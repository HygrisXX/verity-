#!/usr/bin/env python3
"""
VERITY — Legalna biblioteka zdjęć ilustracyjnych z Wikimedia Commons (CC0 / PD / CC BY / CC BY-SA).

Zasady zgodności z prawem:
- Zero hotlinkowania do portali informacyjnych.
- Akceptowane wyłącznie wolne licencje dopuszczające także użytek komercyjny:
  CC0, Public Domain (PD), CC BY (2.0/3.0/4.0), CC BY-SA (2.0/3.0/4.0).
- Kategoryczne odrzucanie licencji z ograniczeniami (NC, ND, Fair use, Copyrighted).
- Każdy pobrany plik zapisywany jest lokalnie w `media/<id>.jpg` (800x450, bez EXIF),
  a pełne metadane (autor, licencja, link do licencji, URL źródłowy) trafiają do `media_registry.json`.

Uruchomienie:
    python3 media_library.py
"""

from __future__ import annotations

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
USER_AGENT = "VERITY-MediaLibrary/1.0 (https://github.com/HygrisXX/verity-; legal CC media archive)"

ALLOWED_LICENSE_RE = re.compile(
    r"^(?:cc0(?:\s+1\.0)?|public\s+domain|pd(?:-[a-z0-9-]+)?|cc[\s-]+by(?:[\s-]+sa)?[\s-]+[1-4]\.[0-9])$",
    re.IGNORECASE,
)
FORBIDDEN_LICENSE_RE = re.compile(r"(?:nc|nd|non-?commercial|no-?deriv|fair\s*use|copyright|gfdl-only)", re.IGNORECASE)
BAD_TITLE_RE = re.compile(
    r"(?:map|mapa|herb|coat\s+of\s+arms|flag|flaga|logo|diagram|chart|plan|scan|document|pdf|svg|icon|signature|seal|stamp|emblem|banner|poster|plakat)",
    re.IGNORECASE,
)

# Katalog tematyczny i regionalny (16 województw + tematy krajowe, gospodarcze, światowe i sportowe)
MEDIA_CATALOG = [
    # --- 16 województw (stolice) ---
    {"id": "reg-mazowieckie", "queries": ["Warsaw skyline sunset", "Warszawa panorama centrum"], "paths": ["/Polska/Regiony/Mazowieckie"], "keywords": ["warszaw", "mazowieck", "radom", "płock"], "label": "Warszawa, woj. mazowieckie"},
    {"id": "reg-malopolskie", "queries": ["Krakow Main Square Wawel", "Kraków Rynek Główny"], "paths": ["/Polska/Regiony/Malopolskie"], "keywords": ["krakow", "kraków", "małopolsk", "zakopan", "tarnów"], "label": "Kraków, woj. małopolskie"},
    {"id": "reg-dolnoslaskie", "queries": ["Wroclaw Market Square Rynek", "Wrocław Ostrów Tumski"], "paths": ["/Polska/Regiony/Dolnoslaskie"], "keywords": ["wrocław", "wroclaw", "dolnośląsk", "wałbrzych", "legnic", "lubin"], "label": "Wrocław, woj. dolnośląskie"},
    {"id": "reg-wielkopolskie", "queries": ["Poznan Stary Rynek town hall", "Poznań panorama"], "paths": ["/Polska/Regiony/Wielkopolskie"], "keywords": ["poznań", "poznan", "wielkopolsk", "kalisz", "konin", "leszn"], "label": "Poznań, woj. wielkopolskie"},
    {"id": "reg-pomorskie", "queries": ["Gdansk Motlawa crane", "Gdańsk Długi Targ"], "paths": ["/Polska/Regiony/Pomorskie"], "keywords": ["gdańsk", "gdansk", "gdyni", "sopot", "pomorsk", "słupsk"], "label": "Gdańsk, woj. pomorskie"},
    {"id": "reg-lodzkie", "queries": ["Lodz Piotrkowska street", "Łódź Manufaktura"], "paths": ["/Polska/Regiony/Lodzkie"], "keywords": ["łódź", "łodzi", "lodz", "łódzk", "piotrków", "zgierz"], "label": "Łódź, woj. łódzkie"},
    {"id": "reg-slaskie", "queries": ["Katowice Spodek skyline", "Katowice panorama"], "paths": ["/Polska/Regiony/Slaskie"], "keywords": ["katowic", "śląsk", "slask", "gliwic", "sosnow", "bielsko", "częstochow", "zabrze", "bytom"], "label": "Katowice, woj. śląskie"},
    {"id": "reg-zachodniopomorskie", "queries": ["Szczecin Waly Chrobrego", "Szczecin panorama Odra"], "paths": ["/Polska/Regiony/Zachodniopomorskie"], "keywords": ["szczecin", "zachodniopomorsk", "koszalin", "świnoujści", "kołobrzeg"], "label": "Szczecin, woj. zachodniopomorskie"},
    {"id": "reg-lubelskie", "queries": ["Lublin Old Town Castle", "Lublin Stare Miasto"], "paths": ["/Polska/Regiony/Lubelskie"], "keywords": ["lublin", "lubelsk", "zamość", "chełm", "biała podlaska"], "label": "Lublin, woj. lubelskie"},
    {"id": "reg-podlaskie", "queries": ["Bialystok Branicki Palace", "Białystok Rynek Kościuszki"], "paths": ["/Polska/Regiony/Podlaskie"], "keywords": ["białystok", "białegostok", "podlask", "suwałk", "łomż"], "label": "Białystok, woj. podlaskie"},
    {"id": "reg-podkarpackie", "queries": ["Rzeszow Rynek town hall", "Rzeszów centrum"], "paths": ["/Polska/Regiony/Podkarpackie"], "keywords": ["rzeszów", "rzeszow", "podkarpack", "przemyśl", "mielec", "krosn", "bieszczad"], "label": "Rzeszów, woj. podkarpackie"},
    {"id": "reg-swietokrzyskie", "queries": ["Kielce Palace of the Krakow Bishops", "Kielce centrum"], "paths": ["/Polska/Regiony/Swietokrzyskie"], "keywords": ["kielc", "świętokrzysk", "sandomierz", "ostrowiec"], "label": "Kielce, woj. świętokrzyskie"},
    {"id": "reg-warminsko-mazurskie", "queries": ["Olsztyn Old Town", "Mazury lake Poland"], "paths": ["/Polska/Regiony/Warminsko-Mazurskie"], "keywords": ["olsztyn", "warmińsk", "mazur", "elbląg", "ełk"], "label": "Olsztyn, woj. warmińsko-mazurskie"},
    {"id": "reg-opolskie", "queries": ["Opole Rynek town hall", "Opole Odra"], "paths": ["/Polska/Regiony/Opolskie"], "keywords": ["opole", "opola", "opolsk", "nysa", "kędzierzyn"], "label": "Opole, woj. opolskie"},
    {"id": "reg-kujawsko-pomorskie", "queries": ["Torun Old Town Vistula", "Bydgoszcz Wyspa Młyńska"], "paths": ["/Polska/Regiony/Kujawsko-Pomorskie"], "keywords": ["toruń", "torun", "bydgoszcz", "kujawsko", "inowrocław", "włocławek"], "label": "Toruń, woj. kujawsko-pomorskie"},
    {"id": "reg-lubuskie", "queries": ["Zielona Gora Old Town", "Gorzow Wielkopolski"], "paths": ["/Polska/Regiony/Lubuskie"], "keywords": ["zielon", "gorzów", "gorzow", "lubusk"], "label": "Zielona Góra, woj. lubuskie"},

    # --- Tematy ogólne (wysoki priorytet dopasowania po słowach kluczowych) ---
    {"id": "topic-fire", "queries": ["fire engine truck emergency", "firefighters rescue fire"], "paths": [], "keywords": ["pożar", "pozar", "strażak", "strazak", "zastęp", "płomien", "dym", "gaśnic"], "label": "Straż pożarna (zdjęcie ilustracyjne)"},
    {"id": "topic-police", "queries": ["Policja Poland car", "police car emergency lights"], "paths": [], "keywords": ["policj", "zatrzyman", "cbśp", "obława", "napad", "kradzież", "oszuka", "przestęp"], "label": "Policja (zdjęcie ilustracyjne)"},
    {"id": "topic-traffic", "queries": ["Autostrada A2 Poland", "highway traffic motorway Europe"], "paths": [], "keywords": ["wypadek", "karambol", "zderzen", "kierowc", "autostrad", "ekspresow", "drogow", "korek", "potrącen", "parkowan"], "label": "Ruch drogowy (zdjęcie ilustracyjne)"},
    {"id": "topic-rail", "queries": ["PKP Intercity train Poland", "Pendolino Poland railway"], "paths": [], "keywords": ["pociąg", "pociag", "pkp", "kolej", "torach", "maszynist", "dworzec", "tramwaj"], "label": "Transport kolejowy (zdjęcie ilustracyjne)"},
    {"id": "topic-hospital", "queries": ["ambulance rescue Poland pogotowie", "hospital building Poland szpital"], "paths": [], "keywords": ["szpital", "karetk", "lekarz", "zdrowi", "szczep", "nfz", "pacjent", "lpr", "śmigłowiec", "chorob"], "label": "Ochrona zdrowia (zdjęcie ilustracyjne)"},
    {"id": "topic-court", "queries": ["Supreme Court Warsaw Poland Sad Najwyzszy", "courthouse justice scales"], "paths": [], "keywords": ["sąd", "sadu", "prokuratur", "wyrok", "oskarż", "areszt", "więzien", "prawn", "trybunał"], "label": "Wymiar sprawiedliwości (zdjęcie ilustracyjne)"},
    {"id": "topic-sejm", "queries": ["Sejm building Warsaw Poland", "Sejm RP sala plenarna"], "paths": ["/Polska/Polityka"], "keywords": ["sejm", "senat", "rząd", "premier", "minister", "posł", "ustaw", "prezydent", "wybor", "partia", "koalicj"], "label": "Sejm RP, Warszawa"},
    {"id": "topic-military", "queries": ["Polish Army soldier tank", "F-16 Polish Air Force"], "paths": [], "keywords": ["wojsk", "armia", "nato", "pentagon", "obronn", "pocisk", "dron", "żołnierz", "granic", "alerty"], "label": "Obronność i bezpieczeństwo (zdjęcie ilustracyjne)"},
    {"id": "topic-finance", "queries": ["Warsaw Spire Rondo Daszynskiego skyscrapers", "National Bank of Poland NBP Warsaw building"], "paths": ["/Polska/Gospodarka"], "keywords": ["giełd", "gpw", "akcj", "nbp", "inflacj", "zysk", "kredyt", "podat", "budżet", "skarbówk", "walut", "frank", "euro", "dolar", "bankow", "banku"], "label": "Finanse i rynek kapitałowy (zdjęcie ilustracyjne)"},
    {"id": "topic-retail", "queries": ["shopping mall supermarket Poland", "parcel locker InPost Paczkomat"], "paths": [], "keywords": ["sklep", "black friday", "paczki", "przesyłk", "zakup", "handl", "biedronk", "żabk", "allegro", "cen"], "label": "Handel i konsumenci (zdjęcie ilustracyjne)"},
    {"id": "topic-energy", "queries": ["wind turbines Poland energy", "power plant electricity grid"], "paths": ["/Polska/Energetyka"], "keywords": ["energ", "prąd", "prad", "taryf", "ure", "pge", "orlen", "paliw", "benzyn", "węgiel", "wegiel", "gaz", "atom", "elektrown", "fotowoltaik"], "label": "Energetyka (zdjęcie ilustracyjne)"},
    {"id": "topic-tech", "queries": ["smartphone circuit board technology", "data center server room"], "paths": [], "keywords": ["ai", "sztuczn", "smartfon", "samsung", "apple", "google", "cyber", "aplikacj", "internet", "technolog", "bateri", "startup"], "label": "Technologia (zdjęcie ilustracyjne)"},
    {"id": "topic-weather-winter", "queries": ["snow winter road Poland", "winter city snow street"], "paths": [], "keywords": ["śnieg", "snieg", "zima", "mróz", "mroz", "gołoledź", "imgw", "pogod", "wichur", "powódź", "odra"], "label": "Pogoda i klimat (zdjęcie ilustracyjne)"},
    {"id": "topic-education", "queries": ["University of Warsaw building", "school classroom books"], "paths": [], "keywords": ["szkoł", "liceum", "uczni", "student", "uniwersytet", "uczelni", "nauczyciel", "matur"], "label": "Edukacja (zdjęcie ilustracyjne)"},
    {"id": "topic-culture", "queries": ["National Museum Warsaw Poland", "theater concert hall stage"], "paths": [], "keywords": ["kultur", "muzeum", "teatr", "film", "galeria", "wystaw", "książk", "literac", "koncert", "sztuk", "zabytek"], "label": "Kultura i sztuka (zdjęcie ilustracyjne)"},
    {"id": "topic-housing", "queries": ["modern apartment buildings Warsaw", "construction crane building"], "paths": [], "keywords": ["mieszkan", "nieruchomoś", "deweloper", "budow", "najem", "hipote"], "label": "Nieruchomości i budownictwo (zdjęcie ilustracyjne)"},

    # --- Świat ---
    {"id": "world-eu", "queries": ["European Parliament Brussels building", "Berlaymont Brussels EU flags"], "paths": ["/Swiat"], "keywords": ["unia europejsk", "bruksel", "komisja europejsk", "parlament europejsk", "ue"], "label": "Instytucje UE, Bruksela"},
    {"id": "world-usa", "queries": ["United States Capitol Washington DC", "White House Washington"], "paths": [], "keywords": ["usa", "ameryk", "waszyngton", "trump", "biały dom", "kongres"], "label": "Waszyngton, USA"},
    {"id": "world-ukraine", "queries": ["Kyiv Independence Square Ukraine", "Kyiv skyline"], "paths": [], "keywords": ["ukrain", "kijów", "kijow", "zełensk", "rosj", "kreml", "moskw"], "label": "Europa Wschodnia (zdjęcie ilustracyjne)"},
    {"id": "world-germany", "queries": ["Brandenburg Gate Berlin", "Reichstag building Berlin"], "paths": [], "keywords": ["niemc", "niemieck", "berlin", "bundestag"], "label": "Berlin, Niemcy"},
    {"id": "world-norway", "queries": ["Oslo Opera House fjord", "Oslo skyline"], "paths": [], "keywords": ["norweg", "oslo", "skandynaw", "szwecj", "finland"], "label": "Oslo, Norwegia"},
    {"id": "world-global", "queries": ["United Nations Headquarters New York", "Earth globe night space"], "paths": ["/Swiat"], "keywords": ["świat", "dyplomacj", "szczyt", "onz", "chiny", "izrael", "bliski wschód", "iran"], "label": "Wydarzenia międzynarodowe"},

    # --- Sport ---
    {"id": "sport-football", "queries": ["National Stadium Warsaw football pitch", "football stadium match night"], "paths": ["/Sport"], "keywords": ["piłk", "ekstraklas", "liga mistrzów", "reprezentacj", "gol", "bramk", "stadion", "trener", "transfer", "lewandowsk"], "label": "Piłka nożna (zdjęcie ilustracyjne)"},
    {"id": "sport-volleyball", "queries": ["volleyball match indoor arena", "volleyball net court"], "paths": [], "keywords": ["siatkówk", "siatkar", "plusliga", "fivb", "liga narodów"], "label": "Siatkówka (zdjęcie ilustracyjne)"},
    {"id": "sport-basketball", "queries": ["basketball arena court game", "basketball hoop arena"], "paths": [], "keywords": ["koszykówk", "nba", "kwarta", "trefl", "śląsk wrocław"], "label": "Koszykówka (zdjęcie ilustracyjne)"},
    {"id": "sport-tennis", "queries": ["tennis court match stadium", "tennis racket clay court"], "paths": [], "keywords": ["tenis", "wta", "atp", "świątek", "hurkacz", "turniej"], "label": "Tenis (zdjęcie ilustracyjne)"},
    {"id": "sport-winter", "queries": ["ski jumping Zakopane Wielka Krokiew", "ski jumping hill winter"], "paths": [], "keywords": ["skok", "narciar", "puchar świata", "biathlon", "hokej"], "label": "Sporty zimowe (zdjęcie ilustracyjne)"},

    # --- Domyślny fallback dla /Polska ---
    {"id": "polska-general", "queries": ["Poland Warsaw Royal Castle skyline", "Warsaw Vistula bridges"], "paths": ["/Polska"], "keywords": ["polsk"], "label": "Polska (zdjęcie ilustracyjne)"},
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


def _search_wikimedia_photo(query: str, timeout: int = 10) -> dict | None:
    url = (
        "https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6"
        f"&gsrlimit=8&gsrsearch={urllib.parse.quote(query)}"
        "&prop=imageinfo&iiprop=url|extmetadata|size|mime&iiurlwidth=960&format=json"
    )
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    pages = list(((data.get("query") or {}).get("pages") or {}).values())
    pages.sort(key=lambda p: p.get("index", 999))

    for p in pages:
        title = p.get("title") or ""
        if BAD_TITLE_RE.search(title):
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
        return {
            "wikimedia_title": title,
            "download_url": dl_url,
            "source_url": desc_url,
            "author": artist,
            "license": lic_short,
            "license_url": lic_url,
        }
    return None


def _download_and_optimize_jpeg(url: str, out_path: str, width: int = 800, height: int = 450) -> bool:
    from PIL import Image, ImageOps

    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=15) as resp:
        raw = resp.read()
    img = Image.open(io.BytesIO(raw))
    img = ImageOps.exif_transpose(img).convert("RGB")
    fitted = ImageOps.fit(img, (width, height), method=Image.Resampling.LANCZOS, centering=(0.5, 0.45))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    # Zapis bez EXIF / metadanych osobowych
    fitted.save(out_path, format="JPEG", quality=82, optimize=True, progressive=True)
    return True


def build_media_library(force: bool = False) -> dict:
    """Pobiera i buduje lokalny katalog wolnych zdjęć CC + media_registry.json."""
    os.makedirs(MEDIA_DIR, exist_ok=True)
    existing = {}
    if os.path.isfile(REGISTRY_FILE) and not force:
        try:
            with open(REGISTRY_FILE, "r", encoding="utf-8") as f:
                prev = json.load(f)
            for item in prev.get("items") or []:
                if item.get("id") and os.path.isfile(os.path.join(ROOT_DIR, item.get("file", ""))):
                    existing[item["id"]] = item
        except (OSError, ValueError):
            pass

    items_out = []
    downloaded = 0
    for spec in MEDIA_CATALOG:
        mid = spec["id"]
        rel_file = f"media/{mid}.jpg"
        abs_file = os.path.join(ROOT_DIR, rel_file)
        if mid in existing and os.path.isfile(abs_file) and not force:
            entry = dict(existing[mid])
            entry["paths"] = spec["paths"]
            entry["keywords"] = spec["keywords"]
            entry["label"] = spec["label"]
            items_out.append(entry)
            continue

        found = None
        for q in spec["queries"]:
            try:
                found = _search_wikimedia_photo(q)
                if found:
                    break
            except Exception:
                continue
            time.sleep(0.15)

        if not found:
            print(f"[MEDIA] Brak dopasowania dla {mid}")
            continue

        try:
            _download_and_optimize_jpeg(found["download_url"], abs_file)
            downloaded += 1
            attribution = f"Fot. ilustracyjne: {found['author']} ({found['license']}, Wikimedia Commons)"
            items_out.append({
                "id": mid,
                "file": rel_file,
                "label": spec["label"],
                "paths": spec["paths"],
                "keywords": spec["keywords"],
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
            time.sleep(0.25)
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


def match_media_for_article(art: dict, registry: dict | None = None, base_dir: str = ROOT_DIR) -> dict | None:
    """
    Deterministycznie dobiera najbardziej trafne, legalne zdjęcie z `media_registry.json`
    na podstawie słów kluczowych w tytule/leadzie oraz działu/województwa.
    """
    reg = registry if registry is not None else load_media_registry(base_dir)
    items = [it for it in (reg.get("items") or []) if it.get("file") and os.path.isfile(os.path.join(base_dir, it["file"]))]
    if not items:
        return None

    title = (art.get("seo_title") or "").lower()
    lead = (art.get("summary_lead") or "").lower()
    cat_path = (art.get("path") or "/Polska").strip()
    haystack = f"{title} {title} {lead}"

    best_item = None
    best_score = -1

    for it in items:
        mid = it.get("id", "")
        score = 0
        # 1. Dopasowanie tematyczne słów kluczowych (szczególnie w tytule)
        kw_hits = 0
        for kw in it.get("keywords") or []:
            k = kw.lower()
            if k in title:
                kw_hits += 3
            elif k in lead:
                kw_hits += 1
        if mid.startswith(("topic-", "sport-", "world-")) and kw_hits > 0:
            score += 20 + kw_hits * 4
        elif mid.startswith("reg-") and kw_hits > 0:
            score += 10 + kw_hits * 2

        # 2. Dopasowanie dokładne po dziale / województwie
        it_paths = it.get("paths") or []
        if cat_path in it_paths:
            score += 18
        elif any(cat_path.startswith(p + "/") for p in it_paths if p != "/Polska"):
            score += 8

        # 3. Nie mieszaj tematów sportowych do niesportowych i odwrotnie
        if mid.startswith("sport-") and cat_path != "/Sport" and kw_hits < 3:
            score = 0
        if mid.startswith("world-") and cat_path != "/Swiat" and kw_hits < 3:
            score = 0

        if score > best_score:
            best_score = score
            best_item = it

    if best_item and best_score >= 10:
        return best_item

    # Fallback: polska-general lub deterministyczny wybór z dostępnych
    for it in items:
        if it.get("id") == "polska-general":
            return it
    h = int(hashlib.md5((art.get("seo_url") or str(art.get("id") or "")).encode("utf-8")).hexdigest()[:8], 16)
    return items[h % len(items)]


if __name__ == "__main__":
    build_media_library()
