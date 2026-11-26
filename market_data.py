#!/usr/bin/env python3
"""
VERITY — Moduł danych rynkowych i pogodowych (100% otwarte / publiczne API).

Pobiera i zapisuje w `market_data.json`:
- Kursy walut z NBP API (Tabela A — dane publiczne, w tym EUR, USD, CHF, GBP, NOK, SEK, CZK, JPY).
- Indeksy giełdowe, spółki GPW i surowce (Yahoo Finance v8 chart API, z bezpiecznym cache/fallbackiem).
- Kryptowaluty BTC / ETH (CoinGecko API).
- Pogodę dla 16 stolic województw z IMGW-PIB (danepubliczne.imgw.pl — dane publiczne) oraz Oslo (Open-Meteo, CC BY 4.0).

Uruchomienie:
    python3 market_data.py
"""

from __future__ import annotations

import concurrent.futures
import datetime as dt
import json
import os
import urllib.error
import urllib.parse
import urllib.request

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
MARKET_DATA_FILE = os.path.join(ROOT_DIR, "market_data.json")
USER_AGENT = "Mozilla/5.0 (compatible; VERITY-MarketData/1.0)"

NBP_CODES = ("EUR", "USD", "CHF", "GBP", "NOK", "SEK", "CZK", "JPY")

YAHOO_SYMBOLS = {
    "indices": [
        {"symbol": "WIG20.WA", "fallback_symbol": "^WIG20", "name": "WIG20", "market": "GPW", "unit": "pkt"},
        {"symbol": "^GSPC", "name": "S&P 500", "market": "USA", "unit": "pkt"},
        {"symbol": "^IXIC", "name": "NASDAQ", "market": "USA", "unit": "pkt"},
        {"symbol": "^GDAXI", "name": "DAX", "market": "DE", "unit": "pkt"},
        {"symbol": "^FTSE", "name": "FTSE 100", "market": "UK", "unit": "pkt"},
        {"symbol": "OBX.OL", "name": "OBX Oslo", "market": "NO", "unit": "pkt"},
    ],
    "stocks": [
        {"symbol": "PKO.WA", "name": "PKO BP", "market": "GPW", "unit": "PLN"},
        {"symbol": "PKN.WA", "name": "Orlen", "market": "GPW", "unit": "PLN"},
        {"symbol": "PZU.WA", "name": "PZU", "market": "GPW", "unit": "PLN"},
        {"symbol": "CDR.WA", "name": "CD Projekt", "market": "GPW", "unit": "PLN"},
        {"symbol": "KGH.WA", "name": "KGHM", "market": "GPW", "unit": "PLN"},
        {"symbol": "ALE.WA", "name": "Allegro", "market": "GPW", "unit": "PLN"},
    ],
    "commodities": [
        {"symbol": "GC=F", "name": "Złoto", "market": "COMEX", "unit": "USD/oz"},
        {"symbol": "BZ=F", "name": "Ropa Brent", "market": "ICE", "unit": "USD/bbl"},
        {"symbol": "SI=F", "name": "Srebro", "market": "COMEX", "unit": "USD/oz"},
    ],
}

# 16 miast wojewódzkich (nazwa stacji IMGW lub współrzędne Open-Meteo jako fallback) + Oslo
WEATHER_CITIES = [
    {"city": "Warszawa", "voivodeship": "Mazowieckie", "imgw": "Warszawa", "lat": 52.23, "lon": 21.01},
    {"city": "Kraków", "voivodeship": "Małopolskie", "imgw": "Kraków", "lat": 50.06, "lon": 19.94},
    {"city": "Wrocław", "voivodeship": "Dolnośląskie", "imgw": "Wrocław", "lat": 51.11, "lon": 17.04},
    {"city": "Poznań", "voivodeship": "Wielkopolskie", "imgw": "Poznań", "lat": 52.41, "lon": 16.93},
    {"city": "Gdańsk", "voivodeship": "Pomorskie", "imgw": "Gdańsk", "lat": 54.35, "lon": 18.65},
    {"city": "Łódź", "voivodeship": "Łódzkie", "imgw": "Łódź", "lat": 51.76, "lon": 19.46},
    {"city": "Katowice", "voivodeship": "Śląskie", "imgw": "Katowice", "lat": 50.26, "lon": 19.03},
    {"city": "Szczecin", "voivodeship": "Zachodniopomorskie", "imgw": "Szczecin", "lat": 53.43, "lon": 14.55},
    {"city": "Lublin", "voivodeship": "Lubelskie", "imgw": "Lublin", "lat": 51.25, "lon": 22.57},
    {"city": "Białystok", "voivodeship": "Podlaskie", "imgw": "Białystok", "lat": 53.13, "lon": 23.16},
    {"city": "Rzeszów", "voivodeship": "Podkarpackie", "imgw": "Rzeszów", "lat": 50.04, "lon": 22.00},
    {"city": "Kielce", "voivodeship": "Świętokrzyskie", "imgw": "Kielce", "lat": 50.87, "lon": 20.63},
    {"city": "Olsztyn", "voivodeship": "Warmińsko-Mazurskie", "imgw": "Olsztyn", "lat": 53.78, "lon": 20.49},
    {"city": "Opole", "voivodeship": "Opolskie", "imgw": "Opole", "lat": 50.67, "lon": 17.92},
    {"city": "Toruń", "voivodeship": "Kujawsko-Pomorskie", "imgw": "Toruń", "lat": 53.01, "lon": 18.60},
    {"city": "Zielona Góra", "voivodeship": "Lubuskie", "imgw": "Zielona Góra", "lat": 51.94, "lon": 15.51},
    {"city": "Oslo", "voivodeship": "Norwegia", "imgw": None, "lat": 59.91, "lon": 10.75},
]


def _fetch_json(url: str, timeout: int = 8):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_nbp_currencies(timeout: int = 8) -> dict:
    """Pobiera ostatnie 7 tabel A z NBP API (zmiana dzienna + seria do wykresu sparkline)."""
    url = "https://api.nbp.pl/api/exchangerates/tables/A/last/7/?format=json"
    tables = _fetch_json(url, timeout=timeout)
    if not isinstance(tables, list) or not tables:
        return {}
    latest = tables[-1]
    prev = tables[-2] if len(tables) >= 2 else latest
    prev_map = {r["code"]: float(r["mid"]) for r in prev.get("rates") or [] if r.get("code")}
    hist_by_code = {c: [] for c in NBP_CODES}
    for tbl in tables:
        for r in tbl.get("rates") or []:
            code = r.get("code")
            if code in hist_by_code and r.get("mid") is not None:
                hist_by_code[code].append(round(float(r["mid"]), 4))
    items = []
    latest_map = {r["code"]: r for r in latest.get("rates") or [] if r.get("code")}
    for code in NBP_CODES:
        row = latest_map.get(code)
        if not row:
            continue
        mid = float(row["mid"])
        p_mid = prev_map.get(code, mid)
        chg_pct = ((mid - p_mid) / p_mid * 100.0) if p_mid else 0.0
        items.append({
            "code": code,
            "pair": f"{code}/PLN",
            "name": row.get("currency") or code,
            "rate": round(mid, 4),
            "change_pct": round(chg_pct, 2),
            "history": hist_by_code.get(code) or [round(mid, 4)],
        })
    return {
        "effective_date": latest.get("effectiveDate") or "",
        "table_no": latest.get("no") or "",
        "source": "NBP API (Tabela A)",
        "items": items,
    }


def _fetch_single_yahoo(spec: dict, timeout: int = 7) -> dict | None:
    symbols = [spec["symbol"]]
    if spec.get("fallback_symbol"):
        symbols.append(spec["fallback_symbol"])
    for sym in symbols:
        try:
            enc = urllib.parse.quote(sym, safe="")
            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{enc}?range=10d&interval=1d"
            data = _fetch_json(url, timeout=timeout)
            res = ((data.get("chart") or {}).get("result") or [None])[0]
            if not res:
                continue
            meta = res.get("meta") or {}
            closes = [
                round(float(c), 2)
                for c in (((res.get("indicators") or {}).get("quote") or [{}])[0].get("close") or [])
                if isinstance(c, (int, float))
            ]
            price = meta.get("regularMarketPrice")
            if price is None and closes:
                price = closes[-1]
            if price is None:
                continue
            prev = meta.get("chartPreviousClose") or meta.get("previousClose")
            if len(closes) >= 2 and closes[-2]:
                prev = closes[-2]
            chg_pct = ((float(price) - float(prev)) / float(prev) * 100.0) if prev else 0.0
            hist = closes[-7:] if closes else [round(float(price), 2)]
            return {
                "symbol": sym,
                "name": spec["name"],
                "market": spec["market"],
                "unit": spec["unit"],
                "price": round(float(price), 2),
                "change_pct": round(chg_pct, 2),
                "history": hist,
            }
        except (urllib.error.URLError, urllib.error.HTTPError, ValueError, KeyError, TimeoutError, OSError):
            continue
    return None


def fetch_yahoo_quotes(timeout: int = 7) -> dict:
    """Pobiera indeksy, spółki GPW i surowce równolegle."""
    result = {"indices": [], "stocks": [], "commodities": []}
    tasks = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        for group, specs in YAHOO_SYMBOLS.items():
            for idx, spec in enumerate(specs):
                fut = ex.submit(_fetch_single_yahoo, spec, timeout)
                tasks.append((group, idx, fut))
        buckets = {g: [] for g in YAHOO_SYMBOLS}
        for group, idx, fut in tasks:
            try:
                val = fut.result()
                if val:
                    buckets[group].append((idx, val))
            except Exception:
                continue
        for group in result:
            result[group] = [v for _, v in sorted(buckets[group], key=lambda x: x[0])]
    return result


def fetch_crypto_quotes(timeout: int = 7) -> list:
    """Pobiera kurs BTC i ETH z CoinGecko API."""
    url = (
        "https://api.coingecko.com/api/v3/simple/price"
        "?ids=bitcoin,ethereum&vs_currencies=usd,pln&include_24hr_change=true"
    )
    data = _fetch_json(url, timeout=timeout)
    out = []
    for cid, sym, name in (("bitcoin", "BTC", "Bitcoin"), ("ethereum", "ETH", "Ethereum")):
        row = data.get(cid)
        if not isinstance(row, dict) or row.get("usd") is None:
            continue
        out.append({
            "symbol": sym,
            "name": name,
            "price_usd": round(float(row["usd"]), 2),
            "price_pln": round(float(row.get("pln") or 0), 2),
            "change_pct": round(float(row.get("usd_24h_change") or 0), 2),
        })
    return out


def _infer_weather_condition(temp_c: float, precip_mm: float, wind_kmh: float, humidity_pct: int | None) -> tuple[str, str]:
    """Zwraca (ikona_kod, opis_pl) na podstawie pomiarów IMGW / Open-Meteo."""
    if precip_mm >= 0.2:
        return ("snow", "Opady śniegu") if temp_c <= 0.5 else ("rain", "Opady deszczu")
    if wind_kmh >= 32:
        return ("wind", "Wietrznie")
    if temp_c <= -2.0:
        return ("frost", "Mróz")
    if humidity_pct is not None and humidity_pct >= 88:
        return ("cloud", "Pochmurno / mgła")
    if humidity_pct is not None and humidity_pct >= 72:
        return ("partly", "Zachmurzenie umiarkowane")
    return ("sun", "Pogodnie")


def _fetch_open_meteo_city(city_spec: dict, timeout: int = 6) -> dict | None:
    url = (
        f"https://api.open-meteo.com/v1/forecast?latitude={city_spec['lat']}"
        f"&longitude={city_spec['lon']}&current=temperature_2m,wind_speed_10m,surface_pressure,relative_humidity_2m,precipitation,weather_code"
    )
    data = _fetch_json(url, timeout=timeout)
    cur = data.get("current") or {}
    if cur.get("temperature_2m") is None:
        return None
    temp_c = round(float(cur["temperature_2m"]), 1)
    wind_kmh = round(float(cur.get("wind_speed_10m") or 0), 1)
    hum = round(float(cur.get("relative_humidity_2m") or 0)) if cur.get("relative_humidity_2m") is not None else None
    prec = round(float(cur.get("precipitation") or 0), 1)
    wcode = cur.get("weather_code")
    if wcode in (71, 73, 75, 77, 85, 86):
        cond_key, cond_label = "snow", "Opady śniegu"
    elif wcode in (51, 53, 55, 61, 63, 65, 80, 81, 82, 95):
        cond_key, cond_label = "rain", "Opady deszczu"
    elif wcode in (0, 1):
        cond_key, cond_label = ("frost", "Bezchmurnie, mróz") if temp_c <= -2 else ("sun", "Bezchmurnie")
    elif wcode == 2:
        cond_key, cond_label = "partly", "Częściowe zachmurzenie"
    elif wcode in (3, 45, 48):
        cond_key, cond_label = "cloud", "Pochmurno"
    else:
        cond_key, cond_label = _infer_weather_condition(temp_c, prec, wind_kmh, hum)
    return {
        "city": city_spec["city"],
        "voivodeship": city_spec["voivodeship"],
        "lat": city_spec["lat"],
        "lon": city_spec["lon"],
        "temp_c": temp_c,
        "wind_kmh": wind_kmh,
        "pressure_hpa": round(float(cur.get("surface_pressure") or 0), 1) if cur.get("surface_pressure") else None,
        "humidity_pct": hum,
        "precip_mm": prec,
        "condition_key": cond_key,
        "condition": cond_label,
        "source": "Open-Meteo (CC BY 4.0)",
    }


def fetch_weather(timeout: int = 8) -> dict:
    """Pobiera aktualną pogodę z IMGW-PIB (dane publiczne) dla 16 miast wojewódzkich + Open-Meteo dla Oslo/braków."""
    imgw_by_name = {}
    try:
        rows = _fetch_json("https://danepubliczne.imgw.pl/api/data/synop", timeout=timeout)
        if isinstance(rows, list):
            for r in rows:
                st = (r.get("stacja") or "").strip()
                if st:
                    imgw_by_name[st.lower()] = r
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError, TimeoutError, OSError):
        pass

    cities_out = []
    missing_for_om = []
    for spec in WEATHER_CITIES:
        imgw_key = (spec.get("imgw") or "").lower()
        row = imgw_by_name.get(imgw_key) if imgw_key else None
        if row and row.get("temperatura") is not None:
            try:
                temp_c = round(float(row["temperatura"]), 1)
                wind_ms = float(row.get("predkosc_wiatru") or 0)
                wind_kmh = round(wind_ms * 3.6, 1)
                press = round(float(row["cisnienie"]), 1) if row.get("cisnienie") not in (None, "") else None
                hum = round(float(row["wilgotnosc_wzgledna"])) if row.get("wilgotnosc_wzgledna") not in (None, "") else None
                prec = round(float(row.get("suma_opadu") or 0), 1)
                cond_key, cond_label = _infer_weather_condition(temp_c, prec, wind_kmh, hum)
                cities_out.append({
                    "city": spec["city"],
                    "voivodeship": spec["voivodeship"],
                    "lat": spec["lat"],
                    "lon": spec["lon"],
                    "temp_c": temp_c,
                    "wind_kmh": wind_kmh,
                    "pressure_hpa": press,
                    "humidity_pct": hum,
                    "precip_mm": prec,
                    "condition_key": cond_key,
                    "condition": cond_label,
                    "measured_at": f"{row.get('data_pomiaru', '')} {str(row.get('godzina_pomiaru', '')).zfill(2)}:00".strip(),
                    "source": "IMGW-PIB",
                })
                continue
            except (ValueError, TypeError):
                pass
        missing_for_om.append(spec)

    for spec in missing_for_om:
        try:
            om = _fetch_open_meteo_city(spec, timeout=min(timeout, 6))
            if om:
                cities_out.append(om)
        except (urllib.error.URLError, urllib.error.HTTPError, ValueError, TimeoutError, OSError):
            continue

    order = {s["city"]: i for i, s in enumerate(WEATHER_CITIES)}
    cities_out.sort(key=lambda x: order.get(x["city"], 999))
    return {
        "source": "IMGW-PIB (dane publiczne) + Open-Meteo (CC BY 4.0)",
        "cities": cities_out,
    }


def load_cached_market_data(path: str = MARKET_DATA_FILE) -> dict:
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                return data
        except (OSError, ValueError):
            pass
    return {
        "updated_iso": "",
        "currencies": {"items": [], "source": "NBP API"},
        "indices": [],
        "stocks": [],
        "commodities": [],
        "crypto": [],
        "weather": {"cities": [], "source": "IMGW-PIB + Open-Meteo"},
    }


def update_market_data(output_path: str = MARKET_DATA_FILE) -> dict:
    """Odświeża dane rynkowe i pogodowe z zachowaniem cache dla chwilowo niedostępnych źródeł."""
    prev = load_cached_market_data(output_path)
    now_iso = dt.datetime.now(dt.timezone.utc).astimezone().isoformat(timespec="seconds")

    currencies = prev.get("currencies") or {"items": [], "source": "NBP API"}
    try:
        nbp = fetch_nbp_currencies()
        if nbp.get("items"):
            currencies = nbp
    except Exception:
        pass

    indices = prev.get("indices") or []
    stocks = prev.get("stocks") or []
    commodities = prev.get("commodities") or []
    try:
        yq = fetch_yahoo_quotes()
        if yq.get("indices"):
            indices = yq["indices"]
        if yq.get("stocks"):
            stocks = yq["stocks"]
        if yq.get("commodities"):
            commodities = yq["commodities"]
    except Exception:
        pass

    crypto = prev.get("crypto") or []
    try:
        cr = fetch_crypto_quotes()
        if cr:
            crypto = cr
    except Exception:
        pass

    weather = prev.get("weather") or {"cities": [], "source": "IMGW-PIB + Open-Meteo"}
    try:
        w = fetch_weather()
        if w.get("cities"):
            weather = w
    except Exception:
        pass

    payload = {
        "updated_iso": now_iso,
        "currencies": currencies,
        "indices": indices,
        "stocks": stocks,
        "commodities": commodities,
        "crypto": crypto,
        "weather": weather,
    }
    tmp_path = output_path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(tmp_path, output_path)
    return payload


if __name__ == "__main__":
    data = update_market_data()
    print(
        f"[MARKETS] Zaktualizowano market_data.json: "
        f"waluty={len(data['currencies'].get('items', []))}, "
        f"indeksy={len(data['indices'])}, akcje={len(data['stocks'])}, "
        f"surowce={len(data['commodities'])}, krypto={len(data['crypto'])}, "
        f"pogoda={len(data['weather'].get('cities', []))} miast."
    )
