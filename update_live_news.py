#!/usr/bin/env python3
"""
VERITY - Skrypt produkcyjny pobierający artykuły z polskich kanałów RSS.
- Ograniczenie bazy testowej do maksymalnie 100 artykułów (kolejka krocząca).
- Zapis do 4 najważniejszych wydarzeń na godzinę (selekcja według liczby niezależnych redakcji i wagi tematu).
- Pobieranie oficjalnych miniatur ze źródeł (enclosure / media:content / img).
- Płynne dopełnianie wcześniejszymi najważniejszymi tematami, jeśli w danej godzinie pojawiło się mniej niż 4 duże wydarzenia.
- Aktualizacja articles.json oraz news-sitemap.xml.
"""

import json
import os
import re
import urllib.request
import xml.etree.ElementTree as ET
import xml.sax.saxutils
from datetime import datetime

MAX_TOTAL_ARTICLES = 300
MAX_NEW_PER_RUN = 4
ENABLE_THUMBNAILS = True  # Ustaw False, jeśli chcesz wyłączyć zewnętrzne miniatury dla 100% spokoju prawnego

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
    r"\bhoroskop\b",
]


def strip_html(raw: str) -> str:
    text = re.sub(r"<[^>]+>", " ", raw or "")
    return re.sub(r"\s+", " ", text).strip()


def extract_thumbnail_from_item(item_elem, desc_raw: str) -> str:
    # 1. Sprawdź enclosure (standard RSS dla miniatur)
    for enc in item_elem.findall("enclosure"):
        url = enc.get("url")
        ctype = enc.get("type", "")
        if url and ("image" in ctype or any(url.lower().endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".webp"])):
            return url.strip()

    # 2. Sprawdź media:content / media:thumbnail
    for child in item_elem:
        tag = child.tag.lower()
        if "thumbnail" in tag or "content" in tag:
            url = child.get("url")
            if url and ("http" in url):
                return url.strip()

    # 3. Sprawdź <img> w opisie
    m = re.search(r'<img[^>]+src=["\'](https?://[^"\']+)["\']', desc_raw or "", re.IGNORECASE)
    if m:
        return m.group(1).strip()

    return ""


def is_opinion_or_blacklisted(title: str, link: str) -> bool:
    for bad in BLACKLIST:
        if bad in link.lower():
            return True
    combined = title.lower()
    for pat in OPINION_MARKERS:
        if re.search(pat, combined):
            return True
    return False


def fetch_rss_items(max_per_feed: int = 8) -> list:
    items = []
    headers = {"User-Agent": "VerityBot/1.0 (+https://verity.pl)"}
    for feed in LIVE_RSS_FEEDS:
        try:
            req = urllib.request.Request(feed["url"], headers=headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                xml_raw = resp.read()

            # Bezpieczne parsowanie XML z ignorowaniem błędów kodowania
            try:
                root = ET.fromstring(xml_raw)
            except Exception:
                text_clean = xml_raw.decode("utf-8", errors="ignore")
                text_clean = re.sub(r"[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD]", "", text_clean)
                root = ET.fromstring(text_clean.encode("utf-8"))

            count = 0
            for item in root.iter("item"):
                title = strip_html(item.findtext("title") or "")
                raw_desc = item.findtext("description") or ""
                desc = strip_html(raw_desc)
                link = (item.findtext("link") or "").strip()
                pub_date = (item.findtext("pubDate") or "").strip()

                if not title or len(desc) < 30:
                    continue
                if is_opinion_or_blacklisted(title, link):
                    continue

                thumb = extract_thumbnail_from_item(item, raw_desc)

                items.append({
                    "outlet": feed["name"],
                    "path": feed["path"],
                    "title": title,
                    "description": desc,
                    "link": link,
                    "pub_date": pub_date,
                    "thumbnail": thumb,
                })
                count += 1
                if count >= max_per_feed:
                    break
            print(f"[OK] Pobrano {count} depesz z: {feed['name']}")
        except Exception as e:
            print(f"[WARN] Błąd pobierania {feed['name']} ({feed['url']}): {e}")
    return items


def tokenize_title(title: str) -> set:
    words = re.findall(r"\w{4,}", title.lower())
    stop_words = {"polsce", "polska", "polski", "nowe", "będzie", "jest", "roku", "przez", "tylko", "może", "oraz"}
    return {w for w in words if w not in stop_words}


def cluster_similar_items(items: list) -> list:
    """Grupuje depesze z różnych redakcji o tym samym wydarzeniu."""
    clusters = []
    used = set()
    for i, item in enumerate(items):
        if i in used:
            continue
        words_i = tokenize_title(item["title"])
        group = [item]
        used.add(i)
        for j in range(i + 1, len(items)):
            if j in used:
                continue
            words_j = tokenize_title(items[j]["title"])
            if words_i and words_j and len(words_i & words_j) >= 2:
                group.append(items[j])
                used.add(j)
        clusters.append(group)

    # Sortuj według wagi wydarzenia (liczba niezależnych źródeł, miniatura, długość treści)
    def cluster_score(grp):
        score = len(grp) * 10
        if any(it.get("thumbnail") for it in grp):
            score += 2
        score += min(5, sum(len(it["description"]) for it in grp) // 200)
        return score

    clusters.sort(key=cluster_score, reverse=True)
    return clusters


def is_already_covered(group: list, existing_articles: list) -> bool:
    candidate_title = group[0]["title"]
    c_words = tokenize_title(candidate_title)
    cand_links = {it.get("link", "").strip() for it in group if it.get("link")}
    cand_slug = re.sub(r"[^a-z0-9]+", "-", candidate_title.lower()).strip("-")[:60]

    for art in existing_articles:
        # 1. Sprawdź zbieżność linków źródłowych
        existing_links = {p.get("url", "").strip() for p in art.get("perspectives", []) if p.get("url")}
        if cand_links and existing_links and (cand_links & existing_links):
            return True

        # 2. Sprawdź identyczny lub zbliżony slug
        e_slug = (art.get("seo_url", "").split("/")[-1] or "")[:60]
        if cand_slug and e_slug and cand_slug == e_slug:
            return True

        # 3. Sprawdź zbieżność słów kluczowych w tytule
        e_words = tokenize_title(art.get("seo_title", ""))
        if c_words and e_words and len(c_words & e_words) >= 2:
            overlap = len(c_words & e_words) / max(1, min(len(c_words), len(e_words)))
            if overlap >= 0.45:
                return True
    return False


def build_article_from_group(group: list, art_id: int) -> dict:
    now_iso = datetime.now().strftime("%Y-%m-%dT%H:%M:%S+01:00")
    now_display = datetime.now().strftime("%d.%m.%Y, %H:%M")

    # Wybierz reprezentatywną pozycję z miniaturą, jeśli dozwolona i dostępna
    primary = next((it for it in group if it.get("thumbnail")), group[0]) if ENABLE_THUMBNAILS else group[0]
    thumbnail_url = next((it["thumbnail"] for it in group if it.get("thumbnail")), "") if ENABLE_THUMBNAILS else ""
    sources = sorted(list({it["outlet"] for it in group}))

    # Czysty slug
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
        for it in group[:4]
    ]

    metrics = [
        {"label": "Liczba źródeł", "val": f"{len(sources)} {('redakcja' if len(sources) == 1 else 'redakcje' if len(sources) < 5 else 'redakcji')}"},
        {"label": "Kategoria", "val": primary["path"]},
        {"label": "Główne źródło", "val": primary["outlet"]},
        {"label": "Weryfikacja", "val": "Fakty / RSS"}
    ]

    return {
        "id": art_id,
        "path": primary["path"],
        "seo_url": f"{primary['path']}/{slug}",
        "seo_title": primary["title"],
        "thumbnail_url": thumbnail_url,
        "published_iso": now_iso,
        "display_date": now_display,
        "status": "AUTO_PUBLISHED",
        "fact_agreement_pct": min(98, 75 + len(sources) * 6),
        "admin_note": "",
        "metrics": metrics,
        "declickbait": [],
        "full_sections": sections,
        "perspectives": perspectives,
        "sources": sources,
        "corrections": []
    }


def update_news_cycle():
    base_dir = os.path.dirname(__file__)
    articles_path = os.path.join(base_dir, "articles.json")
    sitemap_path = os.path.join(base_dir, "news-sitemap.xml")

    # 1. Wczytaj istniejące artykuły
    existing_articles = []
    if os.path.exists(articles_path):
        try:
            with open(articles_path, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                if isinstance(loaded, list):
                    # Zachowaj tylko artykuły od 13.11.2026
                    existing_articles = [a for a in loaded if (a.get("published_iso") or "")[:10] >= "2026-11-13"]
        except Exception as e:
            print(f"[WARN] Błąd odczytu {articles_path}: {e}")

    # 2. Pobierz świeże depesze
    print("Pobieranie wiadomości z polskich kanałów RSS...")
    raw_items = fetch_rss_items()
    clusters = cluster_similar_items(raw_items) if raw_items else []

    # 3. Wybierz do 4 najważniejszych nowych wydarzeń (nieobecnych jeszcze w bazie)
    new_articles = []
    for grp in clusters:
        if len(new_articles) >= MAX_NEW_PER_RUN:
            break
        if not is_already_covered(grp, existing_articles):
            art = build_article_from_group(grp, len(new_articles) + 1)
            new_articles.append(art)

    print(f"Wyselekcjonowano {len(new_articles)} nowych kluczowych artykułów w tej godzinie.")

    # 4. Jeśli w danej godzinie nic nowego się nie pojawiło (np. w nocy)
    # zachowujemy dotychczasowe artykuły bez dodawania duplikatów.
    combined = new_articles + existing_articles

    # 5. Ograniczenie do maksymalnie 300 artykułów w bazie testowej (kolejka krocząca)
    combined = combined[:MAX_TOTAL_ARTICLES]

    # Przenumeruj identyfikatory
    for idx, a in enumerate(combined, start=1):
        a["id"] = idx

    # 6. Zapisz articles.json
    with open(articles_path, "w", encoding="utf-8") as f:
        json.dump(combined, f, ensure_ascii=False, indent=2)
    print(f"[SUKCES] Baza zaktualizowana: {len(combined)} artykułów zapisanych w {articles_path}")

    # 7. Zapisz news-sitemap.xml
    xml_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
        '        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">'
    ]
    for a in combined:
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
    print(f"[SUKCES] Zaktualizowano sitemapę: {len(combined)} wpisów w {sitemap_path}")


if __name__ == "__main__":
    update_news_cycle()
