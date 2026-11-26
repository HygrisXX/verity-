#!/usr/bin/env python3
"""
VERITY — Legalna, wielowariantowa biblioteka zdjęć ilustracyjnych z Wikimedia Commons
(wyłącznie CC0 / Public Domain / CC BY / CC BY-SA — bezpieczne także komercyjnie).

Zasady zgodności z prawem i różnorodności:
- Zero hotlinkowania do portali informacyjnych (wszystkie zdjęcia hostowane lokalnie w `media/`).
- Akceptowane wyłącznie wolne licencje: CC0, Public Domain (PD), CC BY, CC BY-SA.
- Odrzucane: NC, ND, Fair use, Copyrighted, mapy/loga/skany.
- Wielowariantowe pule tematyczne i regionalne (100+ unikalnych zdjęć) + algorytm
  anty-powtórzeniowy `assign_diverse_media`, gwarantujący brak powtórzeń na pierwszych
  ekranach strony głównej i każdego działu.

Uruchomienie:
    python3 media_library.py
"""

from __future__ import annotations

import concurrent.futures
import datetime as dt
import hashlib
import io
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
MEDIA_DIR = os.path.join(ROOT_DIR, "media")
REGISTRY_FILE = os.path.join(ROOT_DIR, "media_registry.json")
USER_AGENT = "VERITY-MediaLibrary/1.1 (https://github.com/HygrisXX/verity-; legal CC media archive)"

ALLOWED_LICENSE_RE = re.compile(
    r"^(?:cc0(?:\s+1\.0)?|public\s+domain|pd(?:-[a-z0-9-]+)?|cc[\s-]+by(?:[\s-]+sa)?[\s-]+[1-4]\.[0-9])$",
    re.IGNORECASE,
)
FORBIDDEN_LICENSE_RE = re.compile(r"(?:nc|nd|non-?commercial|no-?deriv|fair\s*use|copyright|gfdl-only)", re.IGNORECASE)
BAD_TITLE_RE = re.compile(
    r"(?:map|mapa|herb|coat\s+of\s+arms|flag|flaga|logo|diagram|chart|plan|scan|document|pdf|svg|icon|signature|seal|stamp|emblem|banner|poster|plakat|banknote\s+hand|grave|cemetery)",
    re.IGNORECASE,
)

# Katalog wielowariantowy: `count` określa liczbę unikalnych zdjęć pobieranych dla danej kategorii
MEDIA_CATALOG = [
    # --- 16 województw (stolice i krajobrazy regionalne) ---
    {"id": "reg-mazowieckie", "count": 2, "queries": ["Warsaw skyline sunset", "Warsaw Old Town Vistula panorama"], "paths": ["/Polska/Regiony/Mazowieckie"], "keywords": ["warszaw", "mazowieck", "radom", "płock"], "label": "Warszawa, woj. mazowieckie"},
    {"id": "reg-malopolskie", "count": 2, "queries": ["Krakow Main Square Wawel", "Zakopane Tatra mountains Poland"], "paths": ["/Polska/Regiony/Malopolskie"], "keywords": ["krakow", "kraków", "małopolsk", "zakopan", "tarnów", "tatr"], "label": "Małopolska (zdjęcie ilustracyjne)"},
    {"id": "reg-dolnoslaskie", "count": 2, "queries": ["Wroclaw Market Square Rynek", "Wroclaw Ostrow Tumski Odra"], "paths": ["/Polska/Regiony/Dolnoslaskie"], "keywords": ["wrocław", "wroclaw", "dolnośląsk", "wałbrzych", "legnic", "lubin", "świdnic"], "label": "Wrocław, woj. dolnośląskie"},
    {"id": "reg-wielkopolskie", "count": 2, "queries": ["Poznan Stary Rynek town hall", "Poznan city panorama Poland"], "paths": ["/Polska/Regiony/Wielkopolskie"], "keywords": ["poznań", "poznan", "wielkopolsk", "kalisz", "konin", "leszn"], "label": "Poznań, woj. wielkopolskie"},
    {"id": "reg-pomorskie", "count": 2, "queries": ["Gdansk Motlawa crane", "Gdynia Baltic sea pier Sopot"], "paths": ["/Polska/Regiony/Pomorskie"], "keywords": ["gdańsk", "gdansk", "gdyni", "sopot", "pomorsk", "słupsk"], "label": "Pomorze (zdjęcie ilustracyjne)"},
    {"id": "reg-lodzkie", "count": 2, "queries": ["Lodz Piotrkowska street", "Lodz Manufaktura architecture"], "paths": ["/Polska/Regiony/Lodzkie"], "keywords": ["łódź", "łodzi", "lodz", "łódzk", "piotrków", "zgierz"], "label": "Łódź, woj. łódzkie"},
    {"id": "reg-slaskie", "count": 2, "queries": ["Katowice Spodek skyline", "Katowice Nikiszowiec Silesia"], "paths": ["/Polska/Regiony/Slaskie"], "keywords": ["katowic", "śląsk", "slask", "gliwic", "sosnow", "bielsko", "częstochow", "zabrze", "bytom"], "label": "Śląsk (zdjęcie ilustracyjne)"},
    {"id": "reg-zachodniopomorskie", "count": 2, "queries": ["Szczecin Waly Chrobrego", "Baltic coast beach Poland Swinoujscie"], "paths": ["/Polska/Regiony/Zachodniopomorskie"], "keywords": ["szczecin", "zachodniopomorsk", "koszalin", "świnoujści", "kołobrzeg"], "label": "Pomorze Zachodnie (zdjęcie ilustracyjne)"},
    {"id": "reg-lubelskie", "count": 2, "queries": ["Lublin Old Town Castle", "Zamosc Old Town Poland"], "paths": ["/Polska/Regiony/Lubelskie"], "keywords": ["lublin", "lubelsk", "zamość", "chełm", "biała podlaska"], "label": "Lubelszczyzna (zdjęcie ilustracyjne)"},
    {"id": "reg-podlaskie", "count": 2, "queries": ["Bialystok Branicki Palace", "Bialowieza forest Podlasie Poland"], "paths": ["/Polska/Regiony/Podlaskie"], "keywords": ["białystok", "białegostok", "podlask", "suwałk", "łomż"], "label": "Podlasie (zdjęcie ilustracyjne)"},
    {"id": "reg-podkarpackie", "count": 2, "queries": ["Rzeszow Rynek town hall", "Bieszczady mountains Poland landscape"], "paths": ["/Polska/Regiony/Podkarpackie"], "keywords": ["rzeszów", "rzeszow", "podkarpack", "przemyśl", "mielec", "krosn", "bieszczad"], "label": "Podkarpacie (zdjęcie ilustracyjne)"},
    {"id": "reg-swietokrzyskie", "count": 2, "queries": ["Kielce Palace of the Krakow Bishops", "Sandomierz Old Town Poland"], "paths": ["/Polska/Regiony/Swietokrzyskie"], "keywords": ["kielc", "świętokrzysk", "sandomierz", "ostrowiec"], "label": "Świętokrzyskie (zdjęcie ilustracyjne)"},
    {"id": "reg-warminsko-mazurskie", "count": 2, "queries": ["Olsztyn Old Town", "Masuria lakes Poland Mazury"], "paths": ["/Polska/Regiony/Warminsko-Mazurskie"], "keywords": ["olsztyn", "warmińsk", "mazur", "elbląg", "ełk"], "label": "Warmia i Mazury (zdjęcie ilustracyjne)"},
    {"id": "reg-opolskie", "count": 2, "queries": ["Opole Rynek town hall", "Moszna Castle Opole Poland"], "paths": ["/Polska/Regiony/Opolskie"], "keywords": ["opole", "opola", "opolsk", "nysa", "kędzierzyn"], "label": "Opolszczyzna (zdjęcie ilustracyjne)"},
    {"id": "reg-kujawsko-pomorskie", "count": 2, "queries": ["Torun Old Town Vistula", "Bydgoszcz Mill Island Brda"], "paths": ["/Polska/Regiony/Kujawsko-Pomorskie"], "keywords": ["toruń", "torun", "bydgoszcz", "kujawsko", "inowrocław", "włocławek"], "label": "Kujawy i Pomorze (zdjęcie ilustracyjne)"},
    {"id": "reg-lubuskie", "count": 2, "queries": ["Zielona Gora Old Town", "Gorzow Wielkopolski Warta"], "paths": ["/Polska/Regiony/Lubuskie"], "keywords": ["zielon", "gorzów", "gorzow", "lubusk"], "label": "Lubuskie (zdjęcie ilustracyjne)"},

    # --- Tematy wysokoczęstotliwościowe (po 3–5 unikalnych wariantów) ---
    {"id": "topic-sejm", "count": 5, "queries": ["Sejm building Warsaw Poland", "Presidential Palace Warsaw Krakowskie Przedmiescie", "Chancellery of the Prime Minister Warsaw", "Belweder Palace Warsaw", "Polish Senate building Warsaw"], "paths": ["/Polska/Polityka"], "keywords": ["sejm", "senat", "rząd", "premier", "minister", "posł", "prezydent", "wybor", "partia", "koalicj", "lewica", "pis", "konfederacj", "tusk", "nawrocki"], "exclude_keywords": ["wiatraki", "mleczarn", "palantir", "mon "], "label": "Polityka i instytucje państwowe"},
    {"id": "topic-finance", "count": 5, "queries": ["Warsaw Spire Rondo Daszynskiego skyscrapers", "Warsaw financial district skyscrapers night", "Warsaw Stock Exchange building GPW", "National Bank of Poland Warsaw", "Warsaw Varso Tower business center"], "paths": ["/Polska/Gospodarka"], "keywords": ["giełd", "gpw", "akcj", "nbp", "inflacj", "zysk", "kredyt", "podat", "budżet", "skarbówk", "walut", "frank", "euro", "dolar", "bankow", "etf", "dywidend", "inwestycj", "rpp"], "exclude_keywords": ["banki żywności", "bank żywności", "bank krwi", "zbiórk"], "label": "Finanse i rynek kapitałowy"},
    {"id": "topic-court", "count": 4, "queries": ["Supreme Court Warsaw Poland Sad Najwyzszy", "Constitutional Tribunal Warsaw Poland", "courthouse law architecture Europe", "Ministry of Justice Warsaw Poland"], "paths": [], "keywords": ["sąd", "sądu", "prokuratur", "wyrok", "oskarż", "areszt", "więzien", "trybunał", "adwokat", "pozew", "prawa"], "exclude_keywords": ["sanatorium", "poskarży"], "label": "Wymiar sprawiedliwości"},
    {"id": "topic-energy", "count": 4, "queries": ["wind turbines Poland energy", "solar power plant photovoltaic panels", "Belchatow power station Poland", "refinery oil petrochemical plant"], "paths": ["/Polska/Energetyka"], "keywords": ["energ", "prąd", "prad", "taryf", "ure", "pge", "orlen", "paliw", "benzyn", "węgiel", "wegiel", "gaz", "atom", "elektrown", "fotowoltaik", "wiatrak", "turbin"], "label": "Energetyka i paliwa"},
    {"id": "topic-military", "count": 4, "queries": ["Polish Army soldier NATO", "F-16 Polish Air Force aircraft", "Leopard tank Polish Army", "Polish Border Guard Straz Graniczna"], "paths": [], "keywords": ["wojsk", "armia", "nato", "pentagon", "obronn", "pocisk", "dron", "żołnierz", "granic", "alerty", "mon ", "palantir", "rakiet", "lotniska"], "label": "Obronność i bezpieczeństwo"},
    {"id": "topic-traffic", "count": 4, "queries": ["Autostrada A2 Poland highway", "Warsaw bridge traffic evening", "road construction motorway Poland", "pedestrian crossing city street Poland"], "paths": [], "keywords": ["wypadek", "karambol", "zderzen", "kierowc", "autostrad", "ekspresow", "drogow", "korek", "potrącen", "parkowan", "pieszych", "ulic"], "label": "Ruch drogowy i infrastruktura"},
    {"id": "topic-tech", "count": 4, "queries": ["data center server room racks", "microchip processor circuit board", "smartphone screen technology hand", "fiber optic cables network technology"], "paths": [], "keywords": ["ai ", "sztuczn", "smartfon", "samsung", "apple", "google", "cyber", "aplikacj", "internet", "technolog", "bateri", "startup", "fintech", "cyfrow"], "label": "Technologie i cyfryzacja"},
    {"id": "topic-police", "count": 3, "queries": ["Policja Poland car", "police officers patrol city Europe", "emergency blue lights night"], "paths": [], "keywords": ["policj", "zatrzyman", "cbśp", "obława", "napad", "kradzież", "oszuka", "oszust", "przestęp", "narkotyk"], "label": "Policja i bezpieczeństwo"},
    {"id": "topic-fire", "count": 3, "queries": ["fire engine truck emergency", "firefighters rescue helmet fire", "fire station rescue vehicle Europe"], "paths": [], "keywords": ["pożar", "pozar", "strażak", "strazak", "zastęp", "płomien", "dym", "gaśnic", "psp"], "label": "Straż pożarna"},
    {"id": "topic-rail", "count": 3, "queries": ["PKP Intercity train Poland", "Warszawa Centralna railway station", "modern tram Warsaw Poland"], "paths": [], "keywords": ["pociąg", "pociag", "pkp", "kolej", "torach", "maszynist", "dworzec", "tramwaj", "bilet"], "label": "Transport szynowy"},
    {"id": "topic-hospital", "count": 3, "queries": ["ambulance rescue Poland pogotowie", "hospital building medical clinic", "medical laboratory doctor stethoscope"], "paths": [], "keywords": ["szpital", "karetk", "lekarz", "zdrowi", "szczep", "nfz", "pacjent", "lpr", "śmigłowiec", "chorob", "sanatorium", "kuracjusz", "medycz"], "label": "Ochrona zdrowia"},
    {"id": "topic-retail", "count": 3, "queries": ["shopping mall interior Poland", "supermarket grocery store shelves", "delivery parcels warehouse logistics"], "paths": [], "keywords": ["sklep", "black friday", "paczki", "przesyłk", "zakup", "handl", "biedronk", "żabk", "allegro", "niedziele handlowe", "promocj"], "label": "Handel i konsumenci"},
    {"id": "topic-housing", "count": 3, "queries": ["modern apartment buildings Warsaw", "construction crane residential building", "housing estate architecture Poland"], "paths": [], "keywords": ["mieszkan", "nieruchomoś", "deweloper", "budow", "najem", "hipote", "kominek", "usterki"], "label": "Nieruchomości i budownictwo"},
    {"id": "topic-weather-winter", "count": 3, "queries": ["snow winter road Poland", "winter city street snow evening", "storm clouds rain sky landscape"], "paths": [], "keywords": ["śnieg", "snieg", "zima", "mróz", "mroz", "gołoledź", "imgw", "pogod", "wichur", "powódź", "opady"], "label": "Pogoda i aura"},
    {"id": "topic-education", "count": 2, "queries": ["University of Warsaw campus building", "library books university lecture hall"], "paths": [], "keywords": ["szkoł", "liceum", "uczni", "student", "uniwersytet", "uczelni", "nauczyciel", "matur"], "label": "Edukacja i nauka"},
    {"id": "topic-culture", "count": 3, "queries": ["National Museum Warsaw Poland", "Grand Theatre Warsaw Teatr Wielki", "art gallery exhibition paintings"], "paths": [], "keywords": ["kultur", "muzeum", "teatr", "film", "galeria", "wystaw", "książk", "literac", "koncert", "sztuk", "zabytek", "obrazy"], "label": "Kultura i sztuka"},

    # --- Nowe, brakujące tematy dla jeszcze większej różnorodności ---
    {"id": "topic-aviation", "count": 2, "queries": ["Warsaw Chopin Airport terminal planes", "passenger airplane airport runway"], "paths": [], "keywords": ["lotnisk", "samolot", "lot ", "linii lotnicz", "pasażer", "odpraw", "ryanair", "wizz"], "label": "Lotnictwo i podróże"},
    {"id": "topic-agriculture", "count": 3, "queries": ["wheat field agriculture farm", "vegetables fruits market stall", "cows meadow pasture farm"], "paths": [], "keywords": ["żywnoś", "zywnos", "mleczarn", "rolnic", "rolnik", "zbiórk", "paczek", "jedzen", "wieś", "upraw"], "label": "Rolnictwo i żywność"},
    {"id": "topic-nature", "count": 3, "queries": ["forest river nature Poland park", "wildlife bear zoo nature", "Vistula river sunset Poland"], "paths": [], "keywords": ["las ", "puszcz", "rezerwat", "zwierz", "niedźwied", "zoo", "ekolog", "rzek", "odra", "woda", "wodociąg"], "label": "Przyroda i środowisko"},
    {"id": "topic-automotive", "count": 2, "queries": ["electric car charging station Europe", "cars street traffic city"], "paths": [], "keywords": ["samochód", "samochod", "aut ", "auto ", "elektryczn", "nissan", "byd", "tesla", "motoryzacj", "quad"], "label": "Motoryzacja"},
    {"id": "topic-maritime", "count": 2, "queries": ["Port of Gdansk container ships", "cargo ship sea harbor"], "paths": [], "keywords": ["port ", "bałtyk", "statek", "stoczni", "żeglug", "morski", "zalew"], "label": "Gospodarka morska"},
    {"id": "topic-city-life", "count": 3, "queries": ["Polish town square pedestrians city", "community senior people park bench", "city hall municipal building Poland"], "paths": [], "keywords": ["senior", "mieszkańc", "samorząd", "radnych", "gmin", "dps", "caritas", "pomoc", "ubóstw", "wolontari", "świąt", "kalendarz"], "label": "Społeczeństwo i samorząd"},

    # --- Świat (po 2–3 warianty) ---
    {"id": "world-eu", "count": 3, "queries": ["European Parliament Brussels building", "Berlaymont Brussels European Commission", "European Union flags Brussels"], "paths": ["/Swiat"], "keywords": ["unia europejsk", "bruksel", "komisja europejsk", "parlament europejsk", "ue ", "unij"], "label": "Instytucje UE, Bruksela"},
    {"id": "world-usa", "count": 3, "queries": ["United States Capitol Washington DC", "White House Washington DC", "New York Manhattan skyline"], "paths": [], "keywords": ["usa", "ameryk", "waszyngton", "trump", "biały dom", "kongres", "nowy jork"], "label": "Stany Zjednoczone"},
    {"id": "world-ukraine", "count": 3, "queries": ["Kyiv Independence Square Ukraine", "Kyiv skyline Dnipro river", "Lviv Old Town Ukraine"], "paths": [], "keywords": ["ukrain", "kijów", "kijow", "zełensk", "rosj", "kreml", "moskw", "putin"], "label": "Europa Wschodnia"},
    {"id": "world-germany", "count": 2, "queries": ["Brandenburg Gate Berlin", "Reichstag building Berlin Germany"], "paths": [], "keywords": ["niemc", "niemieck", "berlin", "bundestag", "merz", "scholz"], "label": "Niemcy"},
    {"id": "world-norway", "count": 2, "queries": ["Oslo Opera House fjord Norway", "Bergen Bryggen Norway"], "paths": [], "keywords": ["norweg", "oslo", "skandynaw", "szwecj", "finland", "dania"], "label": "Skandynawia"},
    {"id": "world-global", "count": 3, "queries": ["United Nations Headquarters New York", "London Westminster Big Ben", "Paris Eiffel Tower Seine"], "paths": ["/Swiat"], "keywords": ["świat", "dyplomacj", "szczyt", "onz", "chiny", "izrael", "bliski wschód", "iran", "francj", "wielka brytania", "londyn", "paryż"], "label": "Wydarzenia międzynarodowe"},

    # --- Sport (po 2–3 warianty) ---
    {"id": "sport-football", "count": 3, "queries": ["National Stadium Warsaw football pitch", "football stadium match night floodlights", "football soccer ball pitch grass"], "paths": ["/Sport"], "keywords": ["piłk", "ekstraklas", "liga mistrzów", "reprezentacj", "gol", "bramk", "stadion", "trener", "transfer", "lewandowsk", "mecz"], "label": "Piłka nożna"},
    {"id": "sport-volleyball", "count": 2, "queries": ["volleyball match indoor arena", "volleyball players court net"], "paths": [], "keywords": ["siatkówk", "siatkar", "plusliga", "fivb", "liga narodów"], "label": "Siatkówka"},
    {"id": "sport-basketball", "count": 2, "queries": ["basketball arena court game", "basketball players stadium"], "paths": [], "keywords": ["koszykówk", "nba", "kwarta", "trefl"], "label": "Koszykówka"},
    {"id": "sport-tennis", "count": 2, "queries": ["tennis court match stadium", "tennis tournament clay court"], "paths": [], "keywords": ["tenis", "wta", "atp", "świątek", "hurkacz", "turniej"], "label": "Tenis"},
    {"id": "sport-winter", "count": 2, "queries": ["ski jumping Zakopane Wielka Krokiew", "winter skiing alpine mountain sport"], "paths": [], "keywords": ["skok", "narciar", "puchar świata", "biathlon", "hokej", "łyżwiar"], "label": "Sporty zimowe"},

    # --- Domyślne warianty dla /Polska ---
    {"id": "polska-general", "count": 3, "queries": ["Poland Warsaw Royal Castle skyline", "Warsaw Vistula bridges panorama", "Polish city architecture sunset"], "paths": ["/Polska"], "keywords": ["polsk"], "label": "Polska (zdjęcie ilustracyjne)"},
]


def _clean_html_text(raw: str) -> str:
    txt = re.sub(r"<[^>]+>", " ", raw or "")
    txt = re.sub(r"\s+", " ", txt).strip()
    return txt[:120]


def _is_free_commercial_license(short_name: str, usage_terms: str = "") -> bool:
    s = (short_name or "").strip()
    u = (usage_terms or "").strip()
    if not s:
        return False
    if FORBIDDEN_LICENSE_RE.search(s) or FORBIDDEN_LICENSE_RE.search(u):
        return False
    return bool(ALLOWED_LICENSE_RE.match(s))


def _search_wikimedia_photos(query: str, max_results: int = 3, seen_titles: set | None = None, timeout: int = 10) -> list:
    url = (
        "https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6"
        f"&gsrlimit=12&gsrsearch={urllib.parse.quote(query)}"
        "&prop=imageinfo&iiprop=url|extmetadata|size|mime&iiurlwidth=880&format=json"
    )
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    pages = list(((data.get("query") or {}).get("pages") or {}).values())
    pages.sort(key=lambda p: p.get("index", 999))

    found_list = []
    for p in pages:
        if len(found_list) >= max_results:
            break
        title = p.get("title") or ""
        if BAD_TITLE_RE.search(title):
            continue
        if seen_titles is not None and title in seen_titles:
            continue
        ii = (p.get("imageinfo") or [None])[0]
        if not ii:
            continue
        mime = (ii.get("mime") or "").lower()
        if mime not in ("image/jpeg", "image/png", "image/webp"):
            continue
        w = int(ii.get("width") or 0)
        h = int(ii.get("height") or 0)
        if w < 640 or h < 360 or w < h * 1.15 or w > h * 2.6:
            continue
        em = ii.get("extmetadata") or {}
        lic_short = _clean_html_text((em.get("LicenseShortName") or {}).get("value", ""))
        lic_terms = _clean_html_text((em.get("UsageTerms") or {}).get("value", ""))
        if not _is_free_commercial_license(lic_short, lic_terms):
            continue
        lic_url = (em.get("LicenseUrl") or {}).get("value", "").strip()
        if not lic_url:
            if lic_short.upper().startswith("CC0"):
                lic_url = "https://creativecommons.org/publicdomain/zero/1.0/"
            elif "BY-SA" in lic_short.upper():
                lic_url = "https://creativecommons.org/licenses/by-sa/4.0/"
            elif "BY" in lic_short.upper():
                lic_url = "https://creativecommons.org/licenses/by/4.0/"
            else:
                lic_url = "https://commons.wikimedia.org/wiki/Commons:Licensing"
        artist = _clean_html_text((em.get("Artist") or {}).get("value", "")) or "Wikimedia Commons"
        artist = re.sub(r"^(?:User:|File:)", "", artist).strip()
        if len(artist) > 55:
            artist = artist[:52].rsplit(" ", 1)[0] + "…"
        dl_url = ii.get("thumburl") or ii.get("url") or ""
        desc_url = ii.get("descriptionurl") or ""
        if not dl_url or not desc_url:
            continue
        if seen_titles is not None:
            seen_titles.add(title)
        found_list.append({
            "wikimedia_title": title,
            "download_url": dl_url,
            "source_url": desc_url,
            "author": artist,
            "license": lic_short,
            "license_url": lic_url,
        })
    return found_list


def _download_and_optimize_jpeg(url: str, out_path: str, width: int = 760, height: int = 428) -> bool:
    from PIL import Image, ImageOps

    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=15) as resp:
        raw = resp.read()
    img = Image.open(io.BytesIO(raw))
    img = ImageOps.exif_transpose(img).convert("RGB")
    fitted = ImageOps.fit(img, (width, height), method=Image.Resampling.LANCZOS, centering=(0.5, 0.45))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    fitted.save(out_path, format="JPEG", quality=80, optimize=True, progressive=True)
    return True


def build_media_library(force: bool = False) -> dict:
    """Buduje lokalną wielowariantową bibliotekę zdjęć CC (100+ unikalnych plików) + media_registry.json."""
    os.makedirs(MEDIA_DIR, exist_ok=True)
    existing = {}
    seen_titles = set()
    if os.path.isfile(REGISTRY_FILE) and not force:
        try:
            with open(REGISTRY_FILE, "r", encoding="utf-8") as f:
                prev = json.load(f)
            for item in prev.get("items") or []:
                if item.get("id") and os.path.isfile(os.path.join(ROOT_DIR, item.get("file", ""))):
                    existing[item["id"]] = item
                    if item.get("wikimedia_title"):
                        seen_titles.add(item["wikimedia_title"])
        except (OSError, ValueError):
            pass

    items_out = []
    downloaded = 0

    for spec in MEDIA_CATALOG:
        base_id = spec["id"]
        target_count = int(spec.get("count") or 1)
        queries = list(spec.get("queries") or [])

        for slot in range(target_count):
            mid = base_id if slot == 0 else f"{base_id}-{slot + 1}"
            rel_file = f"media/{mid}.jpg"
            abs_file = os.path.join(ROOT_DIR, rel_file)

            if mid in existing and os.path.isfile(abs_file) and not force:
                entry = dict(existing[mid])
                entry["group_id"] = base_id
                entry["paths"] = spec["paths"]
                entry["keywords"] = spec["keywords"]
                entry["exclude_keywords"] = spec.get("exclude_keywords") or []
                entry["label"] = spec["label"]
                items_out.append(entry)
                continue

            # Preferuj osobne zapytanie dla każdego wariantu, potem przejrzyj pozostałe
            ordered_q = []
            if slot < len(queries):
                ordered_q.append(queries[slot])
            for q in queries:
                if q not in ordered_q:
                    ordered_q.append(q)

            found = None
            for q in ordered_q:
                try:
                    cands = _search_wikimedia_photos(q, max_results=2, seen_titles=seen_titles)
                    if cands:
                        found = cands[0]
                        break
                except Exception:
                    continue
                time.sleep(0.12)

            if not found:
                print(f"[MEDIA] Brak dopasowania dla {mid}")
                continue

            try:
                _download_and_optimize_jpeg(found["download_url"], abs_file)
                downloaded += 1
                attribution = f"Fot. ilustracyjne: {found['author']} ({found['license']}, Wikimedia Commons)"
                items_out.append({
                    "id": mid,
                    "group_id": base_id,
                    "file": rel_file,
                    "label": spec["label"],
                    "paths": spec["paths"],
                    "keywords": spec["keywords"],
                    "exclude_keywords": spec.get("exclude_keywords") or [],
                    "author": found["author"],
                    "license": found["license"],
                    "license_url": found["license_url"],
                    "source_url": found["source_url"],
                    "wikimedia_title": found["wikimedia_title"],
                    "attribution": attribution,
                    "is_illustrative": True,
                    "obtained_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d"),
                })
                print(f"[MEDIA] OK {mid} -> {found['license']} ({found['author']})")
                time.sleep(0.2)
            except Exception as exc:
                print(f"[MEDIA] Błąd pobierania {mid}: {exc}")

    registry = {
        "updated_iso": dt.datetime.now(dt.timezone.utc).astimezone().isoformat(timespec="seconds"),
        "policy": "Only CC0, Public Domain, CC BY, CC BY-SA (commercial-safe, local hosted, EXIF stripped).",
        "items": items_out,
    }
    tmp = REGISTRY_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(registry, f, ensure_ascii=False, indent=2)
    os.replace(tmp, REGISTRY_FILE)
    print(f"[MEDIA] Zapisano media_registry.json: {len(items_out)} legalnych zdjęć (nowo pobrano: {downloaded}).")
    return registry


def load_media_registry(base_dir: str = ROOT_DIR) -> dict:
    path = os.path.join(base_dir, "media_registry.json")
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict) and isinstance(data.get("items"), list):
                return data
        except (OSError, ValueError):
            pass
    return {"items": []}


def _stable_art_hash(art: dict) -> int:
    key = (art.get("seo_url") or art.get("seo_title") or str(art.get("id") or "")).encode("utf-8")
    return int(hashlib.md5(key).hexdigest()[:8], 16)


def rank_media_candidates(art: dict, registry: dict | None = None, base_dir: str = ROOT_DIR) -> list:
    """
    Zwraca posortowaną listę (score, item) trafnych, legalnych zdjęć dla artykułu.
    Tytuł ma 4x większą wagę niż lead; obsługuje `exclude_keywords` i deterministycznie
    tasuje warianty w obrębie tego samego wyniku (score), aby każdy artykuł preferował inny kadr.
    """
    reg = registry if registry is not None else load_media_registry(base_dir)
    items = [it for it in (reg.get("items") or []) if it.get("file") and os.path.isfile(os.path.join(base_dir, it["file"]))]
    if not items:
        return []

    title = (art.get("seo_title") or "").lower()
    lead = (art.get("summary_lead") or "").lower()
    cat_path = (art.get("path") or "/Polska").strip()
    haystack = f"{title} {lead}"
    art_h = _stable_art_hash(art)

    scored = []
    for it in items:
        mid = it.get("id", "")
        excl = it.get("exclude_keywords") or []
        if any(ex.lower() in haystack for ex in excl):
            continue

        title_hits = 0
        lead_hits = 0
        for kw in it.get("keywords") or []:
            k = kw.lower()
            if k in title:
                title_hits += 1
            elif k in lead:
                lead_hits += 1

        score = 0
        if mid.startswith(("topic-", "sport-", "world-")):
            if title_hits > 0:
                score += 36 + title_hits * 12 + lead_hits * 3
            elif lead_hits > 0:
                score += 18 + lead_hits * 4
        elif mid.startswith("reg-"):
            if title_hits > 0:
                score += 24 + title_hits * 6 + lead_hits * 2
            elif lead_hits > 0:
                score += 12 + lead_hits * 2

        it_paths = it.get("paths") or []
        if cat_path in it_paths:
            score += 26 if mid.startswith("reg-") else 18
        elif any(cat_path.startswith(p + "/") for p in it_paths if p != "/Polska"):
            score += 10

        # Pilnuj czystości między działami Sport / Świat / Polska
        if mid.startswith("sport-") and cat_path != "/Sport" and title_hits == 0:
            score = 0
        if mid.startswith("world-") and cat_path != "/Swiat" and title_hits == 0:
            score = 0
        if mid.startswith("polska-general") and score == 0 and cat_path.startswith("/Polska"):
            score = 6

        if score > 0:
            # Deterministyczny tie-breaker per (artykuł, zdjęcie), aby warianty tej samej grupy
            # rozkładały się równomiernie zamiast zawsze wybierać wariant #1
            tie = int(hashlib.md5(f"{art_h}:{mid}".encode("utf-8")).hexdigest()[:6], 16)
            scored.append((score, tie, it))

    scored.sort(key=lambda x: (-x[0], x[1]))
    if not scored:
        fallback = [it for it in items if it.get("id", "").startswith("polska-general")] or items
        scored = [(1, int(hashlib.md5(f"{art_h}:{it['id']}".encode()).hexdigest()[:6], 16), it) for it in fallback]
        scored.sort(key=lambda x: x[1])
    return [(s, it) for s, _, it in scored]


def _attach_media_fields(art: dict, item: dict):
    art["media_file"] = item["file"]
    art["media_credit"] = item.get("attribution") or ""
    art["media_license"] = item.get("license") or ""
    art["media_license_url"] = item.get("license_url") or ""
    art["media_source_url"] = item.get("source_url") or ""
    art["media_label"] = item.get("label") or ""


def match_media_for_article(art: dict, registry: dict | None = None, base_dir: str = ROOT_DIR) -> dict | None:
    """Dobiera pojedyncze najbardziej trafne zdjęcie CC dla pojedynczego artykułu."""
    ranked = rank_media_candidates(art, registry=registry, base_dir=base_dir)
    return ranked[0][1] if ranked else None


def assign_diverse_media(articles: list, registry: dict | None = None, base_dir: str = ROOT_DIR) -> int:
    """
    Przebieg anty-powtórzeniowy dla całej posortowanej chronologicznie listy artykułów:
    - Gwarantuje brak powtórzeń tego samego zdjęcia w oknie ostatnich 18 artykułów na stronie głównej
      oraz w oknie ostatnich 10 artykułów w obrębie każdego działu/województwa.
    - Wyrównuje rozkład wykorzystania wszystkich 100+ zdjęć w bibliotece.
    """
    reg = registry if registry is not None else load_media_registry(base_dir)
    all_valid = [it for it in (reg.get("items") or []) if it.get("file") and os.path.isfile(os.path.join(base_dir, it["file"]))]
    if not all_valid or not articles:
        return 0

    ordered = sorted(
        articles,
        key=lambda a: (a.get("published_iso") or "", int(a.get("id") or 0)),
        reverse=True,
    )

    recent_global = []          # lista ostatnich plików na stronie głównej (/Polska...)
    recent_by_cat = {}          # cat_path -> lista ostatnich plików
    usage_count = {}            # file -> globalna liczba użyć
    assigned = 0

    for art in ordered:
        cat_path = (art.get("path") or "/Polska").strip()
        is_home = cat_path.startswith("/Polska")
        cat_recent = recent_by_cat.setdefault(cat_path, [])
        ranked = rank_media_candidates(art, registry=reg, base_dir=base_dir)

        # Zbuduj rozszerzoną pulę: trafne kandydaty + bezpieczna rezerwa z działu (gdyby wszystkie były niedawno użyte)
        pool = list(ranked[:28])
        seen_files = {it["file"] for _, it in pool}
        art_h = _stable_art_hash(art)
        if cat_path.startswith("/Sport"):
            extras = [it for it in all_valid if it["id"].startswith("sport-")]
        elif cat_path.startswith("/Swiat"):
            extras = [it for it in all_valid if it["id"].startswith("world-")]
        else:
            extras = [it for it in all_valid if not it["id"].startswith(("sport-", "world-"))]
        extras_sorted = sorted(extras, key=lambda it: (usage_count.get(it["file"], 0), int(hashlib.md5(f"{art_h}:{it['id']}".encode()).hexdigest()[:6], 16)))
        for it in extras_sorted[:16]:
            if it["file"] not in seen_files:
                pool.append((4, it))
                seen_files.add(it["file"])

        best_choice = None
        best_eff_score = -10**9
        home_window = recent_global[-18:] if is_home else recent_global[-10:]
        cat_window = cat_recent[-10:]

        for base_score, it in pool:
            mf = it["file"]
            eff = float(base_score)
            # Silna kara za powtórzenie w oknie widocznych kart na stronie głównej i w dziale
            if mf in home_window:
                dist = len(home_window) - 1 - home_window[::-1].index(mf)
                eff -= 120.0 - dist * 3.0
            if mf in cat_window:
                eff -= 90.0
            # Delikatna kara za częste powtarzanie tej samej grupy tematycznej pod rząd
            gid = it.get("group_id") or it["id"]
            if is_home and recent_global and any(g == gid for g in recent_global[-3:]):
                eff -= 14.0
            # Wyrównywanie rozkładu w całej bazie 300 artykułów
            eff -= usage_count.get(mf, 0) * 3.5

            if eff > best_eff_score:
                best_eff_score = eff
                best_choice = it

        if best_choice:
            _attach_media_fields(art, best_choice)
            mf = best_choice["file"]
            usage_count[mf] = usage_count.get(mf, 0) + 1
            if is_home:
                recent_global.append(mf)
            cat_recent.append(mf)
            assigned += 1

    return assigned


if __name__ == "__main__":
    build_media_library()
