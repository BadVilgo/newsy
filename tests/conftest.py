"""Laduje api/rss.py jako modul `rss_engine`.

`api/` nie jest pakietem (Vercel traktuje kazdy plik w tym katalogu jako osobna funkcje),
wiec zamiast zwyklego importu wczytujemy plik po sciezce.
"""
import importlib.util
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("rss_engine", ROOT / "api" / "rss.py")
rss_engine = importlib.util.module_from_spec(_spec)
sys.modules["rss_engine"] = rss_engine
_spec.loader.exec_module(rss_engine)
