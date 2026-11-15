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
