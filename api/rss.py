"""
Silnik "Newsy 2" - mikroserwis w Pythonie (FastAPI), uruchamiany jako funkcja
serverless na Vercelu (plik w /api => endpoint POST /api/rss).

Rola: cała logika RSS + AI dla drugiej zakladki newsow.
  1. pobiera Google News RSS dla zadanego tematu (feedparser),
  2. bierze 20 pierwszych pozycji (naglowek + opis + zrodlo + link),
  3. Gemini (google-genai) wybiera 4 najwazniejsze i pisze do kazdej WLASNY,
     krotki opis po polsku na bazie naglowka i opisu,
  4. zwraca gotowa liste `bullets` w tym samym ksztalcie co reszta appki:
     { text, sources: [{ title, url }] }.

Warstwa TypeScript (Next.js) tylko wola ten endpoint i zapisuje wynik do Supabase -
dzieki temu logika RSS/AI zyje w jednym miejscu (tu), a baza i auth zostaja po stronie TS.

Uwaga dev: pod `next dev` ten plik NIE dziala (to runtime Pythona Vercela). Testuj na
deployu Vercela albo przez `vercel dev`.
"""
import html
import json
import os
import re
from urllib.parse import quote_plus

import feedparser
from fastapi import FastAPI, HTTPException
from google import genai
from pydantic import BaseModel

# Ile pozycji z RSS podajemy modelowi do selekcji.
RSS_ITEMS = 20
# Ile newsow ma finalnie wybrac Gemini.
SELECT_COUNT = 4
GEMINI_MODEL = "gemini-2.5-flash"
# feedparser bez naglowka User-Agent bywa odrzucany - podszywamy sie pod przegladarke.
USER_AGENT = "Mozilla/5.0 (compatible; newsy.live/1.0; +https://newsy-nine.vercel.app)"

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


def fetch_rss_items(topic: str) -> list[dict]:
    url = (
        "https://news.google.com/rss/search?q="
        + quote_plus(topic)
        + "&hl=pl&gl=PL&ceid=PL:pl"
    )
    feed = feedparser.parse(url, agent=USER_AGENT)
    items: list[dict] = []
    for entry in feed.entries[:RSS_ITEMS]:
        title = getattr(entry, "title", "") or ""
        headline, source_in_title = split_headline(title)
        source = ""
        if getattr(entry, "source", None) is not None:
            source = getattr(entry.source, "title", "") or ""
        source = source or source_in_title
        items.append(
            {
                "headline": headline,
                "source": source,
                "summary": strip_html(getattr(entry, "summary", "")),
                "url": getattr(entry, "link", "") or "",
            }
        )
    return items


def select_and_summarize(topic: str, items: list[dict]) -> list[dict]:
    """Gemini: wybierz {SELECT_COUNT} najwazniejszych i napisz wlasny krotki opis PL."""
    numbered = "\n".join(
        f"{i}. {it['headline']}"
        + (f" | opis: {it['summary']}" if it["summary"] else "")
        + (f" | zrodlo: {it['source']}" if it["source"] else "")
        for i, it in enumerate(items)
    )

    prompt = (
        f'Ponizej {len(items)} newsow zebranych z Google News na temat: "{topic}".\n\n'
        f"{numbered}\n\n"
        "Zadanie:\n"
        f"1. Dokonaj glebokiej selekcji i wybierz dokladnie {SELECT_COUNT} absolutnie "
        "najwazniejszych pozycji w ogolnej skali istotnosci. Odrzuc clickbaity i drobiazgi. "
        "Jesli kilka pozycji opisuje to samo wydarzenie, wybierz tylko jedna.\n"
        "2. Do kazdej wybranej pozycji napisz WLASNY, zwiezly opis po polsku (jedno pelne "
        "zdanie), oparty na naglowku i opisie - nie kopiuj naglowka doslownie.\n\n"
        "Zwroc WYLACZNIE poprawny JSON: tablice obiektow "
        '[{"index": <numer z listy>, "summary": "<Twoj opis>"}], '
        f"dokladnie {SELECT_COUNT} elementow, od najwazniejszego do najmniej waznego, "
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
        raise HTTPException(status_code=404, detail="Brak newsow w Google News dla tego tematu.")
    return select_and_summarize(trimmed, items)


# Vercel przekazuje pelna sciezke do funkcji ASGI - rejestrujemy oba warianty,
# zeby dzialalo niezaleznie od tego, czy trafi tu '/api/rss' czy '/'.
@app.post("/api/rss")
@app.post("/")
def rss(req: RssRequest):
    return {"bullets": run(req.topic)}


@app.get("/api/rss")
@app.get("/")
def health():
    return {"status": "ok", "service": "newsy RSS engine"}
