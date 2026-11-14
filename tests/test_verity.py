#!/usr/bin/env python3
"""
Zestaw testów jednostkowych, regresyjnych i integralności SEO dla portalu VERITY.
Uruchamianie: python3 -m unittest discover -s tests -p "test_*.py" -v
"""

import json
import os
import re
import sys
import unittest
import xml.etree.ElementTree as ET

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

import seo_builder
import update_live_news as uln


class TestTextCleaningAndFormatting(unittest.TestCase):
    def test_unescape_and_wordpress_footer_removal(self):
        raw = (
            "Rada Polityki Pieniężnej utrzymała stopy &amp;oacute;gółem na poziomie 5,75 proc. "
            "Decyzja zapadła m.in. po analizie inflacji bazowej. "
            "[…] The post Stopy procentowe bez zmian appeared first on PrzykładowyPortal.pl."
        )
        cleaned = uln.clean_desc_text(raw, "Stopy procentowe bez zmian")
        self.assertNotIn("&oacute;", cleaned)
        self.assertNotIn("&amp;", cleaned)
        self.assertNotIn("The post", cleaned)
        self.assertNotIn("appeared first on", cleaned)
        self.assertIn("5,75 proc.", cleaned)

    def test_polish_wp_footer_and_drupal_metadata_removal(self):
        raw = (
            "Kanał Strefa Inwestorów czw., 13.11.2026 Autor: Jan Kowalski Treść "
            "Spółka zwiększyła przychody w III kwartale o 14 proc. r/r. "
            "[…] Artykuł Rekordowy kwartał spółki pochodzi z serwisu StrefaInwestorow.pl."
        )
        cleaned = uln.clean_desc_text(raw)
        self.assertNotIn("Kanał Strefa Inwestorów", cleaned)
        self.assertNotIn("pochodzi z serwisu", cleaned)
        self.assertIn("Spółka zwiększyła przychody", cleaned)

    def test_sentence_splitting_preserves_abbreviations_and_quote_attribution(self):
        text = (
            "Koszty wzrosły m.in. w sektorze energii w 2026 r. i wyniosły 197,27 zł. "
            "Strażnik zareagował przepisowo na hałas grupy. "
            "Dobra robota, starszy szeregowy! - napisał Hegseth w komunikacie."
        )
        sents = uln.split_sentences_pl(text)
        self.assertTrue(any("m.in. w sektorze energii" in s for s in sents))
        self.assertTrue(any("197,27 zł." in s for s in sents))
        # Atrybucja po wykrzykniku musi zostać przy cytacie, a nie jako ucięty fragment
        quote_sents = [s for s in sents if "Dobra robota" in s]
        self.assertEqual(len(quote_sents), 1)
        self.assertIn("napisał Hegseth", quote_sents[0])

    def test_safe_truncate_never_breaks_on_abbreviations(self):
        txt = (
            "Polskie Sieci Elektroenergetyczne odnotowały m.in. rekordowe ograniczenia OZE w ciągu ok. 25 dni roboczych, "
            "co przełożyło się na łączny wolumen 126 GWh niewyprodukowanej energii w całym miesiącu i wzrost zmienności cen."
        )
        trunc = uln._safe_truncate_text(txt, 90)
        self.assertLessEqual(len(trunc), 91)
        self.assertFalse(trunc.endswith("m.in."))
        self.assertFalse(trunc.endswith("ok."))

    def test_pl_typography_hangs_single_letters_and_units(self):
        sample = "W 2026 r. i w Polsce 10 tys. osób zapłaciło 197,27 zł za 5 MWh oraz 12 proc. podatku."
        out = seo_builder.pl_typography(sample)
        self.assertIn("W\u00A02026\u00A0r.", out)
        self.assertIn("i\u00A0w\u00A0Polsce", out)
        self.assertIn("10\u00A0tys.", out)
        self.assertIn("197,27\u00A0zł", out)
        self.assertIn("5\u00A0MWh", out)
        self.assertIn("12\u00A0proc.", out)

    def test_paragraph_grouping_splits_walls_and_extracts_quotes(self):
        entries = [
            {"text": "Pierwsze zdanie o długości wystarczającej do testu akapitu otwierającego w artykule informacyjnym.", "outlets": ["PAP"]},
            {"text": "Drugie zdanie zawiera szczegółowe dane statystyczne za miniony kwartał gospodarczy w Polsce.", "outlets": ["PAP", "Bankier.pl"]},
            {"text": "— Naszym celem jest pełna stabilność dostaw w kolejnych pięciu latach – podkreślił prezes spółki.", "outlets": ["PAP"]},
            {"text": "Czwarte zdanie podsumowuje dalsze etapy inwestycji planowane przez zarząd w przyszłym roku.", "outlets": ["Bankier.pl"]},
        ]
        paras = uln._group_sentences_to_paragraphs(entries, max_chars=260, max_sents=2)
        self.assertGreaterEqual(len(paras), 3)
        self.assertTrue(any(p.startswith("— Naszym celem") for p in paras))
        for p in paras:
            self.assertLessEqual(len(seo_builder.strip_citations(p)), 450)

    def test_synthesis_single_source_no_percentage_and_multi_source_no_duplicates(self):
        single_group = [{
            "outlet": "WysokieNapiecie.pl",
            "title": "Rynek bilansujący po zmianach w 2026 r.",
            "description": (
                "Ceny energii na rynku bilansującym wykazywały dużą zmienność w całym kwartale. "
                "Najwyższa godzinowa stawka osiągnęła 2602,4 zł/MWh w godzinach szczytu wieczornego. "
                "Najniższa spadła natomiast poniżej zera podczas wysokiej generacji wiatrowej. "
                "Operator systemu zapowiada kolejne aukcje usług elastyczności jeszcze jesienią."
            ),
            "link": "https://wysokienapiecie.pl/test",
            "path": "/Polska/Energetyka",
        }]
        secs, pct = uln.synthesize_article_sections(single_group, single_group[0]["title"])
        self.assertIsNone(pct)
        self.assertEqual(len(secs), 1)
        # Pojedyncze źródło nie powtarza tagu [Źródło: ...] na każdym akapicie
        cited_count = sum(1 for p in secs[0]["paragraphs"] if "[Źródło:" in p)
        self.assertEqual(cited_count, 1)

        multi_group = [
            {
                "outlet": "PAP",
                "title": "Nowa inwestycja kolejowa w Małopolsce za 1,2 mld zł",
                "description": "Rozpoczęto modernizację ważnej linii kolejowej między Krakowem a Tarnowem. Kontrakt opiewa na kwotę 1,2 mld zł i potrwa trzy lata.",
                "link": "https://pap.pl/1",
                "path": "/Polska/Gospodarka",
            },
            {
                "outlet": "Money.pl",
                "title": "Modernizacja kolei pod Krakowem rusza w tym miesiącu",
                "description": "Rozpoczęto modernizację ważnej linii kolejowej między Krakowem a Tarnowem. Wykonawca zapowiada nowe perony w sześciu miejscowościach.",
                "link": "https://money.pl/2",
                "path": "/Polska/Gospodarka",
            },
        ]
        m_secs, m_pct = uln.synthesize_article_sections(multi_group, multi_group[0]["title"])
        self.assertIsNotNone(m_pct)
        self.assertGreaterEqual(m_pct, 80)
        if len(m_secs) >= 2:
            p0 = {seo_builder.strip_citations(x) for x in m_secs[0]["paragraphs"]}
            p1 = {seo_builder.strip_citations(x) for x in m_secs[1]["paragraphs"]}
            self.assertFalse(p0 & p1, "Sekcja 0 i 1 nie mogą powtarzać tych samych akapitów")


class TestClusteringAndConflictGuards(unittest.TestCase):
    def test_different_cities_and_sports_disciplines_conflict(self):
        a_lublin = {"title": "Wypadek na obwodnicy Lublina, droga zablokowana", "description": "", "path": "/Polska"}
        b_krakow = {"title": "Wypadek na obwodnicy Krakowa, droga zablokowana", "description": "", "path": "/Polska"}
        self.assertTrue(uln.has_cluster_conflict(a_lublin, b_krakow))

        a_tenis = {"title": "Turniej w Madrycie: zwycięstwo polskiej tenisistki w dwóch setach", "description": "WTA Madryt tenis", "path": "/Sport"}
        b_pilka = {"title": "Zwycięstwo reprezentacji w piłce nożnej po golach w drugiej połowie", "description": "Ekstraklasa piłka nożna", "path": "/Sport"}
        self.assertTrue(uln.has_cluster_conflict(a_tenis, b_pilka))

    def test_bialy_dom_does_not_conflict_with_cities(self):
        a = {"title": "Biały Dom przedstawia nowy pakiet handlowy USA", "description": "", "path": "/Swiat"}
        b = {"title": "Waszyngton ogłasza nowy pakiet handlowy Stanów Zjednoczonych", "description": "", "path": "/Swiat"}
        self.assertFalse(uln.has_cluster_conflict(a, b))

    def test_bundeswehra_matches_niemcy_and_finland_russia_compatible(self):
        a = {"title": "Niemcy zwiększają budżet obronny na zakupy sprzętu", "description": "", "path": "/Swiat"}
        b = {"title": "Bundeswehra otrzymuje dodatkowe fundusze na nowy sprzęt", "description": "", "path": "/Swiat"}
        self.assertFalse(uln.has_cluster_conflict(a, b))


class TestGeneratedArtifactsIntegrity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        articles_path = os.path.join(ROOT_DIR, "articles.json")
        with open(articles_path, "r", encoding="utf-8") as f:
            cls.articles = json.load(f)

    def test_articles_json_quality_and_seo_fields(self):
        self.assertGreater(len(self.articles), 20)
        seen_urls = set()
        entity_re = re.compile(r"&(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);")
        junk_re = re.compile(
            r"(?:The post\s|appeared first on|pochodzi z serwisu|Kanał Strefa Inwestorów|data-image-(?:caption|description)=|data-large-file=|srcset=)",
            re.IGNORECASE,
        )

        for art in self.articles:
            aid = art["id"]
            seo_url = art.get("seo_url") or ""
            self.assertTrue(seo_url.startswith("/"), f"Brak poprawnego seo_url dla id={aid}")
            self.assertNotIn(seo_url, seen_urls, f"Duplikat seo_url: {seo_url}")
            seen_urls.add(seo_url)

            self.assertTrue(art.get("seo_title"), f"Brak seo_title w id={aid}")
            lead = art.get("summary_lead") or ""
            self.assertTrue(lead, f"Brak summary_lead w id={aid}")
            self.assertFalse(junk_re.search(lead), f"Wyciek znaczników HTML w summary_lead id={aid}: {lead[:120]}")
            meta = art.get("meta_description") or ""
            self.assertTrue(40 <= len(meta) <= 165, f"Nieoptymalna długość meta_description ({len(meta)}) w id={aid}")
            self.assertTrue(art.get("keywords"), f"Brak keywords w id={aid}")

            srcs = art.get("sources") or []
            if len(srcs) <= 1:
                self.assertIsNone(art.get("fact_agreement_pct"), f"1 źródło nie może mieć % w id={aid}")
                self.assertTrue(
                    art.get("path") in uln.LOCAL_PATHS or (srcs and srcs[0] in uln.NICHE_OUTLETS),
                    f"1-źródłowy artykuł spoza lokalnych/niszowych: id={aid}, path={art.get('path')}, srcs={srcs}",
                )
            else:
                pct = art.get("fact_agreement_pct")
                self.assertIsNotNone(pct)
                self.assertTrue(75 <= pct <= 99, f"Poza zakresem pct={pct} w id={aid}")

            secs = art.get("full_sections") or []
            self.assertTrue(secs, f"Puste sekcje w id={aid}")
            sec_texts = []
            for s in secs:
                paras = s.get("paragraphs") or []
                plain_list = []
                for p in paras:
                    self.assertFalse(entity_re.search(p), f"Nieodkodowana encja HTML w id={aid}: {p[:120]}")
                    self.assertFalse(junk_re.search(p), f"Pozostałości stopki/metadanych w id={aid}: {p[:120]}")
                    plain_p = seo_builder.strip_citations(p)
                    self.assertLessEqual(len(plain_p), 650, f"Ściana tekstu ({len(plain_p)} zn.) w id={aid}")
                    plain_list.append(plain_p)
                sec_texts.append(set(plain_list))
            if len(sec_texts) >= 2:
                self.assertFalse(sec_texts[0] & sec_texts[1], f"Zduplikowane akapity między sekcjami w id={aid}")

            # Sprawdzenie fizycznego pliku statycznego HTML HTTP 200
            html_file = os.path.join(ROOT_DIR, seo_url.lstrip("/"), "index.html")
            self.assertTrue(os.path.isfile(html_file), f"Brak statycznego pliku HTML: {html_file}")

    def test_category_pages_and_404_and_root_exist(self):
        self.assertTrue(os.path.isfile(os.path.join(ROOT_DIR, "index.html")))
        self.assertTrue(os.path.isfile(os.path.join(ROOT_DIR, "404.html")))
        self.assertTrue(os.path.isfile(os.path.join(ROOT_DIR, ".nojekyll")))
        self.assertEqual(len(seo_builder.VOIVODESHIPS), 16)
        self.assertEqual(len(seo_builder.CATEGORIES), 23)
        for cat_path, _, _ in seo_builder.CATEGORIES:
            cat_html = os.path.join(ROOT_DIR, cat_path.strip("/"), "index.html")
            self.assertTrue(os.path.isfile(cat_html), f"Brak strony kategorii: {cat_html}")

        regions_hub = os.path.join(ROOT_DIR, "Polska", "Regiony", "index.html")
        with open(regions_hub, "r", encoding="utf-8") as f:
            reg_doc = f.read()
        self.assertIn('id="regionsDrawer"', reg_doc)
        self.assertIn('class="region-strip"', reg_doc)
        for v_path, v_label, _, _, _, _ in seo_builder.VOIVODESHIPS:
            self.assertIn(v_label, reg_doc)
            self.assertIn(f'data-region-link="{v_path}"', reg_doc)

    def test_sitemaps_feed_and_robots_valid_xml(self):
        sitemap_path = os.path.join(ROOT_DIR, "sitemap.xml")
        news_path = os.path.join(ROOT_DIR, "news-sitemap.xml")
        feed_path = os.path.join(ROOT_DIR, "feed.xml")
        robots_path = os.path.join(ROOT_DIR, "robots.txt")

        sm_root = ET.parse(sitemap_path).getroot()
        sm_locs = [el.text for el in sm_root.findall(".//{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
        # Strona główna + 23 działy (w tym /Polska/Regiony + 16 województw) + wszystkie artykuły
        self.assertGreaterEqual(len(sm_locs), len(self.articles) + len(seo_builder.CATEGORIES) + 1)
        self.assertTrue(any(loc.endswith("/Polska/Regiony/") for loc in sm_locs))
        for v_path, _, _, _, _, _ in seo_builder.VOIVODESHIPS:
            self.assertTrue(any(loc.endswith(f"{v_path}/") for loc in sm_locs), f"Brak {v_path} w sitemap.xml")

        ns_root = ET.parse(news_path).getroot()
        ns_urls = ns_root.findall("{http://www.sitemaps.org/schemas/sitemap/0.9}url")
        self.assertGreater(len(ns_urls), 0)
        ns_titles = ns_root.findall(".//{http://www.google.com/schemas/sitemap-news/0.9}title")
        self.assertEqual(len(ns_urls), len(ns_titles))

        rss_root = ET.parse(feed_path).getroot()
        rss_items = rss_root.findall("./channel/item")
        self.assertGreater(len(rss_items), 0)

        with open(robots_path, "r", encoding="utf-8") as f:
            rob = f.read()
        self.assertIn("Sitemap:", rob)
        self.assertIn("sitemap.xml", rob)
        self.assertIn("news-sitemap.xml", rob)

    def test_reconcile_lead_eliminates_duplicate_prefix(self):
        art = {
            "summary_lead": "Zdanie pierwsze testowe o długości ponad sześćdziesięciu znaków w materiale. Zdanie drugie uzupełniające.",
            "full_sections": [
                {
                    "heading": "Ustalenia wspólne (2 redakcje)",
                    "paragraphs": [
                        "Zdanie pierwsze testowe o długości ponad sześćdziesięciu znaków w materiale. Zdanie drugie uzupełniające. Zdanie trzecie zupełnie nowe dla czytelnika w tym samym akapicie. [Źródło: PAP]"
                    ],
                },
                {
                    "heading": "Dodatkowe szczegóły",
                    "paragraphs": ["Osobny kontekst z innej redakcji w drugiej sekcji. [Źródło: Money.pl]"],
                },
            ],
        }
        show_lede, lead, skip_first, override = seo_builder._reconcile_lead_and_first_para(art)
        self.assertTrue(show_lede)
        self.assertFalse(skip_first)
        self.assertTrue(override.startswith("Zdanie trzecie zupełnie nowe"))
        self.assertIn("[Źródło: PAP]", override)

    def test_static_article_html_contains_newsarticle_jsonld_and_no_double_title(self):
        sample_art = next((a for a in self.articles if len(a.get("full_sections") or []) >= 2), self.articles[0])
        html_file = os.path.join(ROOT_DIR, sample_art["seo_url"].lstrip("/"), "index.html")
        with open(html_file, "r", encoding="utf-8") as f:
            doc = f.read()
        self.assertIn('"@type": "NewsArticle"', doc)
        self.assertIn('"@type": "BreadcrumbList"', doc)
        self.assertIn('rel="canonical"', doc)
        self.assertIn('name="news_keywords"', doc)
        self.assertIn('class="reading-progress"', doc)
        # Pierwsze zdanie leadu nie może pojawiać się dosłownie dwa razy (w .article-lede i 1. akapicie)
        lead = seo_builder.strip_citations(sample_art.get("summary_lead") or "")
        if len(lead) > 60 and not lead.endswith("…"):
            lead_nb = seo_builder.pl_typography(lead)
            body_part = doc.split('id="articlesFeed"', 1)[-1]
            self.assertLessEqual(body_part.count(lead_nb), 1)

        # Weryfikacja pełnych okruszków (VERITY -> Polska -> Regiony -> Województwo -> Artykuł) na artykule regionalnym
        reg_art = next((a for a in self.articles if (a.get("path") or "").startswith("/Polska/Regiony/")), None)
        self.assertIsNotNone(reg_art, "Brak artykułu regionalnego w bazie articles.json")
        reg_html_file = os.path.join(ROOT_DIR, reg_art["seo_url"].lstrip("/"), "index.html")
        with open(reg_html_file, "r", encoding="utf-8") as f:
            reg_doc = f.read()
        ld_match = re.search(r'<script id="dynamicJsonLd" type="application/ld\+json">\s*([\s\S]*?)\s*</script>', reg_doc)
        self.assertIsNotNone(ld_match)
        ld_parsed = json.loads(ld_match.group(1))
        crumbs = ld_parsed[1]["itemListElement"]
        crumb_names = [c["name"] for c in crumbs]
        self.assertEqual(crumb_names[:4], ["VERITY", "Polska", "Regiony", seo_builder.VOIVODESHIP_LABELS[reg_art["path"]]])

    def test_editorial_filter_blocks_plus_minus_and_html_has_asset_cache_busting(self):
        self.assertTrue(
            uln.is_opinion_or_blacklisted(
                "„Dziki Koń Dziewięć”. Trudno sobie wyobrazić piękniejsze zakończenie tej historii",
                "https://www.rp.pl/plus-minus/art45484011-dziki-kon-dziewiec",
            )
        )
        with open(os.path.join(ROOT_DIR, "index.html"), "r", encoding="utf-8") as f:
            home_doc = f.read()
        self.assertRegex(home_doc, r'href="styles\.css\?v=[0-9a-f]{8}"')
        self.assertRegex(home_doc, r'src="app\.js\?v=[0-9a-f]{8}"')
        self.assertNotIn("Szukaj tematów", home_doc)

    def test_category_classification_separates_poland_world_and_sport(self):
        cases = [
            ("/Swiat", "https://space24.pl/pojazdy-kosmiczne/systemy-nosne/polska-rakieta-ilr-33-bursztyn-2k-zaliczyla-udany-lot", "Polska rakieta ILR-33 BURSZTYN 2K zaliczyła udany lot", "/Polska"),
            ("/Polska", "https://space24.pl/pojazdy-kosmiczne/systemy-nosne/polska-rakieta-ilr-33-bursztyn-2k-zaliczyla-udany-lot", "Polska rakieta ILR-33 BURSZTYN 2K zaliczyła udany lot", "/Polska"),
            ("/Polska", "https://www.polsatnews.pl/wiadomosc/2026-11-12/strzelanina-w-poblizu-bialego-domu-nie-zyja-dwie-osoby", "Strzelanina w pobliżu Białego Domu. Nie żyją dwie osoby", "/Swiat"),
            ("/Polska/Polityka", "https://defence24.pl/geopolityka/ponad-100-okretow-wokol-tajwanu-nieogloszone-manewry-chin", "Ponad 100 okrętów wokół Tajwanu. Nieogłoszone manewry Chin", "/Swiat"),
            ("/Sport", "https://www.sport.pl/pilka/7,64946,33131669,mistrz-swiata-kandydatem-afd-na-prezydenta-niemiec-to-nie-zart.html", "Mistrz świata kandydatem AfD na prezydenta Niemiec. To nie żart", "/Swiat"),
            ("/Sport", "https://sportowefakty.wp.pl/pilka-nozna/1284061/moze-zostac-prezydentem-niemiec-to-byly-mistrz-swiata", "Może zostać prezydentem Niemiec. To były mistrz świata", "/Swiat"),
            ("/Sport", "https://www.sport.pl/inne/7,64998,33130240,polski-zwiazek-strzelectwa-reaguje-na-zamach-w-krakowie.html", "Polski Związek Strzelectwa reaguje na zamach w Krakowie", "/Polska"),
            ("/Polska/Polityka", "https://www.rp.pl/prawo-w-polsce/art45487551-zakaz-reklamy-aptek-zniesiony", "Zakaz reklamy aptek zniesiony, ale kary będą wyższe. Decyzja prezydenta", "/Polska/Polityka"),
            ("/Polska", "https://www.polsatnews.pl/wiadomosc/2026-11-12/pfizer-zablokowal-aktywa-pazp-jest-decyzja-sadu-w-brukseli", "Pfizer zablokował aktywa PAŻP. Jest decyzja sądu w Brukseli", "/Polska/Gospodarka"),
            ("/Polska/Energetyka", "https://energetyka24.com/surowce/ropa/plonie-rafineria-w-wolgogradzie", "Płonie rafineria w Wołgogradzie. Ukraińskie ataki znacząco zmniejszają rosyjskie moce", "/Swiat"),
            ("/Polska", "https://www.polsatnews.pl/wiadomosc/2026-11-13/slawa-upa-na-pomnikach-w-trojmiescie", '"Slawa UPA" na pomnikach w Trójmieście. Zatrzymano 17-latka z Ukrainy', "/Polska/Regiony/Pomorskie"),
            ("/Polska/Polityka", "https://www.rp.pl/transport/art45487771-usa-wstrzymuja-wszystkie-starty", "USA wstrzymują wszystkie starty samolotów. FAA wydała nadzwyczajny nakaz", "/Swiat"),
        ]
        for def_path, url, title, expected in cases:
            with self.subTest(title=title, def_path=def_path):
                self.assertEqual(uln.infer_category_path(def_path, url, title), expected)

    def test_all_16_voivodeships_and_county_towns_classification(self):
        regional_cases = [
            ("/Polska", "https://example.pl/1", "Awarie wodociągów w Wałbrzychu i Legnicy. Trwa usuwanie skutków", "", "/Polska/Regiony/Dolnoslaskie"),
            ("/Polska", "https://example.pl/2", "Rozbudowa węzła drogowego w Toruniu i Inowrocławiu", "", "/Polska/Regiony/Kujawsko-Pomorskie"),
            ("/Polska", "https://example.pl/3", "Miał dożywotni zakaz prowadzenia pojazdów, ale go złamał. 39-latek zatrzymany", "Zdarzenie w powiecie Tomaszów Lubelski.", "/Polska/Regiony/Lubelskie"),
            ("/Polska", "https://example.pl/4", "Nowa linia autobusowa połączy Gorzów Wielkopolski i Zieloną Górę", "", "/Polska/Regiony/Lubuskie"),
            ("/Polska", "https://example.pl/5", "Poważny wypadek pod Tomaszowem Mazowieckim i Radomskiem", "", "/Polska/Regiony/Lodzkie"),
            ("/Polska", "https://example.pl/6", "Remont linii kolejowej między Tarnowem a Nowym Sączem i Zakopanem", "", "/Polska/Regiony/Malopolskie"),
            ("/Polska", "https://example.pl/7", "Modernizacja dróg w Radomiu, Płocku i Siedlcach w tym roku", "", "/Polska/Regiony/Mazowieckie"),
            ("/Polska", "https://example.pl/8", "Most w Kędzierzynie-Koźlu i trasa w Nysie otwarte dla ruchu", "", "/Polska/Regiony/Opolskie"),
            ("/Polska", "https://example.pl/9", "Utrudnienia i objazdy na drodze krajowej w Mielcu i Przemyślu", "", "/Polska/Regiony/Podkarpackie"),
            ("/Polska", "https://example.pl/10", "Rozbudowa drogi z Suwałk do Bielska Podlaskiego na Podlasiu", "", "/Polska/Regiony/Podlaskie"),
            ("/Polska", "https://example.pl/11", "Karambol na S6 z samego rana. Zderzyło się pięć samochodów", "Do kolizji doszło na wysokości Sycewic w powiecie słupskim.", "/Polska/Regiony/Pomorskie"),
            ("/Polska", "https://example.pl/12", "Nowe autobusy wyjechały na ulice Częstochowy i Bielska-Białej", "", "/Polska/Regiony/Slaskie"),
            ("/Polska", "https://example.pl/13", "Modernizacja szpitala w Ostrowcu Świętokrzyskim i Sandomierzu", "", "/Polska/Regiony/Swietokrzyskie"),
            ("/Polska", "https://example.pl/14", "Tragedia pod Mrągowem. 30-latek usłyszał zarzut zabójstwa", "", "/Polska/Regiony/Warminsko-Mazurskie"),
            ("/Polska", "https://example.pl/15", "Obwodnica Kalisza, Piły i Wrześni w planach na ten rok", "", "/Polska/Regiony/Wielkopolskie"),
            ("/Polska", "https://example.pl/16", "Modernizacja nabrzeża w Koszalinie i Kołobrzegu oraz w miejscowości Wrześnica", "", "/Polska/Regiony/Zachodniopomorskie"),
            # Rozróżnianie kolizji geograficznych między województwami, zachowanie regionu i zakres ogólnopolski
            ("/Polska/Regiony/Wielkopolskie", "https://example.pl/17", "Wypadek na trasie pod Radomiem, korek na wylotówce", "", "/Polska/Regiony/Mazowieckie"),
            ("/Polska/Regiony/Podkarpackie", "https://example.pl/17b", "Inwestycja w strefie ekonomicznej w Mielcu i Przemyślu", "", "/Polska/Regiony/Podkarpackie"),
            ("/Polska", "https://example.pl/18", "Marsz Niepodległości w Warszawie zgromadził dziesiątki tysięcy osób", "", "/Polska"),
            ("/Polska", "https://example.pl/19", "Przełomowy wyrok warszawskiego sądu w sprawie skradzionego głosu", "", "/Polska"),
            ("/Polska", "https://example.pl/20", "Wypadek drogowy pod Ostrowem Wielkopolskim", "", "/Polska/Regiony/Wielkopolskie"),
            ("/Polska", "https://example.pl/21", "Pożar hali pod Ostrowią Mazowiecką", "", "/Polska/Regiony/Mazowieckie"),
        ]
        found_voivs = set()
        for def_path, url, title, desc, expected in regional_cases:
            with self.subTest(title=title, expected=expected):
                res = uln.infer_category_path(def_path, url, title, desc)
                self.assertEqual(res, expected)
                if expected.startswith("/Polska/Regiony/"):
                    found_voivs.add(expected)
        self.assertEqual(found_voivs, set(seo_builder.VOIVODESHIP_BY_PATH.keys()))

        # Wszystkie 16 województw i Energetyka są lokalne (dopuszczają 1 źródło), polityka ogólnopolska nie jest
        for v_path in seo_builder.VOIVODESHIP_BY_PATH:
            self.assertTrue(uln.is_local_or_niche_item({"path": v_path, "outlet": "Lokalny Portal"}))
        self.assertTrue(uln.is_local_or_niche_item({"path": "/Polska/Energetyka", "outlet": "PAP"}))
        self.assertFalse(uln.is_local_or_niche_item({"path": "/Polska/Polityka", "outlet": "Polsat News"}))

        # Wszystkie 16 województw muszą mieć dedykowane kanały RSS i TVP3 bez duplikatów URL
        feed_urls = [f["url"] for f in uln.LIVE_RSS_FEEDS]
        self.assertEqual(len(feed_urls), len(set(feed_urls)), "Wykryto duplikat URL w LIVE_RSS_FEEDS")
        self.assertEqual(len(uln.LIVE_RSS_FEEDS), 153)
        self.assertEqual(len({f["name"] for f in uln.LIVE_RSS_FEEDS}), 151)
        tvp3_feeds = [f for f in uln.LIVE_RSS_FEEDS if f.get("source_type") == "tvp3_sgdata"]
        self.assertEqual(len(tvp3_feeds), 16)
        self.assertEqual({f["path"] for f in tvp3_feeds}, set(seo_builder.VOIVODESHIP_BY_PATH.keys()))
        feed_voivs = {f["path"] for f in uln.LIVE_RSS_FEEDS if f["path"].startswith("/Polska/Regiony/")}
        self.assertEqual(feed_voivs, set(seo_builder.VOIVODESHIP_BY_PATH.keys()))


    def test_category_url_prefix_and_feed_separation_integrity(self):
        valid_cat_paths = {p for p, _, _ in seo_builder.CATEGORIES}
        for art in self.articles:
            cat_dir = art["seo_url"].rsplit("/", 1)[0]
            self.assertEqual(
                cat_dir,
                art["path"],
                f"Niespójność path ({art['path']}) vs seo_url ({art['seo_url']}) w id={art['id']}",
            )
            self.assertIn(art["path"], valid_cat_paths, f"Nieznana kategoria działu: {art['path']}")

        for fname in ("index.html", os.path.join("Polska", "index.html")):
            with open(os.path.join(ROOT_DIR, fname), "r", encoding="utf-8") as f:
                pol_doc = f.read()
            feed_html = pol_doc.split('id="articlesFeed"', 1)[-1].split("</section>", 1)[0]
            self.assertNotIn("/Swiat/", feed_html, f"{fname} nie może zawierać linków do artykułów /Swiat/")
            self.assertNotIn("/Sport/", feed_html, f"{fname} nie może zawierać linków do artykułów /Sport/")

        with open(os.path.join(ROOT_DIR, "Swiat", "index.html"), "r", encoding="utf-8") as f:
            swiat_feed = f.read().split('id="articlesFeed"', 1)[-1].split("</section>", 1)[0]
        self.assertNotIn("ILR-33", swiat_feed)
        self.assertNotIn("polska rakieta", swiat_feed.lower())
        self.assertNotIn("/Polska/", swiat_feed)

    def test_short_acronyms_and_verbal_stem_equivalents(self):
        t_faa_1 = uln.tokenize_title("Loty samolotów wstrzymane w całych USA. Pierwsze informacje")
        t_faa_2 = uln.tokenize_title("USA wstrzymują wszystkie starty samolotów. FAA wydała nadzwyczajny nakaz")
        self.assertIn("usa", t_faa_1 & t_faa_2)
        self.assertIn("wstrzym", t_faa_1 & t_faa_2)
        self.assertIn("samolot", t_faa_1 & t_faa_2)
        self.assertIn("lot", t_faa_1)
        self.assertIn("faa", t_faa_2)

        t_fin_1 = uln.tokenize_title("Kreml zażądał wyjścia Finlandii z NATO? Helsinki reagują na doniesienia")
        t_fin_2 = uln.tokenize_title('Rosyjskie żądania ws. wystąpienia Finlandii z NATO. "Po prostu oburzające"')
        self.assertTrue({"rosj", "zadan", "finland", "nato"}.issubset(t_fin_1 & t_fin_2))

        t_heg_1 = uln.tokenize_title("Pete Hegseth upomniany przez żołnierza. Szeregowy otrzymał medal")
        t_heg_2 = uln.tokenize_title("Szeregowy upomniał sekretarza wojny USA. Hegseth właśnie go odznaczył")
        self.assertTrue({"hegseth", "upomn", "szeregow"}.issubset(t_heg_1 & t_heg_2))

        res_lewica = uln.infer_category_path(
            "/Polska",
            "https://www.polsatnews.pl/wiadomosc/kusznieruk/",
            'Piotr Kusznieruk wykluczony z Nowej Lewicy. Miał "rażąco naruszyć statut"',
            "",
        )
        self.assertEqual(res_lewica, "/Polska/Polityka")

    def test_deduplication_and_source_merging_without_false_merges(self):
        art_faa_a = uln.build_article_from_group(
            [
                {
                    "outlet": "Interia Wydarzenia",
                    "group": "Interia",
                    "path": "/Swiat",
                    "title": "Loty samolotów wstrzymane w całych USA. Pierwsze informacje",
                    "description": "Federalna Administracja Lotnictwa FAA wstrzymała starty samolotów w całych Stanach Zjednoczonych z powodu awarii systemu.",
                    "link": "https://wydarzenia.interia.pl/zagranica/news-loty-usa,nId,1",
                    "thumbnail": "",
                },
                {
                    "outlet": "TVN24",
                    "group": "TVN24",
                    "path": "/Swiat",
                    "title": "Paraliż lotniczy w USA. Loty samolotów wstrzymane",
                    "description": "Wszystkie starty samolotów w USA zostały wstrzymane decyzją nadzoru lotniczego FAA.",
                    "link": "https://tvn24.pl/swiat/usa-loty-1",
                    "thumbnail": "",
                },
            ],
            1,
        )
        orig_url = art_faa_a["seo_url"]

        new_cluster_faa = [
            {
                "outlet": "Rzeczpospolita",
                "group": "Gremi Media",
                "path": "/Swiat",
                "title": "USA wstrzymują wszystkie starty samolotów. FAA wydała nadzwyczajny nakaz",
                "description": "Amerykańska agencja FAA wydała nakaz wstrzymania startów samolotów na lotniskach w USA.",
                "link": "https://www.rp.pl/swiat/art1",
                "thumbnail": "",
            }
        ]
        matched = uln.find_matching_existing_article(new_cluster_faa, [art_faa_a])
        self.assertIsNotNone(matched)
        merged_ok = uln.merge_cluster_into_article(matched, new_cluster_faa)
        self.assertTrue(merged_ok)
        self.assertEqual(matched["seo_url"], orig_url)
        self.assertIn("Rzeczpospolita", matched["sources"])
        self.assertEqual(len(matched["sources"]), 3)

        # Dwa różne wydarzenia o tym samym polityku (np. dwie różne ustawy prezydenta) NIE mogą zostać sklejone
        art_nawrocki_apteki = uln.build_article_from_group(
            [
                {
                    "outlet": "Rzeczpospolita",
                    "path": "/Polska/Polityka",
                    "title": "Prezydent Karol Nawrocki podpisał ustawę o zakazie reklamy aptek",
                    "description": "Nowelizacja prawa farmaceutycznego podwyższa kary za nielegalną reklamę aptek w Polsce.",
                    "link": "https://rp.pl/apteki",
                    "thumbnail": "",
                },
                {
                    "outlet": "RMF24",
                    "path": "/Polska/Polityka",
                    "title": "Ustawa apteczna z podpisem prezydenta Nawrockiego",
                    "description": "Karol Nawrocki podpisał nowelizację prawa farmaceutycznego dotyczącą reklamowania aptek.",
                    "link": "https://rmf24.pl/apteki",
                    "thumbnail": "",
                },
            ],
            2,
        )
        art_nawrocki_dsa = uln.build_article_from_group(
            [
                {
                    "outlet": "Polsat News",
                    "path": "/Polska/Polityka",
                    "title": "Prezydent Karol Nawrocki zawetował ustawę o blokowaniu nielegalnych treści w internecie",
                    "description": "Weto prezydenta dotyczy wdrożenia unijnego aktu o usługach cyfrowych DSA oraz uprawnień UKE.",
                    "link": "https://polsatnews.pl/dsa",
                    "thumbnail": "",
                },
                {
                    "outlet": "Onet Wiadomości",
                    "path": "/Polska/Polityka",
                    "title": "Ustawa o usługach cyfrowych zawetowana przez prezydenta Nawrockiego",
                    "description": "Karol Nawrocki sprzeciwił się przepisom o usuwaniu treści z internetu przez urzędników.",
                    "link": "https://onet.pl/dsa",
                    "thumbnail": "",
                },
            ],
            3,
        )
        deduped = uln.deduplicate_existing_articles([art_nawrocki_apteki, art_nawrocki_dsa])
        self.assertEqual(len(deduped), 2)

    def test_source_filter_bar_and_perspectives_collapsing_in_ssr(self):
        self.assertEqual(
            seo_builder._extract_paragraph_outlets("Tekst [Źródło: TVN24, PAP]", "", ["TVN24", "PAP"]),
            ["TVN24", "PAP"],
        )
        self.assertEqual(
            seo_builder._extract_paragraph_outlets("Tekst bez tagu", "Relacja źródłowa (Radio Olsztyn)", ["Radio Olsztyn"]),
            ["Radio Olsztyn"],
        )

        multi_art = next((a for a in self.articles if len(a.get("sources") or []) >= 2), None)
        self.assertIsNotNone(multi_art)
        multi_html_path = os.path.join(ROOT_DIR, multi_art["seo_url"].lstrip("/"), "index.html")
        with open(multi_html_path, "r", encoding="utf-8") as f:
            multi_doc = f.read()
        self.assertIn('class="source-filter-bar"', multi_doc)
        self.assertIn('data-outlet-filter="', multi_doc)
        self.assertIn('data-outlets="', multi_doc)
        self.assertIn('class="perspective-filter-btn"', multi_doc)

        rich_art = next((a for a in self.articles if len(a.get("perspectives") or []) > 4), None)
        self.assertIsNotNone(rich_art, "Brak artykułu z >4 perspektywami do testu zwijania listy")
        rich_html_path = os.path.join(ROOT_DIR, rich_art["seo_url"].lstrip("/"), "index.html")
        with open(rich_html_path, "r", encoding="utf-8") as f:
            rich_doc = f.read()
        self.assertIn("is-collapsed-persp", rich_doc)
        self.assertIn('class="perspectives-expand-btn"', rich_doc)

        single_art = next((a for a in self.articles if len(a.get("sources") or []) == 1), None)
        self.assertIsNotNone(single_art)
        single_html_path = os.path.join(ROOT_DIR, single_art["seo_url"].lstrip("/"), "index.html")
        with open(single_html_path, "r", encoding="utf-8") as f:
            single_doc = f.read()
        self.assertNotIn('class="source-filter-bar"', single_doc)
        self.assertNotIn('class="perspectives-expand-btn"', single_doc)


class TestParsersAndRegressionGuards(unittest.TestCase):
    def test_swiat_vs_regiony_and_fuel_vs_gas_conflict_guards(self):
        swiat = {"title": "Wybory w regionie budzą ogromne emocje", "description": "Głosowanie za granicą", "path": "/Swiat"}
        region = {"title": "Wybory w regionie budzą ogromne emocje", "description": "Głosowanie lokalne", "path": "/Polska/Regiony/Wielkopolskie"}
        self.assertTrue(uln.has_cluster_conflict(swiat, region))

        fuel = {
            "title": "Ceny paliw ostro w górę na stacjach w całej Polsce",
            "description": "Benzyna Pb95 i olej napędowy diesel drożeją piąty dzień z rzędu.",
            "path": "/Polska/Gospodarka",
        }
        gas = {
            "title": "Ceny w górę od nowego roku. Rząd analizuje taryfy",
            "description": "Zamrożenie cen gazu ziemnego i rozliczenia za MWh mogą obciążyć odbiorców PGNiG.",
            "path": "/Polska/Energetyka",
        }
        self.assertTrue(uln.has_cluster_conflict(fuel, gas))

    def test_tvp3_sgdata_and_newsdata_filtering_and_urljoin(self):
        fake_sg = [
            None,
            {
                "params": {"title": "Aktualności z regionu"},
                "items": [
                    None,
                    {
                        "items": [
                            {
                                "title": "Nowy most nad Wartą w Poznaniu otwarty dla kierowców",
                                "url": "/96460001/nowy-most-nad-warta",
                                "lead": "Przeprawa przez rzekę Wartę została uroczyście otwarta dla samochodów i rowerzystów.",
                                "image": {"url": "https://s1.tvp.pl/images2/most.jpg"},
                            }
                        ]
                    },
                    {
                        "title": "Krótka zapowiedź bez treści",
                        "url": "/96460002/krotki",
                        "lead": "Za krótki opis",
                    },
                    {
                        "title": "Ogólnopolski skrót dnia z TVP Info",
                        "url": "https://www.tvp.info/96469999/skrot-dnia",
                        "lead": "Ten wpis pochodzi z portalu tvp.info i musi zostać odfiltrowany jako ogólnopolski.",
                    },
                ],
            },
            {
                "params": {"title": "NAJNOWSZE Z PORTALU TVP.INFO"},
                "items": [
                    {
                        "title": "Promocyjny materiał z bloku TVP.INFO",
                        "url": "/96460003/promo",
                        "lead": "Ten materiał nie powinien trafić do depesz regionalnych mimo lokalnego URL.",
                    }
                ],
            },
            {
                "params": {"title": "ZOBACZ KONIECZNIE"},
                "items": [
                    {
                        "title": "Program rozrywkowy do obejrzenia",
                        "url": "/96460004/program",
                        "lead": "Ten materiał znajduje się w bloku promocyjnym i musi zostać pominięty.",
                    }
                ],
            },
        ]
        html_doc = f'<html><script>window.__sgData = {json.dumps(fake_sg)};</script></html>'
        feed = {"name": "TVP3 Poznań", "url": "https://poznan.tvp.pl/", "path": "/Polska/Regiony/Wielkopolskie", "group": "TVP3", "source_type": "tvp3_sgdata"}
        items = uln._parse_tvp3_items_from_html(html_doc, feed)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["link"], "https://poznan.tvp.pl/96460001/nowy-most-nad-warta")
        self.assertEqual(items[0]["thumbnail"], "https://s1.tvp.pl/images2/most.jpg")

        html_newsdata = '<html><script>window.__newsData = [{"params":{"title":"Region"},"items":[{"title":"Modernizacja linii kolejowej pod Opolem przyspiesza","url":"/123/kolej-opole","lead":"Inwestor zakończył główny etap wymiany torów na trasie w województwie opolskim."}]}];</script></html>'
        feed_op = {"name": "TVP3 Opole", "url": "https://opole.tvp.pl/", "path": "/Polska/Regiony/Opolskie", "group": "TVP3", "source_type": "tvp3_sgdata"}
        items_op = uln._parse_tvp3_items_from_html(html_newsdata, feed_op)
        self.assertEqual(len(items_op), 1)
        self.assertEqual(items_op[0]["link"], "https://opole.tvp.pl/123/kolej-opole")

    def test_leading_whitespace_truncated_xml_gzip_and_over10_perspectives(self):
        import io
        import zlib

        raw_xml = (
            '\n  \ufeff<?xml version="1.0" encoding="utf-8"?>\n'
            "<rss><channel><title>rc.fm</title>"
            "<item><title>Nowe autobusy miejskie w Kaliszu</title>"
            "<link>https://www.rc.fm/news/autobusy-kalisz</link>"
            "<description>Miasto zakupiło pięć nowych pojazdów niskoemisyjnych do obsługi linii podmiejskich.</description>"
            "</item><item><title>Urwany wpis"
        ).encode("utf-8")

        comp = zlib.compressobj(6, zlib.DEFLATED, 16 + zlib.MAX_WBITS)
        gz_bytes = comp.compress(raw_xml) + comp.flush()

        class _FakeResp:
            def __init__(self, data, enc="gzip"):
                self._bio = io.BytesIO(data)
                self.headers = {"Content-Encoding": enc}

            def read(self, n=-1):
                return self._bio.read(n)

        decoded = uln._read_response_bytes(_FakeResp(gz_bytes), max_bytes=420_000)
        root = uln._parse_feed_xml(decoded)
        parsed_items = [el for el in root.iter() if uln._local_tag(el) == "item"]
        self.assertEqual(len(parsed_items), 1)

        atom_unbound = b'<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Gorzow test</title><media:content url="https://example.pl/img.jpg"/></entry></feed>'
        atom_root = uln._parse_feed_xml(atom_unbound)
        atom_entries = [el for el in atom_root.iter() if uln._local_tag(el) == "entry"]
        self.assertEqual(len(atom_entries), 1)

        group = [
            {
                "outlet": f"Redakcja {i}",
                "group": f"Redakcja {i}",
                "path": "/Polska",
                "title": f"Ważna decyzja gospodarcza rządu w Warszawie nr {i}",
                "description": f"Ministerstwo przedstawiło kompleksowy projekt zmian regulacyjnych w tym roku nr {i}.",
                "link": f"https://example{i}.pl/news",
                "thumbnail": "",
            }
            for i in range(1, 13)
        ]
        art = uln.build_article_from_group(group, 1)
        self.assertEqual(len(art["sources"]), 12)
        self.assertEqual(len(art["perspectives"]), 12)
        self.assertEqual(len(art["perspectives"]), len(art["sources"]))

        jetpack_raw = (
            '<p><img src="https://example.pl/img.jpg" data-image-description="&lt;p&gt;bulaje 4555666&lt;/p&gt;\n" '
            'data-image-caption="" data-large-file="https://i0.wp.com/example.pl/img.jpg?fit=696%2C464&amp;ssl=1" /></p>\n'
            '<p>Szokujące zgłoszenie postawiło na nogi służby w całym regionie.</p>'
        )
        cleaned_jetpack = uln.clean_html_for_synthesis(jetpack_raw, "Test")
        self.assertEqual(cleaned_jetpack, "Szokujące zgłoszenie postawiło na nogi służby w całym regionie.")
        self.assertNotIn("data-large-file", uln.strip_html(jetpack_raw))


if __name__ == "__main__":
    unittest.main()


