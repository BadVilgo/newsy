"""
Silnik "Newsy 2" - mikroserwis w Pythonie (FastAPI), uruchamiany jako funkcja
serverless na Vercelu (plik w /api => endpoint POST /api/rss).

Rola: cała logika RSS + AI dla drugiej zakladki newsow.
  1. pobiera Google News RSS dla zadanego tematu (feedparser) - najpierw PL, a gdy PL ma
     za malo swiezych pozycji, dobiera US (wieksza baza) i laczy obie pule; ograniczajac
     zakres operatorem when: (1-2 dni) i TWARDO odrzucajac wszystko starsze niz 48h po pubDate,
  2. sortuje po dacie (najnowsze) i bierze do 20 pozycji (naglowek + opis + zrodlo + link + data),
  3. Gemini (google-genai) wybiera 4 najwazniejsze i pisze do kazdej WLASNY,
     krotki opis po polsku na bazie naglowka i opisu,
  4. zwraca gotowa liste `bullets` w tym samym ksztalcie co reszta appki:
     { text, sources: [{ title, url }] }.

Warstwa TypeScript (Next.js) tylko wola ten endpoint i zapisuje wynik do Supabase -
dzieki temu logika RSS/AI zyje w jednym miejscu (tu), a baza i auth zostaja po stronie TS.

Uwaga dev: pod `next dev` ten plik NIE dziala (to runtime Pythona Vercela). Testuj na
deployu Vercela albo przez `vercel dev`.
"""
import calendar
import html
import json
import os
import re
import time
from datetime import datetime, timezone
from urllib.parse import quote_plus

import feedparser
from fastapi import FastAPI, Header, HTTPException
from google import genai
from pydantic import BaseModel

# Ile pozycji z RSS podajemy modelowi do selekcji.
RSS_ITEMS = 20
# Ile newsow ma finalnie wybrac Gemini (mniej, jesli temat niszowy i pozycji jest mniej).
SELECT_COUNT = 4
# TWARDE odciecie wieku: w Newsy 2 nie pokazujemy nic starszego niz 48h. Filtrujemy po
# realnej dacie publikacji (pubDate), niezaleznie od tego, co zwroci operator when:.
MAX_AGE_HOURS = 48
# Google News sortuje wyniki wyszukiwania po TRAFNOSCI i bez limitu czasu, wiec bez tego
# operatora do wynikow wpadaja stare artykuly. `when:1d`/`when:2d` ograniczaja zakres.
# Zaczynamy od 1 dnia (najswiezsze); gdy za malo pozycji, poszerzamy do 2 dni. Szerzej
# nie idziemy - i tak twardy filtr 48h nizej odrzucilby starsze wpisy.
SEARCH_WINDOWS = ["when:1d", "when:2d"]
# Ile pozycji chcemy miec do sensownej selekcji - ponizej tego progu poszerzamy okno.
MIN_ITEMS = 8
GEMINI_MODEL = "gemini-2.5-flash"
# feedparser bez naglowka User-Agent bywa odrzucany - podszywamy sie pod przegladarke.
USER_AGENT = "Mozilla/5.0 (compatible; newsy.live/1.0; +https://newsy-nine.vercel.app)"
# Parametry lokalizacji Google News. Zaczynamy od PL; gdy PL ma za malo swiezych newsow
# (typowo tematy niszowe/globalne), dobieramy US - tam baza jest wieksza i swiezsza.
# Gemini i tak pisze opisy po polsku, wiec zagraniczne pozycje sa "tlumaczone" u zrodla.
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


def parse_feed(topic: str, window: str, region: str) -> list[dict]:
    query = f"{topic} {window}".strip()
    url = (
        "https://news.google.com/rss/search?q="
        + quote_plus(query)
        + "&"
        + REGIONS[region]
    )
    feed = feedparser.parse(url, agent=USER_AGENT)
    items: list[dict] = []
    for entry in feed.entries:
        title = getattr(entry, "title", "") or ""
        headline, source_in_title = split_headline(title)
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


def collect_fresh(topic: str, region: str) -> list[dict]:
    """Pozycje z jednego regionu: poszerza okno do MIN_ITEMS, po czym TWARDO odrzuca
    wszystko starsze niz MAX_AGE_HOURS (oraz wpisy bez daty - nie da sie potwierdzic wieku)."""
    items: list[dict] = []
    for window in SEARCH_WINDOWS:
        items = parse_feed(topic, window, region)
        if len(items) >= MIN_ITEMS:
            break
    cutoff = time.time() - MAX_AGE_HOURS * 3600
    return [it for it in items if it["ts"] is not None and it["ts"] >= cutoff]


def fetch_rss_items(topic: str) -> list[dict]:
    """Najpierw PL. Gdy PL ma mniej niz SELECT_COUNT swiezych pozycji (typowo tematy
    niszowe/globalne), dobiera US i LACZY obie pule (PL zostaje, US uzupelnia). Na koniec
    sortuje od najnowszych i przycina do RSS_ITEMS."""
    combined = collect_fresh(topic, "pl")
    if len(combined) < SELECT_COUNT:
        seen = {it["url"] for it in combined}
        combined = combined + [it for it in collect_fresh(topic, "us") if it["url"] not in seen]
    combined.sort(key=lambda it: it["ts"], reverse=True)
    return combined[:RSS_ITEMS]


def select_and_summarize(topic: str, items: list[dict]) -> list[dict]:
    """Gemini: wybierz najwazniejsze pozycje i napisz do kazdej wlasny krotki opis PL."""
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
        source_title = item["headline"] or item["source"] or "zrodlo"
        bullets.append(
            {
                "text": summary,
                "sources": [{"title": source_title, "url": item["url"]}] if item["url"] else [],
                # Znacznik dla UI: pozycja pochodzi z zagranicznego (nie-PL) wydania Google News.
                "foreign": item["region"] != "pl",
            }
        )

    if not bullets:
        raise HTTPException(status_code=502, detail="Model nie zwrocil poprawnej selekcji newsow.")
    return bullets


def run(topic: str) -> list[dict]:
    trimmed = (topic or "").strip()
    if not trimmed:
        raise HTTPException(status_code=400, detail="Podaj temat.")
    items = fetch_rss_items(trimmed)
    if not items:
        raise HTTPException(
            status_code=404,
            detail="Brak newsow z ostatnich 48h dla tego tematu.",
        )
    return select_and_summarize(trimmed, items)


# Vercel przekazuje pelna sciezke do funkcji ASGI - rejestrujemy oba warianty,
# zeby dzialalo niezaleznie od tego, czy trafi tu '/api/rss' czy '/'.
@app.post("/api/rss")
@app.post("/")
def rss(req: RssRequest, x_engine_secret: str | None = Header(default=None)):
    check_secret(x_engine_secret)
    return {"bullets": run(req.topic)}


@app.get("/api/rss")
@app.get("/")
def health():
    return {"status": "ok", "service": "newsy RSS engine"}
