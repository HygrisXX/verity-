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

    def test_podwojnym_gazie_different_voivodeships_conflict_and_do_not_cluster(self):
        epoznan_title = 'Policjanci zatrzymali do kontroli kierowcę samochodu dostawczego. Okazało się, że jechał na "podwójnym gazie"'
        epoznan_desc = "Do zatrzymania doszło w czwartek w Wólce (powiat słupecki)."
        epoznan_url = "https://epoznan.pl/news-news-181940-policjanci_zatrzymali_do_kontroli_kierowce_samochodu_dostawczego_okazalo_sie_ze_jechal_na_podwojnym_gazie?rss=1"
        epoznan = {
            "outlet": "ePoznan.pl",
            "group": "ePoznan.pl",
            "title": epoznan_title,
            "description": epoznan_desc,
            "link": epoznan_url,
            "path": uln.infer_category_path("/Polska/Regiony/Wielkopolskie", epoznan_url, epoznan_title, epoznan_desc),
        }

        lublin_title = "Prowadził auto na podwójnym gazie. Zatrzymał go świadek"
        lublin_desc = "Pijany 57-latek kierujący autem osobowym został zatrzymany dzięki interwencji świadka w miejscowości Hubinek."
        lublin_url = "https://radio.lublin.pl/2026/11/prowadzil-auto-na-podwojnym-gazie-zatrzymal-go-swiadek/"
        lublin = {
            "outlet": "Radio Lublin",
            "group": "Radio Lublin",
            "title": lublin_title,
            "description": lublin_desc,
            "link": lublin_url,
            "path": uln.infer_category_path("/Polska/Regiony/Lubelskie", lublin_url, lublin_title, lublin_desc),
        }

        self.assertEqual(epoznan["path"], "/Polska/Regiony/Wielkopolskie")
        self.assertEqual(lublin["path"], "/Polska/Regiony/Lubelskie")
        self.assertTrue(uln.has_cluster_conflict(epoznan, lublin))
        self.assertEqual(len(uln.cluster_similar_items([epoznan, lublin])), 2)

    def test_sentence_start_medical_gauze_different_voivodeships_conflict_and_do_not_cluster(self):
        cases = [
            (
                "medical_gauze",
                "Gazę medyczną wycofano z obrotu. Komunikat GIF",
                "Hurtownie wycofują wskazaną serię opatrunków z obrotu.",
                "gaza-medyczna-wycofana",
            ),
            (
                "pressurized_gas",
                "Gazie pod ciśnieniem nie wolno zostawiać w nagrzanym aucie",
                "Straż pożarna przypomina o zasadach bezpieczeństwa podczas upałów.",
                "gazie-pod-cisnieniem-w-aucie",
            ),
            (
                "gauze_locative_opatrunkowa",
                "Informacje o Gazie opatrunkowej z hurtowni",
                "Inspektorat sprawdza komunikaty dotyczące dostaw opatrunków.",
                "informacje-o-gazie-opatrunkowej",
            ),
            (
                "municipal_sewer_gas",
                "W mieście gazy z kanalizacji wywołały ewakuację",
                "Strażacy zabezpieczyli studzienki i sprawdzili stężenie oparów.",
                "w-miescie-gazy-z-kanalizacji",
            ),
            (
                "hospital_gauze_appeal",
                "Szpital apeluje o gazę dla pacjentów",
                "Placówka prosi darczyńców o podstawowe materiały opatrunkowe.",
                "szpital-apeluje-o-gaze",
            ),
            (
                "title_case_lub",
                "Zakup Gazy lub Bandaży na Oddział",
                "Dyrekcja placówki ogłosiła przetarg na środki opatrunkowe.",
                "zakup-gazy-lub-bandazy",
            ),
        ]
        for label, title, desc, slug in cases:
            with self.subTest(case=label):
                rzeszow_url = f"https://radio.rzeszow.pl/wiadomosci/{slug}"
                rzeszow = {
                    "outlet": "Radio Rzeszów",
                    "group": "Radio Rzeszów",
                    "title": title,
                    "description": desc,
                    "link": rzeszow_url,
                    "path": uln.infer_category_path("/Polska/Regiony/Podkarpackie", rzeszow_url, title, desc),
                }
                kielce_url = f"https://radiokielce.pl/wiadomosci/{slug}"
                kielce = {
                    "outlet": "Radio Kielce",
                    "group": "Radio Kielce",
                    "title": title,
                    "description": desc,
                    "link": kielce_url,
                    "path": uln.infer_category_path("/Polska/Regiony/Swietokrzyskie", kielce_url, title, desc),
                }

                self.assertEqual(rzeszow["path"], "/Polska/Regiony/Podkarpackie")
                self.assertEqual(kielce["path"], "/Polska/Regiony/Swietokrzyskie")
                self.assertTrue(uln.has_cluster_conflict(rzeszow, kielce))
                self.assertEqual(len(uln.cluster_similar_items([rzeszow, kielce])), 2)


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
        self.assertNotIn("podwójnym gazie", swiat_feed.lower())
        self.assertNotIn("policjanci-zatrzymali-do-kontroli-kierowce-samochodu-dostawczego", swiat_feed)
        self.assertFalse(
            os.path.exists(
                os.path.join(
                    ROOT_DIR,
                    "Swiat",
                    "policjanci-zatrzymali-do-kontroli-kierowce-samochodu-dostawczego",
                    "index.html",
                )
            )
        )
        for art in self.articles:
            if art.get("path") == "/Swiat":
                self.assertNotIn("podwójnym gazie", (art.get("seo_title") or "").lower())

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

    def test_gaza_mideast_vs_polish_gas_alcohol_and_gauze_classification(self):
        mideast_cases = [
            ("/Polska", "https://example.pl/g1", "Sytuacja w Strefie Gazy jest dramatyczna", "", "/Swiat"),
            ("/Polska", "https://example.pl/g2", "Strefa Gazy pod ostrzałem", "", "/Swiat"),
            ("/Polska", "https://example.pl/g3", "Sektor Gazy w ruinie", "", "/Swiat"),
            ("/Polska", "https://example.pl/g4", "Walki w Gazie przybierają na sile", "", "/Swiat"),
            ("/Polska", "https://example.pl/g5", "Atak w Gazie", "", "/Swiat"),
            ("/Polska", "https://example.pl/g6", "Kryzys w Gazie", "", "/Swiat"),
            ("/Polska", "https://example.pl/g7", "Nowe naloty na Gazę", "", "/Swiat"),
            ("/Polska", "https://example.pl/g8", "Pomoc humanitarna dotarła do Gazy", "", "/Swiat"),
            ("/Polska", "https://example.pl/g9", "Wyjechali z Gazy", "", "/Swiat"),
            ("/Polska", "https://example.pl/g10", "Gaza pod blokadą", "", "/Swiat"),
            ("/Polska", "https://example.pl/g11", "W Gazie brakuje wody pitnej", "", "/Swiat"),
            ("/Polska", "https://example.pl/g12", "Dzieci w Gazie potrzebują leków", "", "/Swiat"),
            ("/Polska", "https://example.pl/g13", "Gaza: rozejm nadal niepewny", "", "/Swiat"),
            ("/Polska", "https://example.pl/g14", "WALKI W GAZIE PRZYBIERAJĄ NA SILE", "", "/Swiat"),
            ("/Polska", "https://example.pl/g15", "Szpital w Gazie bez opatrunków i bandaży", "", "/Swiat"),
            ("/Polska", "https://example.pl/g16", "W Gazie brakuje leków i gazy opatrunkowej", "", "/Swiat"),
            ("/Polska/Regiony/Mazowieckie", "https://example.pl/g16b", "W Gazie brakuje leków i gazy opatrunkowej", "", "/Swiat"),
            ("/Polska", "https://example.pl/g17", "Szpital w Gazie: kończy się jałowa gaza i bandaże", "", "/Swiat"),
            ("/Polska", "https://example.pl/g18", "Po ataku w Gazie konwój wiózł gazę opatrunkową", "", "/Swiat"),
            ("/Polska", "https://example.pl/g19", "W Gazie spłonęło auto na gazie po uderzeniu rakiety", "", "/Swiat"),
            ("/Polska", "https://example.pl/g20", "Lekarze w Gazie alarmują: brakuje gazy opatrunkowej", "", "/Swiat"),
            ("/Polska", "https://example.pl/g21", "W Gazie zabrakło gazy opatrunkowej w szpitalach", "", "/Swiat"),
            ("/Polska", "https://example.pl/g22", "Walki w Gazie i gazy łzawiące", "", "/Swiat"),
            ("/Polska", "https://example.pl/g23", "Brakuje gazy opatrunkowej w Gazie", "", "/Swiat"),
            ("/Polska", "https://example.pl/g24", "İzmir: W Gazie zabrakło gazy opatrunkowej", "", "/Swiat"),
            ("/Polska", "https://example.pl/g25", "KONIEC WALK W GAZIE", "", "/Swiat"),
            ("/Polska", "https://example.pl/g26", "SYTUACJA W GAZIE CORAZ TRUDNIEJSZA", "", "/Swiat"),
            ("/Polska", "https://example.pl/g27", "POMOC DO GAZY NIE DOCIERA", "", "/Swiat"),
            ("/Polska", "https://example.pl/g28", "W MIEŚCIE GAZA BRAKUJE WODY", "", "/Swiat"),
            ("/Polska", "https://example.pl/g29", "W Gazie Brakuje Leków", "", "/Swiat"),
            ("/Polska", "https://example.pl/g30", "PILNE: W Gazie Dramat Mieszkańców", "", "/Swiat"),
            ("/Polska", "https://example.pl/g31", "Gazy i Zachodniego Brzegu dotyczy nowy plan pokojowy", "", "/Swiat"),
            ("/Polska", "https://example.pl/g32", "Gaza — nowe ustalenia o losie zakładników", "", "/Swiat"),
            ("/Polska", "https://example.pl/g33", "Gaza – sytuacja bez zmian od tygodnia", "", "/Swiat"),
            ("/Polska", "https://example.pl/g34", "Gaza nadal bez dostępu do czystej wody", "", "/Swiat"),
            ("/Polska", "https://example.pl/g35", "Gaza po wojnie potrzebuje odbudowy", "", "/Swiat"),
            ("/Polska", "https://example.pl/g36", "Gaza apeluje o pomoc", "", "/Swiat"),
            ("/Polska", "https://example.pl/g37", "KRYZYS HUMANITARNY W GAZIE", "", "/Swiat"),
            ("/Polska", "https://example.pl/g38", "W GAZIE ZGINĘŁO 20 OSÓB", "", "/Swiat"),
            ("/Polska", "https://example.pl/g39", "SZPITAL W GAZIE POD OSTRZAŁEM", "", "/Swiat"),
            ("/Polska", "https://example.pl/g40", "Dramat W Gazie Trwa", "", "/Swiat"),
            ("/Polska", "https://example.pl/g41", "Raport UNRWA z Gazy", "", "/Swiat"),
            ("/Polska", "https://example.pl/g42", "Życie w Gazie", "", "/Swiat"),
            ("/Polska", "https://example.pl/g43", "Głód w Gazie", "", "/Swiat"),
            ("/Polska", "https://example.pl/g44", "Uchodźcy z Gazy", "", "/Swiat"),
            ("/Polska", "https://example.pl/g45", "WIDEO: Życie w Gazie", "", "/Swiat"),
            ("/Polska", "https://example.pl/g46", "PILNE: Droga do Gazy", "", "/Swiat"),
            ("/Polska", "https://example.pl/g47", "Dziennikarz: Prawda o Gazie", "", "/Swiat"),
            ("/Polska", "https://example.pl/g48", "Co po Gazie? Nowy plan pokojowy dla regionu", "", "/Swiat"),
            ("/Polska", "https://example.pl/g49", "Po Gazie potrzebna jest odbudowa całego regionu", "", "/Swiat"),
            ("/Polska", "https://example.pl/g50", "Rośnie ciśnienie polityczne na rozejm w Gazie", "", "/Swiat"),
            ("/Polska", "https://example.pl/g51", "Wysokie ciśnienie dyplomatyczne po atakach w Gazie", "", "/Swiat"),
            ("/Polska", "https://example.pl/g52", "Ciśnienie na rozejm po walkach w Gazie", "", "/Swiat"),
            ("/Polska", "https://example.pl/g53", "Αθήνας: W Gazie brakuje gazy opatrunkowej", "", "/Swiat"),
            ("/Polska", "https://example.pl/g54", "Zamówił dla Gazy transport wody", "", "/Swiat"),
        ]
        for def_path, url, title, desc, expected in mideast_cases:
            with self.subTest(kind="mideast", title=title):
                self.assertEqual(uln.infer_category_path(def_path, url, title, desc), expected)

        polish_non_swiat_cases = [
            (
                "/Polska/Regiony/Wielkopolskie",
                "https://epoznan.pl/news-news-181940-policjanci_zatrzymali_do_kontroli_kierowce_samochodu_dostawczego_okazalo_sie_ze_jechal_na_podwojnym_gazie?rss=1",
                'Policjanci zatrzymali do kontroli kierowcę samochodu dostawczego. Okazało się, że jechał na "podwójnym gazie"',
                "Do zatrzymania doszło w czwartek w Wólce (powiat słupecki).",
                "/Polska/Regiony/Wielkopolskie",
            ),
            (
                "/Polska/Regiony/Lubelskie",
                "https://radio.lublin.pl/2026/11/prowadzil-auto-na-podwojnym-gazie-zatrzymal-go-swiadek/",
                "Prowadził auto na podwójnym gazie. Zatrzymał go świadek",
                "",
                "/Polska/Regiony/Lubelskie",
            ),
            ("/Polska", "https://example.pl/p3", "Kierowca jechał na gazie i spowodował kolizję", "", "/Polska"),
            ("/Polska", "https://example.pl/p4", "W gazie ziemnym wykryto zanieczyszczenia", "", "/Polska"),
            ("/Polska", "https://example.pl/p5", "W gazie łupkowym znaleziono nowe złoża", "", "/Polska"),
            ("/Polska", "https://example.pl/p6", "W gazie pieprzowym był silny składnik", "", "/Polska"),
            ("/Polska", "https://example.pl/p7", "Stężenie metanu w gazie", "", "/Polska"),
            ("/Polska", "https://example.pl/p8", "Rozpuszczone w gazie cząsteczki", "", "/Polska"),
            ("/Polska", "https://example.pl/p9", "Gaza opatrunkowa w apteczce", "", "/Polska"),
            ("/Polska", "https://example.pl/p10", "Jałowa gaza na ranę", "", "/Polska"),
            ("/Polska", "https://example.pl/p11", "Auto na gazie z instalacją LPG", "", "/Polska"),
            ("/Polska", "https://example.pl/p12", "Gazy cieplarniane przyspieszają ocieplenie", "", "/Polska"),
            ("/Polska", "https://example.pl/p13", "KIEROWCA JECHAŁ NA PODWÓJNYM GAZIE", "", "/Polska"),
            ("/Polska", "https://example.pl/p14", "STĘŻENIE METANU W GAZIE", "", "/Polska"),
            ("/Polska", "https://example.pl/p15", "Gazę medyczną wycofano z obrotu. Komunikat GIF", "", "/Polska"),
            ("/Polska", "https://example.pl/p16", "Gazą i bandażem opatrzono poszkodowanego na miejscu wypadku", "", "/Polska"),
            ("/Polska", "https://example.pl/p17", "Gazę chłonną trudno kupić po fali wykupów w aptekach", "", "/Polska"),
            ("/Polska", "https://example.pl/p18", "Gazę do opatrywania ran trudno kupić w hurtowni", "", "/Polska"),
            ("/Polska", "https://example.pl/p19", "Gazie pod ciśnieniem nie wolno przewozić w bagażniku", "", "/Polska"),
            ("/Polska", "https://example.pl/p20", "Gazie używanym przy spawaniu poświęcono nowe przepisy", "", "/Polska"),
            ("/Polska", "https://example.pl/p21", "Nowa Gaza do Opatrywania Ran", "", "/Polska"),
            ("/Polska", "https://example.pl/p22", "Kierowca po Gazie Zatrzymany Przez Patrol", "", "/Polska"),
            ("/Polska", "https://example.pl/p23", "Zatrzymany na „podwójnym” Gazie wjechał do rowu", "", "/Polska"),
            ("/Polska", "https://example.pl/p24", "Cena Gazy w aptece wzrosła", "", "/Polska/Gospodarka"),
            ("/Polska", "https://example.pl/p25", "Gazą z apteki opatrzyli ranę", "", "/Polska"),
            ("/Polska", "https://example.pl/p26", "Kierowca jechał na tzw. podwójnym gazie", "", "/Polska"),
            ("/Polska", "https://example.pl/p27", "W mieście gazy cieplarniane przekroczyły normę", "", "/Polska"),
            ("/Polska", "https://example.pl/p28", "W SZPITALU BRAKUJE GAZY", "", "/Polska"),
            ("/Polska", "https://example.pl/p29", "İzmir: Gazę medyczną wycofano z obrotu", "", "/Polska"),
            ("/Polska", "https://example.pl/p30", "W mieście gazy z kanalizacji wywołały ewakuację", "", "/Polska"),
            ("/Polska", "https://example.pl/p31", "Na terenie miasta gazy wybuchły w kotłowni", "", "/Polska"),
            ("/Polska", "https://example.pl/p32", "W MIEŚCIE GAZY Z KANALIZACJI WYWOŁAŁY EWAKUACJĘ", "", "/Polska"),
            ("/Polska", "https://example.pl/p33", "Szpital apeluje o gazę dla pacjentów", "", "/Polska"),
            ("/Polska", "https://example.pl/p34", "Szpital czeka na gazę z hurtowni", "", "/Polska"),
            ("/Polska", "https://example.pl/p35", "Szpital Apeluje o Gazę dla Pacjentów", "", "/Polska"),
            ("/Polska", "https://example.pl/p36", "Lekarze proszą o gazę dla oddziału ratunkowego", "", "/Polska"),
            ("/Polska", "https://example.pl/p37", "Mieszkańcy wykupili zapasy gazy w sklepach", "", "/Polska/Gospodarka"),
            ("/Polska", "https://example.pl/p38", "Informacje o Gazie opatrunkowej z hurtowni", "", "/Polska"),
            ("/Polska", "https://example.pl/p39", "Informacje o Gazie medycznej w raportach GIF", "", "/Polska"),
            ("/Polska", "https://example.pl/p40", "Zakup Gazy lub Bandaży na Oddział", "", "/Polska"),
            ("/Polska", "https://example.pl/p41", "Dostawa Gazy oraz Opatrunków", "", "/Polska"),
            ("/Polska", "https://example.pl/p42", "PILNE: Zakup Gazy oraz Bandaży na Oddział", "", "/Polska"),
            ("/Polska", "https://example.pl/p43", "Dostawa 500 rolek Gazy do hurtowni", "", "/Polska"),
            ("/Polska", "https://example.pl/p44", "Został tylko kawałek Gazy na półce", "", "/Polska"),
            ("/Polska", "https://example.pl/p45", "“Gazę do celów medycznych wycofano”", "", "/Polska"),
            ("/Polska", "https://example.pl/p46", "Auto na gazie — Gazę kupił na stacji", "", "/Polska"),
            ("/Polska", "https://example.pl/p47", "W gazie nie ma wody ani siarkowodoru", "", "/Polska"),
        ]
        for def_path, url, title, desc, expected in polish_non_swiat_cases:
            with self.subTest(kind="polish_gas", title=title):
                got = uln.infer_category_path(def_path, url, title, desc)
                self.assertNotEqual(got, "/Swiat")
                self.assertEqual(got, expected)

    def test_tvp3_directory_data_and_feed_volume_configuration(self):
        directory_payload = {
            "title": "Aktualności",
            "params": {"type": None, "title": None, "order": "release_date_long,-1"},
            "vortal_id": 434300,
            "items_total_count": 60549,
            "items_per_page": 20,
            "items_page": 1,
            "items": [
                {
                    "id": 96457890,
                    "title": " &bdquo;Remont mostu&rdquo; w Opolu &amp; okolicy przyspiesza",
                    "url": "/96457890/remont-mostu-w-opolu",
                    "lead": "Drogowcy zakończyli kluczowy etap prac w Kędzierzynie-Koźlu &amp; Nysie na Opolszczyźnie.",
                    "image": {"url": "https://s10.tvp.pl/images2/opole-most.jpg"},
                    "breadcrumbs": [{"title": "Inne", "url": "/1701243/inne"}],
                    "playable": False,
                },
                {
                    "id": 96463305,
                    "title": "Wiadomość bez leada powinna zostać bezpiecznie pominięta",
                    "url": "/96463305/bez-leada",
                    "lead": None,
                    "image": {"url": "https://s4.tvp.pl/images2/brak-leada.jpg"},
                },
                {
                    "id": 96469999,
                    "title": "Wpis z TVP Info mimo obecności w katalogu",
                    "url": "https://www.tvp.info/96469999/ogolnopolski",
                    "lead": "Ten materiał pochodzi z tvp.info i musi zostać odfiltrowany przez parser TVP3.",
                },
                {
                    "id": 96463345,
                    "title": "Pech ma swoje święto, a przesądy wciąż w modzie",
                    "url": "/96463345/przesady-horoskop",
                    "lead": "Długi opis materiału rozrywkowego, który powinien odpaść na filtrze opinii i rozrywki.",
                },
                {
                    "id": 96455888,
                    "title": "Bezpłatne badania w Opolu bez prawidłowej miniatury",
                    "url": "/96455888/badania-opole",
                    "lead": "Opolski oddział NFZ zaprasza mieszkańców regionu na bezpłatne konsultacje profilaktyczne.",
                    "image": {"url": "https://opole.tvp.pl/favicon.ico"},
                },
            ],
        }
        html_dir = f"<html><script>window.__directoryData = {json.dumps(directory_payload)};</script></html>"
        feed_dir = {
            "name": "TVP3 Opole",
            "url": "https://opole.tvp.pl/38939592/aktualnosci",
            "path": "/Polska/Regiony/Opolskie",
            "group": "TVP3",
            "source_type": "tvp3_sgdata",
        }
        items_dir = uln._parse_tvp3_items_from_html(html_dir, feed_dir)
        self.assertEqual(len(items_dir), 2)
        self.assertEqual(items_dir[0]["title"], "„Remont mostu” w Opolu & okolicy przyspiesza")
        self.assertEqual(items_dir[0]["link"], "https://opole.tvp.pl/96457890/remont-mostu-w-opolu")
        self.assertEqual(
            items_dir[0]["description"],
            "Drogowcy zakończyli kluczowy etap prac w Kędzierzynie-Koźlu & Nysie na Opolszczyźnie.",
        )
        self.assertEqual(items_dir[0]["thumbnail"], "https://s10.tvp.pl/images2/opole-most.jpg")
        self.assertEqual(items_dir[0]["pub_date"], "")
        self.assertEqual(items_dir[0]["path"], "/Polska/Regiony/Opolskie")
        self.assertEqual(items_dir[1]["link"], "https://opole.tvp.pl/96455888/badania-opole")
        self.assertEqual(items_dir[1]["thumbnail"], "")

        # Blok z _TVP3_SKIP_BLOCKS musi być pominięty również w formacie __directoryData
        skip_payload = {
            "title": "POGODA",
            "params": {"title": None},
            "items": [
                {
                    "title": "Prognoza pogody na jutro rano dla całego regionu",
                    "url": "/999/pogoda",
                    "lead": "Szczegółowy opis prognozy pogody na jutrzejszy dzień o odpowiedniej długości.",
                }
            ],
        }
        self.assertEqual(
            uln._parse_tvp3_items_from_html(
                f"<html><script>window.__directoryData = {json.dumps(skip_payload)};</script></html>",
                feed_dir,
            ),
            [],
        )
        with self.assertRaises(ValueError):
            uln._parse_tvp3_items_from_html("<html><script>window.__other = {};</script></html>", feed_dir)

        # Weryfikacja skonfigurowanych kanałów i limitów publikacji z Etapu 2
        feeds_by_name = {f["name"]: f for f in uln.LIVE_RSS_FEEDS}
        self.assertEqual(feeds_by_name["TVP3 Opole"]["url"], "https://opole.tvp.pl/38939592/aktualnosci")
        self.assertEqual(feeds_by_name["TVP3 Opole"].get("source_type"), "tvp3_sgdata")
        self.assertEqual(feeds_by_name["Kurier Poranny"]["url"], "https://poranny.pl/rss/wiadomosci.xml")
        self.assertEqual(uln.MAX_NEW_PER_RUN, 6)
        self.assertEqual(uln.MAX_REGIONAL_PER_RUN, 3)

    def test_tvp3_null_stub_falls_through_to_next_marker(self):
        feed_dir = {
            "name": "TVP3 Opole",
            "url": "https://opole.tvp.pl/38939592/aktualnosci",
            "path": "/Polska/Regiony/Opolskie",
            "group": "TVP3",
            "source_type": "tvp3_sgdata",
        }
        directory_payload = {
            "title": "Aktualności",
            "items": [
                {
                    "title": "Remont mostu w Opolu przyspiesza w tym tygodniu",
                    "url": "/96457890/remont-mostu-w-opolu",
                    "lead": "Drogowcy zakończyli kluczowy etap prac w Kędzierzynie-Koźlu na Opolszczyźnie.",
                    "image": {"url": "https://s10.tvp.pl/images2/opole-most.jpg"},
                }
            ],
        }
        html_null_dir = (
            "<html><script>window.__sgData = null; window.__newsData = false; "
            f"window.__directoryData = {json.dumps(directory_payload)};</script></html>"
        )
        items_dir = uln._parse_tvp3_items_from_html(html_null_dir, feed_dir)
        self.assertEqual(len(items_dir), 1)
        self.assertEqual(items_dir[0]["link"], "https://opole.tvp.pl/96457890/remont-mostu-w-opolu")

        news_payload = [
            {
                "params": {"title": "Region"},
                "items": [
                    {
                        "title": "Modernizacja linii kolejowej pod Opolem przyspiesza",
                        "url": "/123/kolej-opole",
                        "lead": "Inwestor zakończył główny etap wymiany torów na trasie w województwie opolskim.",
                    }
                ],
            }
        ]
        html_null_news = (
            f"<html><script>window.__sgData = null; window.__newsData = {json.dumps(news_payload)};</script></html>"
        )
        items_news = uln._parse_tvp3_items_from_html(html_null_news, feed_dir)
        self.assertEqual(len(items_news), 1)
        self.assertEqual(items_news[0]["link"], "https://opole.tvp.pl/123/kolej-opole")

        for html_stub in (
            "<html><script>window.__sgData = null;</script></html>",
            "<html><script>window.__sgData = false;</script></html>",
            "<html><script>window.__sgData = 0;</script></html>",
            '<html><script>window.__sgData = "stub";</script></html>',
            "<html><script>window.__sgData = null; window.__directoryData = null;</script></html>",
        ):
            with self.subTest(html_stub=html_stub):
                with self.assertRaises(ValueError):
                    uln._parse_tvp3_items_from_html(html_stub, feed_dir)


class TestCycleQualityTelemetry(unittest.TestCase):
    def test_summarize_and_format_empty_list(self):
        stats = uln.summarize_cycle_quality([])
        self.assertEqual(stats["total"], 0)
        self.assertEqual(stats["multi_source_count"], 0)
        self.assertEqual(stats["multi_source_pct"], 0.0)
        self.assertEqual(stats["single_source_count"], 0)
        self.assertEqual(stats["single_source_pct"], 0.0)
        self.assertEqual(stats["zero_source_count"], 0)
        self.assertEqual(stats["voivodeships_covered"], 0)
        self.assertEqual(stats["voivodeships_total"], 16)
        self.assertEqual(len(stats["empty_voivodeships"]), 16)
        self.assertEqual(stats["unexpected_sections"], {})
        for sec in uln.CANONICAL_SUMMARY_SECTIONS:
            self.assertEqual(stats["sections"][sec]["total"], 0)
            self.assertEqual(stats["sections"][sec]["multi_source_pct"], 0.0)

        txt = uln.format_cycle_summary([])
        self.assertTrue(txt.startswith("=== PODSUMOWANIE JAKOŚCIOWE CYKLU ==="))
        self.assertIn("Łącznie artykułów: 0", txt)
        self.assertIn("Wieloźródłowe (>=2): 0/0 (0.0%) | 1-źródłowe: 0/0 (0.0%)", txt)
        self.assertIn("--- POKRYCIE 16 WOJEWÓDZTW (0/16) ---", txt)
        for v_path, v_label, _, _, _, _ in seo_builder.VOIVODESHIPS:
            self.assertIn(f"{v_path}", txt)
            self.assertIn(f"0 art. (BRAK) [{v_label}]", txt)

    def test_mixed_sections_multi_source_math_and_unexpected_paths(self):
        sample = [
            {"path": "/Polska", "sources": ["PAP", "TVN24"]},
            {"path": "/Polska/Gospodarka", "sources": ["Bankier.pl", "Money.pl", "PAP"]},
            {"path": "/Polska/Polityka", "sources": ["Rzeczpospolita", "Polsat News"]},
            {"path": "/Polska/Energetyka", "sources": ["Energetyka24", "PAP"]},
            {"path": "/Polska/Energetyka", "sources": ["WysokieNapiecie.pl"]},
            {"path": "/Polska/Regiony/Dolnoslaskie", "sources": ["Gazeta Wrocławska", "Radio Wrocław"]},
            {"path": "/Polska/Regiony/Opolskie", "sources": ["Nowa Trybuna Opolska"]},
            {"path": "/Swiat", "sources": ["Polsat News", "TVN24"]},
            {"path": "/Sport", "sources": ["Sport.pl", "Przegląd Sportowy"]},
        ]
        stats = uln.summarize_cycle_quality(sample)
        self.assertEqual(stats["total"], 9)
        self.assertEqual(stats["multi_source_count"], 7)
        self.assertEqual(stats["multi_source_pct"], 77.8)
        self.assertEqual(stats["single_source_count"], 2)
        self.assertEqual(stats["single_source_pct"], 22.2)

        self.assertEqual(stats["sections"]["/Polska"]["total"], 1)
        self.assertEqual(stats["sections"]["/Polska/Energetyka"]["total"], 2)
        self.assertEqual(stats["sections"]["/Polska/Energetyka"]["multi_source"], 1)
        self.assertEqual(stats["sections"]["/Polska/Energetyka"]["multi_source_pct"], 50.0)
        self.assertEqual(stats["sections"]["/Polska/Regiony"]["total"], 2)
        self.assertEqual(stats["sections"]["/Polska/Regiony"]["multi_source"], 1)
        self.assertEqual(stats["sections"]["/Polska/Regiony"]["multi_source_pct"], 50.0)

        with_unexpected = sample + [
            {"path": "/Polska/Kultura", "sources": ["PAP", "Onet"]},
            {"path": "", "sources": ["PAP"]},
        ]
        u_stats = uln.summarize_cycle_quality(with_unexpected)
        self.assertEqual(u_stats["total"], 11)
        self.assertEqual(u_stats["unexpected_sections"]["/Polska/Kultura"]["total"], 1)
        self.assertEqual(u_stats["unexpected_sections"]["(brak)"]["total"], 1)
        u_txt = uln.format_cycle_summary(u_stats)
        self.assertIn("/Polska/Kultura", u_txt)
        self.assertIn("(brak)", u_txt)
        self.assertIn("[inny dział]", u_txt)

    def test_all_16_voivodeships_canonical_order_and_zero_counts(self):
        partial = [
            {"path": "/Polska/Regiony/Dolnoslaskie", "sources": ["Gazeta Wrocławska", "Radio Wrocław"]},
            {"path": "/Polska/Regiony/Dolnoslaskie", "sources": ["TVP3 Wrocław"]},
            {"path": "/Polska/Regiony/Zachodniopomorskie", "sources": ["Radio Szczecin"]},
        ]
        stats = uln.summarize_cycle_quality(partial)
        expected_order = [v[0] for v in seo_builder.VOIVODESHIPS]
        self.assertEqual(list(stats["voivodeships"].keys()), expected_order)
        self.assertEqual(stats["voivodeships_covered"], 2)
        self.assertEqual(len(stats["empty_voivodeships"]), 14)
        self.assertEqual(stats["voivodeships"]["/Polska/Regiony/Dolnoslaskie"]["total"], 2)
        self.assertEqual(stats["voivodeships"]["/Polska/Regiony/Dolnoslaskie"]["multi_source"], 1)
        self.assertEqual(stats["voivodeships"]["/Polska/Regiony/Mazowieckie"]["total"], 0)

        txt = uln.format_cycle_summary(partial)
        self.assertIn("--- POKRYCIE 16 WOJEWÓDZTW (2/16) ---", txt)
        positions = [txt.index(vp) for vp in expected_order]
        self.assertEqual(positions, sorted(positions))
        for empty_vp in stats["empty_voivodeships"]:
            label = seo_builder.VOIVODESHIP_LABELS[empty_vp]
            self.assertIn(f"0 art. (BRAK) [{label}]", txt)

        full = [{"path": vp, "sources": ["A", "B"]} for vp in expected_order]
        full_stats = uln.summarize_cycle_quality(full)
        self.assertEqual(full_stats["voivodeships_covered"], 16)
        self.assertEqual(full_stats["empty_voivodeships"], [])
        self.assertIn("--- POKRYCIE 16 WOJEWÓDZTW (16/16) ---", uln.format_cycle_summary(full_stats))

    def test_stdout_emission_and_update_news_cycle_call_site(self):
        import contextlib
        import io
        import tempfile
        from unittest import mock

        sample = [
            {"path": "/Polska/Regiony/Opolskie", "sources": ["Nowa Trybuna Opolska", "TVP3 Opole"]},
            {"path": "/Polska/Energetyka", "sources": ["WysokieNapiecie.pl"]},
        ]
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            ret = uln.print_cycle_summary(sample)
        out = buf.getvalue()
        self.assertEqual(ret, uln.summarize_cycle_quality(sample))
        self.assertEqual(out.strip(), uln.format_cycle_summary(sample).strip())

        sample_db = [
            {
                "id": 1,
                "path": "/Polska/Regiony/Opolskie",
                "seo_url": "/Polska/Regiony/Opolskie/nowa-inwestycja-drogowa-w-opolu",
                "seo_title": "Nowa inwestycja drogowa w Opolu przyspiesza",
                "summary_lead": "Prace na kluczowej trasie w stolicy województwa opolskiego wkroczyły w kolejny etap.",
                "meta_description": "Prace na kluczowej trasie w stolicy województwa opolskiego wkroczyły w kolejny etap.",
                "keywords": "Opolskie, Opole, droga",
                "thumbnail_url": "",
                "published_iso": "2026-11-14T05:00:00+01:00",
                "display_date": "14.11.2026, 05:00",
                "status": "AUTO_PUBLISHED",
                "fact_agreement_pct": None,
                "admin_note": "",
                "metrics": [],
                "declickbait": [],
                "full_sections": [
                    {
                        "heading": "Relacja źródłowa (Nowa Trybuna Opolska)",
                        "paragraphs": [
                            "Prace na kluczowej trasie w stolicy województwa opolskiego wkroczyły w kolejny etap według drogowców. [Źródło: Nowa Trybuna Opolska]"
                        ],
                    }
                ],
                "perspectives": [
                    {
                        "outlet": "Nowa Trybuna Opolska",
                        "angle": "Doniesienie regionalne",
                        "summary": "Nowa inwestycja drogowa w Opolu przyspiesza",
                        "url": "https://nto.pl/test-opole",
                    }
                ],
                "sources": ["Nowa Trybuna Opolska"],
                "corrections": [],
            }
        ]
        with tempfile.TemporaryDirectory() as tmpdir:
            with open(os.path.join(tmpdir, "articles.json"), "w", encoding="utf-8") as f:
                json.dump(sample_db, f, ensure_ascii=False)
            cycle_buf = io.StringIO()
            with mock.patch.object(uln, "__file__", os.path.join(tmpdir, "update_live_news.py")), \
                 mock.patch.object(seo_builder, "build_all_seo_artifacts", side_effect=lambda *_: print("[SEO] mock")), \
                 contextlib.redirect_stdout(cycle_buf):
                uln.update_news_cycle(fetch_live=False)
            cycle_out = cycle_buf.getvalue()
            self.assertIn("[SUKCES]", cycle_out)
            self.assertIn("[SEO] mock", cycle_out)
            self.assertIn("=== PODSUMOWANIE JAKOŚCIOWE CYKLU ===", cycle_out)
            self.assertIn("--- POKRYCIE 16 WOJEWÓDZTW (1/16) ---", cycle_out)
            self.assertLess(cycle_out.index("[SUKCES]"), cycle_out.index("[SEO] mock"))
            self.assertLess(cycle_out.index("[SEO] mock"), cycle_out.index("=== PODSUMOWANIE JAKOŚCIOWE CYKLU ==="))


class TestStage3HardeningAndAntiChaining(unittest.TestCase):
    def test_polskapress_legacy_archive_and_betting_clickbait_filters(self):
        self.assertTrue(
            uln.is_opinion_or_blacklisted(
                "Zwykły tytuł informacyjny z archiwum",
                "https://dziennikbaltycki.pl/test/ar/c7-1234567",
            )
        )
        self.assertFalse(
            uln.is_opinion_or_blacklisted(
                "Nowy odcinek trasy ekspresowej w regionie oddany do użytku",
                "https://dziennikbaltycki.pl/test/ar/c2-19150907",
            )
        )
        for bad_title in (
            "Polska - Holandia: kurs 50.0 i freebet 300 zł na mecz",
            "Bonusy bukmacherskie bez depozytu na Ligę Narodów",
            "Jak karmić ptaki zimą? Poradnik dla każdego",
            "Najgłupsze odpowiedzi uczniów i hity sprawdzianów",
            "Polska wieś w II RP na archiwalnych fotografiach",
        ):
            with self.subTest(bad_title=bad_title):
                self.assertTrue(uln.is_opinion_or_blacklisted(bad_title, "https://example.pl/art"))

    def test_voivodeship_homonyms_and_weighted_multi_region_disambiguation(self):
        # Homonimy słownikowe vs nazwy miast
        self.assertEqual(
            uln.infer_category_path("/Polska", "https://example.pl/1", "Lokalny przemysł chemiczny zwiększa eksport", ""),
            "/Polska/Gospodarka",
        )
        self.assertEqual(
            uln.infer_category_path("/Swiat", "https://example.pl/swiat/1b", "Chiński przemysł motoryzacyjny bije rekordy", ""),
            "/Swiat",
        )
        self.assertEqual(
            uln.infer_category_path("/Polska", "https://example.pl/2", "Utrudnienia i objazdy na drodze w Przemyślu", ""),
            "/Polska/Regiony/Podkarpackie",
        )
        self.assertEqual(
            uln.infer_category_path("/Polska", "https://example.pl/3", "Szpital walczy o kontrakt na oddział ratunkowy", ""),
            "/Polska",
        )
        self.assertEqual(
            uln.infer_category_path("/Polska", "https://example.pl/4", "Remont dworca kolejowego w Wałczu", ""),
            "/Polska/Regiony/Zachodniopomorskie",
        )
        self.assertEqual(
            uln.infer_category_path("/Polska", "https://example.pl/5", "Największy teleskop na świecie rozpoczął pracę", ""),
            "/Polska",
        )
        self.assertEqual(
            uln.infer_category_path("/Polska", "https://example.pl/6", "Nowy most w Świeciu gotowy przed terminem", ""),
            "/Polska/Regiony/Kujawsko-Pomorskie",
        )
        self.assertEqual(
            uln.infer_category_path("/Polska", "https://example.pl/7", "Nowe przepisy wejdą w życie od września", ""),
            "/Polska",
        )
        self.assertEqual(
            uln.infer_category_path("/Polska", "https://example.pl/8", "Września ma nowy przystanek autobusowy", ""),
            "/Polska/Regiony/Wielkopolskie",
        )
        self.assertEqual(
            uln.infer_category_path("/Polska", "https://example.pl/9", "Skarb zakopany w lesie odnaleziony przez leśników", ""),
            "/Polska",
        )
        self.assertEqual(
            uln.infer_category_path("/Polska", "https://example.pl/10", "Rekord turystów w Zakopanem podczas weekendu", ""),
            "/Polska/Regiony/Malopolskie",
        )
        # "Od razu" nie może być mylone z rzeką Odrą
        self.assertEqual(
            uln.infer_category_path("/Swiat", "https://example.pl/swiat/1", "Trump od razu odpowiedział na propozycję", ""),
            "/Swiat",
        )
        # İzmir (wieloznakowe İ po _norm_pl) nie może przesuwać indeksów dla _VOIVODESHIP_RAW_MAIN
        self.assertEqual(
            uln._infer_voivodeship_path("İzmir i współpraca z Przemyślem", "", "https://example.pl/a"),
            "/Polska/Regiony/Podkarpackie",
        )

        # Ważona punktacja wielu województw w opisie (np. Gdańsk + Sycewice vs Wrześnica -> Pomorskie 2:1)
        self.assertEqual(
            uln._infer_voivodeship_path(
                "Karambol pięciu aut na trasie ekspresowej S6",
                "Policjanci z Gdańska i służby w Sycewicach pracują na miejscu wypadku niedaleko Wrześnicy.",
                "https://example.pl/s6",
            ),
            "/Polska/Regiony/Pomorskie",
        )
        # Remis 1:1 dwóch województw w opisie (w tym z _VOIVODESHIP_DISAMBIG) -> brak jednoznacznego regionu ("")
        self.assertEqual(
            uln._infer_voivodeship_path(
                "Wspólna kontrola transportu drogowego",
                "Inspektorzy z Ostrowca Świętokrzyskiego oraz Wielkopolski sprawdzili ciężarówki.",
                "https://example.pl/kontrola",
            ),
            "",
        )

        # Trybunał Konstytucyjny z kanału regionalnego -> /Polska/Polityka, ale sejmik województwa zostaje w regionie
        self.assertEqual(
            uln.infer_category_path(
                "/Polska/Regiony/Malopolskie",
                "https://radiokrakow.pl/aktualnosci/tk",
                "Prezes Trybunału Konstytucyjnego zawiadamia prokuraturę",
                "W Krakowie odbyła się konferencja prasowa.",
            ),
            "/Polska/Polityka",
        )
        self.assertEqual(
            uln.infer_category_path(
                "/Polska/Regiony/Wielkopolskie",
                "https://radiopoznan.fm/sejmik",
                "Sejmik przyjął nowy plan wsparcia dla gmin regionu",
                "Radni głosowali w Poznaniu.",
            ),
            "/Polska/Regiony/Wielkopolskie",
        )
        # Segment /prawo/ w URL (np. Infor.pl) bez słów politycznych nie może wymuszać /Polska/Polityka
        self.assertEqual(
            uln.infer_category_path(
                "/Polska",
                "https://www.infor.pl/prawo/gmina/123,Nowe-zasady-segregacji-odpadow.html",
                "Nowe zasady odbioru odpadów w gminach od przyszłego miesiąca",
                "",
            ),
            "/Polska",
        )

    def test_sport_discipline_and_cluster_conflict_guards(self):
        self.assertEqual(uln._sport_discipline("Dramatyczny tie-break w tenisie kobiet na turnieju WTA"), "tenis")
        self.assertEqual(uln._sport_discipline("PlusLiga: siatkówka na najwyższym poziomie i wygrana w 5 setach"), "siatkowka")
        self.assertEqual(uln._sport_discipline("Mecz reprezentacji w Lidze Narodów UEFA: piękna bramka"), "pilka")
        self.assertEqual(uln._sport_discipline("Bank naliczył wyższe odsetki od kredytu mieszkaniowego"), "")

        crypto = {
            "title": "Bitcoin bije kolejny rekord cenowy na światowych giełdach",
            "description": "Kryptowaluty i BTC zyskują po decyzjach inwestorów instytucjonalnych.",
            "path": "/Polska/Gospodarka",
        }
        fx_nbp = {
            "title": "Kursy walut NBP i decyzja RPP w sprawie stóp procentowych",
            "description": "Złoty umacnia się wobec euro i dolara po komunikacie banku centralnego.",
            "path": "/Polska/Gospodarka",
        }
        self.assertTrue(uln.has_cluster_conflict(crypto, fx_nbp))

        shelter = {
            "title": "Ruszyła wielka zbiórka darów dla potrzebujących przed zimą",
            "description": "Schronisko dla zwierząt apeluje o karmę dla psiaków i kociaków.",
            "path": "/Polska",
        }
        paczka = {
            "title": "Ruszyła wielka zbiórka darów dla potrzebujących przed zimą",
            "description": "Wolontariusze Szlachetnej Paczki otworzyli bazę rodzin w całym kraju.",
            "path": "/Polska",
        }
        self.assertTrue(uln.has_cluster_conflict(shelter, paczka))

        road_s6 = {
            "title": "Poważny karambol pięciu samochodów rano. Duże utrudnienia",
            "description": "Zablokowana jest droga ekspresowa S6 na odcinku nadmorskim.",
            "path": "/Polska",
        }
        road_s7 = {
            "title": "Poważny karambol pięciu samochodów rano. Duże utrudnienia",
            "description": "Zablokowana jest droga ekspresowa S7 na odcinku południowym.",
            "path": "/Polska",
        }
        self.assertTrue(uln.has_cluster_conflict(road_s6, road_s7))

    def test_sentence_splitting_ranks_and_incomplete_trailing_fragment_drop(self):
        raw = (
            "Jak przekazała st. post. Anna Kowalska z komendy powiatowej, asp. szt. Jan Nowak oraz ks. Piotr "
            "i mec. Wiśniewski zabezpieczyli nagrania z monitoringu miejskiego na miejscu zdarzenia. "
            "Z kolei rzecznik prasowy komendy wojewódzkiej st"
        )
        sents = uln.split_sentences_pl(raw)
        self.assertEqual(len(sents), 1)
        self.assertIn("st. post. Anna Kowalska", sents[0])
        self.assertIn("asp. szt. Jan Nowak", sents[0])
        self.assertIn("ks. Piotr", sents[0])
        self.assertIn("mec. Wiśniewski", sents[0])

    def test_anti_chaining_p0_repair_and_cluster_recovery(self):
        # 1. Opinia odrzucona w perspectives nie może wrócić przez pętlę po art["sources"]
        art_with_opinion = {
            "id": 901,
            "path": "/Polska/Polityka",
            "seo_title": "Sejm uchwalił nowelizację ustawy budżetowej na kolejny rok",
            "summary_lead": "Posłowie przyjęli ustawę budżetową większością głosów podczas piątkowego posiedzenia.",
            "full_sections": [
                {
                    "heading": "Ustalenia wspólne",
                    "paragraphs": [
                        "Posłowie przyjęli ustawę budżetową większością głosów podczas piątkowego posiedzenia Sejmu. [Źródło: PAP, Rzeczpospolita]"
                    ],
                }
            ],
            "perspectives": [
                {"outlet": "PAP", "summary": "Sejm uchwalił nowelizację ustawy budżetowej na kolejny rok", "url": "https://pap.pl/budzet"},
                {"outlet": "Rzeczpospolita", "summary": "[Felieton] Dlaczego ten budżet to błąd", "url": "https://rp.pl/opinie/budzet"},
            ],
            "sources": ["PAP", "Rzeczpospolita"],
        }
        cands = uln._extract_candidates_from_article(art_with_opinion)
        self.assertEqual([c["outlet"] for c in cands], ["PAP"])

        # 2. Naprawa niespójnego P[0] względem sekcji wiodącej S0 oraz odzyskanie odrzuconego podklastra (>=2 źródła)
        mixed_art = {
            "id": 902,
            "path": "/Sport",
            "seo_url": "/Sport/wta-finals-sabalenka-wygrywa-w-dwuch-setach",
            "seo_title": "WTA Finals: Aryna Sabalenka wygrywa w dwóch setach w turnieju tenisowym",
            "summary_lead": "Reprezentacja Polski w piłce nożnej zremisowała z Portugalią w Lidze Narodów UEFA po bramce w końcówce.",
            "published_iso": "2026-11-14T05:00:00+01:00",
            "display_date": "14.11.2026, 05:00",
            "full_sections": [
                {
                    "heading": "Ustalenia wspólne",
                    "paragraphs": [
                        "Reprezentacja Polski w piłce nożnej zremisowała z Portugalią w Lidze Narodów UEFA po bramce w końcówce spotkania. [Źródło: Sport.pl, Polsat Sport]"
                    ],
                },
                {
                    "heading": "Dodatkowe szczegóły",
                    "paragraphs": [
                        "Aryna Sabalenka pokonała rywalkę w dwóch setach podczas turnieju tenisowego WTA Finals. [Źródło: Przegląd Sportowy, Interia Sport]"
                    ],
                },
            ],
            "perspectives": [
                {"outlet": "Przegląd Sportowy", "summary": "WTA Finals: Aryna Sabalenka wygrywa w dwóch setach w turnieju tenisowym", "url": "https://ps.pl/tenis1"},
                {"outlet": "Interia Sport", "summary": "Turniej tenisowy WTA Finals: zwycięstwo Aryny Sabalenki w dwóch setach", "url": "https://interia.pl/tenis2"},
                {"outlet": "Sport.pl", "summary": "Liga Narodów UEFA: reprezentacja Polski w piłce nożnej zremisowała z Portugalią", "url": "https://sport.pl/pilka1"},
                {"outlet": "Polsat Sport", "summary": "Piłka nożna, Liga Narodów UEFA: Polska zremisowała z Portugalią po bramce", "url": "https://polsatsport.pl/pilka2"},
            ],
            "sources": ["Interia Sport", "Polsat Sport", "Przegląd Sportowy", "Sport.pl"],
        }
        rejected_out = []
        upgraded = uln._upgrade_existing_article(mixed_art, rejected_out=rejected_out)
        self.assertIsNotNone(upgraded)
        self.assertEqual(set(upgraded["sources"]), {"Polsat Sport", "Sport.pl"})
        self.assertIn("Liga Narodów UEFA", upgraded["seo_title"])
        self.assertEqual({r["outlet"] for r in rejected_out}, {"Przegląd Sportowy", "Interia Sport"})

        for r in rejected_out:
            r["group"] = r["outlet"]
            r["description"] = r.get("excl_description") or r.get("description") or r["title"]
        rec_clusters = uln.cluster_similar_items(rejected_out)
        self.assertEqual(len(rec_clusters), 1)
        self.assertEqual(len(rec_clusters[0]), 2)

    def test_urlopen_with_retry_handles_429_and_closes_error_stream(self):
        import urllib.error
        from unittest import mock

        closed = []

        def make_http_err(code):
            err = urllib.error.HTTPError("https://example.pl/rss", code, "Too Many Requests", {}, None)
            err.close = lambda: closed.append(code)
            return err

        with mock.patch("urllib.request.urlopen", side_effect=[make_http_err(429), make_http_err(503), "OK_RESP"]) as m_open, \
             mock.patch("time.sleep"):
            res = uln._urlopen_with_retry("https://example.pl/rss", timeout=5)
            self.assertEqual(res, "OK_RESP")
            self.assertEqual(m_open.call_count, 3)
            self.assertEqual(closed, [429, 503])

    def test_github_step_summary_markdown_and_oserror_resilience(self):
        import contextlib
        import io
        import tempfile
        from unittest import mock

        sample = [
            {"path": "/Polska/Regiony/Pomorskie", "sources": ["Radio Gdańsk", "TVP3 Gdańsk"]},
            {"path": "/Polska/Gospodarka", "sources": ["PAP", "Bankier.pl"]},
        ]
        md = uln.format_cycle_summary_markdown(sample)
        self.assertIn("## VERITY — Podsumowanie jakościowe cyklu", md)
        self.assertIn("| `/Polska/Regiony` | 1 | 1/1 | 100.0% |", md)
        self.assertIn("| Pomorskie | `/Polska/Regiony/Pomorskie` | 1 | 1/1 |", md)

        with tempfile.NamedTemporaryFile("w+", encoding="utf-8", delete=False) as tf:
            summary_file = tf.name
        try:
            out_buf = io.StringIO()
            with mock.patch.dict(os.environ, {"GITHUB_STEP_SUMMARY": summary_file}), \
                 contextlib.redirect_stdout(out_buf):
                uln.print_cycle_summary(sample)
            self.assertEqual(out_buf.getvalue().strip(), uln.format_cycle_summary(sample).strip())
            with open(summary_file, "r", encoding="utf-8") as f:
                written_md = f.read()
            self.assertIn("## VERITY — Podsumowanie jakościowe cyklu", written_md)
        finally:
            if os.path.exists(summary_file):
                os.remove(summary_file)

        # Błąd zapisu GITHUB_STEP_SUMMARY trafia wyłącznie na stderr, a nie zmienia stdout
        out_buf2 = io.StringIO()
        err_buf2 = io.StringIO()
        with mock.patch.dict(os.environ, {"GITHUB_STEP_SUMMARY": "/nonexistent_dir_verity_test/summary.md"}), \
             contextlib.redirect_stdout(out_buf2), \
             contextlib.redirect_stderr(err_buf2):
            uln.print_cycle_summary(sample)
        self.assertEqual(out_buf2.getvalue().strip(), uln.format_cycle_summary(sample).strip())
        self.assertIn("[WARN]", err_buf2.getvalue())

    def test_app_js_no_embedded_articles_and_security_accessibility_invariants(self):
        app_js_path = os.path.join(ROOT_DIR, "app.js")
        with open(app_js_path, "r", encoding="utf-8") as f:
            js_code = f.read()
        self.assertLess(len(js_code.encode("utf-8")), 95_000)
        self.assertIn("let articles = [];", js_code)
        self.assertIn(".replace(/'/g, '&#39;')", js_code)
        self.assertIn("document.getElementById('regionsToggleBtn')?.focus()", js_code)
        self.assertIn("loadedFromRemote", js_code)


if __name__ == "__main__":
    unittest.main()



