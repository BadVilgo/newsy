"""
Silnik newsow - mikroserwis w Pythonie (FastAPI), uruchamiany jako funkcja
serverless na Vercelu (plik w /api => endpoint POST /api/rss).

Rola: cala logika RSS + AI aplikacji.
  1. pobiera Google News RSS dla zadanego tematu (feedparser) - najpierw wydanie POLSKIE,
     ograniczajac zakres operatorem when: (1-2 dni) i TWARDO odrzucajac wszystko starsze
     niz 48h wg realnej daty publikacji (pubDate),
  2. gdy polskie wydanie ma mniej niz MIN_PL_ITEMS swiezych pozycji (typowo tematy niszowe
     lub globalne), tlumaczy temat na angielski i DOBIERA pozycje z wydania US - obie pule
     sa LACZONE, wiec trafne polskie newsy nigdy nie znikaja na rzecz zagranicznych,
  3. PAMIEC POPRZEDNIEGO DNIA: odrzuca artykuly, ktore uzytkownik widzial juz w poprzednim
     snapshocie (twardy filtr po URL), a ich opisy podaje modelowi z instrukcja, zeby nie
     wracal do tych samych wydarzen bez nowego rozwoju,
  4. priorytetyzuje ostatnie 24h: jesli jest z nich dosc pozycji, starsze (24-48h) w ogole
     nie trafiaja do modelu; 48h to sufit awaryjny,
  5. GRUPUJE naglowki opisujace te sama historie (podobienstwo slow, bez modelu) - model
     dostaje jedna pozycje na historie z informacja, ile redakcji ja relacjonuje. To sygnal
     waznosci, a deduplikacja przestaje zalezec od modelu,
  6. gdy od poprzedniego snapshotu nie pojawilo sie NIC nowego, konczy bez wolania modelu
     (`unchanged`) - box zachowuje dotychczasowy snapshot, a zapytanie do Gemini nie kosztuje,
  7. Gemini (google-genai) JEDNYM wywolaniem wybiera do 4 najwazniejszych pozycji i pisze
     do kazdej WLASNY, krotki opis po polsku - takze dla naglowkow angielskich (model jest
     wielojezyczny, wiec osobny krok tlumaczenia jest zbedny i tylko pogarszalby jakosc),
  8. zwraca gotowa liste `bullets` w tym samym ksztalcie co reszta appki:
     { text, sources: [{ title, url }], foreign, published }.

Tytulow zrodel NIE tlumaczymy - link ma pokazywac prawdziwy naglowek, inaczej user nie
odnajdzie artykulu.

Warstwa TypeScript (Next.js) tylko wola ten endpoint i zapisuje wynik do Supabase -
dzieki temu logika RSS/AI zyje w jednym miejscu (tu), a baza i auth zostaja po stronie TS.

Uwaga dev: pod `next dev` ten plik NIE dziala (to runtime Pythona Vercela). Testuj na
deployu Vercela albo przez `vercel dev`.
"""
import json
import os
import re
import time
import unicodedata
from urllib.parse import quote_plus

import calendar
from datetime import datetime, timezone

import feedparser
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from google import genai
from google.genai import errors as genai_errors
from pydantic import BaseModel

# Ile HISTORII (pozycji po zgrupowaniu podobnych naglowkow) podajemy modelowi do selekcji.
# Wiekszy wybor = lepsza selekcja, a koszt rosnie minimalnie, bo to tylko tokeny wejsciowe.
RSS_ITEMS = 30
# Ile newsow ma finalnie wybrac Gemini. Gdy swiezych pozycji jest mniej, zwracamy tyle,
# ile jest (1-3) - lepiej pokazac mniej niz nic.
SELECT_COUNT = 4
# Ponizej tylu swiezych pozycji w wydaniu PL dobieramy dodatkowo wydanie US.
MIN_PL_ITEMS = 8
# TWARDE odciecie wieku: nie pokazujemy nic starszego niz 48h (wg pubDate).
MAX_AGE_HOURS = 48
# Priorytet swiezosci: jesli z ostatnich 24h jest co najmniej SELECT_COUNT pozycji,
# model dostaje WYLACZNIE je. Starsze (24-48h) sluza tylko jako uzupelnienie.
PRIORITY_AGE_HOURS = 24
# Google News sortuje wyniki po TRAFNOSCI i bez limitu czasu, wiec bez operatora when:
# do wynikow wpadaja stare artykuly. Zaczynamy od 1 dnia, potem 2 - szerzej nie ma sensu,
# bo twardy filtr 48h i tak odrzucilby starsze wpisy.
SEARCH_WINDOWS = ["when:1d", "when:2d"]
GEMINI_MODEL = "gemini-2.5-flash"
# Tlumaczenie tematu na 2-4 slowa kluczowe to zadanie trywialne, wiec idzie na tanszy model.
# Gdyby byl niedostepny, translate_topic() spada na GEMINI_MODEL - selekcja newsow zostaje
# na mocniejszym modelu, bo Lite wyraznie gorzej wybiera.
TRANSLATE_MODEL = "gemini-2.5-flash-lite"
# Dwa naglowki uznajemy za te sama historie, gdy maja co najmniej MIN_SHARED_WORDS wspolnych
# slow, a ich zbiory slow pokrywaja sie co najmniej w polowie (indeks Jaccarda). Progi dobrane
# ostroznie: lepiej nie polaczyc dwoch wersji tej samej historii (model i tak je
# zdeduplikuje) niz skleic dwie rozne.
SIMILARITY_THRESHOLD = 0.5
MIN_SHARED_WORDS = 3
# Ile linkow do zrodel dostaje jeden news (artykul glowny + inne redakcje z tej samej grupy).
MAX_SOURCES_PER_BULLET = 3
# Ile opisow z poprzedniego snapshotu podajemy modelowi jako "to juz bylo".
PREVIOUS_LIMIT = 8
# Google News indeksuje artykuly z opoznieniem, wiec tekst opublikowany tuz PRZED poprzednim
# snapshotem mogl do niego nie trafic. Przy sprawdzaniu "czy jest cos nowego" liczymy go
# jeszcze jako nowy - inaczej nigdy nie zostalby pokazany.
NEW_ITEM_GRACE_HOURS = 2
# Slowa bez wartosci przy porownywaniu naglowkow (PL bez znakow diakrytycznych + EN).
STOPWORDS = frozenset(
    "ale co czy dla do jak jest juz na nad nie od oraz po pod przez przy sie tak tego to tym "
    "we za ze "
    "an and are as at be by for from has have in into is it its of on or over says that the "
    "this was will with".split()
)
# Wymuszony ksztalt odpowiedzi. Sam response_mime_type to tylko prosba o JSON;
# schemat gwarantuje strukture i eliminuje "kreatywne" formaty.
SELECTION_SCHEMA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            "index": {"type": "INTEGER"},
            "summary": {"type": "STRING"},
        },
        "required": ["index", "summary"],
    },
}
# Odpowiedz to ~200-300 tokenow, wiec limit z duzym zapasem - ucieciu ma zapobiegac
# takze wylaczone myslenie (patrz komentarz przy thinking_config nizej).
MAX_OUTPUT_TOKENS = 2048
# Ile razy probujemy, gdy model mimo wszystko odda cos, czego nie da sie sparsowac.
SELECTION_ATTEMPTS = 2
# feedparser bez naglowka User-Agent bywa odrzucany - podszywamy sie pod przegladarke.
USER_AGENT = "Mozilla/5.0 (compatible; newsy.live/1.0; +https://newsy-nine.vercel.app)"
# Parametry lokalizacji Google News.
REGIONS = {
    "pl": "hl=pl&gl=PL&ceid=PL:pl",
    "us": "hl=en-US&gl=US&ceid=US:en",
}

# Wersja API Gemini ustawiona JAWNIE. google-genai 3.0 (XI 2026) zmienil domyslna wersje
# z `v1beta` na `v1`, a deploy Vercela instaluje najnowsza paczke - po deployu 13.11.2026
# kazde wywolanie modelu konczylo sie wyjatkiem i silnik oddawal goly status 500.
# `response_schema` i `thinking_config`, z ktorych korzystamy, sa wspierane w `v1beta`.
GEMINI_API_VERSION = "v1beta"

app = FastAPI(title="newsy RSS engine")


@app.exception_handler(genai_errors.APIError)
async def gemini_error_handler(_request, exc: genai_errors.APIError):
    """Blad API Gemini -> JSON z czytelnym `detail` (wczesniej: goly 500 bez tresci).
    429 przekazujemy dalej jako 429 - warstwa TS zamienia go na RateLimitError."""
    code = getattr(exc, "code", None)
    status = 429 if code == 429 else 502
    return JSONResponse(
        status_code=status,
        content={"detail": f"Gemini API {code} {getattr(exc, 'status', '') or ''}: "
                           f"{(getattr(exc, 'message', '') or str(exc))[:300]}".strip()},
    )


@app.exception_handler(Exception)
async def unexpected_error_handler(_request, exc: Exception):
    """Kazdy inny nieobsluzony wyjatek tez zwraca `detail` - bez tego w UI i w logach
    GitHub Actions widac tylko "Silnik RSS zwrocil status 500" i nie da sie ustalic przyczyny."""
    return JSONResponse(
        status_code=500,
        content={"detail": f"Blad silnika RSS ({type(exc).__name__}): {str(exc)[:300]}"},
    )

_client: genai.Client | None = None


def get_client() -> genai.Client:
    global _client
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Brak GEMINI_API_KEY w srodowisku.")
    if _client is None:
        _client = genai.Client(
            api_key=api_key, http_options={"api_version": GEMINI_API_VERSION}
        )
    return _client


class PreviousItem(BaseModel):
    """News pokazany w poprzednim snapshocie boxa - "pamiec" silnika miedzy dniami."""

    text: str = ""
    urls: list[str] = []


class RssRequest(BaseModel):
    topic: str
    # Angielski wariant tematu zcache'owany w bazie (kolumna boxes.topic_en). Gdy podany,
    # oszczedzamy wywolanie tlumaczace przy kazdym odswiezeniu.
    topic_en: str | None = None
    # Tryb pomocniczy: policz samo tlumaczenie tematu (uzywane przy dodawaniu/edycji boxa).
    translate_only: bool = False
    # Newsy z poprzedniego snapshotu: ich URL-e sa odfiltrowywane, a opisy trafiaja do
    # promptu, zeby ta sama historia nie wracala dzien po dniu.
    previous: list[PreviousItem] = []
    # Czas (ISO 8601) najnowszego snapshotu boxa. Gdy podany i od tego momentu nie pojawilo
    # sie nic nowego, silnik konczy bez wolania modelu i zwraca `unchanged: true`.
    since: str | None = None


def check_secret(provided: str | None) -> None:
    """Opcjonalna ochrona: gdy ustawiono RSS_ENGINE_SECRET, wymagaj naglowka x-engine-secret.
    Bez zmiennej endpoint dziala bez sekretu (wygodne na start; Gemini jest platny, wiec
    warto ustawic sekret po obu stronach: tu i w RSS_ENGINE_SECRET dla Next/GitHub Actions)."""
    expected = os.environ.get("RSS_ENGINE_SECRET")
    if expected and provided != expected:
        raise HTTPException(status_code=401, detail="Brak lub niepoprawny sekret silnika.")


def split_headline(title: str) -> tuple[str, str]:
    """Tytul z Google News to zwykle 'Naglowek - Zrodlo'. Rozdzielamy po ostatnim ' - '."""
    if " - " in title:
        head, source = title.rsplit(" - ", 1)
        return head.strip(), source.strip()
    return title.strip(), ""


def entry_timestamp(entry) -> float | None:
    """Czas publikacji wpisu jako epoch (UTC), albo None gdy brak/niepoprawny."""
    parsed = getattr(entry, "published_parsed", None) or getattr(entry, "updated_parsed", None)
    if parsed is None:
        return None
    try:
        return calendar.timegm(parsed)
    except (TypeError, ValueError):
        return None


def parse_feed(query: str, window: str, region: str) -> list[dict]:
    url = (
        "https://news.google.com/rss/search?q="
        + quote_plus(f"{query} {window}".strip())
        + "&"
        + REGIONS[region]
    )
    feed = feedparser.parse(url, agent=USER_AGENT)
    items: list[dict] = []
    for entry in feed.entries:
        headline, source_in_title = split_headline(getattr(entry, "title", "") or "")
        source = ""
        if getattr(entry, "source", None) is not None:
            source = getattr(entry.source, "title", "") or ""
        source = source or source_in_title
        ts = entry_timestamp(entry)
        published = (
            datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M") if ts else ""
        )
        # Pola `summary` z RSS celowo NIE czytamy: w Google News to ten sam naglowek plus
        # nazwa zrodla, wiec w prompcie byl czystym duplikatem (ok. 30-40% tokenow wejscia).
        items.append(
            {
                "headline": headline,
                "source": source,
                "url": getattr(entry, "link", "") or "",
                "ts": ts,
                "published": published,
                "region": region,
            }
        )
    return items


def collect_fresh(query: str, region: str) -> list[dict]:
    """Pozycje z jednego wydania: poszerza okno do MIN_PL_ITEMS, po czym TWARDO odrzuca
    wszystko starsze niz MAX_AGE_HOURS (oraz wpisy bez daty - nie da sie potwierdzic wieku)."""
    items: list[dict] = []
    for window in SEARCH_WINDOWS:
        items = parse_feed(query, window, region)
        if len(items) >= MIN_PL_ITEMS:
            break
    cutoff = time.time() - MAX_AGE_HOURS * 3600
    return [it for it in items if it["ts"] is not None and it["ts"] >= cutoff]


def translate_topic(topic: str) -> str:
    """Zamienia polski temat na zwiezle angielskie haslo wyszukiwania.
    Powod: do wydania US trzeba wyslac angielskie slowa kluczowe - polska fraza opisowa
    (np. "Postepy nad agentami AI") nie dopasowuje tam praktycznie niczego."""
    prompt = (
        "Przetlumacz ponizszy temat wiadomosci na zwiezle ANGIELSKIE haslo wyszukiwania "
        "do Google News (2-4 slowa kluczowe, bez cudzyslowow, bez wyjasnien). "
        "Jesli temat to nazwa wlasna, zostaw ja bez zmian.\n\n"
        f"Temat: {topic}"
    )
    # Najpierw tani model; gdyby byl niedostepny (wycofany, przeciazony), ta sama prosba
    # idzie do modelu glownego. Tlumaczenie liczymy raz na temat, wiec zapas nic nie kosztuje.
    for model in dict.fromkeys([TRANSLATE_MODEL, GEMINI_MODEL]):
        try:
            response = get_client().models.generate_content(
                model=model,
                contents=prompt,
                # Tlumaczenie 2-4 slow nie wymaga myslenia - patrz komentarz w select_and_summarize.
                config={"thinking_config": {"thinking_budget": 0}, "max_output_tokens": 64},
            )
            first_line = (response.text or "").strip().splitlines()[0]
            cleaned = first_line.strip().strip('"').strip("'").strip()
            if cleaned:
                return cleaned
        except HTTPException:
            # Brak klucza API to blad konfiguracji, nie modelu - zapasowy model nic nie zmieni.
            raise
        except Exception:  # noqa: BLE001 - kazdy blad modelu oznacza "sprobuj nastepnego"
            continue
    return topic


def headline_tokens(headline: str) -> frozenset[str]:
    """Zbior znormalizowanych slow naglowka do porownywania podobienstwa.

    Bez znakow diakrytycznych i wielkosci liter, bez pojedynczych liter i slow pustych
    znaczeniowo (dwuliterowe skroty typu "AI" czy "UE" zostaja - czesto niosa temat).
    Slowa sa przycinane do 5 znakow - to tani zamiennik stemmingu dla polskiej odmiany
    ("ustawa", "ustawy", "ustawe" daja ten sam rdzen). Liczby zostaja w calosci, bo to one
    czesto odrozniaja dwie rozne historie ("wyniki za Q2" kontra "wyniki za Q3")."""
    text = unicodedata.normalize("NFKD", (headline or "").lower().replace("ł", "l"))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    tokens = set()
    for word in re.findall(r"[a-z0-9]+", text):
        if word.isdigit():
            tokens.add(word)
        elif len(word) >= 2 and word not in STOPWORDS:
            tokens.add(word[:5])
    return frozenset(tokens)


def is_same_story(a: frozenset[str], b: frozenset[str]) -> bool:
    """Czy dwa naglowki (jako zbiory slow) opisuja te sama historie."""
    if not a or not b:
        return False
    if a == b:
        return True
    # Dwa wspolne slowa (np. nazwa firmy i "gielda") to za malo, zeby mowic o tej samej historii.
    shared = len(a & b)
    return shared >= MIN_SHARED_WORDS and shared / len(a | b) >= SIMILARITY_THRESHOLD


def group_similar(items: list[dict]) -> list[dict]:
    """Skleja pozycje opisujace te sama historie w jedna (kolejnosc wejscia = od najnowszych).

    Kazda zwrocona pozycja to reprezentant grupy, wzbogacony o:
      - `source_count` - ile roznych redakcji opisalo historie (sygnal waznosci dla modelu),
      - `related`      - artykuly pozostalych redakcji (dodatkowe linki w UI),
      - `newest_ts`    - czas najswiezszego artykulu w grupie.
    Reprezentantem jest najnowszy artykul POLSKI, a dopiero gdy takiego brak - najnowszy
    w ogole: polski naglowek jest dla czytelnika bardziej uzyteczny niz angielski."""
    groups: list[dict] = []
    for item in items:
        tokens = headline_tokens(item["headline"])
        for group in groups:
            if is_same_story(tokens, group["tokens"]):
                group["members"].append(item)
                break
        else:
            groups.append({"tokens": tokens, "members": [item]})

    stories: list[dict] = []
    for group in groups:
        members = group["members"]
        lead = next((m for m in members if m["region"] == "pl"), members[0])
        seen_sources = {(lead["source"] or lead["url"]).lower()}
        related: list[dict] = []
        for member in members:
            key = (member["source"] or member["url"]).lower()
            if member is lead or key in seen_sources:
                continue
            seen_sources.add(key)
            related.append(member)
        stories.append(
            {
                **lead,
                "source_count": len(seen_sources),
                "related": related,
                "newest_ts": max(m["ts"] for m in members),
            }
        )
    return stories


def build_pool(topic: str, topic_en: str | None) -> tuple[list[dict], str | None]:
    """Cala swieza pula dla tematu, od najnowszych. Zwraca (pozycje, uzyte_tlumaczenie_lub_None).

    PL najpierw; gdy PL ma za malo swiezych newsow, DOBIERA (nie zastepuje!) wydanie US
    po angielskim hasle."""
    pool = collect_fresh(topic, "pl")
    used_topic_en: str | None = None

    if len(pool) < MIN_PL_ITEMS:
        used_topic_en = (topic_en or "").strip() or translate_topic(topic)
        seen = {it["url"] for it in pool}
        pool = pool + [it for it in collect_fresh(used_topic_en, "us") if it["url"] not in seen]

    pool.sort(key=lambda it: it["ts"], reverse=True)
    return pool, used_topic_en


def shortlist(pool: list[dict], exclude_urls: frozenset[str] = frozenset()) -> list[dict]:
    """Z puli robi liste HISTORII dla modelu: pamiec -> priorytet 24h -> grupowanie -> limit."""
    # Pamiec: artykulow pokazanych w poprzednim snapshocie nie pokazujemy drugi raz.
    candidates = [it for it in pool if it["url"] not in exclude_urls]

    # Priorytet 24h: starsze pozycje wchodza do gry tylko wtedy, gdy swiezych jest za malo.
    priority_cutoff = time.time() - PRIORITY_AGE_HOURS * 3600
    fresh_24h = [it for it in candidates if it["ts"] >= priority_cutoff]
    selected = fresh_24h if len(fresh_24h) >= SELECT_COUNT else candidates

    stories = group_similar(selected)
    if len(stories) > RSS_ITEMS:
        # Przy nadmiarze najpierw zostaja historie opisane przez kilka redakcji, a wolne
        # miejsca zajmuja najnowsze pojedyncze teksty. Model i tak dostaje liste od najnowszych.
        multi = [st for st in stories if st["source_count"] > 1]
        single = [st for st in stories if st["source_count"] == 1]
        stories = sorted((multi + single)[:RSS_ITEMS], key=lambda st: st["ts"], reverse=True)
    return stories


def fetch_rss_items(
    topic: str, topic_en: str | None, exclude_urls: frozenset[str] = frozenset()
) -> tuple[list[dict], str | None]:
    """Pula + lista historii w jednym kroku. Zwraca (historie, uzyte_tlumaczenie_lub_None)."""
    pool, used_topic_en = build_pool(topic, topic_en)
    return shortlist(pool, exclude_urls), used_topic_en


def parse_since(value: str | None) -> float | None:
    """Czas ISO 8601 -> epoch. Niepoprawna wartosc = brak (wtedy po prostu nie pomijamy)."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.timestamp()


def has_new_items(stories: list[dict], since_ts: float) -> bool:
    """Czy od poprzedniego snapshotu (z zapasem na opoznienie indeksowania) doszlo cos nowego."""
    threshold = since_ts - NEW_ITEM_GRACE_HOURS * 3600
    return any(st.get("newest_ts", st["ts"]) > threshold for st in stories)


def build_prompt(topic: str, items: list[dict], count: int, previous_texts: list[str]) -> str:
    numbered = "\n".join(
        f"{i}. {it['headline']}"
        + (f" | data: {it['published']}" if it["published"] else "")
        + (f" | zrodlo: {it['source']}" if it["source"] else "")
        + (
            f" | relacjonuje: {it['source_count']} zrodel"
            if it.get("source_count", 1) > 1
            else ""
        )
        for i, it in enumerate(items)
    )

    memory = ""
    if previous_texts:
        shown = "\n".join(f"- {text}" for text in previous_texts)
        memory = (
            "Uzytkownik widzial juz przy poprzednim odswiezeniu ponizsze wiadomosci. NIE wybieraj "
            "pozycji o tych samych wydarzeniach - chyba ze wnosza istotny NOWY rozwoj; wtedy "
            "opisz wlasnie to, co sie zmienilo.\n"
            f"{shown}\n\n"
        )

    return (
        f'Ponizej {len(items)} newsow zebranych z Google News na temat: "{topic}", '
        "posortowanych od najnowszych. Kazda pozycja to naglowek, data publikacji (UTC), "
        "zrodlo oraz - jesli te sama historie opisalo kilka redakcji - liczba zrodel.\n\n"
        f"{numbered}\n\n"
        f"{memory}"
        "Zadanie:\n"
        f"1. Wybierz {count} pozycji najbardziej KONKRETNYCH i NOWYCH dla kogos, kto sledzi ten "
        "temat codziennie: fakty, decyzje, liczby, daty, oficjalne komunikaty. Historia opisana "
        "przez kilka zrodel jest zwykle wazniejsza niz tekst jednego portalu. Odrzucaj: "
        'poradniki, rankingi i listy ("5 rzeczy, ktore..."), opinie i felietony, zapowiedzi bez '
        "faktow, clickbait, teksty sponsorowane oraz pozycje tylko luzno zwiazane z tematem. "
        "Jesli kilka pozycji opisuje to samo wydarzenie, wybierz tylko jedna. Przy podobnej "
        f"wadze preferuj pozycje SWIEZSZE. Wybierz mniej niz {count} tylko wtedy, gdy pozostale "
        "pozycje to wylacznie taki szum.\n"
        "2. Do kazdej wybranej pozycji napisz po polsku WLASNY opis: 1-2 zdania, lacznie do ok. "
        "200 znakow. Zacznij od konkretu: kto, co zrobil lub co sie stalo, ile, kiedy. Opieraj "
        "sie WYLACZNIE na naglowku - nie dopisuj faktow, liczb ani dat, ktorych w nim nie ma, "
        'i nie kopiuj naglowka doslownie. Zakazane sa wypelniacze typu "budzi kontrowersje", '
        '"eksperci komentuja", "moze miec wplyw", "warto sledzic", "sytuacja jest dynamiczna" '
        "i podobne ogolniki. Naglowki moga byc po polsku lub angielsku, ale opis ZAWSZE pisz "
        "po polsku.\n\n"
        "Zwroc WYLACZNIE poprawny JSON: tablice obiektow "
        '[{"index": <numer z listy>, "summary": "<Twoj opis>"}], '
        f"najwyzej {count} elementow, od najwazniejszego do najmniej waznego, "
        "bez zadnego dodatkowego tekstu."
    )


def select_and_summarize(
    topic: str, items: list[dict], previous_texts: list[str] | None = None
) -> list[dict]:
    """Gemini: JEDNO wywolanie - wybor najwazniejszych pozycji + wlasne opisy po polsku."""
    count = min(SELECT_COUNT, len(items))
    prompt = build_prompt(topic, items, count, previous_texts or [])

    parsed = None
    last_finish = None
    last_raw = ""
    for _ in range(SELECTION_ATTEMPTS):
        response = get_client().models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": SELECTION_SCHEMA,
                # Gemini 2.5 Flash domyslnie "mysli", a tokeny myslenia zjadaja TEN SAM
                # budzet wyjscia co odpowiedz. Pomiary: 950-3800 tokenow myslenia przy
                # ~200 tokenach odpowiedzi - przy skoku w gore JSON bywal ucinany
                # (finish_reason=MAX_TOKENS) i parsowanie legalo. Do wyboru 4 pozycji
                # z gotowej listy myslenie nie jest potrzebne, a bez niego jest taniej.
                "thinking_config": {"thinking_budget": 0},
                "max_output_tokens": MAX_OUTPUT_TOKENS,
            },
        )
        candidate = (response.candidates or [None])[0]
        last_finish = getattr(candidate, "finish_reason", None)
        last_raw = (response.text or "").strip()
        try:
            parsed = json.loads(last_raw)
            break
        except json.JSONDecodeError:
            continue

    if parsed is None:
        # Diagnostyka w tresci bledu - bez niej takie padniecie jest nie do odtworzenia z logow.
        raise HTTPException(
            status_code=502,
            detail=(
                f"Gemini nie zwrocil poprawnego JSON po {SELECTION_ATTEMPTS} probach "
                f"(finish_reason={last_finish}, dlugosc={len(last_raw)}): {last_raw[:200]}"
            ),
        )

    bullets: list[dict] = []
    seen: set[int] = set()
    for row in parsed if isinstance(parsed, list) else []:
        if not isinstance(row, dict):
            continue
        idx = row.get("index")
        summary = (row.get("summary") or "").strip()
        if not isinstance(idx, int) or idx < 0 or idx >= len(items) or idx in seen:
            continue
        if not summary:
            continue
        seen.add(idx)
        item = items[idx]
        # Tytuly zrodel zostaja w oryginale - link ma prowadzic do rozpoznawalnego artykulu.
        # Po artykule glownym ida inne redakcje z tej samej grupy (ta sama historia).
        sources = [
            {"title": art["headline"] or art["source"] or "zrodlo", "url": art["url"]}
            for art in [item, *item.get("related", [])]
            if art["url"]
        ][:MAX_SOURCES_PER_BULLET]
        bullets.append(
            {
                "text": summary,
                "sources": sources,
                # Znacznik dla UI: pozycja z zagranicznego (nie-PL) wydania Google News.
                "foreign": item["region"] != "pl",
                # Data publikacji zrodla w ISO 8601 (UTC) - UI formatuje ja lokalnie.
                "published": datetime.fromtimestamp(item["ts"], tz=timezone.utc).isoformat(),
            }
        )

    if not bullets:
        raise HTTPException(status_code=502, detail="Model nie zwrocil poprawnej selekcji newsow.")
    return bullets


def run(
    topic: str,
    topic_en: str | None,
    previous: list[PreviousItem] | None = None,
    since: str | None = None,
) -> tuple[list[dict], str | None, bool]:
    """Zwraca (bullets, uzyte_tlumaczenie_lub_None, unchanged)."""
    trimmed = (topic or "").strip()
    if not trimmed:
        raise HTTPException(status_code=400, detail="Podaj temat.")

    previous = previous or []
    exclude_urls = frozenset(url for prev in previous for url in prev.urls if url)
    previous_texts = [prev.text.strip()[:240] for prev in previous if prev.text.strip()]

    pool, used_topic_en = build_pool(trimmed, topic_en)
    if not pool:
        raise HTTPException(
            status_code=404,
            detail="Nie znaleziono istotnych wiadomosci dla tego tematu z ostatnich 48h.",
        )

    items = shortlist(pool, exclude_urls)

    # Nic nowego od poprzedniego snapshotu = nie ma po co wolac modelu. Box zachowuje
    # dotychczasowe newsy, a codzienne odswiezanie oszczedza zapytanie do Gemini.
    since_ts = parse_since(since)
    if since_ts is not None and not has_new_items(items, since_ts):
        return [], used_topic_en, True

    if not items:
        # Wszystko, co jest w puli, bylo juz pokazane, ale wolajacy nie prosil o pomijanie
        # (reczne odswiezenie) - lepiej oddac znane newsy niz blad.
        items = shortlist(pool)
        previous_texts = []

    bullets = select_and_summarize(trimmed, items, previous_texts[:PREVIOUS_LIMIT])
    return bullets, used_topic_en, False


# Vercel przekazuje pelna sciezke do funkcji ASGI - rejestrujemy oba warianty,
# zeby dzialalo niezaleznie od tego, czy trafi tu '/api/rss' czy '/'.
@app.post("/api/rss")
@app.post("/")
def rss(req: RssRequest, x_engine_secret: str | None = Header(default=None)):
    check_secret(x_engine_secret)

    if req.translate_only:
        trimmed = (req.topic or "").strip()
        if not trimmed:
            raise HTTPException(status_code=400, detail="Podaj temat.")
        return {"topic_en": translate_topic(trimmed)}

    bullets, used_topic_en, unchanged = run(req.topic, req.topic_en, req.previous, req.since)
    # Gdy tlumaczenie policzylismy tutaj, oddajemy je warstwie TS, ktora zapisze je w bazie
    # (kolumna boxes.topic_en) - kolejne odswiezenia nie beda go juz liczyc.
    return {"bullets": bullets, "topic_en": used_topic_en, "unchanged": unchanged}


@app.get("/api/rss")
@app.get("/")
def health():
    return {"status": "ok", "service": "newsy RSS engine"}
