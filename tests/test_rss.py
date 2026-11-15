"""Testy czystej logiki silnika newsow - bez sieci i bez wywolan Gemini."""
import json
import time

import pytest
from fastapi import HTTPException

import rss_engine as rss


def item(
    url: str,
    hours_ago: float,
    region: str = "pl",
    headline: str | None = None,
    source: str = "Serwis",
) -> dict:
    return {
        "headline": headline or f"Naglowek {url}",
        "source": source,
        "url": url,
        "ts": time.time() - hours_ago * 3600,
        "published": "2026-07-26 12:00",
        "region": region,
    }


class TestParsowanie:
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
    def __init__(self, text, finish_reason="STOP"):
        self.text = text
        self.candidates = [type("C", (), {"finish_reason": finish_reason})()]


class FakeModels:
    """Oddaje kolejne przygotowane odpowiedzi; zapamietuje uzyte konfiguracje."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.configs = []

    def generate_content(self, **kwargs):
        self.configs.append(kwargs.get("config", {}))
        return self.responses.pop(0) if len(self.responses) > 1 else self.responses[0]


def fake_client(payload, *, raw_responses=None):
    responses = raw_responses or [FakeResponse(json.dumps(payload))]

    class Client:
        models = FakeModels(responses)

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

    def test_dolacza_linki_innych_redakcji_z_tej_samej_historii(self, monkeypatch):
        historie = rss.group_similar(
            [
                item(f"https://{nazwa}", i + 1, headline="Sejm przyjal ustawe o podatku cyfrowym", source=nazwa)
                for i, nazwa in enumerate(["onet", "wp", "interia", "rmf", "tvn"])
            ]
        )
        monkeypatch.setattr(
            rss, "get_client", lambda: fake_client([{"index": 0, "summary": "Sejm przyjal ustawe."}])
        )

        bullet = rss.select_and_summarize("podatki", historie)[0]

        assert [s["url"] for s in bullet["sources"]] == [
            "https://onet",
            "https://wp",
            "https://interia",
        ]
        assert len(bullet["sources"]) == rss.MAX_SOURCES_PER_BULLET

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

    # Regresja: tokeny "myslenia" Gemini 2.5 Flash zjadaja budzet wyjscia, przez co
    # odpowiedz bywala ucinana w polowie JSON-a (finish_reason=MAX_TOKENS).
    def test_wylacza_myslenie_i_wymusza_schemat(self, monkeypatch):
        client = fake_client([{"index": 0, "summary": "ok"}])
        monkeypatch.setattr(rss, "get_client", lambda: client)

        rss.select_and_summarize("temat", [item("https://a", 1)])

        config = client.models.configs[0]
        assert config["thinking_config"]["thinking_budget"] == 0
        assert config["response_schema"] == rss.SELECTION_SCHEMA
        assert config["max_output_tokens"] == rss.MAX_OUTPUT_TOKENS

    def test_ponawia_gdy_pierwsza_odpowiedz_jest_ucieta(self, monkeypatch):
        ucieta = FakeResponse('[{"index": 0, "sum', finish_reason="MAX_TOKENS")
        poprawna = FakeResponse(json.dumps([{"index": 0, "summary": "udalo sie za drugim razem"}]))
        client = fake_client(None, raw_responses=[ucieta, poprawna])
        monkeypatch.setattr(rss, "get_client", lambda: client)

        bullety = rss.select_and_summarize("temat", [item("https://a", 1)])

        assert [b["text"] for b in bullety] == ["udalo sie za drugim razem"]
        assert len(client.models.configs) == 2

    def test_blad_zawiera_diagnostyke_gdy_json_nie_parsuje(self, monkeypatch):
        ucieta = FakeResponse('[{"index": 0, "sum', finish_reason="MAX_TOKENS")
        client = fake_client(None, raw_responses=[ucieta, ucieta])
        monkeypatch.setattr(rss, "get_client", lambda: client)

        with pytest.raises(HTTPException) as exc:
            rss.select_and_summarize("temat", [item("https://a", 1)])

        assert exc.value.status_code == 502
        # Bez finish_reason w komunikacie takie padniecie jest nie do odtworzenia z logow.
        assert "MAX_TOKENS" in exc.value.detail


class TestGrupowanie:
    def test_tokeny_ignoruja_diakrytyki_wielkosc_liter_i_odmiane(self):
        assert rss.headline_tokens("Rząd przyjął USTAWĘ o KSeF") == rss.headline_tokens(
            "rzad przyjal ustawy o ksef"
        )

    def test_liczby_odrozniaja_historie(self):
        a = rss.headline_tokens("Nvidia podala wyniki za kwartal 2")
        b = rss.headline_tokens("Nvidia podala wyniki za kwartal 3")
        assert a != b

    def test_laczy_te_sama_historie_z_roznych_redakcji(self):
        pozycje = [
            item("a", 1, headline="Sejm przyjal ustawe o podatku cyfrowym", source="Onet"),
            item("b", 2, headline="Sejm przyjął ustawę o podatku cyfrowym od gigantow", source="WP"),
            item("c", 3, headline="Kurs dolara najnizej od trzech lat", source="Bankier"),
        ]

        historie = rss.group_similar(pozycje)

        assert [h["url"] for h in historie] == ["a", "c"]
        assert historie[0]["source_count"] == 2
        assert [r["url"] for r in historie[0]["related"]] == ["b"]
        assert historie[1]["source_count"] == 1

    def test_nie_skleja_roznych_historii_o_tym_samym_podmiocie(self):
        pozycje = [
            item("a", 1, headline="Nvidia pokazala nowy uklad dla centrow danych"),
            item("b", 2, headline="Nvidia traci na gieldzie po decyzji o clach"),
        ]
        assert len(rss.group_similar(pozycje)) == 2

    def test_krotkie_naglowki_laczy_tylko_gdy_identyczne(self):
        pozycje = [
            item("a", 1, headline="Nvidia rekord"),
            item("b", 2, headline="Nvidia spadek"),
            item("c", 3, headline="Nvidia rekord", source="Inny"),
        ]
        historie = rss.group_similar(pozycje)
        assert [h["url"] for h in historie] == ["a", "b"]
        assert historie[0]["source_count"] == 2

    def test_reprezentantem_jest_polski_artykul_nawet_gdy_starszy(self):
        pozycje = [
            item("us", 1, "us", headline="OpenAI prezentuje model GPT-6 dla firm", source="Reuters"),
            item("pl", 2, "pl", headline="OpenAI prezentuje model GPT-6 dla firm", source="PAP"),
        ]
        historia = rss.group_similar(pozycje)[0]
        assert historia["url"] == "pl"
        assert historia["region"] == "pl"
        # Do sprawdzania "czy jest cos nowego" liczy sie najswiezszy artykul w grupie.
        assert historia["newest_ts"] == pozycje[0]["ts"]

    def test_ta_sama_redakcja_liczy_sie_raz(self):
        pozycje = [
            item("a", 1, headline="Sejm przyjal ustawe o podatku cyfrowym", source="Onet"),
            item("b", 2, headline="Sejm przyjal ustawe o podatku cyfrowym", source="onet"),
        ]
        historia = rss.group_similar(pozycje)[0]
        assert historia["source_count"] == 1
        assert historia["related"] == []

    def test_przy_nadmiarze_zostaja_historie_wielozrodlowe(self, monkeypatch):
        monkeypatch.setattr(rss, "RSS_ITEMS", 3)
        # Najstarsza historia ma dwa zrodla - bez priorytetu wypadlaby jako czwarta z kolei.
        pula = [
            item("n1", 1, headline="Pierwsza osobna wiadomosc dnia alfa"),
            item("n2", 2, headline="Druga calkiem inna informacja beta"),
            item("n3", 3, headline="Trzecia niezalezna depesza gamma"),
            item("w1", 4, headline="Sejm przyjal ustawe o podatku cyfrowym", source="Onet"),
            item("w2", 5, headline="Sejm przyjal ustawe o podatku cyfrowym", source="WP"),
        ]

        historie = rss.shortlist(pula)

        assert [h["url"] for h in historie] == ["n1", "n2", "w1"]


class TestPamiec:
    def test_odrzuca_artykuly_pokazane_w_poprzednim_snapshocie(self):
        pula = [item("nowy", 1), item("wczorajszy", 2), item("inny", 3)]
        historie = rss.shortlist(pula, frozenset({"wczorajszy"}))
        assert [h["url"] for h in historie] == ["nowy", "inny"]

    def test_prompt_zawiera_wczorajsze_opisy_i_liczbe_zrodel(self):
        historie = rss.group_similar(
            [
                item("a", 1, headline="Sejm przyjal ustawe o podatku cyfrowym", source="Onet"),
                item("b", 2, headline="Sejm przyjal ustawe o podatku cyfrowym", source="WP"),
            ]
        )
        prompt = rss.build_prompt("podatki", historie, 1, ["Rzad zapowiedzial podatek cyfrowy."])

        assert "relacjonuje: 2 zrodel" in prompt
        assert "- Rzad zapowiedzial podatek cyfrowy." in prompt
        assert "NIE wybieraj" in prompt
        # Opis z RSS byl duplikatem naglowka - nie moze wrocic do promptu.
        assert "| opis:" not in prompt

    def test_prompt_bez_pamieci_nie_ma_sekcji_o_poprzednich(self):
        prompt = rss.build_prompt("temat", [item("a", 1)], 1, [])
        assert "widzial juz" not in prompt
        assert "relacjonuje" not in prompt

    def test_has_new_items_uwzglednia_zapas_na_opoznienie_indeksowania(self):
        teraz = time.time()
        since = teraz - 10 * 3600
        tuz_przed = [item("a", 10 + rss.NEW_ITEM_GRACE_HOURS - 0.5)]
        duzo_wczesniej = [item("b", 10 + rss.NEW_ITEM_GRACE_HOURS + 1)]

        assert rss.has_new_items([item("nowy", 1)], since) is True
        assert rss.has_new_items(tuz_przed, since) is True
        assert rss.has_new_items(duzo_wczesniej, since) is False
        assert rss.has_new_items([], since) is False

    def test_parse_since_obsluguje_format_supabase_i_smieci(self):
        assert rss.parse_since("2026-07-26T18:00:00.123456+00:00") == pytest.approx(
            rss.parse_since("2026-07-26T18:00:00.123456Z")
        )
        assert rss.parse_since("nie-data") is None
        assert rss.parse_since(None) is None


class TestTlumaczenie:
    def test_uzywa_tanszego_modelu(self, monkeypatch):
        uzyte = []

        class Models:
            def generate_content(self, **kwargs):
                uzyte.append(kwargs["model"])
                return FakeResponse("AI agents")

        monkeypatch.setattr(rss, "get_client", lambda: type("C", (), {"models": Models()})())

        assert rss.translate_topic("Postepy nad agentami AI") == "AI agents"
        assert uzyte == [rss.TRANSLATE_MODEL]
        assert rss.TRANSLATE_MODEL != rss.GEMINI_MODEL

    def test_spada_na_model_glowny_gdy_tani_zawiedzie(self, monkeypatch):
        uzyte = []

        class Models:
            def generate_content(self, **kwargs):
                uzyte.append(kwargs["model"])
                if kwargs["model"] == rss.TRANSLATE_MODEL:
                    raise RuntimeError("404 model not found")
                return FakeResponse('"AI agents"')

        monkeypatch.setattr(rss, "get_client", lambda: type("C", (), {"models": Models()})())

        assert rss.translate_topic("Postepy nad agentami AI") == "AI agents"
        assert uzyte == [rss.TRANSLATE_MODEL, rss.GEMINI_MODEL]

    def test_oddaje_oryginalny_temat_gdy_oba_modele_zawioda(self, monkeypatch):
        class Models:
            def generate_content(self, **kwargs):
                raise RuntimeError("503")

        monkeypatch.setattr(rss, "get_client", lambda: type("C", (), {"models": Models()})())
        assert rss.translate_topic("UAP") == "UAP"


class TestRun:
    def test_404_gdy_nie_ma_nic_swiezego(self, monkeypatch):
        monkeypatch.setattr(rss, "build_pool", lambda t, e: ([], None))
        with pytest.raises(HTTPException) as exc:
            rss.run("temat", None)
        assert exc.value.status_code == 404
        assert "48h" in exc.value.detail

    def test_400_dla_pustego_tematu(self):
        with pytest.raises(HTTPException) as exc:
            rss.run("   ", None)
        assert exc.value.status_code == 400

    def test_bez_zmian_gdy_nic_nie_doszlo_od_poprzedniego_snapshotu(self, monkeypatch):
        pula = [item("stary-1", 20), item("stary-2", 22)]
        monkeypatch.setattr(rss, "build_pool", lambda t, e: (pula, None))
        monkeypatch.setattr(
            rss, "get_client", lambda: pytest.fail("model nie powinien byc wolany")
        )
        since = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime(time.time() - 10 * 3600))

        bullety, _, unchanged = rss.run("temat", None, [], since)

        assert unchanged is True
        assert bullety == []

    def test_bez_zmian_gdy_wszystko_swieze_bylo_juz_pokazane(self, monkeypatch):
        pula = [item("pokazany", 1)]
        monkeypatch.setattr(rss, "build_pool", lambda t, e: (pula, None))
        monkeypatch.setattr(
            rss, "get_client", lambda: pytest.fail("model nie powinien byc wolany")
        )
        poprzednie = [rss.PreviousItem(text="Byl juz taki news.", urls=["pokazany"])]
        since = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime(time.time() - 10 * 3600))

        _, _, unchanged = rss.run("temat", None, poprzednie, since)

        assert unchanged is True

    def test_wybiera_tylko_z_nowych_gdy_cos_doszlo(self, monkeypatch):
        pula = [item("nowy", 1), item("pokazany", 2)]
        monkeypatch.setattr(rss, "build_pool", lambda t, e: (pula, None))
        client = fake_client([{"index": 0, "summary": "Nowa wiadomosc."}])
        monkeypatch.setattr(rss, "get_client", lambda: client)
        poprzednie = [rss.PreviousItem(text="Byl juz taki news.", urls=["pokazany"])]
        since = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime(time.time() - 10 * 3600))

        bullety, _, unchanged = rss.run("temat", None, poprzednie, since)

        assert unchanged is False
        assert [b["sources"][0]["url"] for b in bullety] == ["nowy"]

    def test_reczne_odswiezenie_bez_since_zawsze_oddaje_newsy(self, monkeypatch):
        # Bez `since` (klik uzytkownika) nie pomijamy - nawet gdy cala pula byla juz pokazana.
        pula = [item("pokazany", 1)]
        monkeypatch.setattr(rss, "build_pool", lambda t, e: (pula, None))
        client = fake_client([{"index": 0, "summary": "Ten sam news."}])
        monkeypatch.setattr(rss, "get_client", lambda: client)
        poprzednie = [rss.PreviousItem(text="Byl juz taki news.", urls=["pokazany"])]

        bullety, _, unchanged = rss.run("temat", None, poprzednie)

        assert unchanged is False
        assert [b["text"] for b in bullety] == ["Ten sam news."]


class TestKlientGeminiIBledy:
    """Regresja z 13.11.2026: google-genai 3.0 zmienil domyslne API na `v1`, a wyjatek
    z Gemini wychodzil z silnika jako goly 500 bez `detail`."""

    def test_klient_uzywa_jawnej_wersji_api_v1beta(self, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        monkeypatch.setattr(rss, "_client", None)
        client = rss.get_client()
        assert client._api_client._http_options.api_version == "v1beta"
        monkeypatch.setattr(rss, "_client", None)

    def _post_z_wyjatkiem(self, monkeypatch, exc):
        from fastapi.testclient import TestClient

        monkeypatch.delenv("RSS_ENGINE_SECRET", raising=False)

        def boom(*args, **kwargs):
            raise exc

        monkeypatch.setattr(rss, "run", boom)
        client = TestClient(rss.app, raise_server_exceptions=False)
        return client.post("/api/rss", json={"topic": "temat"})

    def test_blad_gemini_zwraca_502_z_opisem(self, monkeypatch):
        from google.genai import errors

        exc = errors.ClientError(400, {"error": {"message": "Unknown name", "status": "INVALID_ARGUMENT"}})
        res = self._post_z_wyjatkiem(monkeypatch, exc)
        assert res.status_code == 502
        assert "Gemini API 400" in res.json()["detail"]
        assert "Unknown name" in res.json()["detail"]

    def test_limit_gemini_zwraca_429(self, monkeypatch):
        from google.genai import errors

        exc = errors.ClientError(429, {"error": {"message": "quota", "status": "RESOURCE_EXHAUSTED"}})
        res = self._post_z_wyjatkiem(monkeypatch, exc)
        assert res.status_code == 429
        assert "RESOURCE_EXHAUSTED" in res.json()["detail"]

    def test_nieoczekiwany_wyjatek_ma_detail(self, monkeypatch):
        res = self._post_z_wyjatkiem(monkeypatch, KeyError("ts"))
        assert res.status_code == 500
        assert "KeyError" in res.json()["detail"]
