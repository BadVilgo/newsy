"""Testy czystej logiki silnika newsow - bez sieci i bez wywolan Gemini."""
import json
import time

import pytest
from fastapi import HTTPException

import rss_engine as rss


def item(url: str, hours_ago: float, region: str = "pl", headline: str | None = None) -> dict:
    return {
        "headline": headline or f"Naglowek {url}",
        "source": "Serwis",
        "summary": "Opis",
        "url": url,
        "ts": time.time() - hours_ago * 3600,
        "published": "2026-07-26 12:00",
        "region": region,
    }


class TestParsowanie:
    def test_strip_html_czysci_tagi_i_encje(self):
        assert rss.strip_html("<a href='x'>Tekst &amp;   spacje</a>") == "Tekst & spacje"

    def test_split_headline_oddziela_zrodlo_po_ostatnim_myslniku(self):
        assert rss.split_headline("Rzad przyjal ustawe - Radio - TVN24") == (
            "Rzad przyjal ustawe - Radio",
            "TVN24",
        )

    def test_split_headline_bez_zrodla(self):
        assert rss.split_headline("Sam naglowek") == ("Sam naglowek", "")

    def test_entry_timestamp_zwraca_none_bez_daty(self):
        assert rss.entry_timestamp(object()) is None


class TestCollectFresh:
    def test_odrzuca_pozycje_starsze_niz_48h(self, monkeypatch):
        monkeypatch.setattr(
            rss,
            "parse_feed",
            lambda *_: [item("swiezy", 5), item("stary", 60), item("graniczny", 47)],
        )
        urls = [it["url"] for it in rss.collect_fresh("temat", "pl")]
        assert urls == ["swiezy", "graniczny"]

    def test_odrzuca_pozycje_bez_daty(self, monkeypatch):
        bez_daty = item("bez-daty", 1)
        bez_daty["ts"] = None
        monkeypatch.setattr(rss, "parse_feed", lambda *_: [bez_daty, item("ok", 1)])
        assert [it["url"] for it in rss.collect_fresh("temat", "pl")] == ["ok"]

    def test_poszerza_okno_gdy_za_malo_pozycji(self, monkeypatch):
        uzyte_okna = []

        def fake(query, window, region):
            uzyte_okna.append(window)
            return [item(f"{window}-{i}", 1) for i in range(2 if window == "when:1d" else 9)]

        monkeypatch.setattr(rss, "parse_feed", fake)
        rss.collect_fresh("temat", "pl")
        assert uzyte_okna == ["when:1d", "when:2d"]


class TestFetchRssItems:
    def test_nie_siega_do_us_gdy_polskich_pozycji_wystarczy(self, monkeypatch):
        wywolania = []

        def fake(query, region):
            wywolania.append(region)
            return [item(f"pl-{i}", 1) for i in range(rss.MIN_PL_ITEMS)]

        monkeypatch.setattr(rss, "collect_fresh", fake)
        pozycje, topic_en = rss.fetch_rss_items("Polska", None)

        assert wywolania == ["pl"]
        assert topic_en is None
        assert len(pozycje) == rss.MIN_PL_ITEMS

    def test_dobiera_us_i_LACZY_pule_gdy_polskich_za_malo(self, monkeypatch):
        def fake(query, region):
            if region == "pl":
                return [item("pl-1", 1), item("pl-2", 2)]
            return [item("us-1", 3, "us"), item("us-2", 4, "us")]

        monkeypatch.setattr(rss, "collect_fresh", fake)
        monkeypatch.setattr(rss, "translate_topic", lambda t: "translated")

        pozycje, topic_en = rss.fetch_rss_items("temat niszowy", None)

        # Polskie pozycje NIE znikaja - obie pule trafiaja do modelu razem.
        assert {it["url"] for it in pozycje} == {"pl-1", "pl-2", "us-1", "us-2"}
        assert topic_en == "translated"

    def test_uzywa_zcache_owanego_tlumaczenia_zamiast_liczyc_nowe(self, monkeypatch):
        uzyte_zapytania = []

        def fake(query, region):
            uzyte_zapytania.append((region, query))
            return [] if region == "pl" else [item("us-1", 1, "us")]

        monkeypatch.setattr(rss, "collect_fresh", fake)
        monkeypatch.setattr(
            rss, "translate_topic", lambda t: pytest.fail("nie powinno tlumaczyc ponownie")
        )

        _, topic_en = rss.fetch_rss_items("Postepy nad agentami AI", "AI agents")

        assert ("us", "AI agents") in uzyte_zapytania
        assert topic_en == "AI agents"

    def test_deduplikuje_po_url(self, monkeypatch):
        def fake(query, region):
            if region == "pl":
                return [item("wspolny", 1)]
            return [item("wspolny", 1, "us"), item("us-1", 2, "us")]

        monkeypatch.setattr(rss, "collect_fresh", fake)
        monkeypatch.setattr(rss, "translate_topic", lambda t: "x")

        pozycje, _ = rss.fetch_rss_items("temat", None)
        assert [it["url"] for it in pozycje].count("wspolny") == 1

    def test_priorytet_24h_odcina_starsze_gdy_swiezych_wystarczy(self, monkeypatch):
        swieze = [item(f"swiezy-{i}", 2) for i in range(rss.SELECT_COUNT)]
        starsze = [item("starszy", 30)]
        monkeypatch.setattr(rss, "collect_fresh", lambda q, r: swieze + starsze if r == "pl" else [])
        monkeypatch.setattr(rss, "translate_topic", lambda t: "x")

        pozycje, _ = rss.fetch_rss_items("temat", None)

        assert "starszy" not in [it["url"] for it in pozycje]
        assert len(pozycje) == rss.SELECT_COUNT

    def test_dopuszcza_starsze_gdy_z_24h_jest_za_malo(self, monkeypatch):
        pula = [item("swiezy", 2), item("starszy", 30)]
        monkeypatch.setattr(rss, "collect_fresh", lambda q, r: pula if r == "pl" else [])
        monkeypatch.setattr(rss, "translate_topic", lambda t: "x")

        pozycje, _ = rss.fetch_rss_items("temat", None)

        assert "starszy" in [it["url"] for it in pozycje]

    def test_sortuje_od_najnowszych_i_przycina_do_limitu(self, monkeypatch):
        # Wszystkie pozycje mieszcza sie w 24h, wiec priorytet swiezosci nie zawezi puli
        # i sprawdzamy sam limit RSS_ITEMS.
        duzo = [item(f"i-{h}", h / 2) for h in range(40, 0, -1)]
        monkeypatch.setattr(rss, "collect_fresh", lambda q, r: duzo if r == "pl" else [])

        pozycje, _ = rss.fetch_rss_items("temat", None)

        assert len(pozycje) == rss.RSS_ITEMS
        assert pozycje == sorted(pozycje, key=lambda it: it["ts"], reverse=True)


class FakeResponse:
    def __init__(self, text):
        self.text = text


def fake_client(payload):
    class Models:
        def generate_content(self, **_):
            return FakeResponse(json.dumps(payload))

    class Client:
        models = Models()

    return Client()


class TestSelectAndSummarize:
    def test_buduje_bullety_ze_zrodlem_flaga_i_data(self, monkeypatch):
        pozycje = [item("https://a", 1), item("https://b", 2, "us")]
        monkeypatch.setattr(
            rss,
            "get_client",
            lambda: fake_client([{"index": 1, "summary": "Opis US"}, {"index": 0, "summary": "Opis PL"}]),
        )

        bullety = rss.select_and_summarize("temat", pozycje)

        assert [b["text"] for b in bullety] == ["Opis US", "Opis PL"]
        assert bullety[0]["foreign"] is True
        assert bullety[1]["foreign"] is False
        assert bullety[0]["sources"][0]["url"] == "https://b"
        assert bullety[0]["published"].startswith("20")

    def test_pomija_niepoprawne_indeksy_i_duplikaty(self, monkeypatch):
        pozycje = [item("https://a", 1)]
        monkeypatch.setattr(
            rss,
            "get_client",
            lambda: fake_client(
                [
                    {"index": 99, "summary": "poza zakresem"},
                    {"index": 0, "summary": "ok"},
                    {"index": 0, "summary": "duplikat"},
                    "nie-obiekt",
                ]
            ),
        )

        bullety = rss.select_and_summarize("temat", pozycje)
        assert [b["text"] for b in bullety] == ["ok"]

    def test_blad_gdy_model_zwroci_smieci(self, monkeypatch):
        monkeypatch.setattr(rss, "get_client", lambda: fake_client([]))
        with pytest.raises(HTTPException) as exc:
            rss.select_and_summarize("temat", [item("https://a", 1)])
        assert exc.value.status_code == 502


class TestRun:
    def test_404_gdy_nie_ma_nic_swiezego(self, monkeypatch):
        monkeypatch.setattr(rss, "fetch_rss_items", lambda t, e: ([], None))
        with pytest.raises(HTTPException) as exc:
            rss.run("temat", None)
        assert exc.value.status_code == 404
        assert "48h" in exc.value.detail

    def test_400_dla_pustego_tematu(self):
        with pytest.raises(HTTPException) as exc:
            rss.run("   ", None)
        assert exc.value.status_code == 400
