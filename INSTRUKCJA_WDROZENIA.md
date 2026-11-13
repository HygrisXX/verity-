# VERITY – Pakiet Wdrożeniowy na Domenę Testową

Ten katalog zawiera kompletny, samodzielny zestaw plików statycznych (zero zewnętrznych zależności CDN), gotowy do wgrania bezpośrednio na dowolny serwer WWW / hosting pod domeną testową.

## Zawartość paczki (`synteza_test_domain/`)
- `index.html` – Główny plik portalu z meta-tagami SEO, OpenGraph (Google Discover) oraz schematem JSON-LD (`WebSite`, `BreadcrumbList`).
- `styles.css` – Arkusz stylów Vanilla CSS z automatycznym wykrywaniem motywu urządzenia (`@media (prefers-color-scheme: dark)`), ręcznym przełącznikiem (`Auto / Jasny / Ciemny`) oraz pełną responsywnością (telefon / tablet / komputer).
- `app.js` – Silnik portalu (Polski Stemmer Fleksyjny w wyszukiwarce, pełne wielosekcyjne artykuły, ramka *„Kto jak to przedstawia?”*, formularz sprostowań z wymogiem linku oraz Kolejka Weryfikacji Redakcyjnej).
- `assets/` – Zoptymalizowane zdjęcia redakcyjne 16:9 (`sejm.jpg`, `poznan_tramwaje.jpg`, `poznan_rolnicy.jpg`, `nbp.jpg`, `energetyka.jpg`).
- `news-sitemap.xml` oraz `robots.txt` – Pliki indeksowania dla robotów Google News.

## Jak uruchomić na domenie testowej?
1. Skopiuj całą zawartość folderu `synteza_test_domain/` (pliki `index.html`, `styles.css`, `app.js`, `news-sitemap.xml`, `robots.txt` oraz podkatalog `assets/`) do katalogu głównego domeny na hostingu (np. `public_html/` lub `/var/www/html/`).
2. Strona działa natychmiast po otwarciu adresu domeny – bez konieczności instalowania Node.js czy baz danych na etapie testów wizualnych i funkcjonalnych.
3. Aby uruchomić automatyczne pobieranie z 54 polskich źródeł RSS oraz syntezę przez klucz Gemini API, na serwerze VPS można uruchomić silnik backendowy z katalogu `/home/antigravity/portal_engine/app.py`.
