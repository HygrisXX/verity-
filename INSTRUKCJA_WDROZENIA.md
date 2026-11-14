# VERITY – Architektura, Generator SEO i Instrukcja Wdrożenia

VERITY to w pełni statyczny portal informacyjny łączący automatyczny agregator depesz (`update_live_news.py`), generator stron SSR/SEO (`seo_builder.py`) oraz aplikację SPA/PWA-ready (`app.js`, `styles.css`), gotowy do publikacji na GitHub Pages (`https://hygrisxx.github.io/verity-/`).

## Najważniejsze komponenty repozytorium
- `update_live_news.py` – wielowątkowy silnik pobierający depesze ze **153 kanałów** RSS/Atom/HTML (**151 unikalnych redakcji** ogólnopolskich, branżowych i regionalnych we wszystkich **16 województwach**, w tym 16 oddziałów regionalnych TVP3 przez `source_type: "tvp3_sgdata"` z ekstrakcją `window.__sgData` / `window.__newsData` / `window.__directoryData`). Wykonuje filtrowanie treści (clickbait, opinie, hazard/typy, archiwalne linki), klasyfikację tematyczną i geograficzną, klastrowanie z ochroną przed fałszywymi skojarzeniami (`has_cluster_conflict`), syntezę sekcji bez duplikowania zdań, deduplikację i czyszczenie starszych wpisów (`articles.json`) oraz raportowanie metryk cyklu (`print_cycle_summary`, `GITHUB_STEP_SUMMARY`).
- `seo_builder.py` – deterministyczny generator infrastruktury statycznej dla **23 działów** (`/Polska`, `/Polska/Gospodarka`, `/Polska/Polityka`, `/Polska/Energetyka`, `/Polska/Regiony`, **16 województw** `/Polska/Regiony/<Wojewodztwo>`, `/Swiat`, `/Sport`) i wszystkich artykułów z `articles.json`. Tworzy strony HTML z polską typografią (`\u00A0`), danymi strukturalnymi JSON-LD (`NewsArticle`, `BreadcrumbList`, `CollectionPage`, `WebSite`), `sitemap.xml`, `news-sitemap.xml`, `feed.xml`, `robots.txt` oraz `404.html`.
- `index.html`, `app.js`, `styles.css` – warstwa frontendowa z hydratacją z `articles.json` (bez gigantycznej tablicy artykułów osadzonej w `app.js`), obsługą `file://` SSR, polskim stemmerem w wyszukiwarce, szufladą 16 województw (`#regionsDrawer` z obsługą klawisza `Escape`), paskiem filtrowania akapitów według źródła (`.source-filter-bar`), zwijaniem kart perspektyw powyżej 4 redakcji oraz przełącznikiem motywu (`Auto / Jasny / Ciemny`).
- `articles.json` – bieżąca baza oczyszczonych i zdeduplikowanych opracowań.
- `tests/` – pakiet testów jednostkowych i regresyjnych (`tests/test_verity.py`) oraz testów przeglądarkowych E2E w bezgłowym Chromium przez CDP (`tests/e2e_browser_test.mjs`).
- `.github/workflows/auto_update.yml` i `.github/workflows/tests.yml` – harmonogram cyklicznej aktualizacji (co godzinę) oraz automatyczne testy CI (Unit + E2E) dla każdego pusha i PR na gałęzi `main`.

## Przydatne polecenia lokalne
- Pełna aktualizacja na żywo (pobranie 153 kanałów, synteza, zapis `articles.json` i przebudowa HTML/XML):
  ```bash
  python3 update_live_news.py
  ```
- Przebudowa i czyszczenie bez zapytań sieciowych (idempotentne przeliczenie `articles.json` + plików SEO/HTML):
  ```bash
  python3 update_live_news.py --rebuild-only
  ```
- Audyt dostępności wszystkich 153 kanałów i pokrycia 16 województw:
  ```bash
  python3 update_live_news.py --audit-feeds
  ```
- Uruchomienie testów jednostkowych (Python `unittest`):
  ```bash
  python3 -m unittest discover -s tests -p "test_*.py" -v
  ```
- Uruchomienie testów przeglądarkowych E2E (Node.js + bezgłowy Chromium / Chrome):
  ```bash
  node tests/e2e_browser_test.mjs
  ```

## Konfiguracja i wdrożenie (GitHub Pages)
1. Repozytorium nie wymaga zewnętrznego serwera aplikacji ani kluczy API w runtime — cała witryna składa się ze statycznych plików HTML/CSS/JS/XML/JSON generowanych do katalogu głównego repozytorium.
2. W Ustawieniach repozytorium GitHub (*Settings → Pages*) publikacja odbywa się z gałęzi `main` (katalog `/`). Wykrywanie kanonicznego URL (`detect_site_base_url` w `seo_builder.py`) automatycznie dopasowuje ścieżkę do `https://hygrisxx.github.io/verity-`.
3. Opcjonalne zmienne środowiskowe dla `update_live_news.py`:
   - `VERITY_ENABLE_THUMBNAILS=1` (włącza pobieranie miniaturek z kanałów RSS/TVP3).
   - `GITHUB_STEP_SUMMARY` (ścieżka pliku Markdown do zapisu tabeli jakościowej cyklu w GitHub Actions).
