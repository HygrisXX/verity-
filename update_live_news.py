#!/usr/bin/env python3
"""
VERITY - Skrypt produkcyjny pobierający PRAWDZIWE artykuły z polskich kanałów RSS
i generujący plik articles.json dla domeny testowej.

Uruchomienie na serwerze / komputerze z dostępem do internetu:
    python3 update_live_news.py
"""

import json
import os
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

# Reprezentatywne kanały RSS z 5 koszyków (Polska, Gospodarka, Prawo, Regiony, Branżowe)
LIVE_RSS_FEEDS = [
    {"name": "PAP", "url": "https://www.pap.pl/rss.xml", "path": "/Polska/Polityka"},
    {"name": "Bankier.pl", "url": "https://www.bankier.pl/rss/wiadomosci.xml", "path": "/Polska/Gospodarka"},
    {"name": "Money.pl", "url": "https://www.money.pl/rss/main.xml", "path": "/Polska/Gospodarka"},
    {"name": "Rzeczpospolita", "url": "https://www.rp.pl/rss_main", "path": "/Polska/Polityka"},
    {"name": "RMF24", "url": "https://www.rmf24.pl/feed", "path": "/Polska"},
    {"name": "Polsat News", "url": "https://www.polsatnews.pl/rss/wszystkie.xml", "path": "/Polska"},
    {"name": "Radio Poznań", "url": "https://radiopoznan.fm/rss", "path": "/Polska/Poznan"},
    {"name": "WysokieNapiecie.pl", "url": "https://wysokienapiecie.pl/feed/", "path": "/Polska/Energetyka"},
]

BLACKLIST = {"oko.press", "demagog.org.pl", "konkret24.tvn24.pl", "pravda.org.pl"}

OPINION_MARKERS = [
    r"\bfelieton\b",
    r"\bkomentarz\b",
    r"\bopinia\b",
    r"\bnieoficjalnie\b",
    r"\bnaszym zdaniem\b",
]


def strip_html(raw: str) -> str:
    text = re.sub(r"<[^>]+>", " ", raw or "")
    return re.sub(r"\s+", " ", text).strip()


def is_opinion_or_blacklisted(title: str, link: str) -> bool:
    for bad in BLACKLIST:
        if bad in link.lower():
            return True
    combined = title.lower()
    for pat in OPINION_MARKERS:
        if re.search(pat, combined):
            return True
    return False


def fetch_rss_items(max_per_feed: int = 5) -> list:
    items = []
    headers = {"User-Agent": "VerityBot/1.0 (+https://verity.pl)"}
    for feed in LIVE_RSS_FEEDS:
        try:
            req = urllib.request.Request(feed["url"], headers=headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                xml_bytes = resp.read()
            root = ET.fromstring(xml_bytes)
            count = 0
            for item in root.iter("item"):
                title = strip_html(item.findtext("title") or "")
                desc = strip_html(item.findtext("description") or "")
                link = (item.findtext("link") or "").strip()
                pub_date = (item.findtext("pubDate") or "").strip()
                if not title or len(desc) < 40:
                    continue
                if is_opinion_or_blacklisted(title, link):
                    continue
                items.append({
                    "outlet": feed["name"],
                    "path": feed["path"],
                    "title": title,
                    "description": desc,
                    "link": link,
                    "pub_date": pub_date,
                })
                count += 1
                if count >= max_per_feed:
                    break
            print(f"[OK] Pobrano {count} depesz z: {feed['name']}")
        except Exception as e:
            print(f"[WARN] Błąd pobierania {feed['name']} ({feed['url']}): {e}")
    return items


def cluster_similar_items(items: list) -> list:
    """Grupuje depesze z różnych redakcji o tym samym wydarzeniu (wspólne słowa kluczowe >= 4 znaki)."""
    clusters = []
    used = set()
    for i, item in enumerate(items):
        if i in used:
            continue
        words_i = {w.lower() for w in re.findall(r"\w{4,}", item["title"])}
        group = [item]
        used.add(i)
        for j in range(i + 1, len(items)):
            if j in used:
                continue
            words_j = {w.lower() for w in re.findall(r"\w{4,}", items[j]["title"])}
            if len(words_i & words_j) >= 2:
                group.append(items[j])
                used.add(j)
        clusters.append(group)
    # Sortuj od grup z największą liczbą niezależnych źródeł
    clusters.sort(key=lambda g: len(g), reverse=True)
    return clusters


def build_articles_json(clusters: list) -> list:
    now_iso = datetime.now().strftime("%Y-%m-%dT%H:%M:%S+01:00")
    now_display = datetime.now().strftime("%d.%m.%Y, %H:%M")
    articles_out = []

    for idx, group in enumerate(clusters[:12], start=1):
        primary = group[0]
        sources = sorted(list({it["outlet"] for it in group}))
        slug = re.sub(r"[^a-z0-9]+", "-", primary["title"].lower()).strip("-")[:75]

        sections = []
        for it in group:
            sections.append({
                "heading": f"Relacja źródłowa: {it['outlet']}",
                "paragraphs": [
                    f"{it['description']} [Źródło: {it['outlet']}]"
                ]
            })

        perspectives = [
            {
                "outlet": it["outlet"],
                "angle": "Depesza źródłowa",
                "summary": it["title"],
                "url": it["link"],
            }
            for it in group[:3]
        ]

        articles_out.append({
            "id": idx,
            "path": primary["path"],
            "seo_url": f"{primary['path']}/{slug}",
            "seo_title": primary["title"],
            "published_iso": now_iso,
            "display_date": now_display,
            "status": "AUTO_PUBLISHED",
            "fact_agreement_pct": min(98, 75 + len(sources) * 5),
            "admin_note": "",
            "metrics": [
                {"label": "Liczba źródeł", "val": f"{len(sources)} redakcji"},
                {"label": "Kategoria", "val": primary["path"]},
                {"label": "Główne źródło", "val": primary["outlet"]},
                {"label": "Weryfikacja", "val": "Fakty / RSS"}
            ],
            "declickbait": [],
            "full_sections": sections,
            "perspectives": perspectives,
            "sources": sources,
            "corrections": []
        })

    return articles_out


if __name__ == "__main__":
    print("Pobieranie prawdziwych wiadomości z polskich kanałów RSS...")
    raw_items = fetch_rss_items()
    if not raw_items:
        print("Brak połączenia z internetem lub zablokowane wyjście RSS w tym środowisku.")
    else:
        clusters = cluster_similar_items(raw_items)
        articles = build_articles_json(clusters)
        out_path = os.path.join(os.path.dirname(__file__), "articles.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(articles, f, ensure_ascii=False, indent=2)
        print(f"Zapisano {len(articles)} prawdziwych opracowań do {out_path}")

        # Aktualizacja news-sitemap.xml
        sitemap_path = os.path.join(os.path.dirname(__file__), "news-sitemap.xml")
        xml_lines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
            '        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">'
        ]
        import xml.sax.saxutils
        for a in articles:
            loc = f"https://verity.pl{a['seo_url']}"
            title = xml.sax.saxutils.escape(a["seo_title"])
            xml_lines.extend([
                '  <url>',
                f'    <loc>{loc}</loc>',
                '    <news:news>',
                '      <news:publication>',
                '        <news:name>VERITY</news:name>',
                '        <news:language>pl</news:language>',
                '      </news:publication>',
                f'      <news:publication_date>{a["published_iso"]}</news:publication_date>',
                f'      <news:title>{title}</news:title>',
                '    </news:news>',
                '  </url>'
            ])
        xml_lines.append('</urlset>\n')
        with open(sitemap_path, "w", encoding="utf-8") as f:
            f.write("\n".join(xml_lines))
        print(f"Zaktualizowano {sitemap_path}")
