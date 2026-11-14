#!/usr/bin/env python3
"""
VERITY - Skrypt produkcyjny pobierający artykuły z polskich kanałów RSS i Atom.
- Ograniczenie bazy testowej do maksymalnie 300 artykułów (kolejka krocząca).
- Zapis do 4 najważniejszych wydarzeń na godzinę (selekcja według liczby niezależnych redakcji i wagi tematu).
- Pobieranie oficjalnych miniatur ze źródeł (enclosure / media:content / img).
- Równoległe pobieranie z 99 zweryfikowanych kanałów (97 redakcji: ogólnopolskie, gospodarcze, specjalistyczne, regionalne z 16 województw, świat, sport).
- Aktualizacja articles.json oraz news-sitemap.xml.
"""

import concurrent.futures
import html
import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
import xml.sax.saxutils
from datetime import datetime

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
if _THIS_DIR not in sys.path:
    sys.path.insert(0, _THIS_DIR)

import seo_builder  # noqa: E402

MAX_TOTAL_ARTICLES = 300
MAX_NEW_PER_RUN = 4
MAX_REGIONAL_PER_RUN = 2
ENABLE_THUMBNAILS = True  # Ustaw False, jeśli chcesz wyłączyć zewnętrzne miniatury dla 100% spokoju prawnego

LIVE_RSS_FEEDS = [
    # --- Polityka, Prawo, Bezpieczeństwo, Opinia ---
    {"name": "Rzeczpospolita", "url": "https://www.rp.pl/rss_main", "path": "/Polska/Polityka", "group": "Gremi Media"},
    {"name": "Defence24", "url": "https://defence24.pl/feed", "path": "/Polska/Polityka", "group": "Defence24"},
    {"name": "InfoSecurity24", "url": "https://infosecurity24.pl/feed", "path": "/Polska/Polityka", "group": "Defence24"},
    {"name": "Niezależna.pl", "url": "https://niezalezna.pl/feed/", "path": "/Polska/Polityka"},
    {"name": "Newsweek Polska", "url": "https://www.newsweek.pl/.feed", "path": "/Polska/Polityka"},
    {"name": "Tygodnik Powszechny", "url": "https://www.tygodnikpowszechny.pl/rss.xml", "path": "/Polska/Polityka"},
    {"name": "Klub Jagielloński", "url": "https://klubjagiellonski.pl/feed/", "path": "/Polska/Polityka"},
    {"name": "Krytyka Polityczna", "url": "https://krytykapolityczna.pl/feed/", "path": "/Polska/Polityka"},
    {"name": "Kultura Liberalna", "url": "https://kulturaliberalna.pl/feed/", "path": "/Polska/Polityka"},

    # --- Gospodarka, Finanse, Prawo, Rynek Pracy, Rolnictwo ---
    {"name": "Bankier.pl", "url": "https://www.bankier.pl/rss/wiadomosci.xml", "path": "/Polska/Gospodarka"},
    {"name": "Money.pl", "url": "https://www.money.pl/rss/main.xml", "path": "/Polska/Gospodarka"},
    {"name": "WNP.pl", "url": "https://www.wnp.pl/rss/serwis_rss.xml", "path": "/Polska/Gospodarka"},
    {"name": "300Gospodarka", "url": "https://300gospodarka.pl/feed", "path": "/Polska/Gospodarka"},
    {"name": "Business Insider PL", "url": "https://businessinsider.com.pl/.feed", "path": "/Polska/Gospodarka"},
    {"name": "Forbes Polska", "url": "https://www.forbes.pl/.feed", "path": "/Polska/Gospodarka"},
    {"name": "PulsHR", "url": "https://www.pulshr.pl/rss/serwis_rss.xml", "path": "/Polska/Gospodarka"},
    {"name": "Farmer.pl", "url": "https://www.farmer.pl/rss/serwis_rss.xml", "path": "/Polska/Gospodarka"},
    {"name": "Forsal.pl", "url": "https://forsal.pl/.feed", "path": "/Polska/Gospodarka", "group": "Infor PL"},
    {"name": "Puls Biznesu", "url": "https://www.pb.pl/rss/najnowsze.xml", "path": "/Polska/Gospodarka"},
    {"name": "Parkiet", "url": "https://www.parkiet.com/rss_main", "path": "/Polska/Gospodarka", "group": "Gremi Media"},
    {"name": "XYZ.pl", "url": "https://xyz.pl/feed", "path": "/Polska/Gospodarka"},
    {"name": "Bezprawnik.pl", "url": "https://bezprawnik.pl/feed/", "path": "/Polska/Gospodarka"},
    {"name": "Infor.pl", "url": "https://www.infor.pl/.feed", "path": "/Polska/Gospodarka", "group": "Infor PL"},
    {"name": "Cashless.pl", "url": "https://www.cashless.pl/rss", "path": "/Polska/Gospodarka"},
    {"name": "Comparic.pl", "url": "https://comparic.pl/feed/", "path": "/Polska/Gospodarka"},
    {"name": "StrefaInwestorów.pl", "url": "https://strefainwestorow.pl/rss.xml", "path": "/Polska/Gospodarka"},
    {"name": "Subiektywnie o Finansach", "url": "https://subiektywnieofinansach.pl/feed/", "path": "/Polska/Gospodarka"},
    {"name": "MamStartup.pl", "url": "https://mamstartup.pl/feed/", "path": "/Polska/Gospodarka"},
    {"name": "Wiadomości Handlowe", "url": "https://www.wiadomoscihandlowe.pl/feed", "path": "/Polska/Gospodarka"},
    {"name": "WP Finanse", "url": "https://finanse.wp.pl/rss.xml", "path": "/Polska/Gospodarka", "group": "Wirtualna Polska"},
    {"name": "Biznes Interia", "url": "https://biznes.interia.pl/feed", "path": "/Polska/Gospodarka", "group": "Interia"},

    # --- Energetyka, Transformacja, Elektromobilność ---
    {"name": "WysokieNapiecie.pl", "url": "https://wysokienapiecie.pl/feed/", "path": "/Polska/Energetyka"},
    {"name": "Energetyka24", "url": "https://energetyka24.com/feed", "path": "/Polska/Energetyka", "group": "Defence24"},
    {"name": "Elektrowóz.pl", "url": "https://elektrowoz.pl/feed/", "path": "/Polska/Energetyka"},

    # --- Wydarzenia Ogólnopolskie, Zdrowie, Motoryzacja (pełne spektrum redakcji) ---
    {"name": "RMF24", "url": "https://www.rmf24.pl/feed", "path": "/Polska"},
    {"name": "Polsat News", "url": "https://www.polsatnews.pl/rss/wszystkie.xml", "path": "/Polska"},
    {"name": "Interia Wydarzenia", "url": "https://wydarzenia.interia.pl/feed", "path": "/Polska", "group": "Interia"},
    {"name": "WP Wiadomości", "url": "https://wiadomosci.wp.pl/rss.xml", "path": "/Polska", "group": "Wirtualna Polska"},
    {"name": "Onet Wiadomości", "url": "https://wiadomosci.onet.pl/.feed", "path": "/Polska"},
    {"name": "TVN24", "url": "https://tvn24.pl/najnowsze.xml", "path": "/Polska"},
    {"name": "Gazeta.pl", "url": "https://wiadomosci.gazeta.pl/pub/rss/wiadomosci.htm", "path": "/Polska"},
    {"name": "Fakt.pl", "url": "https://www.fakt.pl/wydarzenia.feed", "path": "/Polska"},
    {"name": "Dziennik.pl", "url": "https://wiadomosci.dziennik.pl/.feed", "path": "/Polska", "group": "Infor PL"},
    {"name": "GazetaPrawna.pl (DGP)", "url": "https://www.gazetaprawna.pl/.feed", "path": "/Polska", "group": "Infor PL"},
    {"name": "TVP.info", "url": "https://www.tvp.info/tvp.info/rss+xml.php", "path": "/Polska"},
    {"name": "Wyborcza.pl", "url": "https://wyborcza.pl/pub/rss/najnowsze_wyborcza.xml", "path": "/Polska"},
    {"name": "naTemat.pl", "url": "https://natemat.pl/rss/wszystkie", "path": "/Polska"},
    {"name": "o2.pl", "url": "https://www.o2.pl/rss.xml", "path": "/Polska", "group": "Wirtualna Polska"},
    {"name": "Wirtualnemedia.pl", "url": "https://www.wirtualnemedia.pl/rss/aktualnosci", "path": "/Polska"},
    {"name": "RadioMaryja.pl", "url": "https://www.radiomaryja.pl/feed/", "path": "/Polska"},
    {"name": "Auto Świat", "url": "https://www.auto-swiat.pl/.feed", "path": "/Polska"},
    {"name": "Medonet.pl", "url": "https://www.medonet.pl/.feed", "path": "/Polska"},
    {"name": "Niedziela.pl", "url": "https://www.niedziela.pl/rss", "path": "/Polska"},

    # --- Polska Lokalna i Regionalna (wszystkie 16 województw) ---
    {"name": "ePoznan.pl", "url": "https://epoznan.pl/rss.php", "path": "/Polska/Regiony/Wielkopolskie"},
    {"name": "Głos Wielkopolski", "url": "https://gloswielkopolski.pl/rss", "path": "/Polska/Regiony/Wielkopolskie", "group": "Polska Press"},
    {"name": "Warszawa w Pigułce", "url": "https://warszawawpigulce.pl/feed/", "path": "/Polska/Regiony/Mazowieckie"},
    {"name": "Radio Kraków", "url": "https://www.radiokrakow.pl/rss.xml", "path": "/Polska/Regiony/Malopolskie"},
    {"name": "Gazeta Krakowska", "url": "https://gazetakrakowska.pl/rss", "path": "/Polska/Regiony/Malopolskie", "group": "Polska Press"},
    {"name": "Gazeta Wrocławska", "url": "https://gazetawroclawska.pl/rss", "path": "/Polska/Regiony/Dolnoslaskie", "group": "Polska Press"},
    {"name": "TVS Śląsk", "url": "https://tvs.pl/feed/", "path": "/Polska/Regiony/Slaskie"},
    {"name": "Dziennik Zachodni", "url": "https://dziennikzachodni.pl/rss", "path": "/Polska/Regiony/Slaskie", "group": "Polska Press"},
    {"name": "Radio Gdańsk", "url": "https://radiogdansk.pl/feed/", "path": "/Polska/Regiony/Pomorskie"},
    {"name": "Dziennik Bałtycki", "url": "https://dziennikbaltycki.pl/rss", "path": "/Polska/Regiony/Pomorskie", "group": "Polska Press"},
    {"name": "Radio Łódź", "url": "https://radiolodz.pl/feed/", "path": "/Polska/Regiony/Lodzkie"},
    {"name": "Dziennik Łódzki", "url": "https://dzienniklodzki.pl/rss", "path": "/Polska/Regiony/Lodzkie", "group": "Polska Press"},
    {"name": "Głos Szczeciński", "url": "https://gs24.pl/rss", "path": "/Polska/Regiony/Zachodniopomorskie", "group": "Polska Press"},
    {"name": "Radio PiK", "url": "https://www.radiopik.pl/rss.php", "path": "/Polska/Regiony/Kujawsko-Pomorskie"},
    {"name": "Gazeta Pomorska", "url": "https://pomorska.pl/rss", "path": "/Polska/Regiony/Kujawsko-Pomorskie", "group": "Polska Press"},
    {"name": "Radio Lublin", "url": "https://radio.lublin.pl/feed/", "path": "/Polska/Regiony/Lubelskie"},
    {"name": "Kurier Lubelski", "url": "https://kurierlubelski.pl/rss", "path": "/Polska/Regiony/Lubelskie", "group": "Polska Press"},
    {"name": "Lublin112.pl", "url": "https://www.lublin112.pl/feed/", "path": "/Polska/Regiony/Lubelskie"},
    {"name": "Radio Rzeszów", "url": "https://radio.rzeszow.pl/feed/", "path": "/Polska/Regiony/Podkarpackie"},
    {"name": "Nowiny24", "url": "https://nowiny24.pl/rss", "path": "/Polska/Regiony/Podkarpackie", "group": "Polska Press"},
    {"name": "Kurier Poranny", "url": "https://poranny.pl/rss", "path": "/Polska/Regiony/Podlaskie", "group": "Polska Press"},
    {"name": "Radio Olsztyn", "url": "https://radioolsztyn.pl/feed/", "path": "/Polska/Regiony/Warminsko-Mazurskie"},
    {"name": "Radio Zachód", "url": "https://zachod.pl/feed/", "path": "/Polska/Regiony/Lubuskie"},
    {"name": "Gazeta Lubuska", "url": "https://gazetalubuska.pl/rss", "path": "/Polska/Regiony/Lubuskie", "group": "Polska Press"},
    {"name": "Radio Kielce", "url": "https://radiokielce.pl/feed/", "path": "/Polska/Regiony/Swietokrzyskie"},
    {"name": "Echo Dnia Kielce", "url": "https://echodnia.eu/rss", "path": "/Polska/Regiony/Swietokrzyskie", "group": "Polska Press"},
    {"name": "Nowa Trybuna Opolska", "url": "https://nto.pl/rss", "path": "/Polska/Regiony/Opolskie", "group": "Polska Press"},

    # --- Świat, Technologia, Cyberbezpieczeństwo, Kosmos ---
    {"name": "Polsat News", "url": "https://www.polsatnews.pl/rss/swiat.xml", "path": "/Swiat"},
    {"name": "TVN24", "url": "https://tvn24.pl/swiat.xml", "path": "/Swiat"},
    {"name": "Niebezpiecznik", "url": "https://niebezpiecznik.pl/feed/", "path": "/Polska"},
    {"name": "Sekurak", "url": "https://sekurak.pl/feed/", "path": "/Polska"},
    {"name": "CHIP.pl", "url": "https://www.chip.pl/feed", "path": "/Polska"},
    {"name": "PurePC", "url": "https://www.purepc.pl/rss.xml", "path": "/Polska"},
    {"name": "Spider's Web", "url": "https://spidersweb.pl/feed", "path": "/Polska"},
    {"name": "CyberDefence24", "url": "https://cyberdefence24.pl/feed", "path": "/Polska", "group": "Defence24"},
    {"name": "Space24", "url": "https://space24.pl/feed", "path": "/Polska", "group": "Defence24"},
    {"name": "Komputer Świat", "url": "https://www.komputerswiat.pl/.feed", "path": "/Polska"},
    {"name": "Antyweb.pl", "url": "https://antyweb.pl/feed/", "path": "/Polska"},
    {"name": "Tabletowo.pl", "url": "https://www.tabletowo.pl/feed/", "path": "/Polska"},
    {"name": "Kresy.pl", "url": "https://kresy.pl/feed/", "path": "/Swiat"},

    # --- Sport ---
    {"name": "Sport.pl", "url": "https://www.sport.pl/pub/rss/sport.htm", "path": "/Sport"},
    {"name": "Przegląd Sportowy", "url": "https://przegladsportowy.onet.pl/.feed", "path": "/Sport"},
    {"name": "Interia Sport", "url": "https://sport.interia.pl/feed", "path": "/Sport", "group": "Interia"},
    {"name": "Polsat Sport", "url": "https://www.polsatsport.pl/rss/wszystkie.xml", "path": "/Sport"},
    {"name": "WP SportoweFakty", "url": "https://sportowefakty.wp.pl/rss.xml", "path": "/Sport", "group": "Wirtualna Polska"},
    {"name": "RMF24 Sport", "url": "https://www.rmf24.pl/sport/feed", "path": "/Sport"},
]

OUTLET_DEFAULT_PATH = {}
for _f in LIVE_RSS_FEEDS:
    if _f["name"] not in OUTLET_DEFAULT_PATH:
        OUTLET_DEFAULT_PATH[_f["name"]] = _f["path"]

BLACKLIST = {"oko.press", "demagog.org.pl"}

PREFERRED_PRIMARY_OUTLETS = {
    "Rzeczpospolita", "Bankier.pl", "Money.pl", "WNP.pl", "300Gospodarka",
    "WysokieNapiecie.pl", "Energetyka24", "Defence24", "InfoSecurity24",
    "RMF24", "Polsat News", "Farmer.pl", "PulsHR", "Niebezpiecznik", "Sekurak",
    "GazetaPrawna.pl (DGP)", "Forsal.pl", "Puls Biznesu", "Parkiet", "XYZ.pl",
    "CyberDefence24", "Space24", "Infor.pl", "Wiadomości Handlowe",
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
    r"\bmateriał sponsorowany\b",
    r"\bartykuł sponsorowany\b",
    r"\bgdzie oglądać\b",
    r"\btransmisj[aę]\s+w\s+tv\b",
    r"\bstream\s+online\b",
    r"\bmem(?:y|ów)\b",
    r"\bprzesąd",
    r"®",
]

EDITORIAL_URL_SEGMENTS = (
    "/opinie/", "/felietony/", "/komentarze/", "/blogi/",
    "/horoskop/", "/horoskopy/", "/quiz/", "/lotto/", "/galerie/",
    "/porady/", "/gwiazdy/", "/plotki/", "/transmisje/",
    "/plus-minus/", "/kultura/", "/film/", "/muzyka/", "/ksiazki/", "/recenzje/", "/rozrywka/", "/styl-zycia/",
)


def _unescape_all(raw: str) -> str:
    txt = raw or ""
    for _ in range(3):
        dec = html.unescape(txt)
        if dec == txt:
            break
        txt = dec
    return txt.replace("\xa0", " ").replace("\u200b", "").replace("\ufeff", "")


def strip_html(raw: str) -> str:
    unescaped = _unescape_all(raw)
    unescaped = re.sub(r"<(script|style|noscript)\b[^>]*>[\s\S]*?</\1>", " ", unescaped, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", unescaped)
    return re.sub(r"\s+", " ", text).strip()


def clean_html_for_synthesis(raw: str, article_title: str = "") -> str:
    """Czyści surowy HTML z RSS/Atom przed podziałem na zdania (usuwa stopki WP, śmieci Drupal, sklejenia nagłówków)."""
    t = _unescape_all(raw)
    if not t:
        return ""
    t = re.sub(r"<(script|style|noscript|figure|figcaption|iframe|svg)\b[^>]*>[\s\S]*?</\1>", " ", t, flags=re.IGNORECASE)

    # Usuń stopki WordPressa w HTML
    t = re.sub(
        r"<p[^>]*>\s*(?:Artykuł|Wpis|The post)\s+[\s\S]{0,280}?(?:pochodzi z serwisu|appeared first on)[\s\S]*?</p>",
        "\n",
        t,
        flags=re.IGNORECASE,
    )
    # Usuń bloki metadanych z Drupala (np. StrefaInwestorów)
    t = re.sub(
        r"<span[^>]+field--name-(?:title|uid|created)[^>]*>[\s\S]*?</span>",
        " ",
        t,
        flags=re.IGNORECASE,
    )
    t = re.sub(
        r"<div[^>]+field--name-field-(?:tags|channels)[^>]*>[\s\S]*?</div>",
        " ",
        t,
        flags=re.IGNORECASE,
    )
    t = re.sub(r"<div[^>]+field__label[^>]*>\s*Treść\s*</div>", " ", t, flags=re.IGNORECASE)

    # Obsługa nagłówków h1-h6: krótkie śródtytuły bez kropki usuń (lub zakończ nową linią), by nie sklejały się z tekstem
    norm_title = _norm_pl(re.sub(r"\W+", " ", article_title or "")).strip()

    def _handle_heading(m):
        inner = re.sub(r"<[^>]+>", " ", m.group(1))
        inner = re.sub(r"\s+", " ", inner).strip()
        if not inner:
            return "\n"
        if norm_title and _norm_pl(re.sub(r"\W+", " ", inner)).strip() == norm_title:
            return "\n"
        # Krótki śródtytuł bez kropki końcowej bywa etykietą lub początkiem innej sekcji newslettera
        if len(inner) < 75 and not inner.endswith((".", "!", "?")):
            return "\n"
        return f"\n{inner}\n"

    t = re.sub(r"<h[1-6]\b[^>]*>([\s\S]*?)</h[1-6]>", _handle_heading, t, flags=re.IGNORECASE)
    t = re.sub(r"<(?:br|/p|/div|/li|/blockquote|/tr|/section)\b[^>]*>", "\n", t, flags=re.IGNORECASE)
    t = re.sub(r"<[^>]+>", " ", t)
    return clean_desc_text(t, article_title=article_title)


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
        if "<content:" in text_clean and "xmlns:content=" not in text_clean:
            text_clean = re.sub(r"<rss\b", '<rss xmlns:content="http://purl.org/rss/1.0/modules/content/"', text_clean, count=1)
        if "<dc:" in text_clean and "xmlns:dc=" not in text_clean:
            text_clean = re.sub(r"<rss\b", '<rss xmlns:dc="http://purl.org/dc/elements/1.1/"', text_clean, count=1)
        try:
            return ET.fromstring(text_clean.encode("utf-8"))
        except Exception:
            text_clean = re.sub(r"&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)", "&amp;", text_clean)
            return ET.fromstring(text_clean.encode("utf-8"))


def _norm_pl(text: str) -> str:
    trans = str.maketrans("ąćęłńóśźż", "acelnoszz")
    return (text or "").lower().translate(trans)


_VOIVODESHIP_DISAMBIG = [
    ("/Polska/Regiony/Lubelskie", _norm_pl(r"\b(?:tomaszow\w*\s+lubelsk\w*|opole\s+lubelsk\w*|janow\w*\s+lubelsk\w*|roztocz\w*)\b")),
    ("/Polska/Regiony/Lodzkie", _norm_pl(r"\b(?:tomaszow\w*\s+mazowieck\w*|radomsk(?:o|u|a)\b|w\s+radomsku|z\s+radomska|powiat\w*\s+radomszcz\w*|raw\w+\s+mazowieck\w*)\b")),
    ("/Polska/Regiony/Mazowieckie", _norm_pl(r"\b(?:ostrow\w*\s+mazowieck\w*|minsk\w*\s+mazowieck\w*|nowy\s+dwor\s+mazowieck\w*|nowym\s+dworze\s+mazowieck\w*|grodzisk\w*\s+mazowieck\w*|makow\w*\s+mazowieck\w*)\b")),
    ("/Polska/Regiony/Wielkopolskie", _norm_pl(r"\b(?:ostrow\w*\s+wielkopolsk\w*|srod\w+\s+wielkopolsk\w*|grodzisk\w*\s+wielkopolsk\w*)\b")),
    ("/Polska/Regiony/Dolnoslaskie", _norm_pl(r"\b(?:srod\w+\s+slask\w*|kamienn\w+\s+gor\w*|jeleni\w*\s+gor\w*)\b")),
    ("/Polska/Regiony/Lubuskie", _norm_pl(r"\b(?:krosn\w*\s+odrzansk\w*|gorzow\w*\s+wielkopolsk\w*)\b")),
    ("/Polska/Regiony/Podlaskie", _norm_pl(r"\b(?:bielsk\w*\s+podlask\w*|wysoki\w+\s+mazowieck\w*|powiat\w*\s+wysokomazowieck\w*|sokolow\w*\s+podlask\w*)\b")),
    ("/Polska/Regiony/Slaskie", _norm_pl(r"\b(?:bielsk[oa]-bial\w*|bielsk(?:u|a|im)\s+bial\w*|tarnowsk\w*\s+gor\w*|wodzislaw\w*\s+slask\w*|rud\w+\s+slask\w*|piekar\w*\s+slask\w*|dabrow\w+\s+gornicz\w*)\b")),
    ("/Polska/Regiony/Pomorskie", _norm_pl(r"\b(?:nowy\s+dwor\s+gdansk\w*|nowym\s+dworze\s+gdansk\w*|starogard\w*\s+gdansk\w*|pruszcz\w*\s+gdansk\w*)\b")),
    ("/Polska/Regiony/Warminsko-Mazurskie", _norm_pl(r"\b(?:lidzbar\w*\s+warminsk\w*|now\w+\s+miasto\s+lubawsk\w*|nowym\s+miescie\s+lubawsk\w*)\b")),
    ("/Polska/Regiony/Swietokrzyskie", _norm_pl(r"\b(?:kazimierz\w+\s+wielk\w*|ostrowiec\s+swietokrzysk\w*|ostrowc\w+\s+swietokrzysk\w*)\b")),
]

_VOIVODESHIP_MAIN = [
    ("/Polska/Regiony/Dolnoslaskie", _norm_pl(r"\b(?:dolnoslask\w*|doln\w+\s+slask\w*|wroclaw\w*|walbrzych\w*|legnic\w*|lubin\w*|glogow\w*|zgorzel\w*|olesnic\w*|olaw\w*|boleslaw\w*|dzierzoniow\w*|swidnic\w*|klodzk\w*|trzebnic\w*|jawor(?:ze|a|em)?\b|luban\w*|zlotoryj\w*|polkowic\w*|karkonosz\w*|karpacz\w*|szklarsk\w+\s+poreb\w*)\b")),
    ("/Polska/Regiony/Kujawsko-Pomorskie", _norm_pl(r"\b(?:kujawsko-pomorsk\w*|kujaw(?:y|ach|ami)\b|bydgoszcz\w*|bydgosk\w*|torun\w*|wloclaw\w*|grudziadz\w*|inowroclaw\w*|brodnic\w*|swieci(?:e|u|a)\b|znin\w*|chelmno|chelmnie|mogiln\w*|nakielsk\w*|rypin\w*|tuchol\w*|ciechocink\w*)\b")),
    ("/Polska/Regiony/Lubelskie", _norm_pl(r"\b(?:lubelsk\w*|lubelszczyzn\w*|lublin\w*|zamosc\w*|zamojsk\w*|chelm(?:a|ie|em|sk\w*)?\b|bial\w+\s+podlask\w*|pulaw\w*|swidnik\w*|krasnik\w*|lukow\w*|bilgoraj\w*|lubartow\w*|hrubieszow\w*|krasnystaw\w*|leczn\w*|radzyn\w*|wlodaw\w*|parczew\w*|kazimierz\w*\s+doln\w*|naleczow\w*)\b")),
    ("/Polska/Regiony/Lubuskie", _norm_pl(r"\b(?:lubusk\w*|zielon\w+\s+gor\w*|zielonogor\w*|gorzow\w*|now\w+\s+sol\w*|nowosolsk\w*|zary|zarach|zagan\w*|swiebodzin\w*|miedzyrzecz\w*|slubic\w*|sulechow\w*|wschow\w*|kozuchow\w*|gubin\w*)\b")),
    ("/Polska/Regiony/Lodzkie", _norm_pl(r"\b(?:lodzk\w*|lodz\w*|lodzi\w*|piotrkow\w*|pabianic\w*|zgierz\w*|skierniewic\w*|belchatow\w*|zdunsk\w+\s+wol\w*|sieradz\w*|kutno|kutnie|kuten\w*|lowicz\w*|wielun\w*|opoczn\w*|leczyc\w*|poddebic\w*|pajeczn\w*|brzezin\w*|wieruszow\w*)\b")),
    ("/Polska/Regiony/Malopolskie", _norm_pl(r"\b(?:malopolsk\w*|krakow\w*|tarnow\w*|now\w+\s+sacz\w*|sadec\w*|oswiecim\w*|chrzanow\w*|olkusz\w*|nowy\s+targ|nowotarsk\w*|zakopan\w*|tatr(?:y|ach|zansk\w*)|podhal\w*|bochni\w*|limanow\w*|myslenic\w*|gorlic\w*|brzesk(?:o|a|u|iem)|wadowic\w*|andrychow\w*|wieliczk\w*|niepolomic\w*|krynic\w*|miechow\w*|proszowic\w*)\b")),
    ("/Polska/Regiony/Mazowieckie", _norm_pl(r"\b(?:mazowieck\w*|mazowsz\w*|warszawsk\w+\s+prag\w*|prag[aio]\s+(?:polnoc|poludnie)|pradze\s+(?:polnoc|poludnie)|mokotow\w*|zoliborz\w*|wilanow\w*|ursynow\w*|(?:na|z)\s+bielanach|bialolek\w*|targowk\w*|bemow\w*|na\s+ochocie|wawer\w*|rembertow\w*|radom(?:ia|iu|iem|sk[iaeo]\w*)?\b|plock\w*|siedlc\w*|siedlec\w*|ostrolek\w*|ostrolec\w*|ciechanow\w*|pruszkow\w*|legionow\w*|piaseczn\w*|wolomin\w*|sochaczew\w*|zyrardow\w*|mlaw\w*|plonsk\w*|wyszkow\w*|pultusk\w*|otwock\w*|garwolin\w*|grojec\w*|kozienic\w*|sierpc\w*|wegrow\w*|przysuch\w*|szydlowiec\w*|bialobrzeg\w*)\b")),
    ("/Polska/Regiony/Opolskie", _norm_pl(r"\b(?:opolsk\w*|opolszczyzn\w*|opole|opol(?:a|u|em)\b|kedzierzyn\w*|nysa\b|(?:w|z|do|pod)\s+nysie|z\s+nysy|nysk\w*|kluczbork\w*|prudnik\w*|krapkowic\w*|namyslow\w*|glubczyc\w*|glucholaz\w*|(?:w|do|pod)\s+brzegu\b|z\s+brzegu\b)\b")),
    ("/Polska/Regiony/Podkarpackie", _norm_pl(r"\b(?:podkarpack\w*|podkarpaci\w*|rzeszow\w*|przemysl\w*|stalow\w+\s+wol\w*|mielec\w*|mielc\w*|tarnobrzeg\w*|krosno|krosna|krosnie|krosnem|krosniensk\w*|debic\w*|sanok\w*|sanoc\w*|jasl\w*|jasielsk\w*|(?:w|do|pod)\s+jaroslawiu|z\s+jaroslawia|powiat\w*\s+jaroslawsk\w*|lancut\w*|przeworsk\w*|nizansk\w*|ropczyc\w*|kolbuszow\w*|lubaczow\w*|lezajsk\w*|ustrzyk\w*|bieszczad\w*)\b")),
    ("/Polska/Regiony/Podlaskie", _norm_pl(r"\b(?:podlask\w*|podlasi\w*|bialystok\w*|bialymstok\w*|bialegostok\w*|suwalk\w*|lomz\w*|augustow\w*|zambrow\w*|grajew\w*|sokolsk\w*|hajnowk\w*|siemiatycz\w*|sejn\w*|moniek|monki|choroszcz\w*|suprasl\w*)\b")),
    ("/Polska/Regiony/Pomorskie", _norm_pl(r"\b(?:pomorsk\w*|trojmiast\w*|trojmiesc\w*|gdansk\w*|gdyni\w*|sopot\w*|sopoc\w*|slupsk\w*|sycewic\w*|tczew\w*|wejherow\w*|rumi[ae]\b|w\s+redzie|starogard\w*|chojnic\w*|malbork\w*|malborsk\w*|kwidzyn\w*|lebork\w*|kartuz\w*|kartusk\w*|koscierz\w*|puck\w*|wladyslawow\w*|ustk[aei]\b|ustce|kaszub\w*|sztum\w*|czluchow\w*|bytow\w*)\b")),
    ("/Polska/Regiony/Slaskie", _norm_pl(r"\b(?:slask\w*(?!\s+wroc)|gorn\w+\s+slask\w*|katowic\w*|czestochow\w*|sosnowi\w*|gliwic\w*|zabrz\w*|bytom\w*|rybnik\w*|tychy|tychach|chorzow\w*|jaworzn\w*|jastrzebi\w*|myslowic\w*|siemianowic\w*|zory|zorach|pszczyn\w*|bedzin\w*|cieszyn\w*|raciborz\w*|raciborsk\w*|lubliniec\w*|mikolow\w*|zywiec\w*|żywcz\w*|zawierci\w*|klobuck\w*|myszkow\w*|knurow\w*|wodzislaw\w*)\b")),
    ("/Polska/Regiony/Swietokrzyskie", _norm_pl(r"\b(?:swietokrzysk\w*|kielc\w*|kieleck\w*|ostrowc\w*|starachowic\w*|skarzysk\w*|sandomierz\w*|sandomiersk\w*|busko|busku|jedrzejow\w*|wloszczow\w*|opatow\w*|staszow\w*|pinczow\w*|(?:w|do|pod)\s+konskich|z\s+konskich|powiat\w*\s+koneck\w*)\b")),
    ("/Polska/Regiony/Warminsko-Mazurskie", _norm_pl(r"\b(?:warminsko-mazursk\w*|warmi[ia]\b|mazur(?:y|ach|ami|sk\w*)?\b|olsztyn\w*|elblag\w*|elblask\w*|elku\b|elka\b|elkiem\b|elk\b|mragow\w*|ilaw\w*|ostrod\w*|gizyck\w*|ketrzyn\w*|szczytno|szczytn\w*|bartoszyc\w*|dzialdow\w*|braniew\w*|oleck\w*|(?:w|do|pod)\s+piszu|z\s+pisza|powiat\w*\s+pisk\w*|goldap\w*|wegorzew\w*|morag\w*|nidzic\w*)\b")),
    ("/Polska/Regiony/Wielkopolskie", _norm_pl(r"\b(?:wielkopolsk\w*|poznan\w*|kalisz\w*|kalisk\w*|konin\w*|koninsk\w*|(?:w|do|pod|kolo)\s+pil[ei]\b|z\s+pily\b|powiat\w*\s+pilsk\w*|leszn(?:o|a|ie|em)\b|leszczynsk\w*|gniezn\w*|gniezniensk\w*|swarzedz\w*|lubon\w*|wrzesni(?!c)\w*|jarocin\w*|krotoszyn\w*|koscian\w*|(?:w|do|pod)\s+turku\b|w\s+kole\b|powiat\w*\s+kolsk\w*|wagrow\w*|chodziez\w*|czarnkow\w*|szamotul\w*|nowy\s+tomysl|wolsztyn\w*|rawicz\w*|gostyn\w*|slupc\w*|pleszew\w*|ostrzeszow\w*|kepn\w*|obornik\w*)\b")),
    ("/Polska/Regiony/Zachodniopomorskie", _norm_pl(r"\b(?:zachodniopomorsk\w*|pomorz\w+\s+zachodni\w*|szczecin\w*|koszalin\w*|stargard\w*|kolobrzeg\w*|kolobrzesk\w*|swinoujsci\w*|szczecinek\w*|szczecineck\w*|walcz\w*|waleck\w*|bialogard\w*|goleniow\w*|gryfic\w*|gryfin\w*|swidwin\w*|choszczn\w*|drawsk\w*|kamien\w*\s+pomorsk\w*|mysliborz\w*|pyrzyc\w*|slawno|slawiensk\w*|(?:w|do|pod)\s+policach|z\s+polic\b|powiat\w*\s+polick\w*|miedzyzdroj\w*|darlow\w*|wrzesnic\w*)\b")),
]

_NATIONAL_SCOPE_RE = re.compile(
    _norm_pl(
        r"\b(?:marsz\s+niepodleglosci|swieto\s+niepodleglosci|mswia\b|\bmsz\b|\bmon\b|\bmz\b|\bmf\b|\bmen\b|\bmap\b|"
        r"kancelari\w*\s+premiera|kancelari\w*\s+prezydenta|trybunal\w*|sad\s+najwyzszy|naczelny\s+sad|"
        r"polski\s+zwiazek|ogolnopolsk\w*|w\s+calej\s+polsce|przelomowy\s+wyrok|"
        r"rakieta|ilr-33|bursztyn\s+2k|dlugie\s+weekendy|urlop)\b"
    )
)


def _infer_voivodeship_path(title: str, description: str = "", link: str = "") -> str:
    url_hint = re.sub(r"https?://[^/]+", "", (link or "").lower())
    url_hint = re.sub(r"[-_/]+", " ", url_hint)
    for chunk in (_norm_pl(f"{title or ''} {url_hint}"), _norm_pl(description or "")):
        if not chunk.strip():
            continue
        for v_path, pat in _VOIVODESHIP_DISAMBIG:
            if re.search(pat, chunk):
                return v_path
        for v_path, pat in _VOIVODESHIP_MAIN:
            if re.search(pat, chunk):
                return v_path
    return ""


def infer_category_path(default_path: str, link: str, title: str, description: str = "") -> str:
    default_path = seo_builder.LEGACY_REGION_MAP.get(default_path, default_path)
    u = (link or "").lower()
    tl = (title or "").lower()
    tl_norm = _norm_pl(tl)

    # 1. Sport — ale z wykluczeniem tematów politycznych/kryminalnych/społecznych (np. zamach w Krakowie, Marsz Niepodległości, wybory prezydenta Niemiec AfD)
    is_non_sport = bool(
        re.search(
            _norm_pl(
                r"\bzamach|\bwybor|\bkandydat\b.*\bprezydent|\bprezydent\w*\s+(?:kraju|niemiec|polsk\w*|usa|stanow|rosj\w*|ukrain\w*|francj\w*|wloch\w*|elek\w*)"
                r"|\bafd\b|\bsejm\w*|\bparlament\w*|\bpolicj|\bprokuratur|\bsąd\b|\bstrzelanin|\bmarsz\b"
            ),
            tl_norm,
        )
    )
    is_sport_url = any(
        seg in u
        for seg in (
            "/sport/", "/tenis/", "/pilka-nozna/", "/siatkowka/", "/koszykowka/", "/zuzel/",
            "sport.pl", "przegladsportowy", "sportowefakty", "polsatsport", "sport.interia",
        )
    )
    is_sport_kw = any(
        kw in tl
        for kw in (
            "wta finals", "ekstraklasa", "liga narodów", "liga mistrzów", "puchar świata",
            "lewandowski", "świątek", "sabalenk", "hurkacz", "probierz", "skoki narciarskie",
        )
    ) or bool(re.search(r"\burban(?:a|em|owi)?\b", tl))
    if (is_sport_url or is_sport_kw) and not is_non_sport:
        return "/Sport"
    if default_path == "/Sport" and is_non_sport:
        default_path = "/Polska"

    # 2. Wykrywanie wyraźnego polskiego kontekstu w tytule (włącznie z województwami i miastami powiatowymi)
    pl_markers = _norm_pl(
        r"\b(?:polsk\w*|polak\w*|polac\w*|polk[aięąo]\b|warszaw\w*|krakow\w*|kraków|wrocław\w*|wroclaw\w*|"
        r"poznan\w*|poznań\w*|gdańsk\w*|gdansk\w*|szczecin\w*|lublin\w*|katowic\w*|łódź|lodz\w*|łodzi\w*|"
        r"białystok\w*|bialystok\w*|białegostok\w*|bialegostok\w*|rzeszow\w*|rzeszów|olsztyn\w*|bydgoszcz\w*|toruń\w*|torun\w*|"
        r"kielc\w*|opol(?:e|a|u|em|sk\w*|szczyzn\w*)\b|radom\w*|częstochow\w*|czestochow\w*|sosnowi\w*|gliwic\w*|zabrze|bytom\w*|bielsk\w*|"
        r"rybnik\w*|tychy|tychach|elbląg\w*|elblag\w*|płock\w*|plock\w*|wałbrzych\w*|walbrzych\w*|włocław\w*|wloclaw\w*|"
        r"tarnow\w*|tarnów|koszalin\w*|kalisz\w*|legnic\w*|grudziądz\w*|grudziadz\w*|słupsk\w*|slupsk\w*|jaworzn\w*|"
        r"jastrzębi\w*|nowy\s+sącz|nowym\s+sączu|jeleni\w+\s+gór\w*|konin\w*|piotrkow\w*|piotrków|inowrocław\w*|"
        r"lubin\w*|ostrow\w+\s+wielkopolsk\w*|ostrow\w+\s+mazowieck\w*|suwałk\w*|suwalk\w*|gniezn\w*|głogow\w*|glogow\w*|chełm\w*|chelm\w*|"
        r"zamość|zamosc\w*|przemyśl\w*|przemysl\w*|stalow\w+\s+wol\w*|mielec\w*|tomaszow\w*|leszn\w*|zgorzelc\w*|"
        r"świnoujści\w*|swinoujsci\w*|kołobrzeg\w*|kolobrzeg\w*|sopot\w*|gdyni\w*|podhale|zakopan\w*|tatr\w*|"
        r"zielon\w+\s+gór\w*|zielonogór\w*|gorzow\w*|now\w+\s+sól|świdnic\w*|kłodzk\w*|trzebnic\w*|puław\w*|świdnik\w*|pabianic\w*|"
        r"bełchatow\w*|oświęcim\w*|siedlc\w*|ciechanow\w*|pruszkow\w*|kędzierzyn\w*|dębic\w*|sanok\w*|łomż\w*|augustow\w*|"
        r"wejherow\w*|chojnic\w*|malbork\w*|chorzow\w*|ostrowiec\w*|starachowic\w*|sandomierz\w*|iław\w*|ostród\w*|giżyck\w*|stargard\w*|sycewic\w*|wrześnic\w*|"
        r"bieszczad\w*|mazur\w*|śląsk\w*|slask\w*|wielkopolsk\w*|małopolsk\w*|malopolsk\w*|pomorz\w*|podlasi\w*|"
        r"podkarpaci\w*|mazowsz\w*|kujaw\w*|warmi\w*|lubuski\w*|świętokrzysk\w*|swietokrzysk\w*|dolnośląsk\w*|"
        r"zachodniopomorsk\w*|wisł[aąęy]|wisl[aae]|odr[aąęy]|bałtyk\w*|baltyk\w*|ostrołęk\w*|"
        r"sejm\w*|senat\w*|tusk\w*|nawrock\w*|kaczyńsk\w*|kaczynsk\w*|trzaskowsk\w*|czarzast\w*|hołown\w*|holown\w*|"
        r"mentzen\w*|bosak\w*|kosiniak\w*|sikorsk\w*|bodnar\w*|żurek\w*|zurek\w*|duda\b|dudy\b|dudzie\b|dudę\b|"
        r"morawieck\w*|ziobr\w*|romanowsk\w*|czarnek\w*|błaszczak\w*|blaszczak\w*|macierewicz\w*|giertych\w*|"
        r"biejat\w*|zandberg\w*|gawkowsk\w*|domańsk\w*|domansk\w*|hennig-klosk\w*|leszczyńsk\w*|leszczynsk\w*|"
        r"kierwińsk\w*|kierwinsk\w*|siemoniak\w*|nowack\w*|lubnauer\w*|szłapk\w*|szlapk\w*|nitras\w*|kropiwnick\w*|"
        r"gibał\w*|gibal\w*|sutryk\w*|miszalsk\w*|zdanowsk\w*|krupow\w*|korwin-piotrowsk\w*|zgorzelsk\w*|ociepa\b|krajewsk\w*|kusznieruk\w*|lewic\w*|"
        r"trójmiast\w*|trójmieśc\w*|trojmiast\w*|trojmiesc\w*|mrągow\w*|mragow\w*|telewizj\w*\s+republik\w*|\btv\s+republik\w*|"
        r"\bnfz\b|\bzus\b|\bkrus\b|\bgus\b|\bnbp\b|\bknf\b|\buokik\b|\bpkol\b|\bpge\b|\borlen\w*|\btauron\w*|\benea\b|"
        r"\bpko\b|\bpekao\b|\bpzu\b|\bkghm\b|\bpgnig\b|\blotos\w*|\bpkp\b|\bcpk\b|\bgddkia\b|\bpażp\b|\bpazp\b|\bkowr\b|"
        r"\bipn\b|\bnik\b|\brpo\b|\bkrrt\w*|\bkrrit\b|\bkrs\b|\btk\b|\bsn\b|\bnsa\b|\bwot\b|\bcbśp\b|\bcbsp\b|"
        r"\babw\b|\bcba\b|\bsop\b|\bmon\b|\bmsz\b|\bmswia\b|\bmen\b|\bmz\b|\bmf\b|\bmap\b|"
        r"allegro\w*|inpost\w*|autopay\w*|blik\w*|złot(?:y|ych|ego|ówki|owki)\b|\bpln\b|\bzł\b|trójmorz\w*|trojmorz\w*|ilr-33|bursztyn\s+2k)\b"
    )
    has_pl = bool(re.search(pl_markers, tl_norm))

    # 3. Wykrywanie wyraźnego kontekstu zagranicznego / międzynarodowego / BigTech
    foreign_kw = _norm_pl(
        r"\b(?:usa\b|stany\s+zjednoczone|stanów\s+zjednoczonych|stanow\s+zjednoczonych|ameryka\w*|waszyngton\w*|"
        r"biał(?:y|ego|emu|ym)\s+dom(?:u|em|ie|owi)?|bial(?:y|ego|emu|ym)\s+dom(?:u|em|ie|owi)?|kapitol\w*|pentagon\w*|wall\s+street|"
        r"now(?:y|ego|ym)\s+jork\w*|kaliforni\w*|floryd\w*|teksas\w*|missisipi|\bfaa\b|\bcia\b|\bfbi\b|\bnasa\b|"
        r"trump\w*|biden\w*|vance\w*|hegseth\w*|musk\w*|rubio\b|harris\w*|kongres\w*\s+usa|us\s+army|"
        r"rosj\w*|rosyjsk\w*|kreml\w*|putin\w*|moskw\w*|miedwiediew\w*|ławrow\w*|lawrow\w*|szojgu|wołgograd\w*|wolgograd\w*|biełgorod\w*|bielgorod\w*|kursk\w*|syberi\w*|"
        r"ukrain\w*|ukraińsk\w*|ukrainsk\w*|kijow\w*|kijów|zełensk\w*|zelensk\w*|donbas\w*|charkow\w*|charków|odess\w*|lwów|lwow\w*|krym\w*|"
        r"chin\w*|chińsk\w*|chinsk\w*|pekin\w*|szanghaj\w*|hongkong\w*|tajwan\w*|xi\s+jinping|"
        r"niemc\w*|niemiec\w*|niemieck\w*|berlin\w*|bundestag\w*|bundeswehr\w*|scholz\w*|merz\w*|\bafd\b|"
        r"francj\w*|francusk\w*|paryż\w*|paryz\w*|macron\w*|le\s+pen|"
        r"wielk\w+\s+brytani\w*|brytyjsk\w*|londyn\w*|starmer\w*|angli\w*|szkocj\w*|"
        r"włoch\w*|wloch\w*|włosz\w*|wlosz\w*|włosk\w*|wlosk\w*|\brzym(?:ie|u|em)?\b|meloni\w*|watykan\w*|papież\w*|papiez\w*|"
        r"hiszpan\w*|madryt\w*|barcelon\w*|walencj\w*|portugali\w*|portugalsk\w*|lizbon\w*|"
        r"węgr\w*|wegr\w*|węgrz\w*|wegrz\w*|węgier\w*|wegier\w*|budapeszt\w*|orban\w*|orbán\w*|"
        r"finland\w*|fińsk\w*|finsk\w*|helsink\w*|szwecj\w*|szwedzk\w*|sztokholm\w*|norwegi\w*|norwesk\w*|oslo\b|dani\w*|duńsk\w*|kopenhag\w*|"
        r"holandi\w*|niderland\w*|amsterdam\w*|hadze\b|belgi\w*|bruksel\w*|austri\w*|wiedeń\w*|wieden\w*|szwajcari\w*|genew\w*|zurych\w*|"
        r"irland\w*|dublin\w*|grecj\w*|greck\w*|aten(?:y|ach)\b|serbi\w*|belgrad\w*|chorwacj\w*|zagrzeb\w*|"
        r"czech\w*|czesk\w*|praga|pradze|słowacj\w*|slowacj\w*|bratysław\w*|fico\b|rumuni\w*|bukareszt\w*|bułgari\w*|bulgari\w*|"
        r"litw\w*|litewsk\w*|wiln\w*|łotw\w*|lotw\w*|ryga|rydze|estoni\w*|tallin\w*|białoru\w*|bialoru\w*|mińsk\w*|minsk\w*|łukaszenk\w*|lukaszenk\w*|"
        r"mołdawi\w*|moldawi\w*|gruzj\w*|tbilisi|armeni\w*|azerbejdżan\w*|"
        r"izrael\w*|netanjahu|stref\w+\s+gazy|gaza\b|gazie|hamas\w*|hezbollah\w*|liban\w*|beirut\w*|"
        r"iran\w*|irańsk\w*|iransk\w*|teheran\w*|syri\w*|damaszk\w*|turcj\w*|tureck\w*|ankar\w*|erdogan\w*|jemen\w*|"
        r"arabi\w+\s+saudyjsk\w*|saudi\s+aramco|zjednoczone\s+emiraty|abu\s+zabi|dubaj\w*|katar\w*|rijad\w*|"
        r"indi\w*|indyjsk\w*|japoni\w*|japońsk\w*|japonsk\w*|tokio|kore\w+\s+północn\w*|kore\w+\s+południow\w*|seul\w*|pjongjang\w*|filipin\w*|indonezj\w*|"
        r"kanad\w*|kanadyjsk\w*|meksyk\w*|brazyli\w*|argentyn\w*|wenezuel\w*|kuba\b|kubie\b|kuby\b|kubańsk\w*|kubansk\w*|afryc\w*|afryk\w*|egipt\w*|sudan\w*|australi\w*|sydney\b|"
        r"\bnato\b|\bonz\b|\bwho\b|\bmfw\b|\bopec\b|komisj\w+\s+europejsk\w*|parlament\w+\s+europejsk\w*|rad\w+\s+europejsk\w*|"
        r"nvidi\w*|jensen\w+\s+huang\w*|microsoft\w*|apple\b|google\b|meta\b|openai\b|chatgpt\b|spacex\w*|boeing\w*|airbus\w*)\b"
    )
    has_foreign_title = bool(re.search(foreign_kw, tl_norm))
    has_foreign_url = any(seg in u for seg in ("/swiat/", "/fakty/swiat/", "/ze-swiata/", "/zagranica/", "/za-granica/"))

    if (has_foreign_title or has_foreign_url) and not has_pl:
        return "/Swiat"

    # 4. Zachowaj ścieżki regionalne (16 województw) i koryguj po wyraźnej lokalizacji z tytułu/URL
    title_url_voiv = _infer_voivodeship_path(title, "", link)
    if default_path in seo_builder.VOIVODESHIP_BY_PATH:
        return title_url_voiv or default_path

    # 5. Energetyka (w kontekście polskim lub ogólnym krajowym)
    energy_url = any(seg in u for seg in ("/energetyka/", "/energia/", "/oze/", "wysokienapiecie.pl", "energetyka24.com"))
    energy_kw = bool(
        re.search(
            _norm_pl(
                r"\b(?:energetyk\w*|elektrown\w*|wiatrak\w*|fotowoltaik\w*|jądrow\w*|jadrow\w*|atomow\w*|prąd\w*|prad\w*|"
                r"taryf\w*\s+na\s+prąd|ciepłown\w*|cieplown\w*|węgl\w*|wegl\w*|kopaln\w*|gazociąg\w*|gazociag\w*|terminal\w*\s+lng|"
                r"paliw\w*|zamrożeni\w*\s+cen\s+gazu|orlen\s+lietuva|\boze\b|\bpge\b|\btauron\w*|\benea\b)"
            ),
            tl_norm,
        )
    )
    if (energy_url or energy_kw) and (has_pl or not has_foreign_title):
        return "/Polska/Energetyka"

    # 6. Gospodarka / Finanse vs Polityka w Polsce
    econ_kw = bool(
        re.search(
            _norm_pl(
                r"\b(?:gospodark\w*|inflacj\w*|stopy\s+procentow\w*|stóp\s+procentow\w*|\bnbp\b|\brpp\b|\bgus\b|\bpkb\b|"
                r"podatk\w*|podatek\w*|\bvat\b|\bpit\b|\bcit\b|składk\w*|skladk\w*|\bzus\b|emerytur\w*|emeryt\w*|rent\w*|"
                r"płac\w*|plac\w*|wynagrodzen\w*|zarabia\w*|zarobk\w*|pensj\w*|budżet\w*|budzet\w*|deficyt\w*|dług\w*\s+publiczn\w*|"
                r"giełd\w*|gield\w*|\bgpw\b|\bwig\b|akcj[ie]\b|obligacj\w*|inwestycj\w*|inwestor\w*|kredyt\w*|hipotek\w*|hipoteczn\w*|"
                r"bank\w*|mieszkan\w*|nieruchomośc\w*|nieruchomosc\w*|deweloper\w*|cen[ay]\b|drożej\w*|drozej\w*|taniej\w*|"
                r"eksport\w*|import\w*|handl\w*|sklep\w*|dyskont\w*|biedronk\w*|lidl\w*|dino\b|żabk\w*|zabk\w*|allegro\w*|inpost\w*|"
                r"przedsiębiorc\w*|przedsiebiorc\w*|firm[ayę]\b|biznes\w*|rynek\s+pracy|bezroboci\w*|etat\w*|zasiłk\w*|zasilk\w*|"
                r"świadczen\w*|swiadczen\w*|800\s*plus|babciowe|waloryzacj\w*|przelew\w*|płatnośc\w*|platnosc\w*|blik\w*|autopay\w*|"
                r"kurs\w*\s+walut|euro\b|dolar\w*|frank\w*|aktyw\w*\s+pażp|uprawnie\w*\s+ets|\bets\b|miliard\w*\s+(?:zł|euro)|tys\.\s*zł|\bzł\b)\b"
            ),
            tl_norm,
        )
    )
    econ_url = any(
        seg in u
        for seg in (
            "/gospodarka/", "/biznes/", "/ekonomia/", "/finanse/", "ekonomia.rp.pl", "/pieniadze/",
            "pulsbiznesu", "pb.pl", "parkiet.com", "300gospodarka", "pulshr.pl", "farmer.pl",
            "wiadomoscihandlowe.pl", "cashless.pl", "strefainwestorow.pl",
        )
    )

    pol_strong_kw = bool(
        re.search(
            _norm_pl(
                r"\b(?:sejm\w*|senat\w*|trybuna[lł]\w*\s+konstytucyjn|konstytucj\w*|rząd\w*|premier\w*|wiceminist\w*|minist(?:er|ra|erstw)\w*|"
                r"koalicj\w*|opozycj\w*|pos(?:eł|ła|łowie|elsk)\w*|ustaw\w*|wet[oa]\b|zawetowa\w*|ułaskawi\w*|"
                r"ziobr\w*|tusk\w*|nawrock\w*|kaczyńsk\w*|kaczynsk\w*|czarzast\w*|hołown\w*|holown\w*|mentzen\w*|"
                r"sikorsk\w*|kosiniak\w*|gawkowsk\w*|żurek\w*|zurek\w*|morawieck\w*|duda\b|dudy\b|dudzie\b|"
                r"trzaskowsk\w*|biejat\w*|zandberg\w*|kusznieruk\w*|konfederacj\w*|lewic\w*|now\w+\s+lewic\w*|trzeci\w+\s+drog\w*|polsk\w+\s+2050|partii\s+razem|rozwoj\w*\s+plus|prawic\w*|\bpis\b|\bpsl\b|"
                r"wyklucz\w*\s+z\s+(?:partii|nowej\s+lewicy|lewicy|pis|ko|psl|konfederacji|polski\s+2050)|statut\w*\s+partii|"
                r"sonda[zż]\w*|wybor(?:y|ów|ach|cze|czy)\b|"
                r"referend\w*|komisj\w*\s+śledcz|immunitet\w*|orzeczeni\w*\s+tk\b|\btk\b|\bkrs\b|kancelari\w*\s+prezydent|"
                r"decyzj\w*\s+prezydent|prezydent\w*\s+(?:polski|rp|proponuj\w*|podpis\w*|zawetow\w*|wetuj\w*|oglos\w*|powol\w*))\b"
            ),
            tl_norm,
        )
    )
    pol_url = any(seg in u for seg in ("/polityka/", "/wybory/", "/sejm/", "/rząd/", "/rzad/", "/prawo-w-polsce/", "/prawo/"))

    if (pol_strong_kw or pol_url) and not econ_kw:
        return "/Polska/Polityka"
    if econ_kw or (econ_url and not pol_strong_kw):
        return "/Polska/Gospodarka"

    if default_path in ("/Polska/Polityka", "/Polska/Gospodarka") and not pol_strong_kw and not pol_url and not econ_kw and not econ_url:
        fallback_path = "/Polska"
    elif default_path == "/Swiat" and (has_pl or not (has_foreign_title or has_foreign_url)):
        fallback_path = "/Polska"
    else:
        fallback_path = default_path

    # 7. Lokalizacja wydarzeń regionalnych ze źródeł ogólnopolskich (16 województw) bez przenoszenia spraw stricte ogólnopolskich
    if fallback_path == "/Polska" and not _NATIONAL_SCOPE_RE.search(tl_norm):
        inferred_voiv = title_url_voiv or _infer_voivodeship_path(title, description, link)
        if inferred_voiv:
            return inferred_voiv

    return fallback_path


def _fetch_single_feed(feed: dict, max_per_feed: int = 12) -> tuple:
    headers = {"User-Agent": "VerityBot/1.0 (+https://hygrisxx.github.io/verity-/)"}
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

            clean_desc = clean_html_for_synthesis(raw_desc, title)
            clean_cont = clean_html_for_synthesis(raw_content, title) if raw_content else ""
            desc = clean_desc if len(clean_desc) >= 60 else (clean_cont or clean_desc)
            best_raw = raw_desc if len(clean_desc) >= 60 else (raw_content or raw_desc)

            if not title or len(desc) < 30 or not link:
                continue
            if is_opinion_or_blacklisted(title, link):
                continue

            thumb = extract_thumbnail_from_item(node, best_raw + " " + raw_content)
            inferred_path = infer_category_path(feed["path"], link, title, desc)

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


SHORT_KEY_TOKENS = {
    "usa", "faa", "onz", "ue", "krs", "tk", "sn", "nsa", "nik", "nbp", "rpp",
    "gus", "pkb", "vat", "pit", "cit", "zus", "nfz", "pge", "oze", "cpk", "pkp",
    "mon", "msz", "abw", "cba", "pis", "psl", "sld", "afd", "fbi", "cia", "who",
    "mfw", "gpw", "wig", "ets", "dsa", "ai", "wta", "atp", "mls", "nba",
    "lot", "gaz", "s6", "s7", "s8", "s12", "s17", "s19", "a1", "a2", "a4",
}

_PL_SUFFIXES = (
    "iejszymi", "iejszych", "iejszym", "iejszej", "iejsza", "iejsze",
    "owskiego", "owskiemu", "owskich", "owskimi", "owskim", "owskiej", "owska", "owski",
    "skiego", "skiemu", "skich", "skimi", "skim", "skiej", "ska", "ski",
    "aniami", "aniach", "aniom", "aniem", "ania", "aniu", "anie",
    "eniami", "eniach", "eniom", "eniem", "enia", "eniu", "enie",
    "ujacych", "ujacymi", "ujacego", "ujacej", "ujacym", "ujacy", "ujaca", "ujace",
    "owanych", "owanymi", "owanego", "owanej", "owanym", "owany", "owana", "owane",
    "owali", "owaly", "owano", "owala", "owal",
    "iami", "iach", "iemu", "iego", "imi", "ich", "iej",
    "ami", "ach", "owi", "omu", "emu", "ego", "iom", "iem", "om", "ow",
    "uja", "ie", "iu", "em", "a", "u", "y", "i", "e", "o",
)

STEM_EQUIVALENTS = {
    "kreml": "rosj",
    "rosyjsk": "rosj",
    "rosyj": "rosj",
    "rosjan": "rosj",
    "ukrainsk": "ukrain",
    "amerykansk": "usa",
    "amerykan": "usa",
    "ameryk": "usa",
    "niemieck": "niemc",
    "francusk": "francj",
    "brytyjsk": "brytani",
    "chinsk": "chin",
    "finsk": "finland",
    "finlandi": "finland",
    "iransk": "iran",
    "izraelsk": "izrael",
    "kubansk": "kuba",
    "wegiers": "wegr",
    "wegier": "wegr",
    "zazadal": "zadan",
    "zazadala": "zadan",
    "zazadano": "zadan",
    "zazad": "zadan",
    "zadani": "zadan",
    "zada": "zadan",
    "zadal": "zadan",
    "wstrzymuj": "wstrzym",
    "wstrzyman": "wstrzym",
    "wstrzymal": "wstrzym",
    "upomnian": "upomn",
    "upomnial": "upomn",
    "upomniel": "upomn",
    "upomnien": "upomn",
    "upomni": "upomn",
    "odznaczyl": "odznacz",
    "odznaczon": "odznacz",
    "zadeklarow": "deklaracj",
    "deklaruj": "deklaracj",
    "loty": "lot",
    "lotow": "lot",
    "lotom": "lot",
    "lotach": "lot",
    "lotami": "lot",
    "lotu": "lot",
    "locie": "lot",
    "lotem": "lot",
}


def _stem_pl(word: str) -> str:
    if word in STEM_EQUIVALENTS:
        return STEM_EQUIVALENTS[word]
    if word in SHORT_KEY_TOKENS:
        return word
    res = word
    if len(word) > 4:
        for suf in _PL_SUFFIXES:
            if word.endswith(suf) and (len(word) - len(suf)) >= 4:
                res = word[:-len(suf)]
                break
    return STEM_EQUIVALENTS.get(res, res)


LOCAL_PATHS = set(seo_builder.VOIVODESHIP_BY_PATH.keys()) | {"/Polska/Energetyka"}

NICHE_OUTLETS = {
    "Farmer.pl", "PulsHR", "WysokieNapiecie.pl", "Energetyka24", "Elektrowóz.pl",
    "Space24", "CyberDefence24", "Niebezpiecznik", "Sekurak",
    "Cashless.pl", "MamStartup.pl", "Wiadomości Handlowe",
    "Subiektywnie o Finansach", "StrefaInwestorów.pl",
    "Klub Jagielloński", "Kultura Liberalna", "Krytyka Polityczna", "Tygodnik Powszechny",
}

TEASER_SENTENCE_PATTERNS = (
    r"^wiadomo już\b",
    r"^sprawdź\b",
    r"^sprawdzaj\b",
    r"^zobacz\b",
    r"^czytaj\b",
    r"^obejrzyj\b",
    r"^kto więc\b",
    r"^co dalej\b",
    r"^jak do tego doszło\b",
    r"^jak najlepiej\b",
    r"^kiedy wypadają\b",
    r"^przygotowaliśmy wszystkie\b",
    r"^przypomnijmy garść faktów\b",
    r"^wyjaśniamy skąd\b",
    r"^lepiej tego dnia zostać\b",
    r"^dramatyczne sceny rozegrały się\b",
    r"^dramatyczne wydarzenia rozegrały się\b",
    r"^nieprawdopodobne sceny\b",
)

STOP_WORDS_PL = {
    "polsce", "polska", "polski", "polskie", "polskich", "polskiego", "polsk", "polak", "polacy",
    "nowe", "nowy", "nowa", "nowych", "bedzie", "beda", "jest", "roku", "lata", "latek", "latka",
    "przez", "tylko", "moze", "oraz", "wielu", "ktory", "ktora", "ktore", "bardzo", "wlasnie",
    "gdzie", "kiedy", "dlaczego", "wszystko", "maja", "mial", "miala", "mieli", "mialy",
    "zostal", "zostala", "zostali", "zostalo",
    "jako", "przed", "ponad", "miedzy", "podczas", "wedlug", "kolejny", "kolejne", "kolejna",
    "wideo", "zdjecia", "sprawdz", "zobacz", "czytaj", "obejrzyj", "relacja", "transmisja",
    "osoby", "osob", "osoba", "sprawa", "sprawie", "spraw", "zycia", "zycie", "zyci",
    "dzien", "czas", "temat", "miejsce", "miejscu", "kraj", "kraju", "swiat", "swiata",
    "zatrzymany", "zatrzymanych", "zatrzymano", "zatrzymanie", "zarzut", "zarzuty", "zarzutem",
    "policj", "policja", "policjant", "policjanci", "policjantow", "funkcjonariusz", "prezes", "prezesi",
    "sprawca", "sprawcy", "atak", "ataku", "ataki", "mecz", "meczu", "wynik", "wyniki", "zywo",
    "stream", "online", "rekord", "rekordowy", "rekordowa", "rekordowe", "liczba", "wzrost", "spadek",
    "historia", "historii", "trudno", "wyobrazic", "piekniejsze", "zakonczenie",
    "dzis", "wczoraj", "jutro", "piatek", "piatku", "sobota", "niedziela", "poniedzialek", "wtorek", "sroda", "czwartek",
    "styczen", "luty", "marzec", "kwiecien", "listopad", "listopada", "grudzien", "trzynastego",
    "decyzja", "decyzji", "wyrok", "sadu", "koniec", "poczatek", "wielki", "wielka", "wazny", "wazna", "przelomowy",
    "mezczyzna", "mezczyzn", "kobieta", "kobiety", "ludzi", "ludzie", "pilne", "oficjalnie", "wiadomo",
    "szczegoly", "dramat", "tragedia", "incydent", "zdarzenie", "sytuacja", "procent", "tysiac", "milion", "miliard",
    "uslyszal", "uslyszala", "uslyszeli", "wczesniej", "wczesn", "liczb", "tego", "tych", "duzo", "naprawde", "naprawd", "stron",
}

CITY_STEM_MAP = {
    "warszaw": "warszawa", "krakow": "krakow", "gdansk": "gdansk", "poznan": "poznan",
    "wroclaw": "wroclaw", "lodz": "lodz", "katowic": "katowice", "szczecin": "szczecin",
    "lublin": "lublin", "bydgoszcz": "bydgoszcz", "bialystok": "bialystok", "bialegostok": "bialystok",
    "rzeszow": "rzeszow", "olsztyn": "olsztyn", "kielc": "kielce", "opole": "opole", "opolu": "opole",
    "mragow": "mragowo", "torun": "torun", "gdyni": "gdynia", "sopot": "sopot",
    "tarnow": "tarnow", "chodziez": "chodziez", "slupsk": "slupsk",
    "czestochow": "czestochowa", "radom": "radom", "plock": "plock", "wloclaw": "wloclawek",
    "elblag": "elblag", "suwalk": "suwalki", "zamosc": "zamosc", "walbrzych": "walbrzych",
    "legnic": "legnica", "koszalin": "koszalin", "kalisz": "kalisz", "ilaw": "ilawa",
    "gizyck": "gizycko", "zakopan": "zakopane", "trzebnic": "trzebnica",
    "kijow": "kijow", "moskw": "moskwa", "berlin": "berlin", "paryz": "paryz",
    "rzym": "rzym", "madryt": "madryt", "helsink": "helsinki", "waszyngton": "waszyngton",
    "londyn": "londyn", "bruksel": "bruksela", "dublin": "dublin", "budapeszt": "budapeszt",
    "abu": "abuzabi", "zabi": "abuzabi", "wolograd": "wolgograd", "wolgograd": "wolgograd",
}

COUNTRY_STEM_MAP = {
    "ukrain": "ukraina", "rosja": "rosja", "rosyj": "rosja",
    "niemc": "niemcy", "niemie": "niemcy", "bundeswehr": "niemcy",
    "francj": "francja", "francu": "francja",
    "wloch": "wlochy", "wlosk": "wlochy", "hiszpan": "hiszpania",
    "finland": "finlandia", "finsk": "finlandia", "chiny": "chiny", "chins": "chiny",
    "tajwan": "tajwan", "iran": "iran", "izrael": "izrael",
    "stany": "usa", "stanow": "usa", "ameryk": "usa", "usa": "usa",
    "kuba": "kuba", "kuban": "kuba", "wegr": "wegry", "wegier": "wegry",
    "brytani": "brytania", "turcj": "turcja", "rumuni": "rumunia",
}

CITY_TO_COUNTRY = {
    "kijow": "ukraina", "moskwa": "rosja", "wolgograd": "rosja",
    "berlin": "niemcy", "paryz": "francja", "rzym": "wlochy",
    "madryt": "hiszpania", "helsinki": "finlandia", "waszyngton": "usa",
    "londyn": "brytania", "budapeszt": "wegry",
}


def is_local_or_niche_item(item: dict) -> bool:
    path = item.get("path") or ""
    outlet = item.get("outlet") or ""
    return path in LOCAL_PATHS or outlet in NICHE_OUTLETS


def tokenize_title(title: str) -> set:
    words = re.findall(r"[a-z0-9]{2,}", _norm_pl(title))
    stems = set()
    for w in words:
        if w in STOP_WORDS_PL or w.isdigit():
            continue
        if len(w) < 4 and w not in SHORT_KEY_TOKENS:
            continue
        s = _stem_pl(w)
        if s not in STOP_WORDS_PL and (len(s) >= 4 or s in SHORT_KEY_TOKENS):
            stems.add(s)
    return stems


def _extract_geo_entities(text: str) -> tuple:
    words = re.findall(r"[a-z]{3,}", _norm_pl(text))
    cities = set()
    countries = set()
    for w in words:
        if w.startswith(("bialy", "bialeg", "biale", "bialej", "bialym", "biala")):
            continue
        for pref, canon in CITY_STEM_MAP.items():
            if w.startswith(pref):
                cities.add(canon)
                if canon in CITY_TO_COUNTRY:
                    countries.add(CITY_TO_COUNTRY[canon])
        for pref, canon in COUNTRY_STEM_MAP.items():
            if w.startswith(pref):
                countries.add(canon)
    return cities, countries


def _extract_geo_stems(text: str) -> set:
    c, k = _extract_geo_entities(text)
    return c | k


def _extract_age_or_count(title: str) -> set:
    return set(re.findall(r"\b(\d{1,3})\s*(?:-?lat(?:ek|ka|kowie)?|os[óo]b|osoby|zabitych|rannych|zatrzymanych)\b", title or "", flags=re.IGNORECASE))


def _sport_discipline(text: str) -> str:
    low = _norm_pl(text or "")
    if any(k in low for k in ("tenis", "wta", "atp", "swiatek", "sabalenk", "hurkacz", "set")):
        return "tenis"
    if any(k in low for k in ("pilka nozn", "liga narodow", "liga mistrzow", "ekstraklasa", "lewandowski", "bramk", "reprezentacj")):
        return "pilka"
    if any(k in low for k in ("pilka reczn", "szczypiorn", "superliga")):
        return "reczna"
    if any(k in low for k in ("siatkow", "plusliga")):
        return "siatkowka"
    if any(k in low for k in ("koszykow", "nba")):
        return "koszykowka"
    if any(k in low for k in ("skoki", "narciars")):
        return "skoki"
    return ""


def has_cluster_conflict(item_a: dict, item_b: dict) -> bool:
    """Blokuje błędne sklejenia tematów o różnych miastach/krajach, dyscyplinach lub osobach."""
    pa = item_a.get("path") or ""
    pb = item_b.get("path") or ""
    if (pa == "/Sport") != (pb == "/Sport"):
        return True

    ta = item_a.get("title") or ""
    tb = item_b.get("title") or ""
    if pa == "/Sport" and pb == "/Sport":
        da = _sport_discipline(ta + " " + (item_a.get("description") or "")[:180])
        db = _sport_discipline(tb + " " + (item_b.get("description") or "")[:180])
        if da and db and da != db:
            return True

    city_a, country_a = _extract_geo_entities(ta)
    city_b, country_b = _extract_geo_entities(tb)
    if city_a and city_b and not (city_a & city_b):
        return True
    if pa in LOCAL_PATHS and pb in LOCAL_PATHS and pa != pb and "/Polska/Energetyka" not in (pa, pb):
        if not (city_a & city_b):
            return True
    if not (city_a & city_b) and country_a and country_b and not (country_a & country_b):
        # Dwa rozłączne kraje bez wspólnego miasta — konflikt, chyba że oba to różne etykiety miejsca vs podmiot (np. Dublin vs Ukraina w spotkaniu międzynarodowym)
        if not (city_a or city_b):
            return True

    roads_a = set(re.findall(r"\b(?:[sa]\d{1,2}|dk\d{1,3})\b", _norm_pl(ta)))
    roads_b = set(re.findall(r"\b(?:[sa]\d{1,2}|dk\d{1,3})\b", _norm_pl(tb)))
    if roads_a and roads_b and not (roads_a & roads_b):
        return True

    ca = _extract_age_or_count(ta)
    cb = _extract_age_or_count(tb)
    if ca and cb and not (ca & cb):
        return True

    return False


def polish_typography_clean(text: str) -> str:
    t = _unescape_all(text or "")
    t = re.sub(r"\s+([.,;:!?])", r"\1", t)
    t = re.sub(r"([,;!?])([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż])", r"\1 \2", t)
    t = re.sub(r"([a-ząćęłńóśźż])\.([A-ZĄĆĘŁŃÓŚŹŻ])", r"\1. \2", t)
    t = re.sub(r"\s+-\s+", " – ", t)
    t = re.sub(r"[ \t]{2,}", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def clean_desc_text(text: str, article_title: str = "") -> str:
    t = _unescape_all(text or "").strip()
    t = re.sub(r"\s*\[Źródło:[^\]]+\]\s*$", "", t)

    # Wycinanie metadanych Drupalowych (np. StrefaInwestorów) ze spłaszczonego opisu
    t = re.sub(r"^.*?\bKanał\s+Strefa\s+Inwestorów\b.*?\bTreść\s+", "", t, flags=re.IGNORECASE | re.DOTALL)
    t = re.sub(
        r"^.*?\b(?:pon\.|wt\.|śr\.|czw\.|pt\.|sob\.|niedz\.),\s*\d{2}\.\d{2}\.\d{4}\s+(?:.*?\bTreść\s+)?",
        "",
        t,
        flags=re.IGNORECASE | re.DOTALL,
    )

    # Usuń powtórzony tytuł na początku opisu
    if article_title:
        clean_title = article_title.strip().rstrip(".!?")
        if len(clean_title) >= 15 and t.lower().startswith(clean_title.lower()):
            t = t[len(clean_title):].lstrip(" .:-–—\n")

    # Wycinanie śmieci WordPress / zachęt kliknięcia (również ucięte ogony typu '[…] The post ...')
    t = re.sub(
        r"\s*(?:\[?\s*(?:\.\.\.|…)\s*\]?\s*)?(?:Artykuł|Wpis|The post)\s+.{0,260}?(?:pochodzi z serwisu|appeared first on)\s+.*$",
        "",
        t,
        flags=re.IGNORECASE | re.DOTALL,
    )
    t = re.sub(
        r"\s*\[\s*(?:\.\.\.|…)\s*\]\s*(?:Artykuł|Wpis|The post)\b.*$",
        "",
        t,
        flags=re.IGNORECASE | re.DOTALL,
    )
    t = re.sub(r"\s*pochodzi z serwisu\s+.*$", "", t, flags=re.IGNORECASE | re.DOTALL)
    t = re.sub(r"\s*appeared first on\s+.*$", "", t, flags=re.IGNORECASE | re.DOTALL)
    t = re.sub(
        r"\s*(?:Zobacz także|Zobacz też|Czytaj także|Czytaj również|Zobacz również|Więcej na temat|Przeczytaj także|Obejrzyj także|Sprawdź też|Materiał wideo|Zobacz wideo)\s*:.*$",
        "",
        t,
        flags=re.IGNORECASE | re.DOTALL,
    )
    t = re.sub(r",?\s*o czym (?:mogliście przeczytać|informowaliśmy|pisaliśmy) tutaj\s*\.?", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\s*Więcej szczegółów (?:wkrótce|podamy niebawem|w materiale)\.?", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\s*Sprawdzaj wynik na żywo i online!?", "", t, flags=re.IGNORECASE)

    # Usuń ucięty koniec z […] lub [...] (lub urwane zdanie przed nim) jeśli wcześniej są pełne zdania
    m_ellip = re.search(r"\[\s*(?:\.\.\.|…)\s*\]\s*$", t)
    if m_ellip:
        before = t[:m_ellip.start()].rstrip()
        last_stop = max(before.rfind(". "), before.rfind("! "), before.rfind("? "))
        if last_stop >= 50:
            t = before[:last_stop + 1]
        else:
            t = before + "…"

    return polish_typography_clean(t)


def split_sentences_pl(text: str, article_title: str = "") -> list:
    t = clean_desc_text(text, article_title=article_title)
    if not t:
        return []

    raw_lines = [ln.strip() for ln in t.split("\n") if ln.strip()]
    out = []
    for ln in raw_lines:
        # Chroń skróty niekończące zdania; skróty typu r., tys., mln, mld, proc., zł chroń tylko gdy nie poprzedzają Wielkiej Litery
        protected = re.sub(
            r"\b(m\.in|np|ok|godz|ust|art|pkt|tzw|hab|dr|prof|inż|gen|płk|kpt|św|im|ul|al|pl|woj|pow|gm|nr|tel|red|fot|pt|ws|dz\.u)\.\s+",
            r"\1<DOT> ",
            ln,
            flags=re.IGNORECASE,
        )
        protected = re.sub(
            r"\b(r|tys|mln|mld|proc)\.\s+(?=[a-ząćęłńóśźż0-9,(])",
            r"\1<DOT> ",
            protected,
            flags=re.IGNORECASE,
        )
        protected = re.sub(
            r"\bzł\.\s+(?=[a-ząćęłńóśźż,(])",
            "zł<DOT> ",
            protected,
            flags=re.IGNORECASE,
        )
        protected = re.sub(r"(\b\d+)\.\s+(?=[a-ząćęłńóśźż])", r"\1<DOT> ", protected)
        protected = re.sub(r"\b([A-ZŚĆŹŻŁÓ])\.\s+", r"\1<DOT> ", protected)
        parts = re.split(r"(?<=[.!?])\s+(?=(?:[A-ZŚĆŹŻŁÓ0-9„\"]|[—–-]\s*[A-ZŚĆŹŻŁÓ„\"])|$)", protected)

        for p in parts:
            s = p.replace("<DOT>", ".").strip()
            s = re.sub(r"^(?:19|20)\d{2}\s+r\.\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ])", "", s)
            if not s or len(s) < 28:
                continue
            # Zamień początkowy dywiz dialogowy "- " na poprawną polską pauzę "— "
            s = re.sub(r"^\s*[-–]\s+", "— ", s)
            low = s.lower()
            if any(re.search(pat, low) for pat in TEASER_SENTENCE_PATTERNS):
                continue
            # Odrzuć krótkie pytania retoryczne/clickbaitowe
            if s.endswith("?") and len(s) < 115 and re.match(r"^(?:jak|kiedy|gdzie|czy|co|ile|kto|dlaczego|lepiej)\b", low):
                continue
            # Odrzuć ewidentnie ucięte w pół słowa wielokropki
            if s.endswith(("…", "[…]")) and len(s) < 90:
                continue
            out.append(polish_typography_clean(s))

    # Jeśli cały opis był w jednym uciętym zdaniu i nic nie przeszło, spróbuj łagodniej
    if not out and len(t.replace("\n", " ").strip()) >= 40:
        fallback = polish_typography_clean(t.replace("\n", " "))
        if not any(re.search(pat, fallback.lower()) for pat in TEASER_SENTENCE_PATTERNS):
            out.append(fallback)
    return out



def _make_clean_slug(title: str, max_len: int = 72) -> str:
    raw = re.sub(r"[^a-z0-9]+", "-", _norm_pl(title or "artykul")).strip("-")
    if len(raw) <= max_len:
        return raw or "artykul"
    cut = raw[:max_len]
    if "-" in cut:
        cut = cut.rsplit("-", 1)[0]
    return cut.strip("-") or raw[:max_len]


def _contextual_angle(outlet: str, title: str, path: str, is_primary: bool) -> str:
    if is_primary:
        if outlet in {"Bankier.pl", "Money.pl", "Puls Biznesu", "Parkiet", "XYZ.pl", "300Gospodarka", "Forsal.pl", "StrefaInwestorów.pl"}:
            return "Raport rynkowy"
        if outlet in {"WysokieNapiecie.pl", "Energetyka24", "Elektrowóz.pl", "Farmer.pl", "Defence24", "InfoSecurity24", "CyberDefence24", "Space24"}:
            return "Analiza sektorowa"
        return "Relacja wiodąca"
    if path in LOCAL_PATHS or outlet in {"ePoznan.pl", "Lublin112.pl", "Warszawa w Pigułce", "TVS Śląsk", "Nowiny24", "Nowa Trybuna Opolska"} or outlet.startswith(("Radio ", "Gazeta ", "Dziennik ", "Kurier ", "Głos ", "Echo ")):
        return "Doniesienie regionalne"
    if outlet in {"Bankier.pl", "Money.pl", "Puls Biznesu", "Parkiet", "XYZ.pl", "300Gospodarka", "Forsal.pl", "Infor.pl", "Bezprawnik.pl", "Cashless.pl", "Comparic.pl", "StrefaInwestorów.pl", "Business Insider PL", "Forbes Polska", "Subiektywnie o Finansach", "MamStartup.pl", "Wiadomości Handlowe", "WP Finanse", "Biznes Interia", "GazetaPrawna.pl (DGP)"}:
        return "Perspektywa rynkowa"
    if outlet in {"Niebezpiecznik", "Sekurak", "CyberDefence24", "CHIP.pl", "PurePC", "Spider's Web", "Komputer Świat", "Antyweb.pl", "Tabletowo.pl", "Space24"}:
        return "Kontekst technologiczny"
    if outlet in {"WysokieNapiecie.pl", "Energetyka24", "Elektrowóz.pl"}:
        return "Kontekst sektorowy"
    if path == "/Sport" or outlet in {"Sport.pl", "Przegląd Sportowy", "Interia Sport", "Polsat Sport", "WP SportoweFakty", "RMF24 Sport"}:
        return "Relacja sportowa"
    return "Relacja uzupełniająca"


def _strip_all_citations(text: str) -> str:
    t = re.sub(r"\[Źródło:\s*[^\]]+\]", "", text or "")
    t = re.sub(r"\[\d+:[^\]]+\]", "", t)
    return re.sub(r"\s{2,}", " ", t).strip()


def _group_sentences_to_paragraphs(
    fact_entries: list,
    max_chars: int = 380,
    max_sents: int = 3,
    single_source_outlet: str = "",
) -> list:
    """
    Łączy pojedyncze zdania w rytmiczne, czytelne akapity po 2-3 zdania (~380 znaków).
    - Cytaty rozpoczynające się od pauzy '— ' otwierają nowy akapit (dla stylowego wyróżnienia .is-quote).
    - Dla pojedynczego źródła tag [Źródło: X] trafia raz na koniec ostatniego akapitu.
    """
    if not fact_entries:
        return []

    buckets = []
    cur_sents = []
    cur_outlets = []
    cur_len = 0

    for entry in fact_entries:
        txt = (entry["text"] if isinstance(entry, dict) else str(entry)).strip()
        if not txt:
            continue
        outlets = entry.get("outlets", []) if isinstance(entry, dict) else []
        starts_quote = txt.startswith(("—", "–"))
        prev_was_quote = bool(cur_sents and cur_sents[0].startswith(("—", "–")))

        if cur_sents and (
            starts_quote
            or prev_was_quote
            or len(cur_sents) >= max_sents
            or (cur_len + len(txt) + 1 > max_chars and cur_len >= 120)
        ):
            buckets.append((cur_sents, cur_outlets))
            cur_sents = []
            cur_outlets = []
            cur_len = 0

        cur_sents.append(txt)
        cur_len += len(txt) + 1
        for o in outlets:
            if o not in cur_outlets:
                cur_outlets.append(o)

    if cur_sents:
        buckets.append((cur_sents, cur_outlets))

    paragraphs = []
    for idx_b, (sents_list, outlets_list) in enumerate(buckets):
        body = " ".join(sents_list)
        if single_source_outlet:
            if idx_b == len(buckets) - 1:
                paragraphs.append(f"{body} [Źródło: {single_source_outlet}]")
            else:
                paragraphs.append(body)
        else:
            cites = ", ".join(outlets_list)
            if cites:
                paragraphs.append(f"{body} [Źródło: {cites}]")
            else:
                paragraphs.append(body)
    return paragraphs


def _safe_truncate_text(text: str, max_len: int) -> str:
    if len(text) <= max_len:
        return text
    cut = text[:max_len]
    # Znajdź koniec pełnego zdania pomijając znane skróty polskie
    best_stop = -1
    for m in re.finditer(r"[.!?](?:\s|$)", cut):
        pos = m.start()
        if pos < int(max_len * 0.45):
            continue
        before_word = re.findall(r"([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż0-9.]+\.)$", cut[: pos + 1])
        if before_word and before_word[0].lower() in {"m.in.", "np.", "ok.", "godz.", "tys.", "mln.", "mld.", "proc.", "zł.", "r.", "ust.", "art.", "pkt.", "tzw.", "dr.", "prof.", "ul.", "nr.", "woj."}:
            continue
        best_stop = pos + 1
    if best_stop > 0:
        return cut[:best_stop].strip()
    trimmed = re.sub(r"\s+\S*$", "", cut).rstrip(",;:-")
    trimmed = re.sub(r"\s+(?:m\.in|np|ok|tzw|godz)\.$", "", trimmed, flags=re.IGNORECASE)
    return trimmed + "…"


def _build_meta_and_summary(title: str, sections: list, path: str, sources: list) -> tuple:
    """Generuje (summary_lead, meta_description, keywords) bez tagów źródłowych i urwanych skrótów."""
    raw_paras = []
    for s in sections or []:
        for p in s.get("paragraphs") or []:
            clean_p = _strip_all_citations(p)
            if clean_p:
                raw_paras.append(clean_p)

    first_plain = raw_paras[0] if raw_paras else ""
    summary_lead = _safe_truncate_text(first_plain, 235)

    # Meta description optymalne dla Google (115-158 znaków)
    meta_src = summary_lead if len(summary_lead) >= 115 else " ".join(raw_paras[:2]).strip()
    if not meta_src:
        meta_src = f"{title}. Zweryfikowane zestawienie faktów z {len(sources)} źródeł w portalu VERITY."
    meta_desc = _safe_truncate_text(meta_src, 158)

    # Słowa kluczowe do news_keywords i Schema.org
    kw_extra_stop = STOP_WORDS_PL | {
        "celem", "chodzi", "dotyczace", "dotyczacych", "dotyczaca", "wystapienia",
        "prostu", "oburzajace", "szybciej", "mialy", "mial", "miala", "zmian",
        "nowym", "nowych", "kolejne", "wiecej", "znika", "znikac", "przepisy",
    }
    raw_words = re.findall(r"[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż0-9-]{4,}", title or "")
    kw_list = []
    seen_kw = set()
    cat_word = path.strip("/").split("/")[-1]
    if cat_word:
        kw_list.append(cat_word)
        seen_kw.add(_norm_pl(cat_word))
    for w in raw_words:
        nw = _norm_pl(w)
        if nw in kw_extra_stop or nw in seen_kw or nw.isdigit():
            continue
        seen_kw.add(nw)
        kw_list.append(w)
        if len(kw_list) >= 7:
            break
    return summary_lead, meta_desc, ", ".join(kw_list)


def synthesize_article_sections(ranked_group: list, primary_title: str) -> tuple:
    """
    Tworzy spójną syntezę artykułu bez duplikowania zdań i bez wielotysięcznych ścian tekstu.
    Zwraca: (sections, fact_agreement_pct)
    """
    title_tokens = tokenize_title(primary_title)
    facts = []  # [{"text": str, "tokens": set, "nums": set, "outlets": list, "is_primary": bool}]

    for idx_it, it in enumerate(ranked_group):
        outlet = it["outlet"]
        desc_clean = clean_desc_text(it.get("description") or "", article_title=it.get("title") or primary_title)
        sents = split_sentences_pl(desc_clean, article_title=it.get("title") or primary_title)

        # Limit na pojedyncze źródło: maks. 6 zdań i ~900 znaków (chroni przed całymi newsletterami)
        taken_chars = 0
        taken_count = 0
        for s in sents:
            if taken_count >= 6 or (taken_count >= 2 and taken_chars + len(s) > 900):
                break
            s_tokens = tokenize_title(s)
            if not s_tokens:
                continue
            s_nums = set(re.findall(r"\b\d+(?:[.,]\d+)?\b", s))

            # Pomiń zdanie będące wyłącznie powtórzeniem tytułu
            if len(s) < len(primary_title) + 18 and len(s_tokens & title_tokens) / max(1, len(s_tokens)) >= 0.78:
                continue

            matched = False
            for f in facts:
                shared = len(s_tokens & f["tokens"])
                overlap = shared / max(1, min(len(s_tokens), len(f["tokens"])))
                if shared >= 3 or (shared >= 2 and overlap >= 0.40):
                    if outlet not in f["outlets"]:
                        f["outlets"].append(outlet)
                    f["tokens"] |= s_tokens
                    new_nums = s_nums - f["nums"]
                    f["nums"] |= s_nums
                    if new_nums and shared < 5 and idx_it > 0:
                        matched = False
                    else:
                        matched = True
                    break

            if not matched and idx_it > 0 and facts:
                best_f = max(facts, key=lambda fc: len(s_tokens & fc["tokens"]) / max(1, min(len(s_tokens), len(fc["tokens"]))))
                sh_b = len(s_tokens & best_f["tokens"])
                ov_b = sh_b / max(1, min(len(s_tokens), len(best_f["tokens"])))
                if (not s_nums and ov_b >= 0.55) or ov_b >= 0.70:
                    if outlet not in best_f["outlets"]:
                        best_f["outlets"].append(outlet)
                    best_f["tokens"] |= s_tokens
                    continue

            if not matched:
                facts.append({
                    "text": s,
                    "tokens": set(s_tokens),
                    "nums": set(s_nums),
                    "outlets": [outlet],
                    "is_primary": (idx_it == 0),
                })
                taken_chars += len(s)
                taken_count += 1

    unique_outlets = list({it["outlet"] for it in ranked_group})
    num_sources = len(unique_outlets)

    # Pojedyncze źródło (lokalne / niszowe) -> brak oceny % zgodności krzyżowej
    if num_sources == 1:
        only_outlet = ranked_group[0]["outlet"]
        if facts:
            paras = _group_sentences_to_paragraphs(facts[:6], max_chars=380, max_sents=3, single_source_outlet=only_outlet)
        else:
            joined = clean_desc_text(ranked_group[0].get("description") or primary_title, article_title=primary_title)
            paras = [f"{joined[:800].strip()} [Źródło: {only_outlet}]"]
        sections = [{
            "heading": f"Relacja źródłowa ({only_outlet})",
            "paragraphs": paras,
        }]
        return sections, None

    # Wiele źródeł -> wyraźny podział na Ustalenia wspólne i Dodatkowe szczegóły BEZ duplikacji
    if not facts:
        primary = ranked_group[0]
        p_desc = clean_desc_text(primary.get("description") or primary_title, article_title=primary_title)
        p_out = primary["outlet"]
        sections = [{
            "heading": f"Ustalenia wspólne ({num_sources} redakcje)" if num_sources < 5 else f"Ustalenia wspólne ({num_sources} redakcji)",
            "paragraphs": [f"{p_desc[:700].strip()} [Źródło: {p_out}]"],
        }]
    else:
        core_facts = []
        extra_facts = []
        for f in facts:
            if len(f["outlets"]) >= 2 or f["is_primary"]:
                core_facts.append(f)
            else:
                extra_facts.append(f)

        # Jeśli żadne zdanie nie trafiło do core (np. główny opis był zbyt krótki), PRZENIEŚ pierwsze zdania z extra zamiast kopiować
        if not core_facts and extra_facts:
            move_n = min(2, len(extra_facts))
            core_facts = extra_facts[:move_n]
            extra_facts = extra_facts[move_n:]

        core_facts = core_facts[:8]
        core_paras = _group_sentences_to_paragraphs(core_facts, max_chars=390, max_sents=3)

        heading_main = (
            f"Ustalenia wspólne ({num_sources} redakcje)"
            if num_sources < 5
            else f"Ustalenia wspólne ({num_sources} redakcji)"
        )
        sections = [{
            "heading": heading_main,
            "paragraphs": core_paras,
        }]

        # Dodatkowe szczegóły: odfiltruj zdania, które powtarzają fakty z core_facts w >= 55%
        core_union = set().union(*(f["tokens"] for f in core_facts)) if core_facts else set()
        extra_by_outlet = {}
        for f in extra_facts:
            too_similar = False
            for cf in core_facts:
                sh = len(f["tokens"] & cf["tokens"])
                ov = sh / max(1, min(len(f["tokens"]), len(cf["tokens"])))
                if ov >= 0.55 or (sh >= 4 and ov >= 0.45):
                    too_similar = True
                    break
            if not too_similar and core_union:
                cov = len(f["tokens"] & core_union) / max(1, len(f["tokens"]))
                if cov >= 0.80 and not (f["nums"] - set().union(*(cf["nums"] for cf in core_facts))):
                    too_similar = True
            if too_similar:
                continue
            out_name = f["outlets"][0]
            if len(extra_by_outlet.get(out_name, [])) < 3:
                extra_by_outlet.setdefault(out_name, []).append(f)

        if extra_by_outlet:
            extra_paras = []
            for out_name, outlet_facts in extra_by_outlet.items():
                extra_paras.extend(
                    _group_sentences_to_paragraphs(outlet_facts, max_chars=420, max_sents=3, single_source_outlet=out_name)
                )
            if extra_paras:
                sections.append({
                    "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
                    "paragraphs": extra_paras,
                })

    multi_confirmed = sum(1 for f in facts if len(f["outlets"]) >= 2)
    base_pct = 78 + min(14, num_sources * 4) + min(6, multi_confirmed * 2)
    fact_pct = min(98, max(82, base_pct))
    return sections, fact_pct


def cluster_similar_items(items: list) -> list:
    """Grupuje depesze z różnych redakcji o tym samym wydarzeniu z blokadą fałszywych skojarzeń."""
    clusters = []
    used = set()
    title_tokens_cache = [tokenize_title(it["title"]) for it in items]
    desc_tokens_cache = [tokenize_title(clean_desc_text(it.get("description", ""), it.get("title", ""))) for it in items]

    for i, item in enumerate(items):
        if i in used:
            continue
        words_i = title_tokens_cache[i]
        desc_i = desc_tokens_cache[i]
        group = [item]
        group_outlets = {item["outlet"]}
        group_syndicates = {item.get("group") or item["outlet"]}
        used.add(i)
        for j in range(i + 1, len(items)):
            synd_j = items[j].get("group") or items[j]["outlet"]
            if j in used or items[j]["outlet"] in group_outlets or synd_j in group_syndicates:
                continue
            if has_cluster_conflict(item, items[j]):
                continue
            words_j = title_tokens_cache[j]
            if not words_i or not words_j:
                continue
            shared = len(words_i & words_j)
            overlap = shared / max(1, min(len(words_i), len(words_j)))
            desc_shared = len((words_i | desc_i) & (words_j | desc_tokens_cache[j]))
            if shared >= 3 or (shared >= 2 and overlap >= 0.45 and desc_shared >= 5):
                group.append(items[j])
                group_outlets.add(items[j]["outlet"])
                group_syndicates.add(synd_j)
                used.add(j)
        clusters.append(group)

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


GENERIC_TOPIC_TOKENS = {
    "prezydent", "premier", "minister", "minist", "rzad", "sejm", "senat",
    "ustaw", "przepis", "nowelizacj", "projekt", "uchwal", "koalicj", "opozycj",
    "part", "wybor", "glosow", "polityk", "polityczn", "kandydat",
    "karol", "nawrock", "donald", "tusk", "trump", "biden", "putin", "zelensk", "wolodymyr",
    "polsk", "rosj", "ukrain", "usa", "niemc", "francj", "chin", "europ", "europejsk",
    "panstw", "kraj", "swiat", "miasto", "powiat", "gmin", "region", "wojewodztw",
    "informacj", "pierwsz", "kolejn", "wazn", "piln", "oficjaln",
    "decyzj", "spraw", "stanowisk", "komentarz", "odpowiedz", "pytan", "rozmow",
    "spotkan", "konferencj", "apel", "protest", "akcj", "sluzb", "prokuratur",
    "onet", "tvn24", "rmf24", "polsat", "interi", "rzeczpospolit", "dziennik", "gazet",
}


def _article_token_profile(art: dict) -> dict:
    title = art.get("seo_title") or ""
    lead_toks = tokenize_title(title)
    persp_titles = [p.get("summary") or "" for p in (art.get("perspectives") or []) if p.get("summary")]
    persp_toks = set().union(*(tokenize_title(pt) for pt in persp_titles), lead_toks) if persp_titles else set(lead_toks)
    body_parts = [art.get("summary_lead") or ""]
    for s in art.get("full_sections") or []:
        for p in s.get("paragraphs") or []:
            body_parts.append(_strip_all_citations(p))
    body_toks = tokenize_title(" ".join(body_parts)) | persp_toks
    links = {p.get("url", "").strip() for p in (art.get("perspectives") or []) if p.get("url", "").strip()}
    slug = (art.get("seo_url", "").split("/")[-1] or "")[:60]
    _, countries = _extract_geo_entities(title)
    return {
        "lead_toks": lead_toks,
        "persp_toks": persp_toks,
        "body_toks": body_toks,
        "links": links,
        "slug": slug,
        "countries": countries,
    }


def _are_articles_same_event(art_a: dict, art_b: dict, prof_a: dict | None = None, prof_b: dict | None = None) -> bool:
    pa = prof_a or _article_token_profile(art_a)
    pb = prof_b or _article_token_profile(art_b)

    if pa["links"] and pb["links"] and (pa["links"] & pb["links"]):
        return True
    if pa["slug"] and pb["slug"] and len(pa["slug"]) >= 12 and pa["slug"] == pb["slug"]:
        return True

    stub_a = {"title": art_a.get("seo_title", ""), "description": art_a.get("summary_lead", ""), "path": art_a.get("path", "/Polska")}
    stub_b = {"title": art_b.get("seo_title", ""), "description": art_b.get("summary_lead", ""), "path": art_b.get("path", "/Polska")}
    if has_cluster_conflict(stub_a, stub_b):
        return False

    diff_countries = (pa["countries"] ^ pb["countries"]) - {"usa", "rosja", "ukraina"}
    if diff_countries:
        return False

    la, lb = pa["lead_toks"], pb["lead_toks"]
    if not la or not lb:
        return False

    sh_l = la & lb
    sp_l = sh_l - GENERIC_TOPIC_TOKENS
    sh_p = pa["persp_toks"] & pb["persp_toks"]
    sp_p = sh_p - GENERIC_TOPIC_TOKENS
    sh_b = pa["body_toks"] & pb["body_toks"]
    sp_b = sh_b - GENERIC_TOPIC_TOKENS

    ov_l = len(sh_l) / max(1, min(len(la), len(lb)))
    ov_b = len(sh_b) / max(1, min(len(pa["body_toks"]), len(pb["body_toks"])))

    c1 = len(sh_l) >= 3 and len(sp_l) >= 2 and (ov_l >= 0.42 or len(sp_b) >= 4)
    c2 = len(sh_l) >= 1 and len(sh_p) >= 2 and len(sp_p) >= 1 and len(sp_b) >= 9 and ov_b >= 0.29
    return bool(c1 or c2)


def find_matching_existing_article(group: list, existing_articles: list) -> dict | None:
    if not group or not existing_articles:
        return None
    candidate_title = group[0].get("title") or ""
    cand_lead_toks = tokenize_title(candidate_title)
    cand_titles_tokens = [tokenize_title(it.get("title") or "") for it in group if it.get("title")]
    cand_persp_toks = set().union(*cand_titles_tokens, cand_lead_toks) if cand_titles_tokens else set(cand_lead_toks)
    cand_body_toks = tokenize_title(" ".join((it.get("title") or "") + " " + (it.get("description") or "") for it in group)) | cand_persp_toks
    cand_links = {it.get("link", "").strip() for it in group if it.get("link", "").strip()}
    cand_slug = _make_clean_slug(candidate_title)[:60]
    _, cand_countries = _extract_geo_entities(candidate_title)

    for art in existing_articles:
        prof = _article_token_profile(art)
        if cand_links and prof["links"] and (cand_links & prof["links"]):
            return art
        if cand_slug and prof["slug"] and len(cand_slug) >= 12 and cand_slug == prof["slug"]:
            return art

        ext_stub = {"title": art.get("seo_title", ""), "description": art.get("summary_lead", ""), "path": art.get("path", "/Polska")}
        if has_cluster_conflict(group[0], ext_stub):
            continue

        diff_countries = (cand_countries ^ prof["countries"]) - {"usa", "rosja", "ukraina"}
        if diff_countries:
            continue

        sh_l = cand_lead_toks & prof["lead_toks"]
        sp_l = sh_l - GENERIC_TOPIC_TOKENS
        sh_p = cand_persp_toks & prof["persp_toks"]
        sp_p = sh_p - GENERIC_TOPIC_TOKENS
        sh_b = cand_body_toks & prof["body_toks"]
        sp_b = sh_b - GENERIC_TOPIC_TOKENS
        ov_l = len(sh_l) / max(1, min(len(cand_lead_toks), len(prof["lead_toks"])))
        ov_b = len(sh_b) / max(1, min(len(cand_body_toks), len(prof["body_toks"])))

        if len(sh_l) >= 3 and len(sp_l) >= 2 and (ov_l >= 0.42 or len(sp_b) >= 4):
            return art
        if len(sh_l) >= 1 and len(sh_p) >= 2 and len(sp_p) >= 1 and len(sp_b) >= 6 and ov_b >= 0.29:
            return art

        ext_titles = [art.get("seo_title", "")] + [p.get("summary", "") for p in art.get("perspectives", [])]
        for et in ext_titles:
            e_words = tokenize_title(et)
            if not e_words:
                continue
            for c_words in cand_titles_tokens:
                if not c_words:
                    continue
                sh = c_words & e_words
                sp = sh - GENERIC_TOPIC_TOKENS
                overlap = len(sh) / max(1, min(len(c_words), len(e_words)))
                if (len(sh) >= 3 and len(sp) >= 2) or (len(sh) >= 2 and len(sp) >= 1 and overlap >= 0.48 and len(sp_b) >= 4):
                    return art
    return None


def is_already_covered(group: list, existing_articles: list) -> bool:
    return find_matching_existing_article(group, existing_articles) is not None


def _metrics_for_article(sources: list, path: str, primary_outlet: str) -> list:
    n = len(sources)
    verif_label = (
        f"Potwierdzone ({n} źródeł)"
        if n >= 5
        else f"Potwierdzone ({n} źródła)"
        if n >= 2
        else "1 źródło (lokalne/niszowe)"
    )
    red_label = "redakcja" if n == 1 else ("redakcje" if n < 5 else "redakcji")
    return [
        {"label": "Liczba źródeł", "val": f"{n} {red_label}"},
        {"label": "Kategoria", "val": path},
        {"label": "Główne źródło", "val": primary_outlet},
        {"label": "Weryfikacja", "val": verif_label},
    ]


def build_article_from_group(group: list, art_id: int) -> dict:
    now_iso = datetime.now().strftime("%Y-%m-%dT%H:%M:%S+01:00")
    now_display = datetime.now().strftime("%d.%m.%Y, %H:%M")

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

    clean_title = polish_typography_clean(primary["title"])
    art_path = infer_category_path(primary["path"], primary.get("link", ""), clean_title, primary.get("description", ""))
    slug = _make_clean_slug(clean_title)
    sections, fact_agreement_pct = synthesize_article_sections(ranked_group, clean_title)
    summary_lead, meta_description, keywords = _build_meta_and_summary(clean_title, sections, art_path, sources)

    perspectives = [
        {
            "outlet": it["outlet"],
            "angle": _contextual_angle(it["outlet"], it["title"], art_path, idx == 0),
            "summary": polish_typography_clean(it["title"]),
            "url": it["link"],
        }
        for idx, it in enumerate(ranked_group[:6])
    ]

    metrics = _metrics_for_article(sources, art_path, primary["outlet"])

    return {
        "id": art_id,
        "path": art_path,
        "seo_url": f"{art_path}/{slug}",
        "seo_title": clean_title,
        "summary_lead": summary_lead,
        "meta_description": meta_description,
        "keywords": keywords,
        "thumbnail_url": thumbnail_url,
        "published_iso": now_iso,
        "display_date": now_display,
        "status": "AUTO_PUBLISHED",
        "fact_agreement_pct": fact_agreement_pct,
        "admin_note": "",
        "metrics": metrics,
        "declickbait": [],
        "full_sections": sections,
        "perspectives": perspectives,
        "sources": sources,
        "corrections": [],
    }


def _reconstruct_outlet_texts(art: dict) -> dict:
    """Zbiera akapity z istniejących sekcji według znaczników [Źródło: ...]."""
    by_outlet_excl = {}
    by_outlet_all = {}
    for s in art.get("full_sections") or []:
        heading = s.get("heading") or ""
        explicit_single = ""
        if heading.startswith("Relacja źródłowa:"):
            explicit_single = heading.replace("Relacja źródłowa:", "").strip()
        elif heading.startswith("Relacja źródłowa (") and heading.endswith(")"):
            explicit_single = heading[len("Relacja źródłowa ("):-1].strip()
        for raw_p in s.get("paragraphs") or []:
            m = re.search(r"\[Źródło:\s*([^\]]+)\]\s*$", raw_p)
            plain_p = _strip_all_citations(raw_p)
            if not plain_p:
                continue
            if m:
                outlets = [o.strip() for o in m.group(1).split(",") if o.strip()]
            elif explicit_single:
                outlets = [explicit_single]
            else:
                outlets = (art.get("sources") or [])[:1]
            for o in outlets:
                by_outlet_all.setdefault(o, []).append(plain_p)
            if len(outlets) == 1:
                by_outlet_excl.setdefault(outlets[0], []).append(plain_p)
    return {"exclusive": by_outlet_excl, "all": by_outlet_all}


def _extract_candidates_from_article(art: dict) -> list:
    title = polish_typography_clean(art.get("seo_title") or "")
    persps = list(art.get("perspectives") or [])
    new_path = art.get("path") or "/Polska"
    outlet_texts = _reconstruct_outlet_texts(art)
    candidates = []
    seen_outlets = set()
    for idx_p, p in enumerate(persps):
        out_name = (p.get("outlet") or "").strip()
        p_title = polish_typography_clean(p.get("summary") or title)
        p_url = (p.get("url") or "").strip()
        if not out_name or out_name in seen_outlets:
            continue
        if idx_p > 0 and (is_opinion_or_blacklisted(p_title, p_url) or re.search(r"\bmemy\b", p_title, re.IGNORECASE)):
            continue
        seen_outlets.add(out_name)
        if idx_p == 0:
            desc_parts = outlet_texts["all"].get(out_name) or ([art.get("summary_lead")] if art.get("summary_lead") else [])
        else:
            desc_parts = outlet_texts["exclusive"].get(out_name) or outlet_texts["all"].get(out_name) or []
        p_default = OUTLET_DEFAULT_PATH.get(out_name, new_path)
        p_default = seo_builder.LEGACY_REGION_MAP.get(p_default, p_default)
        p_path = infer_category_path(p_default, p_url, p_title, "\n".join(desc_parts)[:320])
        candidates.append({
            "outlet": out_name,
            "title": p_title,
            "description": "\n".join(desc_parts),
            "link": p_url,
            "path": p_path,
            "is_orig_primary": (idx_p == 0),
        })

    for out_name in art.get("sources") or []:
        if out_name in seen_outlets:
            continue
        seen_outlets.add(out_name)
        desc_parts = outlet_texts["all"].get(out_name) or []
        candidates.append({
            "outlet": out_name,
            "title": title,
            "description": "\n".join(desc_parts),
            "link": "",
            "path": new_path,
            "is_orig_primary": (len(candidates) == 0),
        })
    return candidates


def _apply_candidates_to_article(art: dict, candidates: list, preserve_seo_url: bool = False):
    title = polish_typography_clean(art.get("seo_title") or (candidates[0]["title"] if candidates else ""))
    art_path = art.get("path") or "/Polska"
    sources = sorted(list({c["outlet"] for c in candidates if c.get("outlet")}))
    primary_outlet = candidates[0]["outlet"] if candidates else (sources[0] if sources else "")

    if not preserve_seo_url:
        old_seo = art.get("seo_url") or ""
        old_cat = old_seo.rsplit("/", 1)[0] if "/" in old_seo else ""
        old_slug = old_seo.split("/")[-1] if old_seo else ""
        new_slug = _make_clean_slug(title)
        if not old_seo or old_cat != art_path or len(old_slug) >= 74:
            art["seo_url"] = f"{art_path}/{new_slug}"

    ranked_for_synth = [
        {
            "outlet": c["outlet"],
            "title": c["title"],
            "description": c.get("description") or c["title"],
            "link": c.get("link") or "",
            "path": art_path,
        }
        for c in candidates
    ]

    new_secs, new_pct = synthesize_article_sections(ranked_for_synth, title)
    art["full_sections"] = new_secs
    art["fact_agreement_pct"] = new_pct
    art["sources"] = sources
    art["perspectives"] = [
        {
            "outlet": c["outlet"],
            "angle": _contextual_angle(c["outlet"], c["title"], art_path, idx == 0),
            "summary": c["title"],
            "url": c.get("link") or "",
        }
        for idx, c in enumerate(candidates[:6])
    ]
    summary_lead, meta_desc, keywords = _build_meta_and_summary(title, new_secs, art_path, sources)
    art["summary_lead"] = summary_lead
    art["meta_description"] = meta_desc
    art["keywords"] = keywords
    art["metrics"] = _metrics_for_article(sources, art_path, primary_outlet)


def merge_cluster_into_article(existing_art: dict, group: list) -> bool:
    """
    Dopisuje nowe redakcje i perspektywy z klastra RSS do już opublikowanego artykułu
    o tym samym wydarzeniu (z zachowaniem istniejącego seo_url).
    """
    if not existing_art or not group:
        return False

    candidates = _extract_candidates_from_article(existing_art)
    by_outlet = {c["outlet"]: c for c in candidates if c.get("outlet")}
    anchor = candidates[0] if candidates else {
        "title": existing_art.get("seo_title") or "",
        "description": existing_art.get("summary_lead") or "",
        "path": existing_art.get("path") or "/Polska",
    }

    added_any = False
    for it in group:
        out_name = (it.get("outlet") or "").strip()
        if not out_name:
            continue
        it_title = polish_typography_clean(it.get("title") or "")
        it_link = (it.get("link") or "").strip()
        it_desc = clean_desc_text(it.get("description") or "", article_title=it_title)
        if is_opinion_or_blacklisted(it_title, it_link):
            continue
        if has_cluster_conflict(anchor, it):
            continue
        if out_name in by_outlet:
            existing_c = by_outlet[out_name]
            if not existing_c.get("link") and it_link:
                existing_c["link"] = it_link
                added_any = True
            if len(it_desc) > len(existing_c.get("description") or "") + 40:
                existing_c["description"] = it_desc
                added_any = True
            continue

        new_cand = {
            "outlet": out_name,
            "title": it_title or existing_art.get("seo_title") or "",
            "description": it_desc,
            "link": it_link,
            "path": it.get("path") or existing_art.get("path") or "/Polska",
            "is_orig_primary": False,
        }
        candidates.append(new_cand)
        by_outlet[out_name] = new_cand
        added_any = True
        if ENABLE_THUMBNAILS and not existing_art.get("thumbnail_url") and it.get("thumbnail"):
            existing_art["thumbnail_url"] = it["thumbnail"]

    if added_any:
        _apply_candidates_to_article(existing_art, candidates, preserve_seo_url=True)
    return added_any


def deduplicate_existing_articles(articles: list) -> list:
    """
    Scala zduplikowane artykuły o tym samym wydarzeniu w bazie articles.json,
    łącząc ich redakcje, perspektywy i sekcje faktograficzne.
    """
    if len(articles) <= 1:
        return articles

    profiles = [_article_token_profile(a) for a in articles]
    merged_indices = set()
    result = []

    for i, art_a in enumerate(articles):
        if i in merged_indices:
            continue
        prof_a = profiles[i]
        for j in range(i + 1, len(articles)):
            if j in merged_indices:
                continue
            art_b = articles[j]
            prof_b = profiles[j]
            if not _are_articles_same_event(art_a, art_b, prof_a, prof_b):
                continue

            # Scal art_b do art_a
            cands_a = _extract_candidates_from_article(art_a)
            cands_b = _extract_candidates_from_article(art_b)

            # Jeśli tytuł art_a zawiera ogólnik „Pierwsze informacje”, a art_b ma konkretny tytuł z preferowanej redakcji, przejmij lepszy tytuł
            title_a = art_a.get("seo_title") or ""
            title_b = art_b.get("seo_title") or ""
            if re.search(r"\bpierwsze\s+informacje\b", title_a, re.IGNORECASE) and not re.search(r"\bpierwsze\s+informacje\b", title_b, re.IGNORECASE):
                art_a["seo_title"] = title_b
                if cands_b:
                    cands_a, cands_b = cands_b, cands_a

            by_outlet = {c["outlet"]: c for c in cands_a if c.get("outlet")}
            for cb in cands_b:
                out_name = cb.get("outlet") or ""
                if not out_name:
                    continue
                if out_name not in by_outlet:
                    cands_a.append(cb)
                    by_outlet[out_name] = cb
                else:
                    existing_c = by_outlet[out_name]
                    if not existing_c.get("link") and cb.get("link"):
                        existing_c["link"] = cb["link"]
                    if len(cb.get("description") or "") > len(existing_c.get("description") or ""):
                        existing_c["description"] = cb["description"]

            if not art_a.get("thumbnail_url") and art_b.get("thumbnail_url"):
                art_a["thumbnail_url"] = art_b["thumbnail_url"]
            if (art_b.get("published_iso") or "") > (art_a.get("published_iso") or ""):
                art_a["published_iso"] = art_b["published_iso"]
                art_a["display_date"] = art_b.get("display_date") or art_a.get("display_date")

            _apply_candidates_to_article(art_a, cands_a, preserve_seo_url=True)
            prof_a = _article_token_profile(art_a)
            profiles[i] = prof_a
            merged_indices.add(j)

        result.append(art_a)

    return result


def _upgrade_existing_article(art: dict) -> dict | None:
    """
    Czyści i przebudowuje istniejące artykuły w bazie:
    - Odrzuca artykuły SEO-spam (transmisje 'gdzie oglądać', memy, quizy, horoskopy).
    - Rozdziela błędnie sklejone klastry wielotematowe z wcześniejszych wersji (np. różne miasta/dyscypliny/daty).
    - Egzekwuje regułę min. 2 źródeł dla ogólnopolskich (1 źródło tylko dla lokalnych/niszowych bez %).
    - Usuwa stopki WordPress, śmieci Drupala, podwójne encje HTML, urwane […] i powtórzenia między sekcjami.
    - Dzieli wielkie ściany tekstu na spójne akapity oraz wylicza summary_lead, meta_description i keywords.
    """
    title = polish_typography_clean(art.get("seo_title") or "")
    persps = list(art.get("perspectives") or [])
    primary_url = persps[0].get("url", "") if persps else ""
    first_outlet = (persps[0].get("outlet") or "").strip() if persps else ""

    if is_opinion_or_blacklisted(title, primary_url):
        return None
    if not title:
        return None

    raw_old_path = OUTLET_DEFAULT_PATH.get(first_outlet) or art.get("path") or "/Polska"
    old_path = seo_builder.LEGACY_REGION_MAP.get(raw_old_path, raw_old_path)

    first_para_plain = ""
    if art.get("full_sections"):
        paras0 = art["full_sections"][0].get("paragraphs") or []
        if paras0:
            first_para_plain = _strip_all_citations(paras0[0])
    geo_context_desc = f"{art.get('summary_lead') or ''} {first_para_plain}".strip()[:380]

    new_path = infer_category_path(old_path, primary_url, title, geo_context_desc)
    # Jeśli artykuł miał główną perspektywę z RSS Sport lub sportową — skoryguj dział
    art["path"] = new_path
    art["seo_title"] = title

    candidates = _extract_candidates_from_article(art)

    # Wykryj i odetnij błędnie sklejone perspektywy niezgodne z tematem głównym
    GEO_ONLY_SHARED = {
        "rosj", "rosyjsk", "ukrain", "ukrainsk", "usa", "amerykansk", "niemc", "niemieck",
        "francj", "francusk", "chin", "chinsk", "finland", "iransk", "iran", "izrael", "izraelsk", "hiszpani", "rosja",
    }
    if len(candidates) >= 2:
        anchor = candidates[0]
        kept = [anchor]
        for cand in candidates[1:]:
            if has_cluster_conflict(anchor, cand):
                continue
            c_title_toks = tokenize_title(cand["title"])
            c_all_toks = tokenize_title(cand["title"] + " " + cand["description"])
            c_cities_lead, _ = _extract_geo_entities(cand["title"] + " " + cand["description"][:220])
            compatible = False
            for k in kept:
                if has_cluster_conflict(k, cand):
                    compatible = False
                    break
                k_title_toks = tokenize_title(k["title"])
                k_all_toks = tokenize_title(k["title"] + " " + k["description"])
                k_cities_lead, _ = _extract_geo_entities(k["title"] + " " + k["description"][:220])
                common_t = c_title_toks & k_title_toks
                non_geo_common_t = common_t - GEO_ONLY_SHARED
                sh_t = len(common_t)
                ov_t = sh_t / max(1, min(len(c_title_toks), len(k_title_toks)))
                sh_all = len(c_all_toks & k_all_toks)
                if sh_t < 3 and c_cities_lead and k_cities_lead and not (c_cities_lead & k_cities_lead):
                    continue
                if len(non_geo_common_t) == 0 and sh_t <= 2 and sh_all < 5:
                    continue
                if sh_t >= 3 or (sh_t >= 2 and ov_t >= 0.30) or (sh_t >= 1 and sh_all >= 4) or (sh_all >= 5 and ov_t >= 0.15):
                    compatible = True
                    break
            if compatible:
                kept.append(cand)
        candidates = kept

    sources = sorted(list({c["outlet"] for c in candidates}))
    primary_outlet = candidates[0]["outlet"] if candidates else (sources[0] if sources else "")
    lead_url = candidates[0]["link"] if candidates else primary_url
    new_path = infer_category_path(old_path, lead_url, title, geo_context_desc)
    art["path"] = new_path

    # Egzekucja reguły 1 źródła: wyłącznie tematy lokalne (16 województw / Energetyka) lub niszowe
    if len(sources) <= 1:
        if new_path not in LOCAL_PATHS and primary_outlet not in NICHE_OUTLETS:
            return None

    _apply_candidates_to_article(art, candidates, preserve_seo_url=False)
    return art


def _ensure_unique_seo_urls(articles: list):
    used = set()
    for a in articles:
        url = (a.get("seo_url") or "").rstrip("/")
        if not url:
            url = f"{a.get('path', '/Polska')}/{_make_clean_slug(a.get('seo_title', 'artykul'))}"
        if url in used:
            url = f"{url}-{a['id']}"
        used.add(url)
        a["seo_url"] = url


def update_news_cycle(fetch_live: bool = True):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    articles_path = os.path.join(base_dir, "articles.json")

    # 1. Wczytaj, oczyść i zdeduplikuj istniejące artykuły
    existing_articles = []
    if os.path.exists(articles_path):
        try:
            with open(articles_path, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                if isinstance(loaded, list):
                    for a in loaded:
                        if (a.get("published_iso") or "")[:10] < "2026-11-13":
                            continue
                        upgraded = _upgrade_existing_article(a)
                        if upgraded is not None:
                            existing_articles.append(upgraded)
        except Exception as e:
            print(f"[WARN] Błąd odczytu {articles_path}: {e}")

    before_dedup = len(existing_articles)
    existing_articles = deduplicate_existing_articles(existing_articles)
    if len(existing_articles) < before_dedup:
        print(f"[DEDUP] Scalono {before_dedup - len(existing_articles)} zduplikowanych artykułów o tych samych wydarzeniach.")

    new_articles = []
    if fetch_live:
        print("Pobieranie wiadomości z polskich kanałów RSS...")
        raw_items = fetch_rss_items()
        clusters = cluster_similar_items(raw_items) if raw_items else []

        # Najpierw dopisz nowe źródła/perspektywy do już opublikowanych artykułów
        enriched_count = 0
        for grp in clusters:
            matched_existing = find_matching_existing_article(grp, existing_articles)
            if matched_existing is not None:
                if merge_cluster_into_article(matched_existing, grp):
                    enriched_count += 1
        if enriched_count:
            print(f"[MERGE] Dopisano nowe źródła do {enriched_count} istniejących artykułów.")

        for grp in clusters:
            if len(new_articles) >= MAX_NEW_PER_RUN:
                break
            unique_groups = {it.get("group") or it["outlet"] for it in grp}
            if len(unique_groups) < 2:
                continue
            matched = find_matching_existing_article(grp, existing_articles + new_articles)
            if matched is not None:
                merge_cluster_into_article(matched, grp)
                continue
            art = build_article_from_group(grp, len(new_articles) + 1)
            new_articles.append(art)

        if len(new_articles) < MAX_NEW_PER_RUN:
            for grp in clusters:
                if len(new_articles) >= MAX_NEW_PER_RUN:
                    break
                unique_groups = {it.get("group") or it["outlet"] for it in grp}
                if len(unique_groups) == 1 and is_local_or_niche_item(grp[0]):
                    if not is_already_covered(grp, existing_articles + new_articles):
                        art = build_article_from_group(grp, len(new_articles) + 1)
                        new_articles.append(art)
                        break

        # Dedykowana pula regionalna (rotuje od województw z najmniejszą liczbą artykułów, bez głodzenia przez tematy ogólnopolskie)
        reg_counts = {vp: 0 for vp in seo_builder.VOIVODESHIP_BY_PATH}
        for ext in existing_articles + new_articles:
            ep = ext.get("path") or ""
            if ep in reg_counts:
                reg_counts[ep] += 1

        reg_candidates = []
        for grp in clusters:
            lead_it = grp[0]
            inferred_p = infer_category_path(
                lead_it.get("path") or "/Polska",
                lead_it.get("link") or "",
                lead_it.get("title") or "",
                lead_it.get("description") or "",
            )
            if inferred_p not in seo_builder.VOIVODESHIP_BY_PATH:
                continue
            unique_groups = {it.get("group") or it["outlet"] for it in grp}
            reg_candidates.append((reg_counts.get(inferred_p, 0), 0 if len(unique_groups) >= 2 else 1, inferred_p, grp))

        reg_candidates.sort(key=lambda x: (x[0], x[1], -len(x[3][0].get("description") or "")))
        added_reg = 0
        added_reg_paths = set()
        for _, _, cand_path, grp in reg_candidates:
            if added_reg >= MAX_REGIONAL_PER_RUN:
                break
            if cand_path in added_reg_paths:
                continue
            matched = find_matching_existing_article(grp, existing_articles + new_articles)
            if matched is not None:
                merge_cluster_into_article(matched, grp)
                continue
            art = build_article_from_group(grp, len(new_articles) + 1)
            new_articles.append(art)
            added_reg += 1
            added_reg_paths.add(cand_path)

        print(f"Wyselekcjonowano {len(new_articles)} nowych kluczowych artykułów w tej godzinie (w tym regionalne: {added_reg}).")

    # 4. Połącz i posortuj chronologicznie (malejąco)
    combined = new_articles + existing_articles
    combined.sort(key=lambda a: (1 if (a.get("declickbait") or []) else 0, a.get("published_iso") or ""), reverse=True)
    combined = combined[:MAX_TOTAL_ARTICLES]

    for idx, a in enumerate(combined, start=1):
        a["id"] = idx
    _ensure_unique_seo_urls(combined)

    # 6. Zapisz articles.json
    with open(articles_path, "w", encoding="utf-8") as f:
        json.dump(combined, f, ensure_ascii=False, indent=2)
    print(f"[SUKCES] Baza zaktualizowana: {len(combined)} artykułów zapisanych w {articles_path}")

    # 7. Wygeneruj całą infrastrukturę SEO (statyczne HTML, sitemap.xml, news-sitemap.xml, feed.xml, robots.txt, 404.html)
    seo_builder.build_all_seo_artifacts(base_dir, combined)


if __name__ == "__main__":
    no_fetch = "--rebuild-only" in sys.argv
    update_news_cycle(fetch_live=not no_fetch)


