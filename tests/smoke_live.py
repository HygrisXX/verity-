#!/usr/bin/env python3
"""
Smoke test wdrożonej produkcji VERITY na GitHub Pages.
Sprawdza dostępność strony głównej, bazy articles.json, pokrycie 16 województw,
artefaktów SEO (sitemap.xml, news-sitemap.xml, feed.xml, robots.txt, 404.html)
oraz próbkę statycznych stron artykułów z tagiem canonical i JSON-LD NewsArticle.

Użycie:
  python3 tests/smoke_live.py [BASE_URL]
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

import seo_builder  # noqa: E402

DEFAULT_BASE_URL = "https://hygrisxx.github.io/verity-"
USER_AGENT = "VERITY-SmokeTest/1.0"


def fetch(url: str, timeout: int = 20) -> tuple[int, str, bytes]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.headers.get("Content-Type", ""), resp.read()
    except urllib.error.HTTPError as err:
        body = err.read()
        err.close()
        return err.code, err.headers.get("Content-Type", "") if err.headers else "", body


def assert_true(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


def run_smoke(base_url: str) -> None:
    base = base_url.rstrip("/")
    print(f"[SMOKE] Sprawdzanie produkcji: {base}/")

    # 1. Strona główna
    status, ctype, raw_home = fetch(f"{base}/")
    assert_true(status == 200, f"Strona główna zwróciła HTTP {status}")
    home_html = raw_home.decode("utf-8", errors="replace")
    assert_true("VERITY" in home_html, "Brak tytułu/marki VERITY na stronie głównej")
    assert_true(f'href="{base}/"' in home_html, "Brak poprawnego canonical na stronie głównej")
    print("[PASS] Strona główna HTTP 200 + canonical OK")

    # 2. articles.json i pokrycie 16 województw
    status, _, raw_arts = fetch(f"{base}/articles.json")
    assert_true(status == 200, f"articles.json zwrócił HTTP {status}")
    articles = json.loads(raw_arts.decode("utf-8"))
    assert_true(isinstance(articles, list) and len(articles) >= 100, f"Nieoczekiwana liczba artykułów: {len(articles)}")
    voiv_paths = {a.get("path") for a in articles if a.get("path") in seo_builder.VOIVODESHIP_BY_PATH}
    missing_voiv = sorted(set(seo_builder.VOIVODESHIP_BY_PATH.keys()) - voiv_paths)
    assert_true(not missing_voiv, f"Brakujące województwa na produkcji: {missing_voiv}")
    multi_count = sum(1 for a in articles if len(set(a.get("sources") or [])) >= 2)
    print(f"[PASS] articles.json OK ({len(articles)} artykułów, {multi_count} wieloźródłowych, 16/16 woj.)")

    # 2b. Lekki indeks i zasoby PWA
    st_idx, _, raw_idx = fetch(f"{base}/articles-index.json")
    assert_true(st_idx == 200, f"articles-index.json zwrócił HTTP {st_idx}")
    idx_data = json.loads(raw_idx.decode("utf-8"))
    assert_true(isinstance(idx_data, list) and len(idx_data) == len(articles), "Rozbieżność liczby wpisów w articles-index.json")
    assert_true(len(raw_idx) < len(raw_arts) * 0.4, "articles-index.json jest zbyt duży względem articles.json")

    st_man, _, raw_man = fetch(f"{base}/manifest.webmanifest")
    assert_true(st_man == 200, f"manifest.webmanifest zwrócił HTTP {st_man}")
    man_json = json.loads(raw_man.decode("utf-8"))
    assert_true(man_json.get("short_name") == "VERITY", "Niepoprawny manifest.webmanifest")

    for pwa_rel in ("sw.js", "icon.svg", "icon-192.png", "icon-512.png"):
        st_p, _, raw_p = fetch(f"{base}/{pwa_rel}")
        assert_true(st_p == 200 and len(raw_p) > 0, f"{pwa_rel} zwrócił HTTP {st_p}")
    print("[PASS] articles-index.json + PWA (manifest, sw.js, ikony) OK")

    # 3. Artefakty SEO/XML/404 oraz kanały RSS działów
    for rel in ("robots.txt", "sitemap.xml", "news-sitemap.xml", "feed.xml", "Polska/feed.xml", "Swiat/feed.xml", "Sport/feed.xml", "404.html"):
        st, _, raw = fetch(f"{base}/{rel}")
        assert_true(st == 200, f"{rel} zwrócił HTTP {st}")
        txt = raw.decode("utf-8", errors="replace")
        if rel.endswith(".xml"):
            ET.fromstring(txt)
        elif rel == "robots.txt":
            assert_true(f"Sitemap: {base}/sitemap.xml" in txt, "robots.txt nie wskazuje sitemap.xml")
    print("[PASS] robots.txt, sitemap.xml, news-sitemap.xml, feed.xml (+działowe), 404.html OK")

    # 4. Próbka 3 stron artykułów (najnowszy, ogólnopolski/sportowy/światowy oraz regionalny)
    samples = [articles[0]]
    non_reg = next((a for a in articles if a not in samples and not (a.get("path") or "").startswith("/Polska/Regiony/")), None)
    if non_reg:
        samples.append(non_reg)
    reg_sample = next((a for a in articles if a not in samples and (a.get("path") or "").startswith("/Polska/Regiony/")), None)
    if reg_sample:
        samples.append(reg_sample)
    for extra in articles[1:]:
        if len(samples) >= 3:
            break
        if extra not in samples:
            samples.append(extra)

    for art in samples:
        seo_url = (art.get("seo_url") or "").strip("/")
        assert_true(bool(seo_url), f"Pusty seo_url w id={art.get('id')}")
        art_url = f"{base}/{seo_url}/"
        st, _, raw_art = fetch(art_url)
        assert_true(st == 200, f"Artykuł {art_url} zwrócił HTTP {st}")
        art_html = raw_art.decode("utf-8", errors="replace")
        assert_true(f'href="{art_url}"' in art_html, f"Brak canonical {art_url}")
        assert_true('"@type":"NewsArticle"' in art_html or '"@type": "NewsArticle"' in art_html, f"Brak JSON-LD NewsArticle w {art_url}")
        assert_true(not re.search(r"undefined|NaN", art.get("seo_title") or ""), f"Podejrzany tytuł w {art_url}")
    print(f"[PASS] Próbka {len(samples)} artykułów produkcyjnych HTTP 200 + JSON-LD OK")

    # 5. Sprawdzenie obsługi 404 dla nieistniejącej ścieżki
    st_404, _, _ = fetch(f"{base}/nieistniejaca-strona-verity-smoke-check/")
    assert_true(st_404 == 404, f"Oczekiwano HTTP 404 dla nieistniejącej trasy, otrzymano {st_404}")
    print("[PASS] Trasa nieistniejąca zwraca HTTP 404")
    print("[SUKCES] Wszystkie testy smoke produkcji zaliczone!")


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_BASE_URL
    run_smoke(target)
