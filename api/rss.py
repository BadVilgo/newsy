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
  3. priorytetyzuje ostatnie 24h: jesli jest z nich dosc pozycji, starsze (24-48h) w ogole
     nie trafiaja do modelu; 48h to sufit awaryjny,
  4. Gemini (google-genai) JEDNYM wywolaniem wybiera do 4 najwazniejszych pozycji i pisze
     do kazdej WLASNY, krotki opis po polsku - takze dla naglowkow angielskich (model jest
     wielojezyczny, wiec osobny krok tlumaczenia jest zbedny i tylko pogarszalby jakosc),
  5. zwraca gotowa liste `bullets` w tym samym ksztalcie co reszta appki:
     { text, sources: [{ title, url }], foreign }.

Tytulow zrodel NIE tlumaczymy - link ma pokazywac prawdziwy naglowek, inaczej user nie
odnajdzie artykulu.

Warstwa TypeScript (Next.js) tylko wola ten endpoint i zapisuje wynik do Supabase -
dzieki temu logika RSS/AI zyje w jednym miejscu (tu), a baza i auth zostaja po stronie TS.

Uwaga dev: pod `next dev` ten plik NIE dziala (to runtime Pythona Vercela). Testuj na
deployu Vercela albo przez `vercel dev`.
"""
import html
import json
import os
import re
import time
from urllib.parse import quote_plus

import calendar
from datetime import datetime, timezone

import feedparser
from fastapi import FastAPI, Header, HTTPException
from google import genai
from pydantic import BaseModel

# Ile pozycji z RSS podajemy modelowi do selekcji (wiekszy wybor = lepsza selekcja,
# a koszt rosnie minimalnie, bo to tylko tokeny wejsciowe).
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
# Tlumaczenie tematu to zadanie trywialne - mozna tu podstawic tanszy model.
TRANSLATE_MODEL = GEMINI_MODEL
# feedparser bez naglowka User-Agent bywa odrzucany - podszywamy sie pod przegladarke.
USER_AGENT = "Mozilla/5.0 (compatible; newsy.live/1.0; +https://newsy-nine.vercel.app)"
# Parametry lokalizacji Google News.
REGIONS = {
    "pl": "hl=pl&gl=PL&ceid=PL:pl",
    "us": "hl=en-US&gl=US&ceid=US:en",
}

app = FastAPI(title="newsy RSS engine")

_client: genai.Client | None = None


def get_client() -> genai.Client:
    global _client
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Brak GEMINI_API_KEY w srodowisku.")
    if _client is None:
        _client = genai.Client(api_key=api_key)
    return _client


class RssRequest(BaseModel):
    topic: str
    # Angielski wariant tematu zcache'owany w bazie (kolumna boxes.topic_en). Gdy podany,
    # oszczedzamy wywolanie tlumaczace przy kazdym odswiezeniu.
    topic_en: str | None = None
    # Tryb pomocniczy: policz samo tlumaczenie tematu (uzywane przy dodawaniu/edycji boxa).
    translate_only: bool = False


def check_secret(provided: str | None) -> None:
    """Opcjonalna ochrona: gdy ustawiono RSS_ENGINE_SECRET, wymagaj naglowka x-engine-secret.
    Bez zmiennej endpoint dziala bez sekretu (wygodne na start; Gemini jest platny, wiec
    warto ustawic sekret po obu stronach: tu i w RSS_ENGINE_SECRET dla Next/GitHub Actions)."""
    expected = os.environ.get("RSS_ENGINE_SECRET")
    if expected and provided != expected:
        raise HTTPException(status_code=401, detail="Brak lub niepoprawny sekret silnika.")


def strip_html(text: str) -> str:
    """Opis w Google News RSS to fragment HTML - czyscimy tagi i encje."""
    without_tags = re.sub(r"<[^>]+>", " ", text or "")
    collapsed = re.sub(r"\s+", " ", html.unescape(without_tags)).strip()
    return collapsed


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
        items.append(
            {
                "headline": headline,
                "source": source,
                "summary": strip_html(getattr(entry, "summary", "")),
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
    try:
        response = get_client().models.generate_content(model=TRANSLATE_MODEL, contents=prompt)
        first_line = (response.text or "").strip().splitlines()[0]
        cleaned = first_line.strip().strip('"').strip("'").strip()
        return cleaned or topic
    except (IndexError, AttributeError):
        return topic


def fetch_rss_items(topic: str, topic_en: str | None) -> tuple[list[dict], str | None]:
    """Buduje pule pozycji dla modelu. Zwraca (pozycje, uzyte_tlumaczenie_lub_None).

    PL najpierw; gdy PL ma za malo swiezych newsow, DOBIERA (nie zastepuje!) wydanie US
    po angielskim hasle. Na koniec priorytetyzuje ostatnie 24h i przycina do RSS_ITEMS.
    """
    pool = collect_fresh(topic, "pl")
    used_topic_en: str | None = None

    if len(pool) < MIN_PL_ITEMS:
        used_topic_en = (topic_en or "").strip() or translate_topic(topic)
        seen = {it["url"] for it in pool}
        pool = pool + [it for it in collect_fresh(used_topic_en, "us") if it["url"] not in seen]

    pool.sort(key=lambda it: it["ts"], reverse=True)

    # Priorytet 24h: starsze pozycje wchodza do gry tylko wtedy, gdy swiezych jest za malo.
    priority_cutoff = time.time() - PRIORITY_AGE_HOURS * 3600
    fresh_24h = [it for it in pool if it["ts"] >= priority_cutoff]
    selected = fresh_24h if len(fresh_24h) >= SELECT_COUNT else pool

    return selected[:RSS_ITEMS], used_topic_en


def select_and_summarize(topic: str, items: list[dict]) -> list[dict]:
    """Gemini: JEDNO wywolanie - wybor najwazniejszych pozycji + wlasne opisy po polsku."""
    count = min(SELECT_COUNT, len(items))
    numbered = "\n".join(
        f"{i}. {it['headline']}"
        + (f" | data: {it['published']}" if it["published"] else "")
        + (f" | opis: {it['summary']}" if it["summary"] else "")
        + (f" | zrodlo: {it['source']}" if it["source"] else "")
        for i, it in enumerate(items)
    )

    prompt = (
        f'Ponizej {len(items)} newsow zebranych z Google News na temat: "{topic}", '
        "posortowanych od najnowszych.\n\n"
        f"{numbered}\n\n"
        "Zadanie:\n"
        f"1. Dokonaj glebokiej selekcji i wybierz dokladnie {count} absolutnie "
        "najwazniejszych pozycji w ogolnej skali istotnosci. Odrzuc clickbaity i drobiazgi. "
        "Jesli kilka pozycji opisuje to samo wydarzenie, wybierz tylko jedna. Przy podobnej "
        "wadze preferuj pozycje SWIEZSZE (nowsza data).\n"
        "2. Do kazdej wybranej pozycji napisz WLASNY, zwiezly opis po polsku (jedno pelne "
        "zdanie), oparty na naglowku i opisie - nie kopiuj naglowka doslownie. Pozycje moga "
        "byc po polsku lub angielsku, ale opis ZAWSZE pisz po polsku.\n\n"
        "Zwroc WYLACZNIE poprawny JSON: tablice obiektow "
        '[{"index": <numer z listy>, "summary": "<Twoj opis>"}], '
        f"dokladnie {count} elementow, od najwazniejszego do najmniej waznego, "
        "bez zadnego dodatkowego tekstu."
    )

    response = get_client().models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
        config={"response_mime_type": "application/json"},
    )

    raw = (response.text or "").strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="Gemini zwrocil niepoprawny JSON.")

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
        # Tytul zrodla zostaje w oryginale - link ma prowadzic do rozpoznawalnego artykulu.
        source_title = item["headline"] or item["source"] or "zrodlo"
        bullets.append(
            {
                "text": summary,
                "sources": [{"title": source_title, "url": item["url"]}] if item["url"] else [],
                # Znacznik dla UI: pozycja z zagranicznego (nie-PL) wydania Google News.
                "foreign": item["region"] != "pl",
            }
        )

    if not bullets:
        raise HTTPException(status_code=502, detail="Model nie zwrocil poprawnej selekcji newsow.")
    return bullets


def run(topic: str, topic_en: str | None) -> tuple[list[dict], str | None]:
    trimmed = (topic or "").strip()
    if not trimmed:
        raise HTTPException(status_code=400, detail="Podaj temat.")
    items, used_topic_en = fetch_rss_items(trimmed, topic_en)
    if not items:
        raise HTTPException(
            status_code=404,
            detail="Nie znaleziono istotnych wiadomosci dla tego tematu z ostatnich 48h.",
        )
    return select_and_summarize(trimmed, items), used_topic_en


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

    bullets, used_topic_en = run(req.topic, req.topic_en)
    # Gdy tlumaczenie policzylismy tutaj, oddajemy je warstwie TS, ktora zapisze je w bazie
    # (kolumna boxes.topic_en) - kolejne odswiezenia nie beda go juz liczyc.
    return {"bullets": bullets, "topic_en": used_topic_en}


@app.get("/api/rss")
@app.get("/")
def health():
    return {"status": "ok", "service": "newsy RSS engine"}
