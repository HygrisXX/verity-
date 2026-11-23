#!/usr/bin/env python3
"""
VERITY - Generator warstw SEO, stron statycznych HTTP 200, map witryny i RSS.
Wywoływany automatycznie po każdej aktualizacji bazy przez update_live_news.py.
"""

import hashlib
import html
import json
import os
import re
import shutil
import struct
import urllib.error
import urllib.request
import xml.sax.saxutils
import zlib
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime
from urllib.parse import urlparse

VERITY_INDEXNOW_DEFAULT_KEY = "a7f3c91e4b2d8065e19a4f7c3d28b50e"


def get_indexnow_key() -> str:
    env_k = (os.environ.get("VERITY_INDEXNOW_KEY") or "").strip()
    if re.fullmatch(r"[A-Za-z0-9-]{8,128}", env_k):
        return env_k
    return VERITY_INDEXNOW_DEFAULT_KEY


VOIVODESHIPS = [
    (
        "/Polska/Regiony/Dolnoslaskie",
        "Dolnośląskie",
        "Dolny Śląsk (dolnośląskie)",
        "Wiadomości z całego Dolnego Śląska: Wrocław, Wałbrzych, Legnica, Jelenia Góra, Lubin, Głogów, Zgorzelec i powiaty regionu.",
        ["Gazeta Wrocławska", "Radio Wrocław", "TVP3 Wrocław", "Wroclaw.pl", "Świdnica24.pl"],
        ["/Polska/Wroclaw"],
    ),
    (
        "/Polska/Regiony/Kujawsko-Pomorskie",
        "Kujawsko-Pomorskie",
        "Kujawsko-pomorskie",
        "Informacje z województwa kujawsko-pomorskiego: Bydgoszcz, Toruń, Włocławek, Grudziądz, Inowrocław i okolice.",
        ["Radio PiK", "Gazeta Pomorska", "TVP3 Bydgoszcz", "TylkoTorun.pl"],
        ["/Polska/Bydgoszcz"],
    ),
    (
        "/Polska/Regiony/Lubelskie",
        "Lubelskie",
        "Lubelskie",
        "Wydarzenia z całej Lubelszczyzny: Lublin, Zamość, Chełm, Biała Podlaska, Puławy, Tomaszów Lubelski i powiaty regionu.",
        ["Radio Lublin", "Kurier Lubelski", "Lublin112.pl", "TVP3 Lublin", "Radio Impuls"],
        ["/Polska/Lublin"],
    ),
    (
        "/Polska/Regiony/Lubuskie",
        "Lubuskie",
        "Lubuskie",
        "Wiadomości z województwa lubuskiego: Zielona Góra, Gorzów Wielkopolski, Nowa Sól, Żary, Świebodzin i cały region.",
        ["Radio Zachód", "Gazeta Lubuska", "TVP3 Gorzów", "Gorzowianin.com", "NewsLubuski.pl", "Radio Index", "Pościgi.pl"],
        ["/Polska/Lubuskie"],
    ),
    (
        "/Polska/Regiony/Lodzkie",
        "Łódzkie",
        "Łódzkie",
        "Informacje z całego województwa łódzkiego: Łódź, Piotrków Trybunalski, Tomaszów Mazowiecki, Bełchatów, Pabianice, Zgierz.",
        ["Radio Łódź", "Dziennik Łódzki", "TVP3 Łódź", "Radio ZW"],
        ["/Polska/Lodz"],
    ),
    (
        "/Polska/Regiony/Malopolskie",
        "Małopolskie",
        "Małopolska (małopolskie)",
        "Wydarzenia z całej Małopolski: Kraków, Tarnów, Nowy Sącz, Zakopane, Podhale, Oświęcim i powiaty województwa.",
        ["Radio Kraków", "Gazeta Krakowska", "TVP3 Kraków", "Podhale24.pl", "Bochnianin.pl"],
        ["/Polska/Krakow"],
    ),
    (
        "/Polska/Regiony/Mazowieckie",
        "Mazowieckie",
        "Mazowsze (mazowieckie)",
        "Informacje z Warszawy i całego Mazowsza: Radom, Płock, Siedlce, Ostrołęka, Ciechanów, Pruszków i powiaty regionu.",
        ["Warszawa w Pigułce", "TVP3 Warszawa", "Radio Kolor", "PetroNews.pl", "CoZaDzień.pl"],
        ["/Polska/Warszawa"],
    ),
    (
        "/Polska/Regiony/Opolskie",
        "Opolskie",
        "Opolskie",
        "Wiadomości z całej Opolszczyzny: Opole, Kędzierzyn-Koźle, Nysa, Brzeg, Kluczbork i powiaty województwa.",
        ["Nowa Trybuna Opolska", "TVP3 Opole", "Opolska360.pl", "CzasNaOpole.pl"],
        ["/Polska/Opole"],
    ),
    (
        "/Polska/Regiony/Podkarpackie",
        "Podkarpackie",
        "Podkarpacie (podkarpackie)",
        "Informacje z całego Podkarpacia: Rzeszów, Przemyśl, Stalowa Wola, Mielec, Krosno, Bieszczady i powiaty regionu.",
        ["Radio Rzeszów", "Nowiny24", "TVP3 Rzeszów", "Rzeszow-News.pl"],
        ["/Polska/Rzeszow"],
    ),
    (
        "/Polska/Regiony/Podlaskie",
        "Podlaskie",
        "Podlasie (podlaskie)",
        "Wydarzenia z całego Podlasia: Białystok, Łomża, Suwałki, Augustów, Bielsk Podlaski i powiaty regionu.",
        ["Kurier Poranny", "Radio Białystok", "TVP3 Białystok", "Suwałki24.pl", "4Lomza.pl"],
        ["/Polska/Bialystok"],
    ),
    (
        "/Polska/Regiony/Pomorskie",
        "Pomorskie",
        "Pomorze (pomorskie)",
        "Wiadomości z całego Pomorza: Gdańsk, Gdynia, Sopot, Trójmiasto, Słupsk, Tczew, Kaszuby i powiaty województwa.",
        ["Radio Gdańsk", "Dziennik Bałtycki", "TVP3 Gdańsk", "GP24.pl", "Kaszuby24.pl"],
        ["/Polska/Gdansk"],
    ),
    (
        "/Polska/Regiony/Slaskie",
        "Śląskie",
        "Śląsk (śląskie)",
        "Informacje z całego województwa śląskiego: Katowice, Częstochowa, Sosnowiec, Gliwice, Bielsko-Biała, Rybnik, Tychy.",
        ["TVS Śląsk", "Dziennik Zachodni", "TVP3 Katowice", "Radio 90", "Radio Piekary", "Bielsko.biala.pl", "Beskidzka24.pl"],
        ["/Polska/Katowice"],
    ),
    (
        "/Polska/Regiony/Swietokrzyskie",
        "Świętokrzyskie",
        "Świętokrzyskie",
        "Wiadomości z całego województwa świętokrzyskiego: Kielce, Ostrowiec Świętokrzyski, Starachowice, Sandomierz i powiaty regionu.",
        ["Radio Kielce", "Echo Dnia Kielce", "TVP3 Kielce", "Radio Ostrowiec"],
        ["/Polska/Kielce"],
    ),
    (
        "/Polska/Regiony/Warminsko-Mazurskie",
        "Warmińsko-Mazurskie",
        "Warmia i Mazury",
        "Informacje z Warmii i Mazur: Olsztyn, Elbląg, Ełk, Mrągowo, Iława, Ostróda, Giżycko i całe województwo.",
        ["Radio Olsztyn", "TVP3 Olsztyn", "TKO Olsztyn", "PortEl.pl", "info.elblag.pl"],
        ["/Polska/Olsztyn"],
    ),
    (
        "/Polska/Regiony/Wielkopolskie",
        "Wielkopolskie",
        "Wielkopolska (wielkopolskie)",
        "Wiadomości z całej Wielkopolski: Poznań, Kalisz, Konin, Piła, Leszno, Gniezno, Ostrów Wielkopolski i powiaty regionu.",
        ["ePoznan.pl", "Głos Wielkopolski", "Radio Poznań", "TVP3 Poznań", "Asta24.pl", "rc.fm"],
        ["/Polska/Poznan"],
    ),
    (
        "/Polska/Regiony/Zachodniopomorskie",
        "Zachodniopomorskie",
        "Pomorze Zachodnie",
        "Informacje z Pomorza Zachodniego: Szczecin, Koszalin, Stargard, Kołobrzeg, Świnoujście i całe województwo.",
        ["Głos Szczeciński", "Radio Szczecin", "TVP3 Szczecin", "GK24.pl"],
        ["/Polska/Szczecin"],
    ),
]

VOIVODESHIP_BY_PATH = {v[0]: v for v in VOIVODESHIPS}
VOIVODESHIP_LABELS = {v[0]: v[1] for v in VOIVODESHIPS}
LEGACY_REGION_MAP = {old_p: v[0] for v in VOIVODESHIPS for old_p in v[5]}

CATEGORIES = [
    ("/Polska", "Polska — wszystkie działy", "Najważniejsze potwierdzone informacje z Polski — weryfikacja krzyżowa z 151 redakcji."),
    ("/Polska/Gospodarka", "Gospodarka i rynek", "Zweryfikowane informacje o gospodarce, finansach, podatkach, giełdzie i biznesie w Polsce."),
    ("/Polska/Polityka", "Polityka i prawo", "Fakty i decyzje legislacyjne z wielu źródeł, bez komentarzy publicystycznych."),
    ("/Polska/Energetyka", "Energetyka i klimat", "Ceny energii, transformacja energetyczna, OZE, gaz i rynek paliw w Polsce."),
    ("/Polska/Regiony", "Regiony Polski (16 województw)", "Najważniejsze wiadomości lokalne i regionalne ze wszystkich 16 województw Polski — nie tylko ze stolic regionów."),
    *[(v[0], v[2], v[3]) for v in VOIVODESHIPS],
    ("/Swiat", "Świat i geopolityka", "Potwierdzone depesze ze świata, bezpieczeństwo międzynarodowe, technologie i cyberbezpieczeństwo."),
    ("/Sport", "Sport", "Wyniki, rozgrywki reprezentacji i najważniejsze wydarzenia sportowe w faktograficznym skrócie."),
]

KNOWN_HUES = {
    "gospodarka": 150,
    "polityka": 215,
    "energetyka": 38,
    "regiony": 175,
    "dolnoslaskie": 330,
    "kujawsko-pomorskie": 195,
    "lubelskie": 105,
    "lubuskie": 132,
    "lodzkie": 25,
    "malopolskie": 12,
    "mazowieckie": 225,
    "opolskie": 48,
    "podkarpackie": 162,
    "podlaskie": 145,
    "pomorskie": 200,
    "slaskie": 245,
    "swietokrzyskie": 310,
    "warminsko-mazurskie": 140,
    "wielkopolskie": 350,
    "zachodniopomorskie": 188,
    "poznan": 350,
    "swiat": 265,
    "sport": 15,
    "prawo": 190,
}


def detect_site_base_url(base_dir: str) -> str:
    cname_path = os.path.join(base_dir, "CNAME")
    if os.path.exists(cname_path):
        try:
            with open(cname_path, "r", encoding="utf-8") as f:
                domain = f.read().strip().splitlines()[0].strip()
                if domain:
                    return f"https://{domain}".rstrip("/")
        except Exception:
            pass
    env_url = (os.environ.get("VERITY_SITE_URL") or "").strip().rstrip("/")
    if env_url:
        return env_url
    return "https://hygrisxx.github.io/verity-"


def _norm_pl(text: str) -> str:
    trans = str.maketrans("ąćęłńóśźż", "acelnoszz")
    return (text or "").lower().translate(trans)


def path_hue(path: str) -> int:
    parts = [p for p in (path or "").split("/") if p]
    last = _norm_pl(parts[-1] if parts else "")
    if last in KNOWN_HUES:
        return KNOWN_HUES[last]
    h = 0
    for ch in last:
        h = (h * 31 + ord(ch)) % 360
    return h


def _hsl_to_rgb(hue_deg: int, sat: float = 0.68, light: float = 0.50) -> tuple:
    import colorsys
    r, g, b = colorsys.hls_to_rgb((hue_deg % 360) / 360.0, light, sat)
    return (int(round(r * 255)), int(round(g * 255)), int(round(b * 255)))


def _png_chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def _write_fallback_og_png(out_path: str, width: int, height: int, accent_rgb: tuple):
    bg_row = b"\x00" + (b"\x15\x1b\x28" * width)
    acc_bytes = bytes(accent_rgb)
    acc_row = b"\x00" + (acc_bytes * width)
    card_row = b"\x00" + (b"\x1e\x26\x38" * width)
    rows = []
    for y in range(height):
        if y < 14 or y >= height - 10:
            rows.append(acc_row)
        elif 96 <= y <= height - 96:
            rows.append(card_row)
        else:
            rows.append(bg_row)
    raw = b"".join(rows)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    png_bytes = b"\x89PNG\r\n\x1a\n" + _png_chunk(b"IHDR", ihdr) + _png_chunk(b"IDAT", zlib.compress(raw, 6)) + _png_chunk(b"IEND", b"")
    with open(out_path, "wb") as f:
        f.write(png_bytes)


def _load_og_font(candidates: tuple, size: int):
    from PIL import ImageFont
    for fp in candidates:
        if os.path.isfile(fp):
            try:
                return ImageFont.truetype(fp, size)
            except Exception:
                pass
    return ImageFont.load_default()


def generate_og_card_png(art: dict, out_path: str) -> bool:
    """
    Generuje automatyczną kartę graficzną OpenGraph 1200x630 PNG z tytułem, działem,
    liczbą źródeł i paskiem zgodności (dla artykułów bez zdjęcia z RSS).
    """
    width, height = 1200, 630
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    hue = path_hue(art.get("path") or "/Polska")
    accent_rgb = _hsl_to_rgb(hue, sat=0.72, light=0.54)

    try:
        from PIL import Image, ImageDraw
    except Exception:
        _write_fallback_og_png(out_path, width, height, accent_rgb)
        return True

    bg_col = (21, 27, 40)
    panel_col = (30, 38, 56)
    border_col = (52, 65, 92)
    text_main = (245, 247, 250)
    text_muted = (176, 188, 208)

    img = Image.new("RGB", (width, height), bg_col)
    draw = ImageDraw.Draw(img)

    # Pasek kategorii u góry oraz ramka redakcyjna
    draw.rectangle([0, 0, width, 12], fill=accent_rgb)
    draw.rounded_rectangle([48, 44, width - 48, height - 44], radius=22, fill=panel_col, outline=border_col, width=2)

    serif_paths = (
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    )
    sans_bold_paths = (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    )
    sans_paths = (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    )

    f_logo = _load_og_font(sans_bold_paths, 28)
    f_badge = _load_og_font(sans_bold_paths, 22)
    f_title = _load_og_font(serif_paths, 46)
    f_meta = _load_og_font(sans_bold_paths, 23)
    f_small = _load_og_font(sans_paths, 21)

    # Nagłówek: V VERITY + Kategoria + Data
    draw.rounded_rectangle([84, 78, 134, 128], radius=10, fill=accent_rgb)
    draw.text((99, 86), "V", font=f_logo, fill=(255, 255, 255))
    draw.text((152, 87), "VERITY", font=f_logo, fill=text_main)

    cat_txt = short_cat_label(art.get("path") or "/Polska").upper()
    cat_bbox = draw.textbbox((0, 0), cat_txt, font=f_badge)
    cat_w = (cat_bbox[2] - cat_bbox[0]) + 32
    draw.rounded_rectangle([296, 82, 296 + cat_w, 124], radius=12, fill=accent_rgb)
    draw.text((312, 90), cat_txt, font=f_badge, fill=(255, 255, 255))

    date_txt = (art.get("display_date") or "")[:28]
    if date_txt:
        d_bbox = draw.textbbox((0, 0), date_txt, font=f_small)
        d_w = d_bbox[2] - d_bbox[0]
        draw.text((width - 84 - d_w, 92), date_txt, font=f_small, fill=text_muted)

    # Zawijanie tytułu do maks. 4 wierszy
    raw_title = strip_citations(art.get("seo_title") or "VERITY — Weryfikacja faktów")
    max_title_w = width - 168
    words = raw_title.split()
    lines = []
    cur = ""
    for w in words:
        cand = f"{cur} {w}".strip()
        cb = draw.textbbox((0, 0), cand, font=f_title)
        if cb[2] - cb[0] <= max_title_w:
            cur = cand
        else:
            if cur:
                lines.append(cur)
            cur = w
        if len(lines) == 4:
            cur = ""
            break
    if cur and len(lines) < 4:
        lines.append(cur)
    if len(lines) == 4 and len(" ".join(lines).split()) < len(words):
        lines[-1] = lines[-1].rstrip(".,;:- ") + "…"

    y_cursor = 178
    for ln in lines:
        draw.text((84, y_cursor), ln, font=f_title, fill=text_main)
        y_cursor += 64

    # Dolna belka z liczbą źródeł i paskiem zgodności
    draw.line([84, height - 154, width - 84, height - 154], fill=border_col, width=2)
    srcs = art.get("sources") or []
    pct = art.get("fact_agreement_pct")
    src_txt = f"Źródła: {sources_label(len(srcs))}" if srcs else "Synteza faktograficzna"
    draw.text((84, height - 124), src_txt, font=f_meta, fill=text_main)

    if len(srcs) >= 2 and pct is not None:
        pct_i = max(0, min(100, int(pct)))
        meter_col = (34, 197, 94) if pct_i >= 85 else ((245, 158, 11) if pct_i >= 70 else (239, 68, 68))
        bar_x0, bar_y0, bar_w, bar_h = 370, height - 116, 260, 14
        draw.rounded_rectangle([bar_x0, bar_y0, bar_x0 + bar_w, bar_y0 + bar_h], radius=7, fill=(52, 65, 92))
        fill_w = max(14, int(bar_w * (pct_i / 100.0)))
        draw.rounded_rectangle([bar_x0, bar_y0, bar_x0 + fill_w, bar_y0 + bar_h], radius=7, fill=meter_col)
        draw.text((bar_x0 + bar_w + 18, height - 124), f"{pct_i}% zgodności faktów", font=f_meta, fill=meter_col)
    else:
        draw.text((370, height - 124), "Bez clickbaitu i opinii", font=f_small, fill=text_muted)

    foot_right = "Zero-Trust · Weryfikacja faktów"
    fr_box = draw.textbbox((0, 0), foot_right, font=f_small)
    draw.text((width - 84 - (fr_box[2] - fr_box[0]), height - 121), foot_right, font=f_small, fill=text_muted)

    img.save(out_path, format="PNG", optimize=True)
    return True


def _article_og_image_info(art: dict, site_base_url: str) -> tuple:
    thumb = (art.get("thumbnail_url") or "").strip()
    if thumb:
        return thumb, None
    art_id = art.get("id")
    if art_id:
        return f"{site_base_url.rstrip('/')}/og/{art_id}.png", (1200, 630)
    return "", None


def short_cat_label(path: str) -> str:
    norm_p = LEGACY_REGION_MAP.get(path, path)
    if norm_p in VOIVODESHIP_LABELS:
        return VOIVODESHIP_LABELS[norm_p]
    pretty = {
        "Swiat": "Świat",
        "Regiony": "Regiony",
        "Poznan": "Wielkopolskie",
        "Krakow": "Małopolskie",
        "Wroclaw": "Dolnośląskie",
        "Gdansk": "Pomorskie",
        "Lodz": "Łódzkie",
        "Bialystok": "Podlaskie",
        "Rzeszow": "Podkarpackie",
        "Slaskie": "Śląskie",
        "Swietokrzyskie": "Świętokrzyskie",
        "Warminsko-Mazurskie": "Warmińsko-Mazurskie",
    }
    parts = [pretty.get(p, p) for p in (norm_p or "/Polska").split("/") if p]
    if len(parts) <= 1:
        return parts[0] if parts else "Polska"
    if parts[:2] == ["Polska", "Regiony"] and len(parts) > 2:
        return " · ".join(parts[2:])
    return " · ".join(parts[1:])


def strip_citations(text: str) -> str:
    t = re.sub(r"\[Źródło:\s*[^\]]+\]", "", text or "")
    t = re.sub(r"\[\d+:[^\]]+\]", "", t)
    return re.sub(r"\s{2,}", " ", t).strip()


def pl_typography(text: str) -> str:
    """Dodaje niełamliwe spacje przed wiszącymi spójnikami i jednostkami."""
    t = text or ""
    for _ in range(2):
        t = re.sub(r"(^|[\s(„\"—–-])([aiouwzAIOUWZ]) +", "\\1\\2\u00A0", t)
    t = re.sub(
        r"(\d)[ ]+(r\.|tys\.|mln|mld|proc\.|zł|euro|USD|km|MW|GW|MWh|GWh|osób|osoby|min|lat|lata)(?=$|[\s.,;:!?()„”\"—–-])",
        "\\1\u00A0\\2",
        t,
    )
    return t


def _format_metric_val_html(val: str) -> str:
    return html.escape(val or "").replace("/", "/<wbr>")


def format_citations_html(raw_text: str, perspectives: list) -> str:
    url_by_outlet = {}
    for p in perspectives or []:
        if p and p.get("outlet") and p.get("url"):
            url_by_outlet[p["outlet"].strip()] = p["url"].strip()

    escaped = html.escape(pl_typography(raw_text or ""), quote=True)

    def repl(match):
        raw_list = match.group(1)
        outlets = [s.strip() for s in raw_list.split(",") if s.strip()]
        badges = []
        for name in outlets:
            href = url_by_outlet.get(name)
            if href:
                safe_href = html.escape(href, quote=True)
                badges.append(
                    f'<a class="cite-tag cite-link" href="{safe_href}" target="_blank" '
                    f'rel="noopener noreferrer" title="Otwórz artykuł źródłowy w: {name}">{name} ↗</a>'
                )
            else:
                badges.append(f'<span class="cite-tag">{name}</span>')
        return " ".join(badges)

    return re.sub(r"\[Źródło:\s*([^\]]+)\]", repl, escaped)


def _extract_paragraph_outlets(raw_text: str, heading: str = "", fallback_sources: list = None) -> list:
    outlets = []
    seen = set()
    for m in re.finditer(r"\[Źródło:\s*([^\]]+)\]", raw_text or ""):
        for part in m.group(1).split(","):
            name = part.strip()
            if name and name not in seen:
                seen.add(name)
                outlets.append(name)
    if not outlets and heading:
        m_rel = re.match(r"^Relacja źródłowa\s*\(([^)]+)\)", heading.strip())
        if m_rel:
            name = m_rel.group(1).strip()
            if name:
                outlets.append(name)
        elif heading.strip().startswith("Relacja źródłowa:"):
            name = heading.strip().split(":", 1)[1].strip()
            if name:
                outlets.append(name)
    if not outlets and fallback_sources and len(fallback_sources) == 1:
        outlets.append(fallback_sources[0])
    return outlets


def reading_minutes(art: dict) -> int:
    words = " ".join(
        s.get("heading", "") + " " + " ".join(s.get("paragraphs", []))
        for s in (art.get("full_sections") or [])
    ).split()
    return max(1, round(len(words) / 190))


def minutes_label(n: int) -> str:
    if n == 1:
        return "1 minuta czytania"
    if 2 <= n <= 4 or (n > 20 and 2 <= n % 10 <= 4 and not (12 <= n % 100 <= 14)):
        return f"{n} minuty czytania"
    return f"{n} minut czytania"


def sources_label(n: int) -> str:
    if n == 1:
        return "1 źródło"
    if 2 <= n <= 4:
        return f"{n} źródła"
    return f"{n} źródeł"


def count_articles_label(n: int) -> str:
    if n == 1:
        return "1 opracowanie"
    if 2 <= n <= 4 or (n > 20 and 2 <= n % 10 <= 4 and not (12 <= n % 100 <= 14)):
        return f"{n} opracowania"
    return f"{n} opracowań"


def article_lede(art: dict, max_len: int = 240) -> str:
    lead = strip_citations(art.get("summary_lead") or "")
    if not lead:
        secs = art.get("full_sections") or []
        first = secs[0]["paragraphs"][0] if secs and secs[0].get("paragraphs") else ""
        lead = strip_citations(first)
    if len(lead) <= max_len:
        return lead
    cut = lead[:max_len]
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


def _clean_outlet_name(name: str) -> str:
    return re.sub(r"\s*\[[^\]]*\]", "", name or "").strip()


def _outlet_monogram(name: str) -> str:
    clean = _clean_outlet_name(name or "V")
    words = [w for w in re.split(r"[\s.\-]+", clean) if w]
    if len(words) >= 2:
        return (words[0][0] + words[1][0]).upper()
    return clean[:2].upper()


def _rel_href(rel_root: str, target_path: str) -> str:
    clean = (target_path or "").strip("/")
    if not clean:
        return rel_root or "./"
    return f"{rel_root}{clean}/"


def _render_nav_html(rel_root: str, active_path: str = "/Polska") -> str:
    items = [
        ("/Polska", "Polska", ""),
        ("/Polska/Gospodarka", "Gospodarka", "Polska / "),
        ("/Polska/Polityka", "Polityka", "Polska / "),
        ("/Polska/Energetyka", "Energetyka", "Polska / "),
    ]
    out = []
    for path, label, prefix in items:
        cls = "path-chip active" if path == active_path else "path-chip"
        href = html.escape(_rel_href(rel_root, path), quote=True)
        inner = f'<span class="path-root">{html.escape(prefix)}</span>{html.escape(label)}' if prefix else html.escape(label)
        out.append(
            f'<a class="{cls}" data-path="{html.escape(path, quote=True)}" '
            f'href="{href}" onclick="return selectPathLink(event, \'{html.escape(path, quote=True)}\')">{inner}</a>'
        )
    reg_active = active_path == "/Polska/Regiony" or active_path.startswith("/Polska/Regiony/")
    reg_cls = "path-chip active" if reg_active else "path-chip"
    reg_href = html.escape(_rel_href(rel_root, "/Polska/Regiony"), quote=True)
    out.append(
        '<div class="path-region-group">'
        f'<a class="{reg_cls}" data-path="/Polska/Regiony" href="{reg_href}" '
        'onclick="return selectPathLink(event, \'/Polska/Regiony\')">'
        '<span class="path-root">Polska / </span>Regiony</a>'
        '<button type="button" id="regionsToggleBtn" class="regions-toggle" '
        'onclick="toggleRegionsDrawer()" aria-expanded="false" aria-controls="regionsDrawer" '
        'title="Wybierz dowolne z 16 województw Polski">16 woj. <span class="regions-caret" aria-hidden="true">▾</span></button>'
        '</div>'
    )
    out.append('<span class="path-divider" aria-hidden="true">|</span>')
    for path, label in [("/Swiat", "Świat"), ("/Sport", "Sport")]:
        cls = "path-chip active" if path == active_path else "path-chip"
        href = html.escape(_rel_href(rel_root, path), quote=True)
        out.append(
            f'<a class="{cls}" data-path="{html.escape(path, quote=True)}" '
            f'href="{href}" onclick="return selectPathLink(event, \'{html.escape(path, quote=True)}\')">{html.escape(label)}</a>'
        )
    cam_cls = "path-chip active" if active_path == "/kamery" else "path-chip"
    cam_href = html.escape(_rel_href(rel_root, "/kamery"), quote=True)
    out.append(
        f'<a class="{cam_cls}" data-path="/kamery" href="{cam_href}" '
        'onclick="return fixFileHref(event)">Kamery</a>'
    )
    return "\n        ".join(out)


def _render_regions_drawer_html(rel_root: str, active_path: str = "/Polska") -> str:
    all_href = html.escape(_rel_href(rel_root, "/Polska/Regiony"), quote=True)
    all_cls = "regions-drawer-all active" if active_path == "/Polska/Regiony" else "regions-drawer-all"
    items_html = []
    for v_path, v_label, _, _, _, _ in VOIVODESHIPS:
        href = html.escape(_rel_href(rel_root, v_path), quote=True)
        cls = "region-drawer-item active" if active_path == v_path else "region-drawer-item"
        hue = path_hue(v_path)
        items_html.append(
            f'<a class="{cls}" data-region-link="{html.escape(v_path, quote=True)}" '
            f'href="{href}" onclick="toggleRegionsDrawer(false); return selectPathLink(event, \'{html.escape(v_path, quote=True)}\')">'
            f'<span class="region-dot" style="--h:{hue}" aria-hidden="true"></span>'
            f'<span>{html.escape(v_label)}</span></a>'
        )
    grid = "\n        ".join(items_html)
    return f"""<div id="regionsDrawer" class="regions-drawer hidden" role="region" aria-label="Wszystkie 16 województw Polski">
      <div class="regions-drawer-head">
        <div>
          <span class="regions-drawer-title">16 województw Polski</span>
          <span class="regions-drawer-sub">Wiadomości lokalne ze stolic i powiatów całego kraju</span>
        </div>
        <div class="regions-drawer-actions">
          <a class="{all_cls}" data-region-link="/Polska/Regiony" href="{all_href}" onclick="toggleRegionsDrawer(false); return selectPathLink(event, '/Polska/Regiony')">Wszystkie regiony →</a>
          <button type="button" class="regions-drawer-close" onclick="toggleRegionsDrawer(false)" aria-label="Zamknij wybór województw">✕</button>
        </div>
      </div>
      <div class="regions-drawer-grid">
        {grid}
      </div>
    </div>"""


def _render_card_ssr(art: dict, rel_root: str) -> str:
    seo_url = art.get("seo_url") or ""
    href = html.escape(_rel_href(rel_root, seo_url), quote=True)
    raw_title = art.get("seo_title") or ""
    title_attr = html.escape(raw_title, quote=True)
    title_html = html.escape(pl_typography(raw_title))
    cat_label = html.escape(short_cat_label(art.get("path") or "/Polska"))
    date_txt = html.escape(art.get("display_date") or "")
    lede = html.escape(pl_typography(article_lede(art, 200)))
    hue = path_hue(art.get("path") or "/Polska")
    srcs = art.get("sources") or []
    pct = art.get("fact_agreement_pct")
    mins = reading_minutes(art)

    if len(srcs) >= 2 and pct is not None:
        m_cls = "ok" if pct >= 85 else ("mid" if pct >= 70 else "low")
        meter = f'<span class="meter {m_cls}"><span class="meter-bar"><span class="meter-fill" style="width:{pct}%"></span></span>{pct}% zgodności</span>'
    else:
        meter = '<span class="meter neutral">Temat lokalny/niszowy</span>'

    thumb_url = art.get("thumbnail_url") or ""
    no_thumb_cls = "" if thumb_url else " no-thumb"
    img_html = (
        f'<img src="{html.escape(thumb_url, quote=True)}" alt="{title_attr}" class="story-thumb" '
        f'loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add(\'no-thumb\');this.remove()" />'
        if thumb_url
        else ""
    )

    chips = "".join(
        f'<span class="chip" title="{html.escape(m.get("label",""), quote=True)}">{html.escape(m.get("val",""))}</span>'
        for m in (art.get("metrics") or [])[:2]
    )
    js_url = html.escape(seo_url, quote=True)

    return f"""<article class="cat" style="--h:{hue}" data-id="{art['id']}">
      <div class="story-card">
        <a class="card-media-link" href="{href}" onclick="return openArticleLink(event, {art['id']}, '{js_url}')" tabindex="-1" aria-hidden="true">
          <div class="story-thumb-wrap{no_thumb_cls}">
            <div class="thumb-fallback" aria-hidden="true"><span class="thumb-fallback-label">{cat_label}</span><span class="thumb-fallback-mark">V</span></div>
            {img_html}
          </div>
        </a>
        <div class="story-body">
          <div class="story-top"><span class="cat-badge">{cat_label}</span><span class="story-date">{date_txt}</span></div>
          <h2 class="story-title"><a class="story-title-link" href="{href}" onclick="return openArticleLink(event, {art['id']}, '{js_url}')">{title_html}</a></h2>
          <p class="story-lede">{lede}</p>
          {f'<div class="story-chips">{chips}</div>' if chips else ''}
          <div class="story-foot">{meter}<span>{sources_label(len(srcs))} · {mins} min</span></div>
        </div>
      </div>
    </article>"""


def _render_lead_ssr(lead: dict, rel_root: str) -> str:
    seo_url = lead.get("seo_url") or ""
    href = html.escape(_rel_href(rel_root, seo_url), quote=True)
    raw_title = lead.get("seo_title") or ""
    title_attr = html.escape(raw_title, quote=True)
    title_html = html.escape(pl_typography(raw_title))
    cat_label = html.escape(short_cat_label(lead.get("path") or "/Polska"))
    date_txt = html.escape(lead.get("display_date") or "")
    lede = html.escape(pl_typography(article_lede(lead, 290)))
    hue = path_hue(lead.get("path") or "/Polska")
    srcs = lead.get("sources") or []
    pct = lead.get("fact_agreement_pct")
    mins = reading_minutes(lead)

    if len(srcs) >= 2 and pct is not None:
        m_cls = "ok" if pct >= 85 else ("mid" if pct >= 70 else "low")
        meter = f'<span class="meter {m_cls}"><span class="meter-bar"><span class="meter-fill" style="width:{pct}%"></span></span>{pct}% zgodności</span>'
    else:
        meter = '<span class="meter neutral">Temat lokalny/niszowy</span>'

    thumb_url = lead.get("thumbnail_url") or ""
    no_thumb_cls = "" if thumb_url else " no-thumb"
    img_html = (
        f'<img src="{html.escape(thumb_url, quote=True)}" alt="{title_attr}" class="lead-thumb" '
        f'loading="eager" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add(\'no-thumb\');this.closest(\'.lead-story\')?.classList.add(\'no-thumb\');this.remove()" />'
        if thumb_url
        else ""
    )

    stats_rows = "".join(
        f'<div class="stat-row"><span class="stat-label">{html.escape(m.get("label",""))}</span><span class="stat-val">{_format_metric_val_html(m.get("val",""))}</span></div>'
        for m in (lead.get("metrics") or [])[:3]
    )
    js_url = html.escape(seo_url, quote=True)

    return f"""<article class="cat lead-wrap" style="--h:{hue}">
      <div class="lead-story{no_thumb_cls}" onclick="if(!event.target.closest('a'))openArticleLink(event, {lead['id']}, '{js_url}')">
        <a class="lead-thumb-wrap{no_thumb_cls}" href="{href}" onclick="return openArticleLink(event, {lead['id']}, '{js_url}')" tabindex="-1" aria-hidden="true">
          <div class="thumb-fallback" aria-hidden="true"><span class="thumb-fallback-label">{cat_label}</span><span class="thumb-fallback-mark">V</span></div>
          {img_html}
        </a>
        <div class="lead-main">
          <div class="story-top"><span class="cat-badge">{cat_label}</span><span class="story-date">{date_txt}</span></div>
          <h2 class="lead-title"><a class="story-title-link" href="{href}" onclick="return openArticleLink(event, {lead['id']}, '{js_url}')">{title_html}</a></h2>
          <p class="lead-lede">{lede}</p>
          <div class="story-foot">{meter}<span>{sources_label(len(srcs))} · {minutes_label(mins)}</span></div>
        </div>
        <div class="lead-side">
          <div class="lead-side-title">Kluczowe parametry</div>
          {stats_rows}
        </div>
      </div>
    </article>"""


def _sort_articles_for_feed(items: list) -> list:
    return sorted(
        items,
        key=lambda a: a.get("published_iso") or "",
        reverse=True,
    )


def _render_region_strip_ssr(articles: list, path: str, rel_root: str) -> str:
    if path != "/Polska/Regiony" and path not in VOIVODESHIP_BY_PATH:
        return ""
    counts = {}
    for a in articles:
        ap = a.get("path") or ""
        if ap.startswith("/Polska/Regiony/"):
            counts[ap] = counts.get(ap, 0) + 1
    total_reg = sum(counts.values())
    all_href = html.escape(_rel_href(rel_root, "/Polska/Regiony"), quote=True)
    all_cls = "region-pill active" if path == "/Polska/Regiony" else "region-pill"
    pills = [
        f'<a class="{all_cls}" href="{all_href}" onclick="return selectPathLink(event, \'/Polska/Regiony\')">Wszystkie <span class="region-pill-count">{total_reg}</span></a>'
    ]
    for v_path, v_label, _, _, _, _ in VOIVODESHIPS:
        c = counts.get(v_path, 0)
        href = html.escape(_rel_href(rel_root, v_path), quote=True)
        cls = "region-pill"
        if path == v_path:
            cls += " active"
        if c > 0:
            cls += " has-items"
        hue = path_hue(v_path)
        pills.append(
            f'<a class="{cls}" style="--h:{hue}" href="{href}" onclick="return selectPathLink(event, \'{html.escape(v_path, quote=True)}\')">'
            f'{html.escape(v_label)}<span class="region-pill-count">{c}</span></a>'
        )
    return f'<nav class="region-strip" aria-label="Wybierz województwo">{"".join(pills)}</nav>'


def render_feed_ssr(articles: list, path: str, rel_root: str) -> str:
    filtered = _sort_articles_for_feed(
        [a for a in articles if (a.get("path") or "").startswith(path)]
    )
    title_map = {p: t for p, t, _ in CATEGORIES}
    heading_title = html.escape(title_map.get(path, path))
    heading = f"""<div class="feed-heading">
        <div>
          <span class="feed-crumb">{html.escape(path)}</span>
          <h1>{heading_title}</h1>
        </div>
        <span>{count_articles_label(len(filtered))}</span>
      </div>"""
    region_strip = _render_region_strip_ssr(articles, path, rel_root)
    if not filtered:
        if path in VOIVODESHIP_BY_PATH:
            v_info = VOIVODESHIP_BY_PATH[path]
            outlets_txt = html.escape(", ".join(v_info[4]))
            all_reg_href = html.escape(_rel_href(rel_root, "/Polska/Regiony"), quote=True)
            empty_box = (
                f'<div class="empty-state">'
                f'<p>Brak bieżących opracowań w dziale <strong>{html.escape(v_info[2])}</strong>.</p>'
                f'<p class="empty-sub">Monitorowane redakcje w tym województwie: {outlets_txt}. Kolejne depesze ze stolicy i powiatów regionu pojawiają się w aktualizacjach cyklicznych.</p>'
                f'<p style="margin-top:0.9rem"><a class="btn-outline" style="text-decoration:none;display:inline-block" href="{all_reg_href}" onclick="return selectPathLink(event, \'/Polska/Regiony\')">← Zobacz wiadomości ze wszystkich 16 województw</a></p>'
                f'</div>'
            )
            return heading + region_strip + empty_box
        return heading + region_strip + f'<div class="empty-state">Brak opracowań w dziale <strong>{html.escape(path)}</strong>.</div>'

    use_lead = len(filtered) >= 3
    lead = filtered[0] if use_lead else None
    rest = filtered[1:13] if use_lead else filtered[:12]
    shown_count = (1 if lead else 0) + len(rest)
    lead_html = _render_lead_ssr(lead, rel_root) if lead else ""
    cards_html = "\n".join(_render_card_ssr(a, rel_root) for a in rest)
    grid_cls = "cards-grid after-lead" if lead else "cards-grid"
    grid_html = f'<div id="feedGrid" class="{grid_cls}">{cards_html}</div>' if cards_html else ""
    pager_note = (
        f'<div class="feed-load-more-wrap"><div class="feed-load-more-meta">Wyświetlono {shown_count} z {len(filtered)} opracowań · przewiń w dół, aby wczytać kolejne</div></div>'
        if len(filtered) > shown_count
        else ""
    )
    return heading + region_strip + lead_html + grid_html + pager_note


def _reconcile_lead_and_first_para(art: dict) -> tuple:
    secs = art.get("full_sections") or []
    all_paras = [(si, pi, p) for si, s in enumerate(secs) for pi, p in enumerate(s.get("paragraphs") or [])]
    if not all_paras:
        lead = strip_citations(art.get("summary_lead") or "")
        return bool(lead), lead, False, ""

    first_raw = all_paras[0][2]
    first_plain = strip_citations(first_raw)
    summary_lead = strip_citations(art.get("summary_lead") or "")
    if not summary_lead and len(all_paras) >= 2:
        summary_lead = article_lede(art, 280)

    norm_l = re.sub(r"\W+", "", summary_lead.lower())
    norm_p = re.sub(r"\W+", "", first_plain.lower())
    if len(all_paras) == 1 and norm_l and norm_p.startswith(norm_l[: min(50, len(norm_l))]):
        return False, "", False, first_raw

    if not summary_lead:
        return False, "", False, first_raw

    if summary_lead.endswith("…"):
        prefix_no_ellip = summary_lead[:-1].rstrip()
        if prefix_no_ellip and first_plain.startswith(prefix_no_ellip):
            if len(first_plain) <= 450:
                return True, first_plain, True, ""
            return False, "", False, first_raw

    if norm_l and norm_p and (
        norm_p == norm_l
        or (len(norm_l) > 50 and norm_p.startswith(norm_l[:50]) and len(norm_p) <= len(norm_l) + 30)
    ):
        return True, summary_lead, True, ""

    if not summary_lead.endswith("…") and first_plain.startswith(summary_lead):
        tail_plain = first_plain[len(summary_lead):].strip()
        if len(tail_plain) >= 25 and re.match(r"^[A-ZĄĆĘŁŃÓŚŹŻ„\"—–-]", tail_plain):
            trimmed_raw = first_raw.strip()
            if trimmed_raw.startswith(summary_lead):
                return True, summary_lead, False, trimmed_raw[len(summary_lead):].lstrip()
            cite_suffix = " ".join(re.findall(r"\[Źródło:\s*[^\]]+\]", first_raw))
            return True, summary_lead, False, (f"{tail_plain} {cite_suffix}".strip() if cite_suffix else tail_plain)

    return True, summary_lead, False, first_raw


def _render_article_body_ssr(art: dict, all_articles: list, rel_root: str, site_base_url: str) -> str:
    hue = path_hue(art.get("path") or "/Polska")
    cat_path = art.get("path") or "/Polska"
    title_map = {p: t for p, t, _ in CATEGORIES}
    back_cat = cat_path if cat_path in title_map else "/Polska"
    back_label = html.escape(title_map.get(back_cat, back_cat))
    back_href = html.escape(_rel_href(rel_root, back_cat), quote=True)
    raw_title = art.get("seo_title") or ""
    title_attr = html.escape(raw_title, quote=True)
    title_html = html.escape(pl_typography(raw_title))
    date_esc = html.escape(art.get("display_date") or "")
    mins = reading_minutes(art)
    srcs = art.get("sources") or []
    pct = art.get("fact_agreement_pct")
    persps = art.get("perspectives") or []
    secs = art.get("full_sections") or []

    show_lede, summary_lead, skip_first_para, first_para_override = _reconcile_lead_and_first_para(art)

    lede_html = (
        f'<p class="article-lede">{html.escape(pl_typography(summary_lead))}</p>'
        if show_lede
        else f'<p class="article-context-line">Synteza faktograficzna na podstawie {sources_label(len(srcs))} · Bezpośrednie odnośniki do publikacji źródłowych poniżej.</p>'
    )

    thumb = art.get("thumbnail_url") or ""
    hero_html = ""
    if thumb:
        hero_html = f"""<div class="article-hero-wrap">
            <div class="thumb-fallback" aria-hidden="true"><span class="thumb-fallback-label">{html.escape(short_cat_label(cat_path))}</span><span class="thumb-fallback-mark">V</span></div>
            <img src="{html.escape(thumb, quote=True)}" alt="{title_attr}" class="article-hero-img" loading="eager" referrerpolicy="no-referrer" onerror="this.parentElement.remove()" />
          </div>"""

    facts_html = ""
    if art.get("metrics"):
        boxes = "".join(
            f'<div class="fact-box"><div class="fact-label">{html.escape(m.get("label",""))}</div><div class="fact-val">{_format_metric_val_html(m.get("val",""))}</div></div>'
            for m in art["metrics"]
        )
        facts_html = f'<div class="facts-strip">{boxes}</div>'

    admin_note_html = (
        f'<div class="callout callout-warn"><strong>Nota weryfikacyjna redakcji:</strong> {html.escape(pl_typography(art["admin_note"]))}</div>'
        if art.get("admin_note")
        else ""
    )

    declickbait_html = ""
    if art.get("declickbait"):
        dc_items = "".join(
            f'<div class="cb-item"><div class="cb-strike">„{html.escape(dc.get("original",""))}” <em>— {html.escape(dc.get("outlet",""))}</em></div>'
            f'<div class="cb-fact">→ {html.escape(dc.get("fact",""))}</div></div>'
            for dc in art["declickbait"]
        )
        declickbait_html = f'<div class="callout callout-clickbait"><div class="callout-title">Odfiltrowany clickbait</div>{dc_items}</div>'

    secs_html_parts = []
    dropcap_applied = False
    total_rendered_paras = 0
    outlet_para_counts = {}
    for si, s in enumerate(secs):
        sec_heading = s.get("heading") or ""
        p_htmls = []
        paras = s.get("paragraphs") or []
        for pi, p in enumerate(paras):
            if si == 0 and pi == 0:
                if skip_first_para:
                    continue
                if first_para_override:
                    p = first_para_override
            p_outlets = _extract_paragraph_outlets(p, sec_heading, srcs)
            plain_p = strip_citations(p)
            is_quote = bool(re.match(r"^\s*[—–-]\s+", plain_p))
            p_classes = ["section-paragraph"]
            if is_quote:
                p_classes.append("is-quote")
                p = re.sub(r"^\s*[—–-]\s+", "—\u00A0", p, count=1)
            elif not dropcap_applied and re.match(r"^[A-ZĄĆĘŁŃÓŚŹŻ]", plain_p) and len(plain_p) >= 140:
                p_classes.append("has-dropcap")
                dropcap_applied = True
            total_rendered_paras += 1
            for o in p_outlets:
                outlet_para_counts[o] = outlet_para_counts.get(o, 0) + 1
            outlets_attr = f' data-outlets="{html.escape("|".join(p_outlets), quote=True)}"' if p_outlets else ""
            p_htmls.append(f'<p class="{" ".join(p_classes)}"{outlets_attr}>{format_citations_html(p, persps)}</p>')
        if p_htmls:
            secs_html_parts.append(
                f'<section data-sec-idx="{si}"><h2 class="section-heading" id="sec_{art["id"]}_{si}">{html.escape(sec_heading)}</h2>{"".join(p_htmls)}</section>'
            )

    ordered_outlets = []
    seen_ordered_outlets = set()
    for p in persps:
        o_name = (p.get("outlet") or "").strip()
        if o_name and o_name not in seen_ordered_outlets:
            seen_ordered_outlets.add(o_name)
            ordered_outlets.append(o_name)
    for o_name in srcs:
        clean_o = (o_name or "").strip()
        if clean_o and clean_o not in seen_ordered_outlets:
            seen_ordered_outlets.add(clean_o)
            ordered_outlets.append(clean_o)

    source_filter_bar_html = ""
    if len(srcs) >= 2 and total_rendered_paras > 0 and ordered_outlets:
        filter_pills = [
            f'<button type="button" class="source-filter-chip active" data-outlet-filter="" aria-pressed="true" onclick="setArticleOutletFilter(this.getAttribute(\'data-outlet-filter\'))">Wszystkie <span class="source-chip-count">({total_rendered_paras})</span></button>'
        ]
        for o_name in ordered_outlets:
            cnt = outlet_para_counts.get(o_name, 0)
            o_esc = html.escape(o_name, quote=True)
            o_cls = "source-filter-chip is-zero-paras" if cnt == 0 else "source-filter-chip"
            filter_pills.append(
                f'<button type="button" class="{o_cls}" data-outlet-filter="{o_esc}" aria-pressed="false" onclick="setArticleOutletFilter(this.getAttribute(\'data-outlet-filter\'))">{o_esc} <span class="source-chip-count">({cnt})</span></button>'
            )
        source_filter_bar_html = (
            '<div class="source-filter-bar" role="region" aria-label="Filtruj relacje według redakcji">'
            '<div class="source-filter-head"><span class="source-filter-label">Filtruj wg redakcji</span><span class="source-filter-hint">Kliknij źródło, aby wyróżnić jego ustalenia w tekście</span></div>'
            f'<div class="source-filter-pills">{"".join(filter_pills)}</div>'
            '<div id="sourceFilterStatus" class="source-filter-status hidden" aria-live="polite"></div>'
            '</div>'
        )

    persp_cols = []
    for p_idx, p in enumerate(persps):
        o_raw = (p.get("outlet") or "").strip()
        o_esc = html.escape(o_raw, quote=True)
        link = (
            f'<a class="perspective-link" href="{html.escape(p["url"], quote=True)}" target="_blank" rel="noopener noreferrer">Otwórz artykuł źródłowy ↗</a>'
            if p.get("url")
            else ""
        )
        filter_btn = (
            f'<button type="button" class="perspective-filter-btn" data-outlet-btn="{o_esc}" onclick="setArticleOutletFilter(this.getAttribute(\'data-outlet-btn\'))">Wyróżnij w tekście</button>'
            if len(srcs) >= 2 and o_raw
            else ""
        )
        actions_html = f'<div class="perspective-actions">{link}{filter_btn}</div>' if (link or filter_btn) else ""
        col_cls = "perspective-col is-collapsed-persp" if p_idx >= 4 else "perspective-col"
        diff_parts = []
        if p.get("focus"):
            diff_parts.append(f'<div><strong>Eksponuje:</strong> {html.escape(pl_typography(p["focus"]))}</div>')
        if p.get("omits"):
            diff_parts.append(f'<div><strong>Pomija:</strong> {html.escape(pl_typography(p["omits"]))}</div>')
        diff_html = f'<div class="perspective-diff">{"".join(diff_parts)}</div>' if diff_parts else ""
        persp_cols.append(f"""<div class="{col_cls}" data-outlet="{o_esc}">
          <div class="perspective-head">
            <span class="outlet-mono" aria-hidden="true">{html.escape(_outlet_monogram(o_raw))}</span>
            <div>
              <div class="perspective-outlet">{html.escape(o_raw)}</div>
              <div class="perspective-angle">{html.escape(p.get("angle") or "Depesza źródłowa")}</div>
            </div>
          </div>
          <p class="perspective-summary">{html.escape(pl_typography(p.get("summary","")))}</p>
          {diff_html}
          {actions_html}
        </div>""")

    persp_more_html = ""
    if len(persp_cols) > 4:
        persp_more_html = (
            '<div class="perspectives-more-wrap">'
            f'<button type="button" class="perspectives-expand-btn" aria-expanded="false" data-total="{len(persp_cols)}" onclick="toggleAllPerspectives(this)">Pokaż wszystkie ujęcia ({len(persp_cols)})</button>'
            '</div>'
        )
    persp_subtitle = (
        f"{sources_label(len(srcs))} · kliknij wybraną, by wyróżnić jej ustalenia"
        if len(srcs) >= 2
        else f"Źródło: {html.escape(', '.join(srcs))}"
    )

    corrs = art.get("corrections") or []
    corr_box_html = ""
    if corrs:
        corr_lines = "".join(
            f'<div>• {html.escape(c.get("claim_text",""))} (<a href="{html.escape(c.get("evidence_url",""), quote=True)}" target="_blank" rel="noopener noreferrer">link</a>)</div>'
            for c in corrs
        )
        corr_box_html = f'<div class="callout callout-success"><strong>Zweryfikowane uzupełnienia czytelników ({len(corrs)}):</strong>{corr_lines}</div>'

    if len(srcs) >= 2 and pct is not None:
        m_cls = "ok" if pct >= 85 else ("mid" if pct >= 70 else "low")
        aside_verif = f"""<div class="aside-card">
            <div class="aside-title">Zgodność danych</div>
            <div class="big-meter meter {m_cls}">{pct}%<small>{sources_label(len(srcs))}</small></div>
            <div class="meter-bar wide"><span class="meter-fill" style="width:{pct}%"></span></div>
          </div>"""
    else:
        aside_verif = """<div class="aside-card">
            <div class="aside-title">Status źródeł</div>
            <div class="aside-status">1 redakcja (lokalne / branżowe)</div>
            <div class="aside-note">Informacja niszowa z pojedynczego źródła — publikowana bez wskaźnika % zgodności krzyżowej.</div>
          </div>"""

    unique_links = []
    seen_u = set()
    for p in persps:
        u = p.get("url")
        if u and u not in seen_u:
            seen_u.add(u)
            unique_links.append(p)

    toc_html = ""
    if len(secs) > 1:
        toc_items = "".join(
            f'<li><button class="toc-btn" onclick="document.getElementById(\'sec_{art["id"]}_{si}\').scrollIntoView({{behavior:\'smooth\'}})"><span>{html.escape(s.get("heading",""))}</span><span>↓</span></button></li>'
            for si, s in enumerate(secs)
        )
        toc_html = f'<div class="aside-card"><div class="aside-title">W tym artykule</div><ul class="aside-list">{toc_items}</ul></div>'

    links_html = ""
    if unique_links:
        link_items = "".join(
            f'<li><a href="{html.escape(p["url"], quote=True)}" target="_blank" rel="noopener noreferrer"><span>{html.escape(_clean_outlet_name(p.get("outlet","")))}</span><span>↗</span></a></li>'
            for p in unique_links
        )
        links_html = f'<div class="aside-card"><div class="aside-title">Źródła do przeczytania</div><ul class="aside-list">{link_items}</ul></div>'

    ordered_all = _sort_articles_for_feed(all_articles)
    top_cat = "/" + (cat_path.strip("/").split("/")[0] or "Polska")
    related = [a for a in ordered_all if a["id"] != art["id"] and a.get("path") == cat_path][:2]
    if len(related) < 2:
        more_top = [a for a in ordered_all if a["id"] != art["id"] and a not in related and (a.get("path") or "").startswith(top_cat)]
        related = (related + more_top)[:2]
    if not related:
        related = [a for a in ordered_all if a["id"] != art["id"]][:2]
    related_html = (
        f'<section class="related"><h2>Czytaj dalej</h2><div class="cards-grid">{"".join(_render_card_ssr(r, rel_root) for r in related)}</div></section>'
        if related
        else ""
    )

    canonical_full = f"{site_base_url}{art.get('seo_url', '')}/"
    canonical_esc = html.escape(canonical_full, quote=True)

    perspectives_box_html = ""
    if persp_cols:
        perspectives_box_html = f"""<div class="perspectives-box">
            <div class="perspectives-header">
              <span class="perspectives-title">Kto jak to przedstawia?</span>
              <span class="perspectives-sources">{persp_subtitle}</span>
            </div>
            <div class="perspectives-grid">{"".join(persp_cols)}</div>
            {persp_more_html}
          </div>"""

    # Pigułki "Kogo dotyczy / Obszar / Status"
    imp = art.get("impact") or {}
    impact_html = ""
    if imp and (imp.get("audience") or imp.get("scope") or imp.get("status")):
        imp_parts = []
        if imp.get("audience"):
            imp_parts.append(f'<span class="impact-pill"><strong>Kogo dotyczy:</strong> {html.escape(imp["audience"])}</span>')
        if imp.get("scope"):
            imp_parts.append(f'<span class="impact-pill"><strong>Obszar:</strong> {html.escape(imp["scope"])}</span>')
        if imp.get("status"):
            imp_parts.append(f'<span class="impact-pill"><strong>Status:</strong> {html.escape(imp["status"])}</span>')
        impact_html = f'<div class="impact-strip" aria-label="Kogo dotyczy i jaki ma status">{"".join(imp_parts)}</div>'

    # Baner i oś czasu "Akta Sprawy"
    dossier_items = art.get("dossier_items") or []
    dossier_banner_html = ""
    timeline_html = ""
    if len(dossier_items) >= 2:
        d_title = html.escape(art.get("dossier_title") or "Wątek rozwijany")
        d_idx = int(art.get("dossier_index") or 1)
        d_cnt = int(art.get("dossier_count") or len(dossier_items))
        dossier_banner_html = (
            f'<div class="dossier-banner">'
            f'<span class="dossier-badge">Akta Sprawy</span>'
            f'<span class="dossier-title-txt">{d_title} ({d_idx}/{d_cnt})</span>'
            f'<a class="dossier-jump" href="#timeline">Oś czasu tematu ↓</a>'
            f'</div>'
        )
        tl_steps = []
        for step in dossier_items:
            s_id = step.get("id")
            s_url = step.get("seo_url") or ""
            is_cur = (s_id == art.get("id")) or (s_url and s_url == art.get("seo_url"))
            s_href = html.escape(_rel_href(rel_root, s_url), quote=True)
            s_js = html.escape(s_url, quote=True)
            s_title = html.escape(pl_typography(step.get("seo_title") or ""))
            s_date = html.escape(step.get("display_date") or "")
            tl_cls = "timeline-item is-current" if is_cur else "timeline-item"
            cur_tag = '<span class="timeline-now">Czytasz teraz</span>' if is_cur else ""
            link_el = (
                f'<span class="timeline-link">{s_title}</span>'
                if is_cur
                else f'<a class="timeline-link" href="{s_href}" onclick="return openArticleLink(event, {int(s_id or 0)}, \'{s_js}\')">{s_title}</a>'
            )
            tl_steps.append(f'<li class="{tl_cls}"><div class="timeline-date">{s_date}</div>{link_el}{cur_tag}</li>')
        timeline_html = (
            f'<section id="timeline" class="dossier-timeline" aria-label="Oś czasu sprawy">'
            f'<div class="timeline-head"><span class="dossier-badge">Akta Sprawy · Oś czasu</span>'
            f'<h2>{d_title}</h2><span class="timeline-meta">Etap {d_idx} z {d_cnt}</span></div>'
            f'<ol class="timeline-list">{"".join(tl_steps)}</ol>'
            f'</section>'
        )

    # Sekcja FAQ pod Rich Snippets
    seo_faq = [f for f in (art.get("seo_faq") or []) if isinstance(f, dict) and f.get("q") and f.get("a")]
    faq_html = ""
    if seo_faq:
        faq_items_html = "".join(
            f'<details class="faq-item"{" open" if idx == 0 else ""}>'
            f'<summary class="faq-q">{html.escape(pl_typography(fq["q"]))}</summary>'
            f'<div class="faq-a">{html.escape(pl_typography(fq["a"]))}</div>'
            f'</details>'
            for idx, fq in enumerate(seo_faq)
        )
        faq_html = f'<section class="faq-box" aria-label="Pytania i odpowiedzi">{faq_items_html}</section>'

    ai_badge_html = '<span class="ai-badge">Synteza AI Zero-Trust</span>' if art.get("ai_synthesized") else ""

    return f"""<div class="cat" style="--h:{hue}">
      <a class="back-link" href="{back_href}" onclick="return selectPathLink(event, '{html.escape(back_cat, quote=True)}')">← Wróć do {back_label}</a>
      <div class="reader has-aside">
        <article class="article-main">
          <header class="article-head">
            <div class="article-kicker">
              <span class="cat-badge">{html.escape(short_cat_label(cat_path))}</span>
              {ai_badge_html}
              <time datetime="{html.escape(art.get('published_iso') or '')}">{date_esc}</time>
              <span>{minutes_label(mins)}</span>
            </div>
            <h1 class="article-title">{title_html}</h1>
            {lede_html}
            {impact_html}
            {dossier_banner_html}
          </header>

          {hero_html}
          {facts_html}
          {admin_note_html}
          {declickbait_html}
          {source_filter_bar_html}

          <div class="article-sections">
            {"".join(secs_html_parts)}
          </div>

          {perspectives_box_html}
          {faq_html}

          {corr_box_html}

          <div class="article-footer">
            <div class="permalink-wrap">
              <span class="permalink">{html.escape(canonical_full)}</span>
              <button type="button" class="copy-link-btn" onclick="copyPermalink(this, '{canonical_esc}')" title="Kopiuj link do artykułu">Kopiuj link</button>
            </div>
            <button class="btn-outline" onclick="toggleCorr({art['id']})">Zgłoś sprostowanie (wymagany link do źródła)</button>
          </div>
          <div id="corrDrawer_{art['id']}" class="correction-drawer hidden">
            <div class="corr-intro">Zgłoś korektę faktograficzną – przyjmujemy wyłącznie zgłoszenia z linkiem do dokumentu lub źródła:</div>
            <div class="form-row">
              <input id="corrClaim_{art['id']}" type="text" class="text-input" placeholder="Co wymaga korekty?" />
              <input id="corrUrl_{art['id']}" type="text" class="text-input" placeholder="Link do dowodu: https://..." />
            </div>
            <div class="corr-actions">
              <span id="corrMsg_{art['id']}" class="corr-msg"></span>
              <button class="btn-primary" onclick="submitCorr({art['id']})">Wyślij korektę</button>
            </div>
          </div>
        </article>

        <aside class="article-aside">
          {aside_verif}
          {toc_html}
          {links_html}
        </aside>
      </div>
      {timeline_html}
      {related_html}
    </div>"""


def _build_news_article_jsonld(art: dict, site_base_url: str) -> list:
    canonical = f"{site_base_url}{art.get('seo_url', '')}/"
    cat_path = art.get("path") or "/Polska"
    parts = [p for p in cat_path.split("/") if p]
    valid_cats = {p for p, _, _ in CATEGORIES}
    pretty_names = {
        "Polska": "Polska",
        "Swiat": "Świat",
        "Sport": "Sport",
        "Gospodarka": "Gospodarka",
        "Polityka": "Polityka",
        "Energetyka": "Energetyka",
        "Regiony": "Regiony",
        "Poznan": "Wielkopolskie",
        **{v[0].split("/")[-1]: v[1] for v in VOIVODESHIPS},
    }
    breadcrumbs = [
        {"@type": "ListItem", "position": 1, "name": "VERITY", "item": f"{site_base_url}/"},
    ]
    acc = ""
    for part in parts:
        acc += f"/{part}"
        if acc in valid_cats:
            breadcrumbs.append({"@type": "ListItem", "position": len(breadcrumbs) + 1, "name": pretty_names.get(part, part), "item": f"{site_base_url}{acc}/"})
    breadcrumbs.append({"@type": "ListItem", "position": len(breadcrumbs) + 1, "name": art.get("seo_title") or "", "item": canonical})

    citations = []
    for p in art.get("perspectives") or []:
        if p.get("url"):
            citations.append({
                "@type": "NewsArticle",
                "headline": p.get("summary") or art.get("seo_title") or "",
                "url": p["url"],
                "publisher": {"@type": "Organization", "name": p.get("outlet") or ""},
            })

    news_ld = {
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        "mainEntityOfPage": {"@type": "WebPage", "@id": canonical},
        "headline": (art.get("seo_title") or "")[:110],
        "description": art.get("meta_description") or article_lede(art, 160),
        "datePublished": art.get("published_iso") or "",
        "dateModified": art.get("updated_iso") or art.get("published_iso") or "",
        "inLanguage": "pl",
        "isAccessibleForFree": True,
        "articleSection": short_cat_label(cat_path),
        "author": {"@type": "Organization", "name": "Zespół Redakcyjny VERITY", "url": f"{site_base_url}/"},
        "publisher": {"@type": "Organization", "name": "VERITY", "url": f"{site_base_url}/"},
    }
    og_img_url, _ = _article_og_image_info(art, site_base_url)
    if og_img_url:
        news_ld["image"] = [og_img_url]
    if art.get("keywords"):
        news_ld["keywords"] = art["keywords"]
    if citations:
        news_ld["citation"] = citations

    out_ld = [
        news_ld,
        {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": breadcrumbs},
    ]
    faq_entities = [
        {
            "@type": "Question",
            "name": item["q"],
            "acceptedAnswer": {"@type": "Answer", "text": item["a"]},
        }
        for item in (art.get("seo_faq") or [])
        if isinstance(item, dict) and item.get("q") and item.get("a")
    ]
    if faq_entities:
        out_ld.append({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": faq_entities,
        })
    return out_ld


try:
    from community_db import PENALTY_TARIFF as _COMMUNITY_TARIFF
    _TARIFF_ROWS = list(_COMMUNITY_TARIFF.values())
except Exception:
    _TARIFF_ROWS = [
        {"code": "§1.1", "title": "Spam, flood lub link komercyjny", "description": "Masowe powielanie treści, reklamy komercyjne lub flood na czacie live / w komentarzach.", "points": 2},
        {"code": "§1.2", "title": "Koordynacja rajdu lub multikonta", "description": "Zorganizowane zwoływanie brygady z zewnętrznych komunikatorów lub zakładanie multikont do manipulacji.", "points": 4},
        {"code": "§1.3", "title": "Phishing, złośliwe linki lub podszywanie", "description": "Rozsyłanie fałszywych stron logowania, skracaczy maskujących malware lub podszywanie się pod redakcję.", "points": 6},
        {"code": "§2.1", "title": "Wulgarna obelga personalna", "description": "Bezpośrednie wyzwiska, inwektywy ad personam i poniżanie innych uczestników dyskusji.", "points": 2},
        {"code": "§2.2", "title": "Prowokacja nienawiścią / dezorganizacja debaty", "description": "Systematyczne rozbijanie dyskusji mową nienawiści lub wulgarnym trollingiem (zero kar za same poglądy).", "points": 4},
        {"code": "§2.3", "title": "Groźby karalne lub doxxing", "description": "Grożenie przemocą fizyczną, publikowanie prywatnych adresów, telefonów lub danych osobowych.", "points": 10},
    ]


def _render_moderation_ssr(rel_root: str) -> str:
    tariff_rows = "\n".join(
        f'<tr>'
        f'<td class="mod-code"><code>{html.escape(r["code"])}</code></td>'
        f'<td><strong>{html.escape(r["title"])}</strong><div class="mod-desc">{html.escape(r["description"])}</div></td>'
        f'<td class="mod-pts">+{int(r["points"])}&nbsp;pkt</td>'
        f'</tr>'
        for r in _TARIFF_ROWS
    )
    home_href = html.escape(_rel_href(rel_root, "/Polska"), quote=True)
    return f"""<div class="moderation-page">
      <a class="back-link" href="{home_href}" onclick="return selectPathLink(event, '/Polska')">← Wróć do wydania głównego VERITY</a>
      <div class="feed-heading">
        <div>
          <span class="feed-crumb">/moderacja</span>
          <h1>Publiczny Rejestr Moderacji i Taryfikator</h1>
        </div>
        <span>Pełna jawność decyzji</span>
      </div>
      <div class="mod-principle-box">
        <strong>Zasada naczelna:</strong> Zero kar za poglądy polityczne czy gospodarcze. Usuwamy wyłącznie spam, rajdy multikont i wulgarne wyzwiska personalne według sztywnego taryfikatora. Przy <strong>6 pkt</strong> następuje automatyczne wyciszenie na 24h, a przy <strong>10 pkt</strong> blokada konta.
      </div>
      <section class="mod-card">
        <h2 class="mod-section-title">Sztywny Taryfikator Punktowy (§1.1–§2.3)</h2>
        <div class="mod-table-wrap">
          <table class="mod-table">
            <thead>
              <tr><th>Paragraf</th><th>Naruszenie</th><th>Punkty</th></tr>
            </thead>
            <tbody>
              {tariff_rows}
            </tbody>
          </table>
        </div>
      </section>
      <section id="moderationRegistryMount" class="mod-card">
        <h2 class="mod-section-title">Ostatnie jawne wpisy w rejestrze</h2>
        <p class="mod-desc" style="margin-bottom:0.75rem">Lista aktualizuje się na żywo z bazy portalu przy aktywnym serwerze VERITY.</p>
        <div class="mod-table-wrap">
          <table class="mod-table">
            <thead>
              <tr><th>Konto</th><th>Paragraf</th><th>Kontekst</th><th>Decyzja</th></tr>
            </thead>
            <tbody id="moderationLogBody">
              <tr>
                <td><strong>@Troll_Konto99</strong></td>
                <td><code>§2.1</code> Wulgarna obelga personalna</td>
                <td>„Ty jesteś chory psychicznie i nie umiesz czytać...”</td>
                <td class="mod-decision warn">+2 pkt karne (4/10)</td>
              </tr>
              <tr>
                <td><strong>@Prawica_PL</strong></td>
                <td><code>ODRZUCONO</code> Zgłoszenie za „poglądy polityczne”</td>
                <td>„Ta zmiana podatkowa oznacza wyższe koszty dla samorządów...”</td>
                <td class="mod-decision ok">ODRZUCONO (Komentarz zostaje — zero kar za poglądy)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>"""


def _load_cameras(base_dir: str) -> list:
    cam_path = os.path.join(base_dir, "cameras.json")
    if not os.path.exists(cam_path):
        return []
    try:
        with open(cam_path, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except Exception as exc:
        print(f"[VERITY] Ostrzeżenie: nie można wczytać cameras.json: {exc}")
        return []
    if not isinstance(raw, list):
        print("[VERITY] Ostrzeżenie: cameras.json nie jest tablicą JSON.")
        return []

    valid_regions = {v[0] for v in VOIVODESHIPS}
    seen_ids = set()
    cameras = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        cid = str(item.get("id") or "").strip()
        name = str(item.get("name") or "").strip()
        scope = str(item.get("scope") or "").strip()
        ctype = str(item.get("type") or "").strip()
        source_name = str(item.get("source_name") or "").strip()
        source_url = str(item.get("source_url") or "").strip()
        if not cid or not name or scope not in ("polska", "swiat") or not source_name or not source_url:
            print(f"[VERITY] Pominięto niekompletną kamerę w cameras.json: {cid or name or item}")
            continue
        if cid in seen_ids:
            print(f"[VERITY] Pominięto duplikat kamery id={cid}")
            continue
        region = item.get("region")
        if scope == "polska":
            if region not in valid_regions:
                print(f"[VERITY] Pominięto kamerę {cid}: niepoprawny region={region!r}")
                continue
        else:
            region = None
        if ctype == "youtube_channel" and not str(item.get("youtube_channel_id") or "").strip():
            print(f"[VERITY] Pominięto kamerę {cid}: brak youtube_channel_id")
            continue
        if ctype == "youtube_video" and not str(item.get("youtube_video_id") or "").strip():
            print(f"[VERITY] Pominięto kamerę {cid}: brak youtube_video_id")
            continue
        if ctype == "external_link" and not str(item.get("external_url") or "").strip():
            print(f"[VERITY] Pominięto kamerę {cid}: brak external_url")
            continue
        if ctype not in ("youtube_channel", "youtube_video", "external_link"):
            print(f"[VERITY] Pominięto kamerę {cid}: nieznany type={ctype!r}")
            continue
        seen_ids.add(cid)
        cameras.append(item)
    return cameras


def _camera_monogram(name: str) -> str:
    words = [w for w in re.split(r"[\s\-–—/]+", (name or "").strip()) if w and w[0].isalnum()]
    if len(words) >= 2:
        return (words[0][0] + words[1][0]).upper()
    if words:
        return words[0][:2].upper()
    return "CAM"


def _render_cameras_ssr(rel_root: str, cameras: list) -> str:
    home_href = html.escape(_rel_href(rel_root, "/Polska"), quote=True)
    voiv_labels = {v[0]: v[1] for v in VOIVODESHIPS}
    region_options = "\n            ".join(
        f'<option value="{html.escape(v[0], quote=True)}">{html.escape(v[1])}</option>'
        for v in VOIVODESHIPS
    )
    categories = []
    for c in cameras:
        cat = str(c.get("category") or "").strip()
        if cat and cat not in categories:
            categories.append(cat)
    cat_chips = "\n          ".join(
        f'<button type="button" class="cam-cat-chip" data-cam-cat="{html.escape(cat, quote=True)}">{html.escape(cat.capitalize())}</button>'
        for cat in categories
    )

    cards_html = []
    for c in cameras:
        cid = str(c.get("id") or "")
        name = str(c.get("name") or "")
        scope = str(c.get("scope") or "polska")
        region = str(c.get("region") or "")
        country = str(c.get("country") or "")
        city = str(c.get("city") or "")
        category = str(c.get("category") or "")
        ctype = str(c.get("type") or "")
        source_name = str(c.get("source_name") or "")
        source_url = str(c.get("source_url") or "")
        status = str(c.get("status") or "online")
        is_offline = status == "offline"

        embed_url = ""
        thumb_html = ""
        monogram = html.escape(_camera_monogram(source_name or name))
        hue = sum(ord(ch) for ch in cid) % 360

        if ctype == "youtube_channel":
            ch_id = str(c.get("youtube_channel_id") or "").strip()
            embed_url = f"https://www.youtube-nocookie.com/embed/live_stream?channel={ch_id}"
            thumb_html = (
                f'<div class="cam-poster" style="--cam-h:{hue}">'
                f'<span class="cam-monogram" aria-hidden="true">{monogram}</span>'
                f'<span class="cam-poster-sub">{html.escape(city or source_name)}</span>'
                f"</div>"
            )
        elif ctype == "youtube_video":
            vid_id = str(c.get("youtube_video_id") or "").strip()
            embed_url = f"https://www.youtube-nocookie.com/embed/{vid_id}"
            poster_src = f"https://i.ytimg.com/vi/{html.escape(vid_id, quote=True)}/hqdefault.jpg"
            thumb_html = (
                f'<img class="cam-thumb-img" src="{poster_src}" '
                f'alt="{html.escape(name, quote=True)}" loading="lazy" decoding="async" />'
            )
        else:
            ext_url = str(c.get("external_url") or source_url).strip()
            thumb_html = (
                f'<div class="cam-poster cam-poster-ext" style="--cam-h:{hue}">'
                f'<span class="cam-monogram" aria-hidden="true">{monogram}</span>'
                f'<span class="cam-poster-sub">{html.escape(source_name)}</span>'
                f"</div>"
            )

        if is_offline:
            badge_html = '<span class="cam-live-badge is-offline">OFFLINE</span>'
            action_html = (
                f'<a class="cam-play cam-ext-link" href="{html.escape(source_url, quote=True)}" '
                f'target="_blank" rel="noopener nofollow" aria-label="Otwórz u źródła: {html.escape(name, quote=True)}">'
                '<span aria-hidden="true">↗</span> Otwórz u źródła</a>'
            )
        elif ctype == "external_link":
            ext_url = str(c.get("external_url") or source_url).strip()
            badge_html = '<span class="cam-live-badge is-external">ZEWN.</span>'
            action_html = (
                f'<a class="cam-play cam-ext-link" href="{html.escape(ext_url, quote=True)}" '
                f'target="_blank" rel="noopener nofollow" aria-label="Otwórz transmisję na stronie źródła: {html.escape(name, quote=True)}">'
                '<span aria-hidden="true">↗</span> Otwórz u źródła</a>'
            )
        else:
            badge_html = '<span class="cam-live-badge"><span class="cam-live-dot" aria-hidden="true"></span>LIVE</span>'
            action_html = (
                f'<button type="button" class="cam-play" '
                f'data-embed="{html.escape(embed_url, quote=True)}" '
                f'data-title="{html.escape(name, quote=True)}" '
                f'aria-label="Odtwórz kamerę na żywo: {html.escape(name, quote=True)}">'
                '<span class="cam-play-icon" aria-hidden="true">▶</span> Odtwórz na żywo</button>'
            )

        loc_parts = [p for p in [city, voiv_labels.get(region, ""), country if scope == "swiat" else ""] if p]
        loc_line = " · ".join(loc_parts)
        offline_cls = " is-offline" if is_offline else ""
        cards_html.append(
            f'<article class="cam-card{offline_cls}" '
            f'data-cam-id="{html.escape(cid, quote=True)}" '
            f'data-scope="{html.escape(scope, quote=True)}" '
            f'data-region="{html.escape(region, quote=True)}" '
            f'data-category="{html.escape(category, quote=True)}">'
            f'<div class="cam-media">'
            f'{thumb_html}'
            f'{badge_html}'
            f'{action_html}'
            f"</div>"
            f'<div class="cam-body">'
            f'<div class="cam-meta-row">'
            f'<span class="cam-loc">{html.escape(loc_line)}</span>'
            f'<span class="cam-cat-tag">{html.escape(category)}</span>'
            f"</div>"
            f'<h2 class="cam-title">{html.escape(name)}</h2>'
            f'<div class="cam-source">Źródło: <a href="{html.escape(source_url, quote=True)}" target="_blank" rel="noopener nofollow">{html.escape(source_name)}</a></div>'
            f"</div>"
            f"</article>"
        )

    pl_count = sum(1 for c in cameras if c.get("scope") == "polska")
    world_count = sum(1 for c in cameras if c.get("scope") == "swiat")
    grid_inner = "\n        ".join(cards_html) if cards_html else '<div class="empty-state"><p>Brak skonfigurowanych kamer.</p></div>'

    return f"""<div class="cameras-page">
      <a class="back-link" href="{home_href}" onclick="return selectPathLink(event, '/Polska')">← Wróć do wydania głównego VERITY</a>
      <div class="feed-heading">
        <div>
          <span class="feed-crumb">/kamery</span>
          <h1>Kamery na żywo — Polska i świat</h1>
        </div>
        <span id="camCountLabel">{len(cameras)} kamer ({pl_count} Polska · {world_count} Świat)</span>
      </div>
      <div class="cam-filters" role="region" aria-label="Filtrowanie kamer">
        <div class="cam-scope-group" role="group" aria-label="Zakres geograficzny">
          <button type="button" class="cam-scope-btn active" data-cam-scope="all">Wszystkie ({len(cameras)})</button>
          <button type="button" class="cam-scope-btn" data-cam-scope="polska">Polska ({pl_count})</button>
          <button type="button" class="cam-scope-btn" data-cam-scope="swiat">Świat ({world_count})</button>
        </div>
        <label class="cam-region-label">
          <span class="sr-only">Województwo</span>
          <select id="camRegionSelect" class="cam-region-select" aria-label="Filtruj według województwa">
            <option value="">Wszystkie województwa</option>
            {region_options}
          </select>
        </label>
        <div class="cam-cat-group" role="group" aria-label="Kategoria widoku">
          <button type="button" class="cam-cat-chip active" data-cam-cat="all">Wszystkie kategorie</button>
          {cat_chips}
        </div>
      </div>
      <div id="camGrid" class="cam-grid">
        {grid_inner}
      </div>
      <p class="cam-legal-note">Transmisje należą do ich nadawców; VERITY jedynie je osadza. Odtwarzacz ładuje się dopiero po kliknięciu, bez wcześniejszego przesyłania danych do zewnętrznych serwisów.</p>
    </div>"""


def _page_shell(
    *,
    title: str,
    description: str,
    canonical_url: str,
    og_type: str,
    og_image: str,
    json_ld_obj,
    rel_root: str,
    active_path: str,
    ssr_main_html: str,
    extra_meta_html: str = "",
    init_script_vars: str = "",
    robots_content: str = "index, follow, max-image-preview:large, max-snippet:-1",
    css_ver: str = "1",
    js_ver: str = "1",
    comm_ver: str = "1",
    section_rss_rel: str = "",
    section_rss_title: str = "",
    pending_count: int = 0,
    og_image_dims: tuple | None = None,
) -> str:
    safe_title = html.escape(title, quote=True)
    safe_desc = html.escape(description, quote=True)
    safe_can = html.escape(canonical_url, quote=True)
    safe_img = html.escape(og_image, quote=True) if og_image else ""
    og_dim_tags = (
        f'  <meta property="og:image:width" content="{int(og_image_dims[0])}" />\n'
        f'  <meta property="og:image:height" content="{int(og_image_dims[1])}" />\n'
        if safe_img and og_image_dims
        else ""
    )
    og_img_tags = (
        f'  <meta property="og:image" content="{safe_img}" />\n{og_dim_tags}  <meta name="twitter:image" content="{safe_img}" />\n'
        if safe_img
        else ""
    )
    tw_card = "summary_large_image" if safe_img else "summary"
    ld_json_str = json.dumps(json_ld_obj, ensure_ascii=False, indent=2).replace("</", "<\\/")
    nav_html = _render_nav_html(rel_root, active_path)
    sec_rss_tag = (
        f'\n  <link rel="alternate" type="application/rss+xml" title="{html.escape(section_rss_title or "VERITY RSS", quote=True)}" href="{html.escape(rel_root + section_rss_rel, quote=True)}" />'
        if section_rss_rel
        else ""
    )

    return f"""<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{safe_title}</title>
  <meta name="description" content="{safe_desc}" />
  <meta name="robots" content="{html.escape(robots_content, quote=True)}" />
  <meta name="theme-color" content="#151b28" />
  <link rel="icon" type="image/svg+xml" href="{html.escape(rel_root, quote=True)}icon.svg" />
  <link rel="apple-touch-icon" href="{html.escape(rel_root, quote=True)}icon-192.png" />
  <link rel="manifest" href="{html.escape(rel_root, quote=True)}manifest.webmanifest" />
  <link rel="canonical" href="{safe_can}" />
{extra_meta_html}
  <meta property="og:type" content="{html.escape(og_type, quote=True)}" />
  <meta property="og:locale" content="pl_PL" />
  <meta property="og:site_name" content="VERITY" />
  <meta property="og:title" content="{safe_title}" />
  <meta property="og:description" content="{safe_desc}" />
  <meta property="og:url" content="{safe_can}" />
{og_img_tags}  <meta name="twitter:card" content="{tw_card}" />
  <meta name="twitter:title" content="{safe_title}" />
  <meta name="twitter:description" content="{safe_desc}" />

  <script id="dynamicJsonLd" type="application/ld+json">
{ld_json_str}
  </script>

  <link rel="alternate" type="application/rss+xml" title="VERITY RSS" href="{html.escape(rel_root, quote=True)}feed.xml" />{sec_rss_tag}
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,500;0,6..72,600;0,6..72,700;1,6..72,600&display=swap" />
  <link rel="stylesheet" href="{html.escape(rel_root, quote=True)}styles.css?v={html.escape(css_ver, quote=True)}" />
</head>
<body>
  <div id="readingProgress" class="reading-progress" aria-hidden="true"></div>

  <div class="top-utility">
    <div class="container top-utility-inner">
      <div class="top-utility-meta">
        <span id="todayDateLabel" class="top-date">Wydanie bieżące</span>
        <span class="top-sep top-hide-sm" aria-hidden="true"></span>
        <span class="top-hide-sm">Weryfikacja z 151 redakcji</span>
        <span class="top-sep top-hide-sm" aria-hidden="true"></span>
        <span class="top-hide-sm">16 województw · Filtr anty-clickbait</span>
      </div>
      <div class="top-utility-actions">
        <button id="liveChatBtn" class="queue-btn chat-toggle-btn" type="button" onclick="window.VERITY_COMMUNITY?.toggleChat()">
          <span class="chat-live-dot" aria-hidden="true"></span><span class="btn-label-full">Czat live</span><span class="btn-label-short">Czat</span>
        </button>
        <button id="authAccountBtn" class="queue-btn auth-pill-btn" type="button" onclick="window.VERITY_COMMUNITY?.openAuthModal()">
          Konto
        </button>
        <button class="queue-btn" onclick="switchView(currentView === 'public' ? 'editorial' : 'public')">
          <span class="btn-label-full">Kolejka redakcyjna</span><span class="btn-label-short">Kolejka</span> <span id="pendingBadge" class="queue-count">{int(pending_count)}</span>
        </button>
      </div>
    </div>
  </div>

  <header class="site-header">
    <div class="container">
      <div class="header-main">
        <a class="brand" href="{html.escape(rel_root or './', quote=True)}" onclick="return selectPathLink(event, '/Polska')">
          <div class="brand-mark">V</div>
          <div>
            <div class="brand-title">VERITY</div>
            <div class="brand-subtitle">Wieloźródłowa weryfikacja i synteza informacji</div>
          </div>
        </a>

        <div class="header-controls">
          <div class="search-box">
            <input
              id="searchInput"
              type="search"
              class="search-input"
              oninput="handleSearchInput()"
              aria-label="Wyszukaj artykuły"
            />
            <button id="clearSearchBtn" class="search-clear hidden" onclick="clearSearch()" title="Wyczyść">✕</button>
          </div>

          <div class="theme-switcher" role="group" aria-label="Wybór motywu kolorystycznego">
            <button id="themeBtn_auto" class="theme-btn active" onclick="applyTheme('auto')" title="Automatycznie dopasuj do motywu urządzenia">Auto</button>
            <button id="themeBtn_light" class="theme-btn" onclick="applyTheme('light')" title="Motyw jasny">Jasny</button>
            <button id="themeBtn_dark" class="theme-btn" onclick="applyTheme('dark')" title="Motyw ciemny">Ciemny</button>
          </div>
        </div>
      </div>

      <nav class="path-nav" aria-label="Kategorie tematyczne">
        {nav_html}
      </nav>
      {_render_regions_drawer_html(rel_root, active_path)}
    </div>
  </header>

  <main class="container main-content">
    <section id="viewPublic">
      <div id="articlesFeed" class="articles-stack">
        {ssr_main_html}
      </div>
    </section>

    <section id="viewEditorial" class="hidden">
      <div class="editorial-head">
        <div>
          <h1>Kolejka Weryfikacji Redakcyjnej</h1>
          <p>
            Artykuły wymagające zatwierdzenia z uwagi na rozbieżność między komunikatem instytucji rządowej a twardymi danymi NBP / GUS / NIK oraz zgłoszenia korekt od czytelników.
          </p>
        </div>
        <button class="btn-outline" onclick="switchView('public')">← Wróć do widoku portalu</button>
      </div>
      <div id="editorialQueue" class="articles-stack"></div>
    </section>
  </main>

  <footer class="site-footer">
    <div class="container footer-inner">
      <div class="footer-brand">
        <strong>VERITY</strong>
        <p>Wieloźródłowa weryfikacja faktów z 151 redakcji w Polsce — bez clickbaitu, powtórzeń i opinii publicystycznych, z bezpośrednimi odnośnikami do oryginalnych publikacji.</p>
      </div>
      <div class="footer-links">
        <a href="{html.escape(rel_root, quote=True)}kamery/" onclick="return fixFileHref(event)">Kamery na żywo (/kamery)</a>
        <a href="{html.escape(rel_root, quote=True)}moderacja/" onclick="return fixFileHref(event)">Rejestr moderacji (/moderacja)</a>
        <a href="{html.escape(rel_root, quote=True)}news-sitemap.xml">Mapa Google News (XML)</a>
        <a href="{html.escape(rel_root, quote=True)}sitemap.xml">Sitemap (XML)</a>
        <a href="{html.escape(rel_root, quote=True)}feed.xml">Kanał RSS</a>
        <a href="{html.escape(rel_root, quote=True)}robots.txt">robots.txt</a>
        <a href="{html.escape(rel_root, quote=True)}articles.json">Dane (JSON)</a>
      </div>
    </div>
  </footer>

  <script>{init_script_vars}</script>
  <script src="{html.escape(rel_root, quote=True)}app.js?v={html.escape(js_ver, quote=True)}"></script>
  <script src="{html.escape(rel_root, quote=True)}community.js?v={html.escape(comm_ver, quote=True)}" defer></script>
  {f'<script src="{html.escape(rel_root, quote=True)}cameras.js?v={html.escape(_asset_hash(os.path.join(os.path.dirname(os.path.abspath(__file__)), "cameras.js")), quote=True)}" defer></script>' if active_path == "/kamery" else ""}
</body>
</html>
"""


def _write_file(path: str, content: str):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def _asset_hash(path: str) -> str:
    try:
        with open(path, "rb") as f:
            return hashlib.sha1(f.read()).hexdigest()[:8]
    except Exception:
        return "1"


MAIN_RSS_SECTIONS = (
    ("/Polska", "Polska"),
    ("/Polska/Gospodarka", "Gospodarka i rynek"),
    ("/Polska/Polityka", "Polityka i prawo"),
    ("/Polska/Energetyka", "Energetyka i klimat"),
    ("/Polska/Regiony", "Regiony Polski (16 województw)"),
    ("/Swiat", "Świat i geopolityka"),
    ("/Sport", "Sport"),
)
MAIN_RSS_SECTION_MAP = dict(MAIN_RSS_SECTIONS)


def _iso_to_rfc2822(iso_str: str) -> str:
    raw = (iso_str or "").strip()
    if not raw:
        return ""
    try:
        dt = datetime.fromisoformat(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone(timedelta(hours=1)))
        return format_datetime(dt)
    except Exception:
        return ""


def _section_rss_for_path(cat_path: str) -> tuple:
    p = LEGACY_REGION_MAP.get(cat_path or "", cat_path or "/Polska")
    if p in MAIN_RSS_SECTION_MAP:
        return f"{p.strip('/')}/feed.xml", f"VERITY — {MAIN_RSS_SECTION_MAP[p]} (RSS)"
    if p.startswith("/Polska/Regiony/"):
        return "Polska/Regiony/feed.xml", f"VERITY — {MAIN_RSS_SECTION_MAP['/Polska/Regiony']} (RSS)"
    if p.startswith("/Polska/"):
        return "Polska/feed.xml", f"VERITY — {MAIN_RSS_SECTION_MAP['/Polska']} (RSS)"
    return "", ""


def build_articles_index(articles: list) -> list:
    """Buduje lekki indeks artykułów (bez full_sections i perspectives) do szybkiego startu SPA."""
    index_items = []
    for a in articles or []:
        item = {
            "id": a.get("id"),
            "path": a.get("path") or "/Polska",
            "seo_url": a.get("seo_url") or "",
            "seo_title": a.get("seo_title") or "",
            "summary_lead": a.get("summary_lead") or article_lede(a, 240),
            "meta_description": a.get("meta_description") or "",
            "keywords": a.get("keywords") or "",
            "thumbnail_url": a.get("thumbnail_url") or "",
            "published_iso": a.get("published_iso") or "",
            "updated_iso": a.get("updated_iso") or a.get("published_iso") or "",
            "display_date": a.get("display_date") or "",
            "status": a.get("status") or "AUTO_PUBLISHED",
            "fact_agreement_pct": a.get("fact_agreement_pct"),
            "metrics": (a.get("metrics") or [])[:3],
            "sources": a.get("sources") or [],
            "declickbait": a.get("declickbait") or [],
            "reading_minutes": reading_minutes(a),
        }
        if a.get("admin_note"):
            item["admin_note"] = a["admin_note"]
        if a.get("zero_trust_reason"):
            item["zero_trust_reason"] = a["zero_trust_reason"]
        if a.get("corrections"):
            item["corrections"] = a["corrections"]
        index_items.append(item)
    return index_items


def _build_rss_xml(title: str, page_link: str, self_url: str, description: str, items: list, site_base_url: str) -> str:
    rss_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
        "  <channel>",
        f"    <title>{xml.sax.saxutils.escape(title)}</title>",
        f"    <link>{xml.sax.saxutils.escape(page_link)}</link>",
        f'    <atom:link href="{xml.sax.saxutils.escape(self_url)}" rel="self" type="application/rss+xml" />',
        f"    <description>{xml.sax.saxutils.escape(description)}</description>",
        "    <language>pl</language>",
    ]
    for a in items[:30]:
        link_esc = xml.sax.saxutils.escape(f"{site_base_url}{a['seo_url']}/")
        desc = a.get("meta_description") or article_lede(a, 200)
        pub_rfc = _iso_to_rfc2822(a.get("published_iso") or "")
        rss_lines.extend([
            "    <item>",
            f"      <title>{xml.sax.saxutils.escape(a['seo_title'])}</title>",
            f"      <link>{link_esc}</link>",
            f'      <guid isPermaLink="true">{link_esc}</guid>',
            f"      <category>{xml.sax.saxutils.escape(short_cat_label(a.get('path','/Polska')))}</category>",
            *(["      <pubDate>" + xml.sax.saxutils.escape(pub_rfc) + "</pubDate>"] if pub_rfc else []),
            f"      <description>{xml.sax.saxutils.escape(desc)}</description>",
            "    </item>",
        ])
    rss_lines.extend(["  </channel>", "</rss>\n"])
    return "\n".join(rss_lines)


def build_all_seo_artifacts(base_dir: str, articles: list, site_base_url: str = None):
    if not site_base_url:
        site_base_url = detect_site_base_url(base_dir)
    site_base_url = site_base_url.rstrip("/")
    css_ver = _asset_hash(os.path.join(base_dir, "styles.css"))
    js_ver = _asset_hash(os.path.join(base_dir, "app.js"))
    comm_ver = _asset_hash(os.path.join(base_dir, "community.js"))

    published = _sort_articles_for_feed(
        [a for a in articles if a.get("status", "AUTO_PUBLISHED") == "AUTO_PUBLISHED"]
    )
    all_sorted = _sort_articles_for_feed(list(articles or []))
    pending_arts_cnt = sum(1 for a in articles if a.get("status") == "PENDING_ADMIN")
    pending_corrs_cnt = 0
    ed_state_path = os.path.join(base_dir, "editorial_state.json")
    if os.path.isfile(ed_state_path):
        try:
            with open(ed_state_path, "r", encoding="utf-8") as ef:
                ed_state = json.load(ef)
            if isinstance(ed_state, dict) and isinstance(ed_state.get("reader_corrections"), list):
                pending_corrs_cnt = sum(
                    1
                    for c in ed_state["reader_corrections"]
                    if isinstance(c, dict) and c.get("status") == "PENDING_ADMIN_REVIEW"
                )
        except Exception:
            pass
    pending_badge_total = pending_arts_cnt + pending_corrs_cnt

    # 1. Bezpieczne oczyszczenie poprzednich statycznych folderów kategorii/artykułów
    for top_dir in ("Polska", "Swiat", "Sport"):
        full = os.path.join(base_dir, top_dir)
        if os.path.isdir(full):
            shutil.rmtree(full)

    # 1a. Automatyczne karty graficzne OG 1200x630 PNG dla artykułów bez zdjęcia z RSS + usunięcie nieaktualnych kart
    og_dir = os.path.join(base_dir, "og")
    os.makedirs(og_dir, exist_ok=True)
    valid_og_files = set()
    generated_og_cnt = 0
    for art in all_sorted:
        if not (art.get("thumbnail_url") or "").strip() and art.get("id"):
            fname = f"{art['id']}.png"
            valid_og_files.add(fname)
            if generate_og_card_png(art, os.path.join(og_dir, fname)):
                generated_og_cnt += 1
    for existing_f in os.listdir(og_dir):
        if existing_f.endswith(".png") and existing_f not in valid_og_files:
            try:
                os.remove(os.path.join(og_dir, existing_f))
            except OSError:
                pass

    # 1b. Lekki indeks articles-index.json do szybkiego startu SPA i odroczonego ładowania treści
    index_items = build_articles_index(articles)
    with open(os.path.join(base_dir, "articles-index.json"), "w", encoding="utf-8") as f:
        json.dump(index_items, f, ensure_ascii=False, separators=(",", ":"))

    # 2. Główny index.html (z wstępnie wyrenderowaną listą najnowszych artykułów dla botów i natychmiastowego LCP)
    home_ld = [
        {
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "VERITY",
            "url": f"{site_base_url}/",
            "description": "Wieloźródłowa weryfikacja i synteza informacji z 151 redakcji w Polsce.",
        },
        {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": idx, "name": label, "item": f"{site_base_url}{p}/"}
                for idx, (p, label, _) in enumerate(
                    [c for c in CATEGORIES if c[0] in {"/Polska", "/Polska/Gospodarka", "/Polska/Polityka", "/Polska/Energetyka", "/Polska/Regiony", "/Swiat", "/Sport"}],
                    start=1,
                )
            ],
        },
        {
            "@context": "https://schema.org",
            "@type": "ItemList",
            "name": "Najnowsze zweryfikowane opracowania — VERITY",
            "itemListElement": [
                {
                    "@type": "ListItem",
                    "position": idx,
                    "url": f"{site_base_url}{a['seo_url']}/",
                    "name": a["seo_title"],
                }
                for idx, a in enumerate([x for x in published if (x.get("path") or "").startswith("/Polska")][:15], start=1)
            ],
        },
    ]
    first_thumb = next((a.get("thumbnail_url") for a in published if a.get("thumbnail_url")), "")
    first_thumb_dims = None
    if not first_thumb and published:
        first_thumb, first_thumb_dims = _article_og_image_info(published[0], site_base_url)
    home_html = _page_shell(
        title="VERITY – Wieloźródłowa Weryfikacja i Synteza Informacji",
        description="Wieloźródłowa weryfikacja i synteza informacji z 151 redakcji ogólnopolskich, regionalnych (16 województw) i branżowych. Pełna treść faktograficzna, zero clickbaitu, bezpośrednie linki do źródeł.",
        canonical_url=f"{site_base_url}/",
        og_type="website",
        og_image=first_thumb,
        og_image_dims=first_thumb_dims,
        json_ld_obj=home_ld,
        rel_root="",
        active_path="/Polska",
        ssr_main_html=render_feed_ssr(published, "/Polska", ""),
        init_script_vars=f'window.VERITY_BASE="";window.VERITY_CANONICAL_ORIGIN={json.dumps(site_base_url)};',
        css_ver=css_ver,
        js_ver=js_ver,
        comm_ver=comm_ver,
        section_rss_rel="Polska/feed.xml",
        section_rss_title="VERITY — Polska (RSS)",
        pending_count=pending_badge_total,
    )
    with open(os.path.join(base_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(home_html)

    # 3. Strony kategorii (/Polska/, /Polska/Gospodarka/, /Swiat/, /Sport/ itp.)
    for cat_path, cat_title, cat_desc in CATEGORIES:
        rel_dir = cat_path.strip("/")
        depth = len([p for p in rel_dir.split("/") if p])
        rel_root = "../" * depth
        cat_arts = [a for a in published if (a.get("path") or "").startswith(cat_path)]
        cat_thumb = next((a.get("thumbnail_url") for a in cat_arts if a.get("thumbnail_url")), "")
        cat_thumb_dims = None
        if not cat_thumb and cat_arts:
            cat_thumb, cat_thumb_dims = _article_og_image_info(cat_arts[0], site_base_url)
        elif not cat_thumb:
            cat_thumb, cat_thumb_dims = first_thumb, first_thumb_dims
        cat_ld = [
            {
                "@context": "https://schema.org",
                "@type": "CollectionPage",
                "name": f"{cat_title} — VERITY",
                "description": cat_desc,
                "url": f"{site_base_url}{cat_path}/",
                "inLanguage": "pl",
            },
            {
                "@context": "https://schema.org",
                "@type": "ItemList",
                "itemListElement": [
                    {
                        "@type": "ListItem",
                        "position": idx,
                        "url": f"{site_base_url}{a['seo_url']}/",
                        "name": a["seo_title"],
                    }
                    for idx, a in enumerate(cat_arts[:15], start=1)
                ],
            },
        ]
        sec_rss_rel, sec_rss_title = _section_rss_for_path(cat_path)
        cat_html = _page_shell(
            title=f"{cat_title} — VERITY",
            description=cat_desc,
            canonical_url=f"{site_base_url}{cat_path}/",
            og_type="website",
            og_image=cat_thumb,
            og_image_dims=cat_thumb_dims,
            json_ld_obj=cat_ld,
            rel_root=rel_root,
            active_path=cat_path,
            ssr_main_html=render_feed_ssr(published, cat_path, rel_root),
            init_script_vars=f'window.VERITY_BASE={json.dumps(rel_root)};window.VERITY_INITIAL_PATH={json.dumps(cat_path)};window.VERITY_CANONICAL_ORIGIN={json.dumps(site_base_url)};',
            css_ver=css_ver,
            js_ver=js_ver,
            comm_ver=comm_ver,
            section_rss_rel=sec_rss_rel,
            section_rss_title=sec_rss_title,
            pending_count=pending_badge_total,
        )
        _write_file(os.path.join(base_dir, rel_dir, "index.html"), cat_html)

    # 3b. Strona Publicznego Rejestru Moderacji (/moderacja/)
    mod_html = _page_shell(
        title="Publiczny Rejestr Moderacji i Taryfikator (§1.1–§2.3) — VERITY",
        description="Jawny rejestr moderacji VERITY. Zero kar za poglądy polityczne — usuwamy wyłącznie spam, rajdy multikont i wulgarne wyzwiska według taryfikatora.",
        canonical_url=f"{site_base_url}/moderacja/",
        og_type="website",
        og_image=first_thumb,
        og_image_dims=first_thumb_dims,
        json_ld_obj={"@context": "https://schema.org", "@type": "WebPage", "name": "Publiczny Rejestr Moderacji — VERITY", "url": f"{site_base_url}/moderacja/"},
        rel_root="../",
        active_path="/Polska",
        ssr_main_html=_render_moderation_ssr("../"),
        init_script_vars=f'window.VERITY_IS_MODERATION=true;window.VERITY_BASE="../";window.VERITY_CANONICAL_ORIGIN={json.dumps(site_base_url)};',
        css_ver=css_ver,
        js_ver=js_ver,
        comm_ver=comm_ver,
        pending_count=pending_badge_total,
    )
    _write_file(os.path.join(base_dir, "moderacja", "index.html"), mod_html)

    # 3c. Strona Kamer Online (/kamery/)
    cameras_list = _load_cameras(base_dir)
    cam_ld_items = []
    for idx, cam in enumerate(cameras_list, start=1):
        ctype = cam.get("type")
        if ctype in ("youtube_channel", "youtube_video"):
            embed_u = (
                f"https://www.youtube-nocookie.com/embed/live_stream?channel={cam.get('youtube_channel_id')}"
                if ctype == "youtube_channel"
                else f"https://www.youtube-nocookie.com/embed/{cam.get('youtube_video_id')}"
            )
            cam_ld_items.append({
                "@type": "ListItem",
                "position": idx,
                "item": {
                    "@type": "VideoObject",
                    "name": cam.get("name"),
                    "embedUrl": embed_u,
                    "publication": {
                        "@type": "BroadcastEvent",
                        "isLiveBroadcast": True,
                    },
                },
            })
    cam_json_ld = {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": "Kamery na żywo — Polska i świat — VERITY",
        "url": f"{site_base_url}/kamery/",
        "mainEntity": {
            "@type": "ItemList",
            "itemListElement": cam_ld_items,
        },
    }
    cam_html = _page_shell(
        title="Kamery na żywo — Polska i świat — VERITY",
        description="Kamery online na żywo z Polski i ze świata: góry, Bałtyk, polskie miasta oraz wybrane transmisje globalne.",
        canonical_url=f"{site_base_url}/kamery/",
        og_type="website",
        og_image=first_thumb,
        og_image_dims=first_thumb_dims,
        json_ld_obj=cam_json_ld,
        rel_root="../",
        active_path="/kamery",
        ssr_main_html=_render_cameras_ssr("../", cameras_list),
        init_script_vars=f'window.VERITY_IS_CAMERAS=true;window.VERITY_BASE="../";window.VERITY_CANONICAL_ORIGIN={json.dumps(site_base_url)};',
        css_ver=css_ver,
        js_ver=js_ver,
        comm_ver=comm_ver,
        pending_count=pending_badge_total,
    )
    _write_file(os.path.join(base_dir, "kamery", "index.html"), cam_html)

    # 4. Strony pojedynczych artykułów (prawdziwy HTTP 200 OK dla każdego artykułu, z noindex dla PENDING_ADMIN)
    written_urls = set()
    for art in all_sorted:
        seo_url = (art.get("seo_url") or "").strip("/")
        if not seo_url or seo_url in written_urls:
            continue
        written_urls.add(seo_url)
        parts = [p for p in seo_url.split("/") if p]
        rel_root = "../" * len(parts)
        cat_path = art.get("path") or "/Polska"
        meta_desc = art.get("meta_description") or article_lede(art, 158)
        mod_iso = art.get("updated_iso") or art.get("published_iso") or ""
        extra_meta = (
            f'  <meta property="article:published_time" content="{html.escape(art.get("published_iso") or "", quote=True)}" />\n'
            f'  <meta property="article:modified_time" content="{html.escape(mod_iso, quote=True)}" />\n'
            f'  <meta property="article:section" content="{html.escape(short_cat_label(cat_path), quote=True)}" />\n'
        )
        if art.get("keywords"):
            extra_meta += f'  <meta name="news_keywords" content="{html.escape(art["keywords"], quote=True)}" />\n'

        sec_rss_rel, sec_rss_title = _section_rss_for_path(cat_path)
        art_robots = (
            "noindex, follow"
            if art.get("status") == "PENDING_ADMIN"
            else "index, follow, max-image-preview:large, max-snippet:-1"
        )
        art_og_img, art_og_dims = _article_og_image_info(art, site_base_url)
        art_html = _page_shell(
            title=f"{art['seo_title']} — VERITY",
            description=meta_desc,
            canonical_url=f"{site_base_url}/{seo_url}/",
            og_type="article",
            og_image=art_og_img,
            og_image_dims=art_og_dims,
            json_ld_obj=_build_news_article_jsonld(art, site_base_url),
            rel_root=rel_root,
            active_path=cat_path if any(c[0] == cat_path for c in CATEGORIES) else "/Polska",
            ssr_main_html=_render_article_body_ssr(art, published, rel_root, site_base_url),
            extra_meta_html=extra_meta,
            init_script_vars=(
                f'window.VERITY_BASE={json.dumps(rel_root)};'
                f'window.VERITY_INITIAL_ARTICLE_URL={json.dumps("/" + seo_url)};'
                f'window.VERITY_CANONICAL_ORIGIN={json.dumps(site_base_url)};'
            ),
            robots_content=art_robots,
            css_ver=css_ver,
            js_ver=js_ver,
            comm_ver=comm_ver,
            section_rss_rel=sec_rss_rel,
            section_rss_title=sec_rss_title,
            pending_count=pending_badge_total,
        )
        _write_file(os.path.join(base_dir, seo_url, "index.html"), art_html)

    # 5. Strona 404.html (obsługuje też miękkie przekierowania SPA dla zmienionych URL-i)
    parsed_base = urlparse(site_base_url)
    root_abs_prefix = (parsed_base.path.rstrip("/") + "/") if parsed_base.path.strip("/") else "/"
    not_found_html = _page_shell(
        title="Strona nie została znaleziona — VERITY",
        description="Wybrany adres nie istnieje lub został przeniony. Skorzystaj z wyszukiwarki VERITY lub wróć do najnowszych wiadomości.",
        canonical_url=f"{site_base_url}/",
        og_type="website",
        og_image="",
        json_ld_obj={"@context": "https://schema.org", "@type": "WebPage", "name": "404 — VERITY"},
        rel_root=root_abs_prefix,
        active_path="/Polska",
        ssr_main_html='<div class="empty-state"><h2>Nie znaleziono strony (404)</h2><p style="margin-top:0.5rem">Sprawdź adres lub wróć na stronę główną portalu VERITY.</p></div>',
        init_script_vars=f'window.VERITY_IS_404=true;window.VERITY_BASE={json.dumps(root_abs_prefix)};window.VERITY_CANONICAL_ORIGIN={json.dumps(site_base_url)};',
        robots_content="noindex, follow",
        css_ver=css_ver,
        js_ver=js_ver,
        comm_ver=comm_ver,
        pending_count=pending_badge_total,
    )
    with open(os.path.join(base_dir, "404.html"), "w", encoding="utf-8") as f:
        f.write(not_found_html)

    # 6. news-sitemap.xml (standard Google News: ostatnie 48h, max 1000 URL-i + <image:image>)
    now_dt = datetime.now(timezone.utc)
    now_fallback_iso = now_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    recent_arts = []
    for a in published:
        iso_s = (a.get("published_iso") or "").strip()
        try:
            dt = datetime.fromisoformat(iso_s)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone(timedelta(hours=1)))
            if (now_dt - dt.astimezone(timezone.utc)) <= timedelta(hours=48):
                recent_arts.append(a)
        except Exception:
            recent_arts.append(a)
    if not recent_arts:
        recent_arts = published[:50]

    news_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
        '        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"',
        '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ]
    for a in recent_arts[:1000]:
        loc = xml.sax.saxutils.escape(f"{site_base_url}{a['seo_url']}/")
        title_xml = xml.sax.saxutils.escape((a["seo_title"] or "")[:110])
        news_lines.extend([
            "  <url>",
            f"    <loc>{loc}</loc>",
            "    <news:news>",
            "      <news:publication>",
            "        <news:name>VERITY</news:name>",
            "        <news:language>pl</news:language>",
            "      </news:publication>",
            f"      <news:publication_date>{xml.sax.saxutils.escape(a['published_iso'])}</news:publication_date>",
            f"      <news:title>{title_xml}</news:title>",
            "    </news:news>",
        ])
        og_img_url, _ = _article_og_image_info(a, site_base_url)
        if og_img_url:
            img_loc = xml.sax.saxutils.escape(og_img_url)
            news_lines.extend([
                "    <image:image>",
                f"      <image:loc>{img_loc}</image:loc>",
                f"      <image:title>{title_xml}</image:title>",
                "    </image:image>",
            ])
        news_lines.append("  </url>")
    news_lines.append("</urlset>\n")
    with open(os.path.join(base_dir, "news-sitemap.xml"), "w", encoding="utf-8") as f:
        f.write("\n".join(news_lines))

    # 7. Pełna mapa witryny sitemap.xml (rzeczywisty updated_iso dla artykułów i deterministyczny lastmod dla działów)
    root_lastmod = max(
        ((a.get("updated_iso") or a.get("published_iso") or "") for a in published),
        default="",
    ) or now_fallback_iso
    sitemap_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
        '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
        "  <url>",
        f"    <loc>{xml.sax.saxutils.escape(site_base_url + '/')}</loc>",
        f"    <lastmod>{xml.sax.saxutils.escape(root_lastmod)}</lastmod>",
        "    <changefreq>hourly</changefreq>",
        "    <priority>1.0</priority>",
        "  </url>",
        "  <url>",
        f"    <loc>{xml.sax.saxutils.escape(site_base_url + '/moderacja/')}</loc>",
        f"    <lastmod>{xml.sax.saxutils.escape(root_lastmod)}</lastmod>",
        "    <changefreq>daily</changefreq>",
        "    <priority>0.6</priority>",
        "  </url>",
        "  <url>",
        f"    <loc>{xml.sax.saxutils.escape(site_base_url + '/kamery/')}</loc>",
        f"    <lastmod>{xml.sax.saxutils.escape(root_lastmod)}</lastmod>",
        "    <changefreq>daily</changefreq>",
        "    <priority>0.7</priority>",
        "  </url>",
    ]
    for cat_path, _, _ in CATEGORIES:
        cat_lastmod = max(
            (
                (a.get("updated_iso") or a.get("published_iso") or "")
                for a in published
                if (a.get("path") or "").startswith(cat_path)
            ),
            default="",
        ) or root_lastmod
        sitemap_lines.extend([
            "  <url>",
            f"    <loc>{xml.sax.saxutils.escape(f'{site_base_url}{cat_path}/')}</loc>",
            f"    <lastmod>{xml.sax.saxutils.escape(cat_lastmod)}</lastmod>",
            "    <changefreq>hourly</changefreq>",
            "    <priority>0.9</priority>",
            "  </url>",
        ])
    for a in published:
        loc = xml.sax.saxutils.escape(f"{site_base_url}{a['seo_url']}/")
        art_lastmod = a.get("updated_iso") or a.get("published_iso") or root_lastmod
        sitemap_lines.extend([
            "  <url>",
            f"    <loc>{loc}</loc>",
            f"    <lastmod>{xml.sax.saxutils.escape(art_lastmod)}</lastmod>",
            "    <changefreq>daily</changefreq>",
            "    <priority>0.8</priority>",
        ])
        og_img_url, _ = _article_og_image_info(a, site_base_url)
        if og_img_url:
            sitemap_lines.extend([
                "    <image:image>",
                f"      <image:loc>{xml.sax.saxutils.escape(og_img_url)}</image:loc>",
                "    </image:image>",
            ])
        sitemap_lines.append("  </url>")
    sitemap_lines.append("</urlset>\n")
    with open(os.path.join(base_dir, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write("\n".join(sitemap_lines))

    # 8. Kanał RSS feed.xml (główny) oraz dedykowane kanały RSS głównych działów
    root_rss = _build_rss_xml(
        title="VERITY – Wieloźródłowa Weryfikacja Faktów",
        page_link=f"{site_base_url}/",
        self_url=f"{site_base_url}/feed.xml",
        description="Synteza faktograficzna z 151 redakcji w Polsce bez clickbaitu i powtórzeń.",
        items=published,
        site_base_url=site_base_url,
    )
    with open(os.path.join(base_dir, "feed.xml"), "w", encoding="utf-8") as f:
        f.write(root_rss)

    cat_desc_map = {p: d for p, _, d in CATEGORIES}
    for sec_path, sec_label in MAIN_RSS_SECTIONS:
        sec_items = [a for a in published if (a.get("path") or "").startswith(sec_path)]
        sec_rel = sec_path.strip("/")
        sec_rss = _build_rss_xml(
            title=f"VERITY – {sec_label}",
            page_link=f"{site_base_url}{sec_path}/",
            self_url=f"{site_base_url}{sec_path}/feed.xml",
            description=cat_desc_map.get(sec_path) or "Zweryfikowane informacje działu w portalu VERITY.",
            items=sec_items,
            site_base_url=site_base_url,
        )
        _write_file(os.path.join(base_dir, sec_rel, "feed.xml"), sec_rss)

    # 9. robots.txt oraz plik weryfikacyjny IndexNow (<key>.txt)
    robots_txt = (
        "User-agent: *\n"
        "Allow: /\n\n"
        f"Sitemap: {site_base_url}/sitemap.xml\n"
        f"Sitemap: {site_base_url}/news-sitemap.xml\n"
    )
    with open(os.path.join(base_dir, "robots.txt"), "w", encoding="utf-8") as f:
        f.write(robots_txt)

    inow_key = get_indexnow_key()
    with open(os.path.join(base_dir, f"{inow_key}.txt"), "w", encoding="utf-8") as f:
        f.write(f"{inow_key}\n")

    print(
        f"[SEO] Wygenerowano strony HTML ({len(written_urls)} artykułów + {len(CATEGORIES)} działów), "
        f"karty OG ({generated_og_cnt} PNG 1200x630), IndexNow ({inow_key}.txt), "
        f"articles-index.json, sitemap.xml, news-sitemap.xml, feed.xml (+{len(MAIN_RSS_SECTIONS)} działowych RSS), robots.txt, 404.html"
    )


def build_indexnow_payload(site_base_url: str, urls: list, key: str | None = None) -> dict:
    base = (site_base_url or "https://hygrisxx.github.io/verity-").strip().rstrip("/")
    parsed = urlparse(base)
    host = parsed.netloc
    chosen_key = (key or get_indexnow_key()).strip()
    clean_urls = []
    seen = set()
    for u in urls or []:
        s = str(u or "").strip()
        if s and s.startswith(("http://", "https://")) and s not in seen:
            seen.add(s)
            clean_urls.append(s)
    return {
        "host": host,
        "key": chosen_key,
        "keyLocation": f"{base}/{chosen_key}.txt",
        "urlList": clean_urls,
    }


def submit_indexnow_urls(
    base_dir: str,
    articles: list | None = None,
    site_base_url: str | None = None,
    key: str | None = None,
    endpoint: str = "https://api.indexnow.org/indexnow",
    max_urls: int = 100,
    timeout: int = 12,
) -> tuple:
    base = (site_base_url or detect_site_base_url(base_dir)).strip().rstrip("/")
    if articles is None:
        arts_path = os.path.join(base_dir, "articles.json")
        if not os.path.isfile(arts_path):
            return False, "Brak pliku articles.json"
        try:
            with open(arts_path, "r", encoding="utf-8") as f:
                articles = json.load(f)
        except Exception as e:
            return False, f"Błąd odczytu articles.json: {e}"

    published = sorted(
        [a for a in (articles or []) if (a.get("status") or "AUTO_PUBLISHED") == "AUTO_PUBLISHED" and a.get("seo_url")],
        key=lambda a: a.get("updated_iso") or a.get("published_iso") or "",
        reverse=True,
    )
    urls = [f"{base}/", f"{base}/Polska/"]
    for a in published:
        if len(urls) >= max_urls:
            break
        seo_u = "/" + str(a["seo_url"]).strip("/")
        urls.append(f"{base}{seo_u}/")

    payload = build_indexnow_payload(base, urls, key=key)
    if not payload["host"] or not payload["urlList"]:
        return False, "Brak poprawnego hosta lub listy URL dla IndexNow"

    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=raw,
        method="POST",
        headers={"Content-Type": "application/json; charset=utf-8"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status = getattr(resp, "status", 200)
            msg = f"IndexNow HTTP {status}: wysłano {len(payload['urlList'])} URL ({payload['host']})"
            print(f"[SEO] {msg}")
            return 200 <= int(status) < 300, msg
    except urllib.error.HTTPError as he:
        msg = f"IndexNow HTTP {he.code}: {he.reason}"
        print(f"[WARN] {msg}")
        return False, msg
    except (urllib.error.URLError, OSError, TimeoutError) as e:
        msg = f"IndexNow niedostępne: {e}"
        print(f"[WARN] {msg}")
        return False, msg

