# VERITY

Statyczny portal informacyjny łączący wieloźródłowy agregator depesz ([update_live_news.py](update_live_news.py)), generator stron SSR/SEO ([seo_builder.py](seo_builder.py)) oraz aplikację SPA ([app.js](app.js), [styles.css](styles.css)), publikowany na GitHub Pages: **https://hygrisxx.github.io/verity-/**.

## Szybki start

- **Testy jednostkowe i integralności SEO:**
  ```bash
  PYTHONDONTWRITEBYTECODE=1 python3 -W error -m unittest discover -s tests -p "test_*.py" -v
  ```
- **Testy przeglądarkowe E2E (Headless Chrome/Chromium):**
  ```bash
  node tests/e2e_browser_test.mjs /tmp/verity_e2e
  ```
- **Audyt 153 kanałów RSS/Atom/TVP3:**
  ```bash
  PYTHONDONTWRITEBYTECODE=1 python3 -W error update_live_news.py --audit-feeds
  ```
- **Przebudowa offline (`articles.json` + pliki HTML/XML):**
  ```bash
  PYTHONDONTWRITEBYTECODE=1 python3 -W error update_live_news.py --rebuild-only
  ```
- **Smoke test działającej produkcji:**
  ```bash
  PYTHONDONTWRITEBYTECODE=1 python3 -W error tests/smoke_live.py
  ```

Szczegóły architektury, harmonogramu GitHub Actions oraz konfiguracji publikacji znajdują się w [INSTRUKCJA_WDROZENIA.md](INSTRUKCJA_WDROZENIA.md).

## Jak dodać kamerę (`/kamery/`)
1. Dopisz nowy obiekt w `cameras.json` (wymagane pola: `id`, `name`, `scope` `"polska"|"swiat"`, `region` z listy 16 województw dla Polski lub `null` dla świata, `category`, `type` `"youtube_channel"|"youtube_video"|"external_link"`, `source_name`, `source_url`).
2. Opcjonalnie sprawdź dostępność transmisji:
   ```bash
   python3 check_cameras.py
   ```
3. Przebuduj statyczne pliki HTML:
   ```bash
   python3 update_live_news.py --rebuild-only
   ```

## Notowania rynkowe i pogoda (`/rynki/`)
- Odświeżenie `market_data.json` (NBP API, IMGW-PIB, Open-Meteo, indeksy/akcje/surowce/krypto):
  ```bash
  PYTHONDONTWRITEBYTECODE=1 python3 -W error market_data.py
  ```
- Konfiguracja profili rynków (limity cytatu, tryb 1-źródłowy, filtr art. 13 pr. pras., `blocked_sources`): `markets/pl.json`, `markets/no.json`.

