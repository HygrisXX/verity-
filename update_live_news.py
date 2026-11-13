#!/usr/bin/env python3
"""
VERITY - Skrypt produkcyjny pobierający artykuły z polskich kanałów RSS i Atom.
- Ograniczenie bazy testowej do maksymalnie 300 artykułów (kolejka krocząca).
- Zapis do 4 najważniejszych wydarzeń na godzinę (selekcja według liczby niezależnych redakcji i wagi tematu).
- Pobieranie oficjalnych miniatur ze źródeł (enclosure / media:content / img).
- Równoległe pobieranie z ponad 40 zweryfikowanych redakcji (ogólnopolskich, gospodarczych, regionalnych, świat, sport).
- Aktualizacja articles.json oraz news-sitemap.xml.
"""

import concurrent.futures
import html
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
    # --- Polityka, Prawo, Bezpieczeństwo ---
    {"name": "Rzeczpospolita", "url": "https://www.rp.pl/rss_main", "path": "/Polska/Polityka"},
    {"name": "Defence24", "url": "https://defence24.pl/feed", "path": "/Polska/Polityka"},
    {"name": "InfoSecurity24", "url": "https://infosecurity24.pl/feed", "path": "/Polska/Polityka"},
    {"name": "Niezależna.pl", "url": "https://niezalezna.pl/feed/", "path": "/Polska/Polityka"},
    {"name": "Newsweek Polska", "url": "https://www.newsweek.pl/.feed", "path": "/Polska/Polityka"},

    # --- Gospodarka, Finanse, Rynek Pracy, Rolnictwo ---
    {"name": "Bankier.pl", "url": "https://www.bankier.pl/rss/wiadomosci.xml", "path": "/Polska/Gospodarka"},
    {"name": "Money.pl", "url": "https://www.money.pl/rss/main.xml", "path": "/Polska/Gospodarka"},
    {"name": "WNP.pl", "url": "https://www.wnp.pl/rss/serwis_rss.xml", "path": "/Polska/Gospodarka"},
    {"name": "300Gospodarka", "url": "https://300gospodarka.pl/feed", "path": "/Polska/Gospodarka"},
    {"name": "Business Insider PL", "url": "https://businessinsider.com.pl/.feed", "path": "/Polska/Gospodarka"},
    {"name": "Forbes Polska", "url": "https://www.forbes.pl/.feed", "path": "/Polska/Gospodarka"},
    {"name": "PulsHR", "url": "https://www.pulshr.pl/rss/serwis_rss.xml", "path": "/Polska/Gospodarka"},
    {"name": "Farmer.pl", "url": "https://www.farmer.pl/rss/serwis_rss.xml", "path": "/Polska/Gospodarka"},

    # --- Energetyka, Transformacja ---
    {"name": "WysokieNapiecie.pl", "url": "https://wysokienapiecie.pl/feed/", "path": "/Polska/Energetyka"},
    {"name": "Energetyka24", "url": "https://energetyka24.com/feed", "path": "/Polska/Energetyka"},

    # --- Wydarzenia Ogólnopolskie (pełne spektrum redakcji) ---
    {"name": "RMF24", "url": "https://www.rmf24.pl/feed", "path": "/Polska"},
    {"name": "Polsat News", "url": "https://www.polsatnews.pl/rss/wszystkie.xml", "path": "/Polska"},
    {"name": "Interia Wydarzenia", "url": "https://wydarzenia.interia.pl/feed", "path": "/Polska"},
    {"name": "WP Wiadomości", "url": "https://wiadomosci.wp.pl/rss.xml", "path": "/Polska"},
    {"name": "Onet Wiadomości", "url": "https://wiadomosci.onet.pl/.feed", "path": "/Polska"},
    {"name": "TVN24", "url": "https://tvn24.pl/najnowsze.xml", "path": "/Polska"},
    {"name": "Gazeta.pl", "url": "https://wiadomosci.gazeta.pl/pub/rss/wiadomosci.htm", "path": "/Polska"},

    # --- Polska Lokalna i Regionalna (wszystkie 16 województw) ---
    {"name": "ePoznan.pl", "url": "https://epoznan.pl/rss.php", "path": "/Polska/Poznan"},
    {"name": "Głos Wielkopolski", "url": "https://gloswielkopolski.pl/rss", "path": "/Polska/Poznan", "group": "Polska Press"},
    {"name": "Warszawa w Pigułce", "url": "https://warszawawpigulce.pl/feed/", "path": "/Polska/Warszawa"},
    {"name": "Radio Kraków", "url": "https://www.radiokrakow.pl/rss.xml", "path": "/Polska/Krakow"},
    {"name": "Gazeta Krakowska", "url": "https://gazetakrakowska.pl/rss", "path": "/Polska/Krakow", "group": "Polska Press"},
    {"name": "Gazeta Wrocławska", "url": "https://gazetawroclawska.pl/rss", "path": "/Polska/Wroclaw", "group": "Polska Press"},
    {"name": "TVS Śląsk", "url": "https://tvs.pl/feed/", "path": "/Polska/Katowice"},
    {"name": "Dziennik Zachodni", "url": "https://dziennikzachodni.pl/rss", "path": "/Polska/Katowice", "group": "Polska Press"},
    {"name": "Radio Gdańsk", "url": "https://radiogdansk.pl/feed/", "path": "/Polska/Gdansk"},
    {"name": "Dziennik Bałtycki", "url": "https://dziennikbaltycki.pl/rss", "path": "/Polska/Gdansk", "group": "Polska Press"},
    {"name": "Radio Łódź", "url": "https://radiolodz.pl/feed/", "path": "/Polska/Lodz"},
    {"name": "Dziennik Łódzki", "url": "https://dzienniklodzki.pl/rss", "path": "/Polska/Lodz", "group": "Polska Press"},
    {"name": "Głos Szczeciński", "url": "https://gs24.pl/rss", "path": "/Polska/Szczecin", "group": "Polska Press"},
    {"name": "Radio PiK", "url": "https://www.radiopik.pl/rss.php", "path": "/Polska/Bydgoszcz"},
    {"name": "Gazeta Pomorska", "url": "https://pomorska.pl/rss", "path": "/Polska/Bydgoszcz", "group": "Polska Press"},
    {"name": "Radio Lublin", "url": "https://radio.lublin.pl/feed/", "path": "/Polska/Lublin"},
    {"name": "Kurier Lubelski", "url": "https://kurierlubelski.pl/rss", "path": "/Polska/Lublin", "group": "Polska Press"},
    {"name": "Radio Rzeszów", "url": "https://radio.rzeszow.pl/feed/", "path": "/Polska/Rzeszow"},
    {"name": "Nowiny24", "url": "https://nowiny24.pl/rss", "path": "/Polska/Rzeszow", "group": "Polska Press"},
    {"name": "Kurier Poranny", "url": "https://poranny.pl/rss", "path": "/Polska/Bialystok", "group": "Polska Press"},
    {"name": "Radio Olsztyn", "url": "https://radioolsztyn.pl/feed/", "path": "/Polska/Olsztyn"},
    {"name": "Radio Zachód", "url": "https://zachod.pl/feed/", "path": "/Polska/Lubuskie"},
    {"name": "Gazeta Lubuska", "url": "https://gazetalubuska.pl/rss", "path": "/Polska/Lubuskie", "group": "Polska Press"},
    {"name": "Radio Kielce", "url": "https://radiokielce.pl/feed/", "path": "/Polska/Kielce"},
    {"name": "Echo Dnia Kielce", "url": "https://echodnia.eu/rss", "path": "/Polska/Kielce", "group": "Polska Press"},
    {"name": "Nowa Trybuna Opolska", "url": "https://nto.pl/rss", "path": "/Polska/Opole", "group": "Polska Press"},

    # --- Świat, Technologia, Cyberbezpieczeństwo ---
    {"name": "Polsat News", "url": "https://www.polsatnews.pl/rss/swiat.xml", "path": "/Swiat"},
    {"name": "TVN24", "url": "https://tvn24.pl/swiat.xml", "path": "/Swiat"},
    {"name": "Niebezpiecznik", "url": "https://niebezpiecznik.pl/feed/", "path": "/Swiat"},
    {"name": "Sekurak", "url": "https://sekurak.pl/feed/", "path": "/Swiat"},
    {"name": "CHIP.pl", "url": "https://www.chip.pl/feed", "path": "/Swiat"},
    {"name": "PurePC", "url": "https://www.purepc.pl/rss.xml", "path": "/Swiat"},
    {"name": "Spider's Web", "url": "https://spidersweb.pl/feed", "path": "/Swiat"},

    # --- Sport ---
    {"name": "Sport.pl", "url": "https://www.sport.pl/pub/rss/sport.htm", "path": "/Sport"},
    {"name": "Przegląd Sportowy", "url": "https://przegladsportowy.onet.pl/.feed", "path": "/Sport"},
    {"name": "Interia Sport", "url": "https://sport.interia.pl/feed", "path": "/Sport"},
    {"name": "Polsat Sport", "url": "https://www.polsatsport.pl/rss/wszystkie.xml", "path": "/Sport"},
    {"name": "WP SportoweFakty", "url": "https://sportowefakty.wp.pl/rss.xml", "path": "/Sport"},
    {"name": "RMF24 Sport", "url": "https://www.rmf24.pl/sport/feed", "path": "/Sport"},
]

BLACKLIST = {"oko.press", "demagog.org.pl"}

PREFERRED_PRIMARY_OUTLETS = {
    "Rzeczpospolita", "Bankier.pl", "Money.pl", "WNP.pl", "300Gospodarka",
    "WysokieNapiecie.pl", "Energetyka24", "Defence24", "InfoSecurity24",
    "RMF24", "Polsat News", "Farmer.pl", "PulsHR", "Niebezpiecznik", "Sekurak",
}

OPINION_MARKERS = [
    r"\bfelieton\b",
    r"\bkomentarz\b",
    r"\bopinia\b",
    r"\bnieoficjalnie\b",
    r"\bnaszym zdaniem\b",
    r"\bhoroskop\b",
    r"\bwyniki lotto\b",
    r"\bszczęśliwe liczby\b",
    r"\bkrzyżówk",
    r"\bquiz\b",
    r"\btylko u nas\b",
    r"\bzobacz wideo\b",
    r"\bnie uwierzysz\b",
    r"\bten trik\b",
    r"\bpromocj[ae]\b",
]

EDITORIAL_URL_SEGMENTS = (
    "/opinie/", "/felietony/", "/komentarze/", "/blogi/",
    "/horoskop/", "/quiz/", "/lotto/", "/galerie/",
)


def strip_html(raw: str) -> str:
    unescaped = html.unescape(raw or "")
    text = re.sub(r"<[^>]+>", " ", unescaped)
    return re.sub(r"\s+", " ", text).strip()


def _is_valid_thumb(url: str) -> bool:
    u = (url or "").strip().lower()
    if not u.startswith(("http://", "https://")):
        return False
    bad_markers = ("1x1", "pixel", "favicon", ".svg", "logo", "spacer", "blank.gif")
    return not any(m in u for m in bad_markers)


def extract_thumbnail_from_item(item_elem, desc_raw: str) -> str:
    # 1. Sprawdź enclosure (standard RSS dla miniatur)
    for child in item_elem:
        tag = child.tag.split("}")[-1].lower()
        if tag == "enclosure":
            url = child.get("url") or ""
            ctype = (child.get("type") or "").lower()
            if _is_valid_thumb(url) and (
                "image" in ctype or any(url.lower().split("?")[0].endswith(ext) for ext in (".jpg", ".jpeg", ".png", ".webp"))
            ):
                return url.strip()

    # 2. Sprawdź media:content / media:thumbnail (atrybut url lub tekst węzła)
    for child in item_elem.iter():
        tag = child.tag.split("}")[-1].lower()
        if tag in ("thumbnail", "content"):
            url = (child.get("url") or child.text or "").strip()
            medium = (child.get("medium") or "").lower()
            if _is_valid_thumb(url) and (not medium or medium == "image"):
                return url

    # 3. Sprawdź <img> w opisie
    m = re.search(r'<img[^>]+src=["\'](https?://[^"\']+)["\']', desc_raw or "", re.IGNORECASE)
    if m and _is_valid_thumb(m.group(1)):
        return m.group(1).strip()

    return ""


def is_opinion_or_blacklisted(title: str, link: str) -> bool:
    lower_link = (link or "").lower()
    for bad in BLACKLIST:
        if bad in lower_link:
            return True
    for seg in EDITORIAL_URL_SEGMENTS:
        if seg in lower_link:
            return True
    combined = (title or "").lower()
    for pat in OPINION_MARKERS:
        if re.search(pat, combined):
            return True
    return False


def _local_tag(elem) -> str:
    return elem.tag.split("}")[-1].lower()


def _parse_feed_xml(xml_raw: bytes):
    try:
        return ET.fromstring(xml_raw)
    except Exception:
        text_clean = xml_raw.decode("utf-8", errors="ignore")
        text_clean = re.sub(r"[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD]", "", text_clean)
        if "<media:" in text_clean and "xmlns:media=" not in text_clean:
            text_clean = re.sub(r"<rss\b", '<rss xmlns:media="http://search.yahoo.com/mrss/"', text_clean, count=1)
        try:
            return ET.fromstring(text_clean.encode("utf-8"))
        except Exception:
            text_clean = re.sub(r"&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)", "&amp;", text_clean)
            return ET.fromstring(text_clean.encode("utf-8"))


def infer_category_path(default_path: str, link: str, title: str) -> str:
    u = (link or "").lower()
    if default_path in ("/Polska", "/Polska/Polityka"):
        if any(seg in u for seg in ("/swiat/", "/fakty/swiat/", "/ze-swiata/", "/zagranica/", "cyfrowa.rp.pl", "/technologie/")):
            return "/Swiat"
        if any(seg in u for seg in ("/sport/", "/tenis/", "/pilka-nozna/")):
            return "/Sport"
        if any(seg in u for seg in ("/energetyka/", "/energia/", "/oze/")):
            return "/Polska/Energetyka"
        if any(seg in u for seg in ("/gospodarka/", "/biznes/", "/ekonomia/", "/finanse/", "ekonomia.rp.pl", "/pieniadze/")):
            return "/Polska/Gospodarka"
        if any(seg in u for seg in ("/polityka/", "/kraj/", "/prawo/")):
            return "/Polska/Polityka"
    return default_path


def _fetch_single_feed(feed: dict, max_per_feed: int = 12) -> tuple:
    headers = {"User-Agent": "VerityBot/1.0 (+https://verity.pl)"}
    out = []
    try:
        req = urllib.request.Request(feed["url"], headers=headers)
        with urllib.request.urlopen(req, timeout=14) as resp:
            xml_raw = resp.read()

        root = _parse_feed_xml(xml_raw)
        is_atom = _local_tag(root) == "feed"

        nodes = [el for el in root.iter() if _local_tag(el) == ("entry" if is_atom else "item")]
        for node in nodes:
            title = ""
            raw_desc = ""
            raw_content = ""
            link = ""
            pub_date = ""

            for ch in node:
                t = _local_tag(ch)
                txt = "".join(ch.itertext()) if len(ch) else (ch.text or "")
                if t == "title" and not title:
                    title = strip_html(txt)
                elif t in ("description", "summary") and not raw_desc:
                    raw_desc = txt
                elif t in ("encoded", "content") and not raw_content:
                    raw_content = txt
                elif t == "link":
                    href = (ch.get("href") or "").strip()
                    rel = (ch.get("rel") or "alternate").strip().lower()
                    if href and (not link or rel == "alternate"):
                        link = href
                    elif not href and (ch.text or "").strip() and not link:
                        link = (ch.text or "").strip()
                elif t in ("pubdate", "updated", "published") and not pub_date:
                    pub_date = (ch.text or "").strip()

            best_raw = raw_desc if len(strip_html(raw_desc)) >= 30 else (raw_content or raw_desc)
            desc = strip_html(best_raw)

            if not title or len(desc) < 30 or not link:
                continue
            if is_opinion_or_blacklisted(title, link):
                continue

            thumb = extract_thumbnail_from_item(node, best_raw + " " + raw_content)
            inferred_path = infer_category_path(feed["path"], link, title)

            out.append({
                "outlet": feed["name"],
                "group": feed.get("group") or feed["name"],
                "path": inferred_path,
                "title": title,
                "description": desc,
                "link": link,
                "pub_date": pub_date,
                "thumbnail": thumb,
            })
            if len(out) >= max_per_feed:
                break
        return feed["name"], out, None
    except Exception as e:
        return feed["name"], [], e


def fetch_rss_items(max_per_feed: int = 12) -> list:
    items = []
    seen_keys = set()
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as executor:
        results = executor.map(lambda f: _fetch_single_feed(f, max_per_feed), LIVE_RSS_FEEDS)
        for name, feed_items, err in results:
            if err is not None:
                print(f"[WARN] Błąd pobierania {name}: {err}")
                continue
            added = 0
            for it in feed_items:
                dedup_key = (it["outlet"], it["link"])
                if dedup_key in seen_keys:
                    continue
                seen_keys.add(dedup_key)
                items.append(it)
                added += 1
            print(f"[OK] Pobrano {added} depesz z: {name}")
    return items


_PL_SUFFIXES = (
    "iejszymi", "iejszych", "iejszym", "iejszej", "iejsza", "iejsze",
    "owskiego", "owskiemu", "owskich", "owskimi", "owskim", "owskiej", "owska", "owski",
    "skiego", "skiemu", "skich", "skimi", "skim", "skiej", "ska", "ski",
    "aniami", "aniach", "aniom", "aniem", "ania", "aniu", "anie",
    "eniami", "eniach", "eniom", "eniem", "enia", "eniu", "enie",
    "iami", "iach", "iemu", "iego", "imi", "ich", "iej",
    "ami", "ach", "owi", "omu", "emu", "ego", "iom", "iem", "om", "ow",
    "ie", "iu", "em", "a", "u", "y", "i", "e", "o",
)


def _norm_pl(text: str) -> str:
    trans = str.maketrans("ąćęłńóśźż", "acelnoszz")
    return (text or "").lower().translate(trans)


def _stem_pl(word: str) -> str:
    if len(word) <= 4:
        return word
    for suf in _PL_SUFFIXES:
        if word.endswith(suf) and (len(word) - len(suf)) >= 4:
            return word[:-len(suf)]
    return word


def tokenize_title(title: str) -> set:
    words = re.findall(r"[a-z0-9]{4,}", _norm_pl(title))
    stop_words = {
        "polsce", "polska", "polski", "polskie", "polskich", "polskiego", "polsk",
        "nowe", "nowy", "nowa", "nowych", "bedzie", "beda", "jest", "roku",
        "przez", "tylko", "moze", "oraz", "wielu", "ktory", "ktora", "ktore",
        "gdzie", "kiedy", "dlaczego", "wszystko", "maja", "zostal", "zostala",
        "jako", "przed", "ponad", "miedzy", "podczas", "wedlug", "kolejny",
        "kolejne", "kolejna", "wideo", "zdjecia", "sprawdz", "zobacz",
    }
    stems = set()
    for w in words:
        if w in stop_words:
            continue
        s = _stem_pl(w)
        if s not in stop_words and len(s) >= 4:
            stems.add(s)
    return stems


def cluster_similar_items(items: list) -> list:
    """Grupuje depesze z różnych redakcji o tym samym wydarzeniu."""
    clusters = []
    used = set()
    tokens_cache = [tokenize_title(it["title"]) for it in items]

    for i, item in enumerate(items):
        if i in used:
            continue
        words_i = tokens_cache[i]
        group = [item]
        group_outlets = {item["outlet"]}
        group_syndicates = {item.get("group") or item["outlet"]}
        used.add(i)
        for j in range(i + 1, len(items)):
            synd_j = items[j].get("group") or items[j]["outlet"]
            if j in used or items[j]["outlet"] in group_outlets or synd_j in group_syndicates:
                continue
            words_j = tokens_cache[j]
            if not words_i or not words_j:
                continue
            shared = len(words_i & words_j)
            overlap = shared / max(1, min(len(words_i), len(words_j)))
            if shared >= 3 or (shared >= 2 and overlap >= 0.35):
                group.append(items[j])
                group_outlets.add(items[j]["outlet"])
                group_syndicates.add(synd_j)
                used.add(j)
        clusters.append(group)

    # Sortuj według wagi wydarzenia (liczba niezależnych grup wydawniczych, źródła faktograficzne, miniatura, treść)
    def cluster_score(grp):
        unique_groups = {it.get("group") or it["outlet"] for it in grp}
        score = len(unique_groups) * 10
        if any(it["outlet"] in PREFERRED_PRIMARY_OUTLETS for it in grp):
            score += 2
        if any(it.get("thumbnail") for it in grp):
            score += 1
        score += min(4, sum(len(it["description"]) for it in grp) // 300)
        return score

    clusters.sort(key=cluster_score, reverse=True)
    return clusters


def is_already_covered(group: list, existing_articles: list) -> bool:
    candidate_title = group[0]["title"]
    cand_titles_tokens = [tokenize_title(it["title"]) for it in group if it.get("title")]
    cand_union_tokens = set().union(*cand_titles_tokens) if cand_titles_tokens else set()
    cand_links = {it.get("link", "").strip() for it in group if it.get("link")}
    cand_slug = re.sub(r"[^a-z0-9]+", "-", _norm_pl(candidate_title)).strip("-")[:60]

    for art in existing_articles:
        # 1. Sprawdź zbieżność linków źródłowych
        existing_links = {p.get("url", "").strip() for p in art.get("perspectives", []) if p.get("url")}
        if cand_links and existing_links and (cand_links & existing_links):
            return True

        # 2. Sprawdź identyczny lub zbliżony slug
        e_slug = (art.get("seo_url", "").split("/")[-1] or "")[:60]
        if cand_slug and e_slug and cand_slug == e_slug:
            return True

        # 3. Sprawdź zbieżność rdzeni słów kluczowych (tytuł główny + tytuły ze wszystkich perspektyw)
        ext_titles = [art.get("seo_title", "")] + [p.get("summary", "") for p in art.get("perspectives", [])]
        for et in ext_titles:
            e_words = tokenize_title(et)
            if not e_words:
                continue
            for c_words in cand_titles_tokens:
                if c_words and len(c_words & e_words) >= 2:
                    overlap = len(c_words & e_words) / max(1, min(len(c_words), len(e_words)))
                    if overlap >= 0.40:
                        return True
            if cand_union_tokens and len(cand_union_tokens & e_words) >= 3:
                return True
    return False


def build_article_from_group(group: list, art_id: int) -> dict:
    now_iso = datetime.now().strftime("%Y-%m-%dT%H:%M:%S+01:00")
    now_display = datetime.now().strftime("%d.%m.%Y, %H:%M")

    # Wybierz reprezentatywną pozycję (preferuj neutralne/specjalistyczne redakcje + miniaturę)
    def item_rank(it):
        return (
            1 if it["outlet"] in PREFERRED_PRIMARY_OUTLETS else 0,
            1 if (ENABLE_THUMBNAILS and it.get("thumbnail")) else 0,
            len(it.get("description", "")),
        )

    ranked_group = sorted(group, key=item_rank, reverse=True)
    primary = ranked_group[0]
    thumbnail_url = next((it["thumbnail"] for it in ranked_group if it.get("thumbnail")), "") if ENABLE_THUMBNAILS else ""
    sources = sorted(list({it["outlet"] for it in ranked_group}))

    # Czysty slug
    slug = re.sub(r"[^a-z0-9]+", "-", _norm_pl(primary["title"])).strip("-")[:75]

    sections = []
    for it in ranked_group:
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
        for it in ranked_group[:6]
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
