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
from unittest import mock
import xml.etree.ElementTree as ET

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

import seo_builder
import ai_synthesizer
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
        self.assertLessEqual(
            len(self.articles),
            uln.MAX_TOTAL_ARTICLES,
            f"Przekroczono limit bufora MAX_TOTAL_ARTICLES={uln.MAX_TOTAL_ARTICLES}",
        )
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
        published_arts = [a for a in self.articles if a.get("status", "AUTO_PUBLISHED") == "AUTO_PUBLISHED"]
        # Strona główna + 23 działy (w tym /Polska/Regiony + 16 województw) + opublikowane artykuły
        self.assertGreaterEqual(len(sm_locs), len(published_arts) + len(seo_builder.CATEGORIES) + 1)
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
        self.assertEqual(items[0]["thumbnail"], "")
        with mock.patch.object(uln, "ENABLE_THUMBNAILS", True):
            items_with_thumb = uln._parse_tvp3_items_from_html(html_doc, feed)
            self.assertEqual(items_with_thumb[0]["thumbnail"], "https://s1.tvp.pl/images2/most.jpg")

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
        self.assertEqual(items_dir[0]["thumbnail"], "")
        with mock.patch.object(uln, "ENABLE_THUMBNAILS", True):
            items_dir_thumb = uln._parse_tvp3_items_from_html(html_dir, feed_dir)
            self.assertEqual(items_dir_thumb[0]["thumbnail"], "https://s10.tvp.pl/images2/opole-most.jpg")
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
        self.assertLess(len(js_code.encode("utf-8")), 100_000)
        self.assertIn("let articles = [];", js_code)
        self.assertIn(".replace(/'/g, '&#39;')", js_code)
        self.assertIn("document.getElementById('regionsToggleBtn')?.focus()", js_code)
        self.assertIn("loadedFromRemote", js_code)

    def test_stable_ids_preserved_when_new_articles_prepended(self):
        base_articles = [
            {"seo_url": "/Polska/Gospodarka/pierwszy-artykul", "seo_title": "Pierwszy artykuł"},
            {"seo_url": "/Polska/Energetyka/drugi-artykul", "seo_title": "Drugi artykuł"},
            {"seo_url": "/Sport/trzeci-artykul", "seo_title": "Trzeci artykuł"},
        ]
        uln._ensure_unique_seo_urls(base_articles)
        uln._assign_stable_ids(base_articles)
        orig_ids = {a["seo_url"]: a["id"] for a in base_articles}
        self.assertEqual(len(set(orig_ids.values())), 3)
        self.assertTrue(all(isinstance(v, int) and v > 0 for v in orig_ids.values()))

        # Dodanie nowego artykułu na początek nie może zmienić ID istniejących wpisów
        with_new = [{"seo_url": "/Swiat/nowy-artykul-na-gorze", "seo_title": "Nowy artykuł"}] + [
            dict(a) for a in base_articles
        ]
        uln._ensure_unique_seo_urls(with_new)
        uln._assign_stable_ids(with_new)
        for a in with_new[1:]:
            self.assertEqual(a["id"], orig_ids[a["seo_url"]])

    def test_intra_source_explanatory_sentences_not_dropped_and_tail_rescued(self):
        long_desc = (
            "10 listopada Orlen poinformował o wypowiedzeniu jednej z dwóch umów długoterminowych na dostawy LNG z QatarEnergy. "
            "Kontrakt obejmował milion ton LNG rocznie i miał obowiązywać do 2034 roku. "
            "Szacowana wartość umowy w 2026 roku wynosiła 570 mln euro, czyli 2,5 mld zł. "
            "Umowę zawarł jeszcze PGNiG w 2009 roku przed budową terminalu w Świnoujściu. "
            "Dostawy rozpoczęły się w 2016 roku. "
            "Według komunikatu Orlen skorzystał z prawa do wypowiedzenia umowy z powodu utrzymującej się siły wyższej, skutkującej brakiem dostaw. "
            "Kontrakt pozostanie w mocy przez 60 dni od złożenia wypowiedzenia. "
            "Średnia cena gazu z kontraktu wynosiła 37,25 euro za MWh w przeliczeniu na 2026 rok. "
            "Analitycy zwracają uwagę na wysoki współczynnik indeksacji wynoszący 16 proc. ceny ropy Brent. "
            "Nowsze kontrakty na rynku stosują niższe wskaźniki indeksacji bliższe 12,5 proc. "
            "Bieżąca cena spot w Europie wzrosła przejściowo z powodu napięć na Bliskim Wschodzie. "
            "Spółka analizowała również długoterminowe prognozy podaży surowca w kolejnej dekadzie. "
            "Najprostsza odpowiedź na pytanie o powód decyzji wskazuje na brak fizycznych dostaw, ale istniał też drugi powód ekonomiczny. "
            "Po 2029 roku na globalnym rynku LNG pojawi się nadwyżka podaży i ceny mogą wyraźnie spaść."
        )
        group = [{
            "outlet": "WysokieNapiecie.pl",
            "title": "Orlen zerwał pierwszy kontrakt z Katarem. Gaz i tak nie płynął, ale istniał też drugi powód",
            "description": long_desc,
            "link": "https://wysokienapiecie.pl/test-orlen",
            "path": "/Polska/Energetyka",
        }]
        with mock.patch.dict(uln.MARKET_CONFIG, {"single_source_mode": "full"}):
            secs, pct = uln.synthesize_article_sections(group, group[0]["title"])
        self.assertIsNone(pct)
        full_text = " ".join(secs[0]["paragraphs"])
        # Zdanie z przyczyną (siła wyższa) ma 4 wspólne słowa z 1. zdaniem, ale NIE może zostać wycięte
        self.assertIn("siły wyższej", full_text)
        # Dalsze zdania z drugim powodem muszą znaleźć się w treści artykułu
        self.assertIn("nadwyżka podaży", full_text)

    def test_rss_prefers_richer_content_encoded_over_short_description_teaser(self):
        import io
        from unittest import mock

        rss_xml = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>TestFeed</title>
    <item>
      <title>Spółka zmienia strategię dostaw energii od nowego kwartału</title>
      <link>https://example.com/artykul-1</link>
      <description>Krótki wstęp redakcyjny mający ponad sześćdziesiąt znaków, ale bez głównego wyjaśnienia decyzji zarządu.</description>
      <content:encoded><![CDATA[<p>Krótki wstęp redakcyjny mający ponad sześćdziesiąt znaków.</p><p>Zarząd wyjaśnił, że głównym powodem zmiany strategii była rosnąca niestabilność cen gazu oraz nowe regulacje unijne obowiązujące od stycznia.</p>]]></content:encoded>
    </item>
  </channel>
</rss>""".encode("utf-8")

        class _FakeResp(io.BytesIO):
            def __init__(self, payload):
                super().__init__(payload)
                self.headers = {}

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

        with mock.patch.object(uln, "_urlopen_with_retry", return_value=_FakeResp(rss_xml)):
            _, items, err = uln._fetch_single_feed(
                {"name": "TestOutlet", "url": "https://example.com/rss.xml", "path": "/Polska/Energetyka"}
            )
        self.assertIsNone(err)
        self.assertEqual(len(items), 1)
        self.assertIn("głównym powodem zmiany strategii", items[0]["description"])

    def test_extract_article_body_from_html_sources_and_guards(self):
        # 1. TVP3 __newsData JSON
        tvp_html = (
            '<html><head><title>Test</title></head><body><script>window.__newsData = '
            + json.dumps({
                "text_paragraph_lead": "35-latka sięgnęła po siekierę podczas spotkania z byłym partnerem.",
                "text_paragraph_standard": [
                    {"text": "<p>Kobieta rozbiła szybę w aucie i usłyszała zarzuty zniszczenia mienia oraz gróźb karalnych.</p>"}
                ],
            }, ensure_ascii=False)
            + ';</script></body></html>'
        )
        tvp_body = uln._extract_article_body_from_html(
            tvp_html,
            "https://poznan.tvp.pl/12345/siekiera",
            "Przyszła do byłego partnera z siekierą",
        )
        self.assertIn("rozbiła szybę w aucie", tvp_body)

        # 2. JSON-LD krótkie (lub z innego tematu) vs pełne <article><p>...</p></article> + filtr cookie/paywall
        html_page = """
        <html><head>
        <script type="application/ld+json">{"@type":"NewsArticle","articleBody":"Zarząd Spółki ABC opublikował zupełnie inny raport kwartalny bez związku z tym tematem."}</script>
        </head><body>
        <nav><p>Menu nawigacyjne serwisu i linki do wszystkich kategorii redakcyjnych.</p></nav>
        <article>
          <p>Prezydent USA Donald Trump oświadczył w wywiadzie, że chce rozwiązać sprawę Kuby jeszcze przed końcem swojej kadencji.</p>
          <p>W rozmowie zaznaczył, że nie wyklucza użycia siły, ponieważ uważa sytuację gospodarczą na wyspie za krytyczną i wymagającą stanowczych działań.</p>
          <p>Wykup dostęp do pełnej prenumeraty i zaakceptuj politykę prywatności oraz pliki cookies.</p>
        </article>
        </body></html>
        """
        extracted = uln._extract_article_body_from_html(
            html_page,
            "https://example.pl/trump-kuba",
            "Trump mówi o użyciu siły wobec Kuby",
            "Krótki wstęp",
        )
        self.assertIn("nie wyklucza użycia siły", extracted)
        self.assertNotIn("Spółki ABC", extracted)
        self.assertNotIn("politykę prywatności", extracted)
        self.assertNotIn("Menu nawigacyjne", extracted)

        # 3. _enrich_existing_thin_articles wzbogaca krótki artykuł i poprawnie sprząta znacznik tymczasowy
        from unittest import mock

        thin_art = {
            "id": 123456,
            "path": "/Polska/Regiony/Wielkopolskie",
            "seo_url": "/Polska/Regiony/Wielkopolskie/kierowca-na-podwojnym-gazie",
            "seo_title": "Kierowca zatrzymany na podwójnym gazie. Zaskakujący finał kontroli",
            "summary_lead": "Do zatrzymania doszło w czwartek w Wólce.",
            "meta_description": "Do zatrzymania doszło w czwartek w Wólce.",
            "keywords": "Wielkopolskie, kierowca",
            "sources": ["ePoznan.pl"],
            "perspectives": [{"outlet": "ePoznan.pl", "angle": "Wątek lokalny", "summary": "Kierowca zatrzymany", "url": "https://epoznan.pl/test-123"}],
            "full_sections": [{"heading": "Relacja źródłowa (ePoznan.pl)", "paragraphs": ["Do zatrzymania doszło w czwartek w Wólce. [Źródło: ePoznan.pl]"]}],
            "metrics": [],
            "declickbait": [],
            "corrections": [],
        }
        rich_body = (
            "Do zatrzymania doszło w czwartek w Wólce w powiecie słupeckim podczas rutynowej kontroli drogowej. "
            "Badanie alkomatem wykazało, że kierowca miał prawie 3 promile alkoholu w organizmie i zakaz prowadzenia pojazdów. "
            "Policjanci zatrzymali mu prawo jazdy oraz zabezpieczyli samochód na parkingu strzeżonym. "
            "Mężczyzna odpowie przed sądem za jazdę w stanie nietrzeźwości oraz złamanie sądowego zakazu."
        )
        with mock.patch.object(uln, "_fetch_enriched_description", return_value=rich_body):
            enriched_n = uln._enrich_existing_thin_articles([thin_art], max_articles=5)
        self.assertEqual(enriched_n, 1)
        self.assertNotIn("_url_enriched", thin_art)
        self.assertIn("prawie 3 promile", " ".join(thin_art["full_sections"][0]["paragraphs"]))


class TestStage5AntiClickbaitBalanceAndQualityGate(unittest.TestCase):
    def test_anti_clickbait_neutralization_declickbait_and_no_feed_pinning(self):
        group = [
            {
                "outlet": "o2.pl",
                "group": "Wirtualna Polska",
                "path": "/Swiat",
                "title": "PILNE: Zaskakujące zachowanie pilota na pokładzie samolotu. Nie uwierzysz, co zrobił [WIDEO]",
                "description": "Załoga samolotu podjęła decyzję o lądowaniu awaryjnym z powodu usterki technicznej w kabinie pilotów.",
                "link": "https://o2.pl/pilot-1",
                "thumbnail": "",
            },
            {
                "outlet": "Polsat News",
                "group": "Polsat News",
                "path": "/Swiat",
                "title": "Awaryjne lądowanie samolotu pasażerskiego po usterce technicznej w kokpicie",
                "description": "Samolot bezpiecznie wylądował na lotnisku zapasowym, a pasażerom zapewniono nocleg.",
                "link": "https://polsatnews.pl/pilot-1",
                "thumbnail": "",
            },
        ]
        art = uln.build_article_from_group(group, 501)
        self.assertFalse(uln._is_clickbait_title(art["seo_title"]))
        self.assertNotIn("[WIDEO]", art["seo_title"])
        self.assertTrue(art["declickbait"], "Powinno zapisać co najmniej jeden wpis declickbait")
        dc0 = art["declickbait"][0]
        self.assertEqual(set(dc0.keys()), {"outlet", "original", "fact"})
        self.assertEqual(dc0["outlet"], "o2.pl")
        self.assertIn("Nie uwierzysz", dc0["original"])

        neutral = uln._neutralize_clickbait_title("PILNE! Szokujący wzrost cen paliw. Powód wbija w fotel!")
        self.assertNotIn("PILNE", neutral)
        self.assertNotIn("wbija w fotel", neutral.lower())
        self.assertNotIn("szokujący", neutral.lower())

        # Chronologia musi być czysta bez przypinania starszego artykułu z declickbait nad nowszym
        older_dc = {"id": 1, "published_iso": "2026-11-15T08:00:00+01:00", "declickbait": [dc0]}
        newer_clean = {"id": 2, "published_iso": "2026-11-15T10:00:00+01:00", "declickbait": []}
        sorted_feed = seo_builder._sort_articles_for_feed([older_dc, newer_clean])
        self.assertEqual([a["id"] for a in sorted_feed], [2, 1])

    def test_polish_curiosity_gap_and_body_payoff_declickbait(self):
        # 1. Jednoźródłowy artykuł z "Ten prosty trik może zaskoczyć" i "Wystarczy sprawdzić jedną rzecz"
        trik_group = [
            {
                "outlet": "Warszawa w Pigułce",
                "group": "Warszawa w Pigułce",
                "path": "/Polska/Regiony/Mazowieckie",
                "title": "Rachunki za prąd mogą być niższe. Wystarczy sprawdzić jedną rzecz w domu. Ten prosty trik może zaskoczyć",
                "description": (
                    "Rachunki za energię elektryczną potrafią zaskoczyć, szczególnie jesienią i zimą. "
                    "Warto sprawdzić, ile prądu pobierają urządzenia nawet wtedy, gdy pozornie są wyłączone. "
                    "Niewielki watomierz może ujawnić sprzęt, który przez całą dobę zużywa energię w trybie czuwania."
                ),
                "link": "https://warszawawpigulce.pl/prad-watomierz",
                "thumbnail": "",
            }
        ]
        trik_art = uln.build_article_from_group(trik_group, 502)
        self.assertFalse(uln._is_clickbait_title(trik_art["seo_title"]))
        self.assertNotIn("trik", trik_art["seo_title"].lower())
        self.assertNotIn("zaskocz", trik_art["seo_title"].lower())
        self.assertNotIn("jedną rzecz", trik_art["seo_title"].lower())
        self.assertTrue(trik_art["declickbait"])
        self.assertIn("Ten prosty trik może zaskoczyć", trik_art["declickbait"][0]["original"])

        # 2. Klaster wieloźródłowy odrzuca "Oto mistrzyni..." i "Zagłosuj w sondzie..."
        wta_group = [
            {
                "outlet": "Sport.pl",
                "group": "Agora",
                "path": "/Sport",
                "title": "Oto mistrzyni WTA Finals! W drodze po tytuł nie straciła seta",
                "description": "Finał turnieju WTA Finals rozstrzygnął się w dwóch setach bez straty seta przez zwyciężczynię.",
                "link": "https://sport.pl/wta",
                "thumbnail": "",
            },
            {
                "outlet": "Polsat Sport",
                "group": "Polsat",
                "path": "/Sport",
                "title": "Finał WTA Finals rozstrzygnięty! Tytuł bez straty seta",
                "description": "Polsat Sport informuje o triumfie w finale WTA Finals bez straty seta.",
                "link": "https://polsatsport.pl/wta",
                "thumbnail": "",
            },
        ]
        wta_art = uln.build_article_from_group(wta_group, 503)
        self.assertFalse(uln._is_clickbait_title(wta_art["seo_title"]))
        self.assertNotIn("Oto mistrzyni", wta_art["seo_title"])
        self.assertTrue(any("Oto mistrzyni" in dc["original"] for dc in wta_art["declickbait"]))

        # 3. "Z ostatniej chwili: ... – foto" i "Zagłosuj w sondzie i sprawdź wyniki"
        photo_neutral = uln._neutralize_clickbait_title(
            "Z ostatniej chwili: Demolka na Bystrzańskiej, BMW straciło koło. Do szpitala odwieziono trzy osoby! – foto"
        )
        self.assertNotIn("Z ostatniej chwili", photo_neutral)
        self.assertNotIn("foto", photo_neutral.lower())
        self.assertIn("Demolka na Bystrzańskiej", photo_neutral)

        self.assertTrue(uln._is_clickbait_title("Kto za Jana Urbana w reprezentacji Polski? Zagłosuj w sondzie i sprawdź wyniki"))
        self.assertTrue(uln._is_clickbait_title("Kiedy chemia zaskakuje"))
        self.assertTrue(uln._is_clickbait_title("Wraca ulubieniec kibiców"))
        self.assertTrue(uln.is_opinion_or_blacklisted("100 ciekawych miejsc, które warto zobaczyć w województwie podlaskim", ""))
        self.assertTrue(uln.is_opinion_or_blacklisted("Prywatne zdjęcia polskich mafiosów", ""))

    def test_spam_cta_and_bare_ellipsis_cleanup(self):
        for title, url in (
            ("Biedronka rozdaje sprzęt AGD za grosze w aplikacji mobilnej", "https://example.pl/promocje/1"),
            ("Ekspert radzi jak wybielać zęby domowymi sposobami", "https://example.pl/poradniki/zeby"),
            ("Materiał partnerski: najlepsze kredyty gotówkowe jesieni", "https://example.pl/art"),
        ):
            with self.subTest(title=title):
                self.assertTrue(uln.is_opinion_or_blacklisted(title, url))

        raw_cta = (
            "Gość porannej audycji mówił o nowym budżecie samorządu dla szkół średnich. "
            "ABY ODSŁUCHAĆ ROZMOWĘ, KLIKNIJ NA ZDJĘCIE POWYŻEJ. "
            "Samorząd zwiększy nakłady o 12 mln zł w przyszłym roku. Dalsza część wypowiedzi dostępna w materiale..."
        )
        cleaned = uln.clean_desc_text(raw_cta, "Budżet samorządu")
        self.assertNotIn("ABY ODSŁUCHAĆ", cleaned.upper())
        self.assertNotIn("KLIKNIJ NA ZDJĘCIE", cleaned.upper())
        self.assertFalse(cleaned.endswith("..."))
        self.assertTrue(cleaned.endswith("roku."))

        wp_trunc = "Pracowników traktują jak drugi sort. The post Kulisy samorządu: Zajęci nikczemnością first appeared on"
        cleaned_wp = uln.clean_desc_text(wp_trunc, "Kulisy samorządu")
        self.assertEqual(cleaned_wp, "Pracowników traktują jak drugi sort.")

        wp_title_only = (
            "Przyjęcie sprawy wymagało opłaty w wysokości 1000 złotych. "
            "Środkowy palec w górze. Sprawa trafiła do sądu first appeared on Swidnica24.pl – wydarzenia."
        )
        cleaned_wp2 = uln.clean_desc_text(wp_title_only, "Środkowy palec w górze. Sprawa trafiła do sądu")
        self.assertEqual(cleaned_wp2, "Przyjęcie sprawy wymagało opłaty w wysokości 1000 złotych.")

    def test_merge_non_oscillation_and_corrections_log(self):
        long_p1 = (
            "Premier ogłosił pakiet inwestycji infrastrukturalnych o wartości 18 mld zł na rozbudowę dróg ekspresowych i kolei regionalnych. "
            "Program obejmuje modernizację dziesięciu głównych węzłów transportowych oraz budowę nowych obwodnic miejskich w całym kraju. "
            "Finansowanie inwestycji ma pochodzić ze środków budżetowych oraz funduszy europejskich przewidzianych na kolejną dekadę."
        )
        long_p2 = (
            "Ministerstwo Infrastruktury potwierdziło, że pierwsze przetargi zostaną ogłoszone jeszcze przed końcem bieżącego kwartału. "
            "Według resortu priorytetem jest połączenie średnich ośrodków powiatowych z siecią szybkiej kolei oraz poprawa bezpieczeństwa ruchu."
        )
        group = [
            {
                "outlet": "PAP",
                "group": "PAP",
                "path": "/Polska/Gospodarka",
                "title": "Rząd ogłasza pakiet inwestycji transportowych za 18 mld zł",
                "description": long_p1,
                "link": "https://pap.pl/inwestycje-18mld",
                "thumbnail": "",
            },
            {
                "outlet": "Money.pl",
                "group": "Wirtualna Polska",
                "path": "/Polska/Gospodarka",
                "title": "Nowy program inwestycji drogowych i kolejowych za 18 mld zł",
                "description": long_p2,
                "link": "https://money.pl/inwestycje-18mld",
                "thumbnail": "",
            },
        ]
        art = uln.build_article_from_group(group, 101)

        # Ponowne zobaczenie tej samej już bogatej redakcji (PAP) z dłuższym tekstem nie wywołuje zbędnego przeliczenia
        reseen_pap = [{
            "outlet": "PAP",
            "group": "PAP",
            "path": "/Polska/Gospodarka",
            "title": "Rząd ogłasza pakiet inwestycji transportowych za 18 mld zł",
            "description": long_p1 + " Dodatkowe zdanie testowe przekraczające próg 80 znaków w opisie z kanału RSS dla sprawdzenia stabilności.",
            "link": "https://pap.pl/inwestycje-18mld",
        }]
        self.assertFalse(uln.merge_cluster_into_article(art, reseen_pap))
        self.assertEqual(art["corrections"], [])

        # Dopisanie nowej redakcji zapisuje corrections ze schematem UI
        new_outlet = [{
            "outlet": "Bankier.pl",
            "group": "Bonnier",
            "path": "/Polska/Gospodarka",
            "title": "Pakiet 18 mld zł na drogi i kolej przyjęty przez rząd",
            "description": "Rząd przeznaczy 18 mld zł na nowe linie kolejowe i obwodnice w całym kraju.",
            "link": "https://bankier.pl/inwestycje-18mld",
        }]
        self.assertTrue(uln.merge_cluster_into_article(art, new_outlet))
        self.assertIn("Bankier.pl", art["sources"])
        self.assertEqual(len(art["corrections"]), 1)
        self.assertEqual(set(art["corrections"][0].keys()), {"claim_text", "evidence_url"})
        self.assertIn("Bankier.pl", art["corrections"][0]["claim_text"])
        self.assertEqual(art["corrections"][0]["evidence_url"], "https://bankier.pl/inwestycje-18mld")

    def test_trim_articles_with_balance_and_quality_gate_and_feeds_health(self):
        import tempfile

        sample = []
        # 160 wieloźródłowych ogólnopolskich
        for i in range(160):
            sample.append({
                "id": 1000 + i,
                "path": "/Polska/Gospodarka",
                "seo_url": f"/Polska/Gospodarka/multi-{i}",
                "seo_title": f"Inwestycja gospodarcza nr {i}",
                "summary_lead": "Szczegółowy opis inwestycji gospodarczej w Polsce.",
                "published_iso": f"2026-11-15T{10 + (i // 60):02d}:{i % 60:02d}:00+01:00",
                "sources": ["PAP", "Bankier.pl"],
                "fact_agreement_pct": 88,
                "full_sections": [{"heading": "Ustalenia", "paragraphs": ["Szczegółowy opis inwestycji gospodarczej w Polsce. [Źródło: PAP, Bankier.pl]"]}],
                "perspectives": [{"outlet": "PAP", "angle": "Relacja wiodąca", "summary": "Tytuł", "url": "https://pap.pl/1"}],
            })
        # Każde z 16 województw: 2 wieloźródłowe + 8 jednoźródłowych
        vid = 2000
        for v_path, _, _, _, _, _ in seo_builder.VOIVODESHIPS:
            for k in range(2):
                sample.append({
                    "id": vid,
                    "path": v_path,
                    "seo_url": f"{v_path}/multi-{k}",
                    "seo_title": f"Wydarzenie regionalne {k}",
                    "summary_lead": "Opis wydarzenia regionalnego potwierdzony przez dwie redakcje.",
                    "published_iso": f"2026-11-15T09:{vid % 60:02d}:00+01:00",
                    "sources": ["Radio Regionalne", "TVP3"],
                    "fact_agreement_pct": 85,
                    "full_sections": [{"heading": "Ustalenia", "paragraphs": ["Opis wydarzenia regionalnego potwierdzony przez dwie redakcje. [Źródło: Radio Regionalne, TVP3]"]}],
                    "perspectives": [{"outlet": "TVP3", "angle": "Doniesienie regionalne", "summary": "Tytuł", "url": "https://tvp.pl/1"}],
                })
                vid += 1
            for k in range(8):
                sample.append({
                    "id": vid,
                    "path": v_path,
                    "seo_url": f"{v_path}/single-{k}",
                    "seo_title": f"Lokalna informacja {k}",
                    "summary_lead": "Lokalna informacja ze sprawdzonego źródła samorządowego.",
                    "published_iso": f"2026-11-14T{k:02d}:00:00+01:00",
                    "sources": ["TVP3"],
                    "fact_agreement_pct": None,
                    "full_sections": [{"heading": "Relacja źródłowa (TVP3)", "paragraphs": ["Lokalna informacja ze sprawdzonego źródła samorządowego. [Źródło: TVP3]"]}],
                    "perspectives": [{"outlet": "TVP3", "angle": "Doniesienie regionalne", "summary": "Tytuł", "url": "https://tvp.pl/2"}],
                })
                vid += 1

        balanced = uln._trim_articles_with_balance(sample, max_total=uln.MAX_TOTAL_ARTICLES)
        stats = uln.summarize_cycle_quality(balanced)
        self.assertEqual(stats["voivodeships_covered"], 16)
        self.assertGreaterEqual(stats["multi_source_pct"], 80.0)
        for vp, vd in stats["voivodeships"].items():
            self.assertGreaterEqual(vd["total"], 5, f"Województwo {vp} spadło poniżej 5 artykułów")

        ok, errs = uln.run_quality_gate(balanced)
        self.assertTrue(ok, f"Quality gate nie przeszedł na zbalansowanym zestawie: {errs}")

        bad_only_single = [a for a in balanced if len(a["sources"]) == 1]
        ok_bad, errs_bad = uln.run_quality_gate(bad_only_single)
        self.assertFalse(ok_bad)
        self.assertTrue(any("wieloźródłowych" in e for e in errs_bad))

        # Test zapisu feeds_health.json i licznika consecutive_failures
        with tempfile.TemporaryDirectory() as tmpdir:
            hp = os.path.join(tmpdir, "feeds_health.json")
            feed_ok = {"name": "FeedA", "path": "/Polska", "url": "https://example.pl/a.xml"}
            feed_err = {"name": "FeedB", "path": "/Swiat", "url": "https://example.pl/b.xml"}
            rep1 = uln._update_feeds_health_report(
                [(feed_ok, [{"title": "x"}], None), (feed_err, [], RuntimeError("HTTP 500"))],
                health_path=hp,
            )
            self.assertEqual(rep1["ok_count"], 1)
            self.assertEqual(rep1["err_count"], 1)
            rep2 = uln._update_feeds_health_report(
                [(feed_ok, [], None), (feed_err, [], RuntimeError("HTTP 500"))],
                health_path=hp,
            )
            by_name2 = {f["name"]: f for f in rep2["feeds"]}
            self.assertEqual(by_name2["FeedA"]["consecutive_failures"], 1)
            self.assertEqual(by_name2["FeedB"]["consecutive_failures"], 2)
            rep3 = uln._update_feeds_health_report(
                [(feed_ok, [{"title": "x"}], None), (feed_err, [{"title": "y"}], None)],
                health_path=hp,
            )
            by_name3 = {f["name"]: f for f in rep3["feeds"]}
            self.assertEqual(by_name3["FeedA"]["consecutive_failures"], 0)
            self.assertEqual(by_name3["FeedB"]["consecutive_failures"], 0)


class TestStage6FastBootPwaSectionRssAndScrollPaging(unittest.TestCase):
    def test_articles_index_compact_schema_and_reading_minutes(self):
        with open(os.path.join(ROOT_DIR, "articles.json"), "rb") as f:
            full_bytes = f.read()
        with open(os.path.join(ROOT_DIR, "articles-index.json"), "rb") as f:
            idx_bytes = f.read()

        self.assertLess(
            len(idx_bytes),
            len(full_bytes) * 0.35,
            f"articles-index.json ({len(idx_bytes)} B) powinien stanowić < 35% rozmiaru articles.json ({len(full_bytes)} B)",
        )
        full_data = json.loads(full_bytes.decode("utf-8"))
        idx_data = json.loads(idx_bytes.decode("utf-8"))
        self.assertEqual(len(idx_data), len(full_data))
        for item in idx_data[:25]:
            self.assertNotIn("full_sections", item)
            self.assertNotIn("perspectives", item)
            self.assertIn("reading_minutes", item)
            self.assertGreaterEqual(item["reading_minutes"], 1)
            self.assertTrue(item.get("updated_iso"))
            self.assertTrue(item.get("seo_url"))

    def test_pwa_assets_manifest_sw_and_html_head_tags(self):
        for fname in ("icon.svg", "icon-192.png", "icon-512.png", "manifest.webmanifest", "sw.js"):
            p = os.path.join(ROOT_DIR, fname)
            self.assertTrue(os.path.isfile(p) and os.path.getsize(p) > 0, f"Brak lub pusty plik PWA: {fname}")

        with open(os.path.join(ROOT_DIR, "manifest.webmanifest"), "r", encoding="utf-8") as f:
            manifest = json.load(f)
        self.assertEqual(manifest.get("start_url"), "./")
        self.assertEqual(manifest.get("display"), "standalone")
        icons = manifest.get("icons") or []
        self.assertGreaterEqual(len(icons), 3)
        for ic in icons:
            self.assertFalse(str(ic.get("src", "")).startswith("/"), "Ścieżki ikon w manifeście powinny być względne")

        with open(os.path.join(ROOT_DIR, "index.html"), "r", encoding="utf-8") as f:
            home_html = f.read()
        self.assertIn('<meta name="theme-color" content="#151b28"', home_html)
        self.assertIn('rel="manifest" href="manifest.webmanifest"', home_html)
        self.assertIn('href="Polska/feed.xml"', home_html)

        with open(os.path.join(ROOT_DIR, "Swiat", "index.html"), "r", encoding="utf-8") as f:
            swiat_html = f.read()
        self.assertIn('href="../manifest.webmanifest"', swiat_html)
        self.assertIn('href="../Swiat/feed.xml"', swiat_html)

    def test_section_rss_feeds_and_rfc2822_pubdate(self):
        import xml.etree.ElementTree as ET

        for rel in ["feed.xml"] + [f"{sec.strip('/')}/feed.xml" for sec, _ in seo_builder.MAIN_RSS_SECTIONS]:
            fpath = os.path.join(ROOT_DIR, rel)
            self.assertTrue(os.path.isfile(fpath), f"Brak kanału RSS działu: {rel}")
            with open(fpath, "r", encoding="utf-8") as f:
                xml_txt = f.read()
            root = ET.fromstring(xml_txt)
            items = root.findall("./channel/item")
            self.assertGreater(len(items), 0, f"Kanał RSS {rel} jest pusty")
            self.assertIsNotNone(items[0].find("pubDate"), f"Brak elementu <pubDate> w {rel}")

    def test_updated_iso_propagation_and_ssr_feed_batch_limit(self):
        import tempfile

        with tempfile.TemporaryDirectory() as tmpdir:
            sample = {
                "id": 9999,
                "path": "/Polska/Gospodarka",
                "seo_url": "/Polska/Gospodarka/test-lastmod",
                "seo_title": "Test aktualizacji znacznika czasu lastmod",
                "summary_lead": "Opis testowego artykułu z oznaczeniem updated_iso dla mapy witryny.",
                "published_iso": "2026-11-14T08:00:00+01:00",
                "updated_iso": "2026-11-15T19:45:00+01:00",
                "display_date": "14 listopada 2026",
                "status": "AUTO_PUBLISHED",
                "sources": ["PAP", "Bankier.pl"],
                "fact_agreement_pct": 90,
                "full_sections": [
                    {"heading": "Ustalenia", "paragraphs": ["Pierwszy akapit testowy. [Źródło: PAP, Bankier.pl]"]}
                ],
                "perspectives": [
                    {"outlet": "PAP", "angle": "Relacja wiodąca", "summary": "Tytuł", "url": "https://pap.pl/1"},
                    {"outlet": "Bankier.pl", "angle": "Dane", "summary": "Tytuł 2", "url": "https://bankier.pl/2"},
                ],
            }
            with open(os.path.join(tmpdir, "styles.css"), "w", encoding="utf-8") as f:
                f.write("body{}")
            with open(os.path.join(tmpdir, "app.js"), "w", encoding="utf-8") as f:
                f.write("let articles=[];")
            seo_builder.build_all_seo_artifacts(tmpdir, [sample], site_base_url="https://example.pl")

            with open(os.path.join(tmpdir, "sitemap.xml"), "r", encoding="utf-8") as f:
                sm_txt = f.read()
            self.assertIn("<lastmod>2026-11-15T19:45:00+01:00</lastmod>", sm_txt)

            art_html_path = os.path.join(tmpdir, "Polska", "Gospodarka", "test-lastmod", "index.html")
            with open(art_html_path, "r", encoding="utf-8") as f:
                art_html = f.read()
            self.assertIn('property="article:modified_time" content="2026-11-15T19:45:00+01:00"', art_html)
            self.assertIn('"dateModified": "2026-11-15T19:45:00+01:00"', art_html)

            # Sprawdzenie limitu SSR (1 lead + 12 kart) na dużym zbiorze
            with open(os.path.join(ROOT_DIR, "index.html"), "r", encoding="utf-8") as f:
                home_html = f.read()
            ssr_feed = home_html.split('id="articlesFeed"', 1)[-1].split("</section>", 1)[0]
            self.assertEqual(ssr_feed.count('class="story-title-link"'), 13)
            self.assertIn('class="feed-load-more-wrap"', ssr_feed)

    def test_app_js_stage6_scroll_and_pwa_invariants(self):
        with open(os.path.join(ROOT_DIR, "app.js"), "r", encoding="utf-8") as f:
            js_code = f.read()
        self.assertLess(len(js_code.encode("utf-8")), 100_000)
        for token in (
            "FEED_BATCH_SIZE = 12",
            "IntersectionObserver",
            "articles-index.json",
            "ensureFullArticlesLoaded",
            "navigator.serviceWorker.register",
        ):
            self.assertIn(token, js_code)


class TestStage7ZeroTrustEditorialQueueAndEvidenceSystem(unittest.TestCase):
    def test_zero_trust_classification_and_evidence_validation(self):
        dispute_art = {
            "id": 101,
            "path": "/Polska/Energetyka",
            "seo_url": "/Polska/Energetyka/test-spor-rządowy",
            "seo_title": "Rząd zapowiada zamrożenie cen gazu na 2027 r., choć URE i ekonomiści ostrzegają przed kosztem 6 mld zł",
            "summary_lead": "Ministerstwo zapowiada utrzymanie taryfy, podczas gdy dane rynkowe wskazują na wysokie koszty rekompensat.",
            "sources": ["WNP.pl", "Bankier.pl"],
            "perspectives": [],
            "full_sections": [],
        }
        status, reason, note = uln.evaluate_zero_trust_article(dispute_art)
        self.assertEqual(status, "PENDING_ADMIN")
        self.assertTrue(reason.startswith("Wstrzymano (Zero-Trust)"))
        self.assertIn("Sygnały:", reason)
        self.assertIn("Wyzwalacz:", reason)
        self.assertNotIn("197,27", note)
        self.assertTrue(len(note) >= 20)

        # Obcy wątek doklejony w jednej z perspektyw nie może wstrzymać niezwiązanego artykułu
        mixed_false_positive = {
            "id": 103,
            "path": "/Polska/Polityka",
            "seo_url": "/Polska/Polityka/stala-baza-usa",
            "seo_title": "Stała amerykańska baza w Polsce. Kosiniak-Kamysz: wiceszef resortu obrony USA potwierdził",
            "summary_lead": "Pentagon dał zielone światło dla stałej bazy wojsk amerykańskich w Polsce.",
            "sources": ["Rzeczpospolita", "Bankier.pl"],
            "perspectives": [
                {"outlet": "Rzeczpospolita", "summary": "Stała amerykańska baza w Polsce."},
                {"outlet": "ObcaRedakcja", "summary": "Rząd zapowiada zamrożenie cen gazu mimo ostrzeżeń URE przed kosztem rekompensat."},
            ],
            "full_sections": [],
        }
        st_fp, reason_fp, _ = uln.evaluate_zero_trust_article(mixed_false_positive)
        self.assertEqual(st_fp, "AUTO_PUBLISHED")
        self.assertEqual(reason_fp, "")

        # Brak efektu kuli śnieżnej po wspólnym frazesie („zielone światło”) i tytule pobocznej perspektywy
        base_art = {
            "id": 104,
            "path": "/Polska/Polityka",
            "seo_url": "/Polska/Polityka/stala-baza-usa",
            "seo_title": "Stała amerykańska baza w Polsce. Kosiniak-Kamysz: wiceszef resortu obrony USA potwierdził",
            "summary_lead": "Pentagon dał zielone światło dla stałej bazy wojskowej USA w Polsce.",
            "sources": ["Rzeczpospolita", "Tabletowo.pl"],
            "perspectives": [
                {"outlet": "Rzeczpospolita", "summary": "Stała amerykańska baza w Polsce."},
                {"outlet": "Tabletowo.pl", "summary": "Jeden cyfrowy portfel w całej Unii Europejskiej. Rząd daje zielone światło"},
            ],
            "full_sections": [],
        }
        wallet_grp = [{
            "outlet": "Cashless.pl",
            "title": "Rząd przyjął projekt ustawy dotyczący mObywatela Europa i cyfrowego portfela",
            "description": "Nowe przepisy wprowadzą europejski portfel tożsamości cyfrowej.",
            "link": "https://cashless.pl/mobywatel-europa",
            "path": "/Polska/Polityka",
        }]
        self.assertIsNone(uln.find_matching_existing_article(wallet_grp, [base_art]))

        normal_art = {
            "id": 102,
            "path": "/Sport",
            "seo_url": "/Sport/mecz-reprezentacji",
            "seo_title": "Wygrana reprezentacji Polski w eliminacjach",
            "summary_lead": "Reprezentacja wygrała spotkanie wyjazdowe 2:0.",
            "sources": ["Sport.pl", "Polsat Sport"],
            "perspectives": [],
            "full_sections": [],
        }
        st2, _, _ = uln.evaluate_zero_trust_article(normal_art)
        self.assertEqual(st2, "AUTO_PUBLISHED")

        # Walidacja linków „Pokaż dowód!”
        ok_bad_url, msg_bad_url = uln.validate_evidence_submission("Poprawny długi opis korekty.", "ftp://invalid.pl")
        self.assertFalse(ok_bad_url)
        self.assertIn("URL", msg_bad_url)

        ok_bl, msg_bl = uln.validate_evidence_submission(
            "Poprawny długi opis korekty faktu.", "https://demagog.org.pl/wypowiedzi/test"
        )
        self.assertFalse(ok_bl)
        self.assertIn("Zero-Trust", msg_bl)

        ok_short, _ = uln.validate_evidence_submission("Za krótko", "https://www.nbp.pl/statystyka")
        self.assertFalse(ok_short)

        ok_valid, _ = uln.validate_evidence_submission(
            "Oficjalny komunikat NBP potwierdza korektę wskaźnika za III kwartał.",
            "https://nbp.pl/statystyka-i-sprawozdawczosc/inflacja/",
        )
        self.assertTrue(ok_valid)

    def test_editorial_persistence_and_server_http_api(self):
        import shutil
        import tempfile
        import threading
        import urllib.error
        import urllib.request
        import server as verity_server

        with tempfile.TemporaryDirectory() as tmpdir:
            sample_articles = [
                {
                    "id": 5001,
                    "path": "/Polska/Energetyka",
                    "seo_url": "/Polska/Energetyka/test-zamrozenie-gazu",
                    "seo_title": "Rząd zapowiada zamrożenie taryf gazu, ekonomiści i URE ostrzegają przed deficytem",
                    "summary_lead": "Spór resortu i ekspertów w sprawie kosztów rekompensat na rynku gazu.",
                    "published_iso": "2026-11-15T18:00:00+01:00",
                    "updated_iso": "2026-11-15T18:00:00+01:00",
                    "display_date": "15.11.2026, 18:00",
                    "status": "PENDING_ADMIN",
                    "admin_note": "",
                    "zero_trust_reason": "Rozbieżność między komunikatem rządu a wyliczeniami URE.",
                    "sources": ["WNP.pl", "Bankier.pl"],
                    "fact_agreement_pct": 84,
                    "corrections": [],
                    "full_sections": [{"heading": "Ustalenia", "paragraphs": ["Resort oraz ekonomiści przedstawili rozbieżne wyliczenia. [Źródło: WNP.pl, Bankier.pl]"]}],
                    "perspectives": [
                        {"outlet": "WNP.pl", "angle": "Komunikat", "summary": "Taryfa", "url": "https://wnp.pl/1"},
                        {"outlet": "Bankier.pl", "angle": "Rynek", "summary": "Koszty", "url": "https://bankier.pl/1"},
                    ],
                },
                {
                    "id": 5002,
                    "path": "/Polska/Gospodarka",
                    "seo_url": "/Polska/Gospodarka/test-inflacja-gus",
                    "seo_title": "GUS publikuje końcowy odczyt inflacji za październik",
                    "summary_lead": "Ostateczne dane GUS potwierdzają stabilizację cen żywności i paliw.",
                    "published_iso": "2026-11-15T19:00:00+01:00",
                    "updated_iso": "2026-11-15T19:00:00+01:00",
                    "display_date": "15.11.2026, 19:00",
                    "status": "AUTO_PUBLISHED",
                    "admin_note": "",
                    "sources": ["PAP", "Money.pl"],
                    "fact_agreement_pct": 92,
                    "corrections": [],
                    "full_sections": [{"heading": "Dane", "paragraphs": ["Odczyt roczny wyniósł 2,8 proc. [Źródło: PAP, Money.pl]"]}],
                    "perspectives": [
                        {"outlet": "PAP", "angle": "Depesza", "summary": "GUS", "url": "https://pap.pl/1"},
                        {"outlet": "Money.pl", "angle": "Analiza", "summary": "Ceny", "url": "https://money.pl/1"},
                    ],
                },
            ]
            with open(os.path.join(tmpdir, "articles.json"), "w", encoding="utf-8") as f:
                json.dump(sample_articles, f, ensure_ascii=False, indent=2)
            for fname in ("styles.css", "app.js"):
                shutil.copyfile(os.path.join(ROOT_DIR, fname), os.path.join(tmpdir, fname))

            os.environ["VERITY_QUIET_SERVER"] = "1"
            old_tok = os.environ.pop("VERITY_ADMIN_TOKEN", None)
            srv = verity_server.create_server(directory=tmpdir, host="127.0.0.1", port=0, rebuild_seo_on_write=False)
            t = threading.Thread(target=srv.serve_forever, daemon=True)
            t.start()
            port = srv.server_address[1]
            base = f"http://127.0.0.1:{port}"

            def req_json(path, method="GET", body=None, headers=None):
                hdrs = dict(headers or {})
                data_bytes = None
                if body is not None:
                    data_bytes = json.dumps(body).encode("utf-8")
                    hdrs["Content-Type"] = "application/json"
                r = urllib.request.Request(base + path, data=data_bytes, method=method, headers=hdrs)
                try:
                    with urllib.request.urlopen(r, timeout=5) as resp:
                        return resp.status, json.loads(resp.read().decode("utf-8"))
                except urllib.error.HTTPError as he:
                    return he.code, json.loads(he.read().decode("utf-8"))

            try:
                st, d0 = req_json("/api/editorial-state")
                self.assertEqual(st, 200)
                self.assertEqual(d0["pending_articles"], 1)

                # Odrzucenie czarnej listy przez API korekt
                st_bl, d_bl = req_json("/api/corrections", "POST", {
                    "article_id": 5002,
                    "claim_text": "Sprawdźmy ten wskaźnik w bazie źródłowej GUS.",
                    "evidence_url": "https://oko.press/test-artykul",
                })
                self.assertEqual(st_bl, 400)
                self.assertFalse(d_bl["ok"])

                # Zapis poprawnej korekty czytelnika
                st_c, d_c = req_json("/api/corrections", "POST", {
                    "article_id": 5002,
                    "claim_text": "Szczegółowa tabela GUS podaje dokładny odczyt 2,8 proc. r/r.",
                    "evidence_url": "https://stat.gov.pl/obszary-tematyczne/ceny-handel/",
                })
                self.assertEqual(st_c, 200)
                self.assertTrue(d_c["ok"])
                corr_id = d_c["correction"]["id"]

                # Zatwierdzenie artykułu z notą redakcyjną
                st_a, d_a = req_json("/api/admin/approve-article", "POST", {
                    "article_id": 5001,
                    "admin_note": "Zweryfikowano w taryfie URE i projekcie ustawy.",
                })
                self.assertEqual(st_a, 200)
                self.assertEqual(d_a["article"]["status"], "AUTO_PUBLISHED")

                # Moderacja korekty (potwierdzenie dowodu)
                st_m, d_m = req_json("/api/admin/moderate-correction", "POST", {
                    "correction_id": corr_id,
                    "action": "approve",
                })
                self.assertEqual(st_m, 200)
                self.assertEqual(d_m["correction"]["status"], "APPROVED")

                # Symulacja kolejnego cyklu RSS (apply_editorial_state_to_articles pamięta decyzję i dowód!)
                with open(os.path.join(tmpdir, "articles.json"), "r", encoding="utf-8") as f:
                    reloaded_arts = json.load(f)
                self.assertEqual(reloaded_arts[1]["corrections"][0].keys(), {"claim_text", "evidence_url"})
                reloaded_arts[0]["status"] = "PENDING_ADMIN"
                reloaded_arts[0]["admin_note"] = ""
                reloaded_arts[1]["corrections"] = []
                persisted_state = uln.load_editorial_state(tmpdir)
                after_cycle = uln.apply_editorial_state_to_articles(reloaded_arts, persisted_state, base_dir=tmpdir)
                self.assertEqual(after_cycle[0]["status"], "AUTO_PUBLISHED")
                self.assertIn("taryfie URE", after_cycle[0]["admin_note"])
                self.assertEqual(len(after_cycle[1]["corrections"]), 1)

                # Egzekwowanie opcjonalnego tokena Admina
                os.environ["VERITY_ADMIN_TOKEN"] = "sekret-verity"
                st_unauth, _ = req_json("/api/admin/reject-article", "POST", {"article_id": 5002})
                self.assertEqual(st_unauth, 401)
                st_auth, _ = req_json(
                    "/api/admin/reject-article",
                    "POST",
                    {"article_id": 5002},
                    headers={"X-Admin-Token": "sekret-verity"},
                )
                self.assertEqual(st_auth, 200)
            finally:
                srv.shutdown()
                srv.server_close()
                if old_tok is not None:
                    os.environ["VERITY_ADMIN_TOKEN"] = old_tok
                else:
                    os.environ.pop("VERITY_ADMIN_TOKEN", None)


class TestStage8AiSynthesizerCostGuardAndComparativePerspectives(unittest.TestCase):
    def test_deterministic_comparative_perspectives_and_seo_title_enrichment(self):
        group = [
            {
                "outlet": "PAP",
                "title": "Sejm przyjął nowelizację ustawy energetycznej",
                "description": (
                    "Posłowie przegłosowali w piątek nowelizację ustawy o wsparciu odbiorców energii elektrycznej. "
                    "W głosowaniu oddano głosy zgodnie z rekomendacją komisji sejmowej."
                ),
                "link": "https://pap.pl/sejm-energetyka",
                "path": "/Polska/Energetyka",
            },
            {
                "outlet": "Bankier.pl",
                "title": "Sejm przyjął ustawę o cenach prądu: 234 za, koszt wsparcia to 6,2 mld zł",
                "description": (
                    "Za przyjęciem ustawy głosowało 234 posłów, przeciw było 190 parlamentarzystów. "
                    "Resort finansów szacuje maksymalny koszt mechanizmu na 6,2 mld zł w budżecie."
                ),
                "link": "https://bankier.pl/sejm-energetyka",
                "path": "/Polska/Energetyka",
            },
        ]
        art = uln.build_article_from_group(group, 701)
        # Deterministyczne wzbogacenie seo_title przejęło konkretne liczby (234 za / 6,2 mld zł)
        self.assertIn("234", art["seo_title"])
        self.assertIn("6,2 mld zł", art["seo_title"])
        # Analiza porównawcza Eksponuje / Pomija zachowuje oryginalne summary/url
        persps = art["perspectives"]
        self.assertEqual(len(persps), 2)
        by_out = {p["outlet"]: p for p in persps}
        self.assertEqual(by_out["PAP"]["summary"], "Sejm przyjął nowelizację ustawy energetycznej")
        self.assertEqual(by_out["PAP"]["url"], "https://pap.pl/sejm-energetyka")
        self.assertIn("234", by_out["PAP"].get("omits", ""))
        self.assertTrue(any(k in by_out["Bankier.pl"].get("focus", "") for k in ("234", "6,2")))
        self.assertTrue(len(by_out["Bankier.pl"].get("omits", "")) >= 15)

        # Wzbogacanie samego tytułu z akapitu sekcji, gdy żaden nagłówek nie miał liczby
        enriched = ai_synthesizer.enrich_seo_title_deterministic(
            "Nowe taryfy na rynku ciepła",
            [{"outlet": "WNP.pl", "title": "Nowe taryfy na rynku ciepła"}],
            [{"heading": "Dane", "paragraphs": ["Maksymalna stawka wzrośnie o 14 proc. od stycznia. [Źródło: WNP.pl]"]}],
        )
        self.assertIn("14 proc.", enriched)

    def test_compress_cost_guard_and_zero_trust_llm_validation(self):
        import io
        import tempfile
        from unittest import mock

        group = [
            {
                "outlet": "PAP",
                "title": "RPP utrzymała stopy procentowe na poziomie 5,75 proc.",
                "description": (
                    "Rada Polityki Pieniężnej zdecydowała w środę o utrzymaniu stopy referencyjnej 5,75 proc. "
                    "Zdanie piąte: długi opis szumu reklamowego. Zdanie czwarte."
                ),
                "link": "https://pap.pl/rpp-575",
                "path": "/Polska/Gospodarka",
            },
            {
                "outlet": "Money.pl",
                "title": "Decyzja RPP w sprawie stóp i prognoza inflacji 3,1 proc.",
                "description": (
                    "Ekonomiści ankietowani przed posiedzeniem spodziewali się inflacji 3,1 proc. "
                    "Prezes NBP omówi projekcję na konferencji."
                ),
                "link": "https://money.pl/rpp-prognoza",
                "path": "/Polska/Gospodarka",
            },
        ]
        compressed = ai_synthesizer.compress_cluster_for_llm(group, [], max_chars=900)
        self.assertEqual(len(compressed["sources"]), 2)

        # 1. Walidacja Zero-Trust odrzuca zmyśloną liczbę (999 mld) oraz clickbait, ale przepuszcza liczby ze źródeł
        bad_llm_out = {
            "seo_title": "SZOK! RPP zmienia stopy o 999 proc.!!",
            "summary_lead": "RPP podniosła stopy i dodała 999 mld zł programu wsparcia dla banków.",
            "meta_description": "Rada Polityki Pieniężnej podjęła decyzję o utrzymaniu stopy referencyjnej na poziomie 5,75 proc. według NBP.",
            "perspectives": [
                {
                    "outlet": "PAP",
                    "angle": "Fakty RPP",
                    "focus": "Eksponuje decyzję RPP o utrzymaniu stopy 5,75 proc.",
                    "omits": "Pomija zmyśloną kwotę 999 mld zł spoza depeszy.",
                }
            ],
        }
        val_bad = ai_synthesizer._validate_zero_trust_llm_output(
            bad_llm_out,
            compressed,
            [{"outlet": "PAP", "angle": "Depesza", "summary": "Tytuł", "url": "https://pap.pl/rpp-575"}],
            fallback_title="RPP utrzymała stopy na poziomie 5,75 proc.",
        )
        # Zmyślone seo_title i summary_lead z 999 odrzucone
        self.assertEqual(val_bad["seo_title"], "RPP utrzymała stopy na poziomie 5,75 proc.")
        self.assertNotIn("summary_lead", val_bad)
        # Meta z prawdziwym 5,75 proc. przeszło
        self.assertIn("5,75 proc.", val_bad["meta_description"])
        # Focus z 5,75 przeszedł, ale omits z 999 odrzucony
        self.assertIn("5,75", val_bad["perspectives"][0]["focus"])
        self.assertNotIn("omits", val_bad["perspectives"][0])

        # 2. GeminiCostGuard + pełne wywołanie enhance_article_narrative_and_seo z mockiem HTTP
        with tempfile.TemporaryDirectory() as tmpdir:
            budget_file = os.path.join(tmpdir, "gemini_budget.json")
            guard = ai_synthesizer.GeminiCostGuard(budget_path=budget_file, max_calls_per_run=1, max_daily_calls=5)
            art = uln.build_article_from_group(group, 702)

            good_gemini_resp = json.dumps({
                "candidates": [{
                    "content": {
                        "parts": [{
                            "text": json.dumps({
                                "seo_title": "RPP utrzymuje stopy na poziomie 5,75 proc. przy prognozie inflacji 3,1 proc.",
                                "summary_lead": "Rada Polityki Pieniężnej utrzymała stopę referencyjną 5,75 proc., podczas gdy ekonomiści szacują inflację na 3,1 proc.",
                                "meta_description": "RPP utrzymała stopę referencyjną 5,75 proc. Sprawdź porównanie depesz PAP i Money.pl na temat inflacji 3,1 proc.",
                                "perspectives": [
                                    {
                                        "outlet": "PAP",
                                        "angle": "Komunikat RPP",
                                        "focus": "Eksponuje oficjalną decyzję RPP o utrzymaniu stopy 5,75 proc.",
                                        "omits": "Pomija ankietową prognozę inflacji 3,1 proc. opisaną przez Money.pl.",
                                    },
                                    {
                                        "outlet": "Money.pl",
                                        "angle": "Rynek i prognozy",
                                        "focus": "Akcentuje oczekiwania ekonomistów wobec inflacji 3,1 proc. i konferencję NBP.",
                                        "omits": "Pomija bezpośrednie brzmienie komunikatu RPP z depeszy PAP.",
                                    },
                                ],
                            })
                        }]
                    }
                }]
            }).encode("utf-8")

            class _FakeResp(io.BytesIO):
                def __enter__(self):
                    return self
                def __exit__(self, *args):
                    return False

            with mock.patch("ai_synthesizer.urllib.request.urlopen", return_value=_FakeResp(good_gemini_resp)) as mocked_open:
                ai_synthesizer.enhance_article_narrative_and_seo(
                    art, group, cost_guard=guard, use_gemini=True, api_key="fake-free-tier-key"
                )
                self.assertEqual(mocked_open.call_count, 1)
                self.assertTrue(art.get("ai_synthesized"))
                self.assertIn("3,1 proc.", art["seo_title"])
                self.assertEqual(guard.calls_this_run, 1)
                self.assertEqual(guard.state["daily_calls"], 1)
                # Drugie wywołanie w tym samym cyklu zostaje zatrzymane przez GeminiCostGuard (max_calls_per_run=1)
                art2 = uln.build_article_from_group(group, 703)
                ai_synthesizer.enhance_article_narrative_and_seo(
                    art2, group, cost_guard=guard, use_gemini=True, api_key="fake-free-tier-key"
                )
                self.assertEqual(mocked_open.call_count, 1)
                self.assertFalse(art2.get("ai_synthesized", False))

            # Sprawdzenie trwałego zapisu licznika w gemini_budget.json
            reloaded_guard = ai_synthesizer.GeminiCostGuard(budget_path=budget_file, max_calls_per_run=6, max_daily_calls=5)
            self.assertEqual(reloaded_guard.state["daily_calls"], 1)


class TestStage9SeoFaqDossierOgAndIndexNow(unittest.TestCase):
    def test_impact_pills_and_deterministic_seo_faq_with_zero_trust(self):
        art = {
            "id": 9101,
            "path": "/Polska/Gospodarka",
            "seo_url": "/Polska/Gospodarka/ksef-obowiazek-przedsiebiorcy",
            "seo_title": "Nowe terminy KSeF dla przedsiębiorców wchodzą w życie w 2026 r.",
            "summary_lead": "Ministerstwo Finansów potwierdziło harmonogram wdrożenia KSeF dla podatników VAT.",
            "sources": ["PAP", "Bankier.pl"],
            "fact_agreement_pct": 91,
            "full_sections": [
                {
                    "heading": "Harmonogram",
                    "paragraphs": [
                        "Ministerstwo Finansów potwierdziło harmonogram wdrożenia KSeF dla podatników VAT. [Źródło: PAP]",
                        "Od 1 lutego 2026 r. system obejmie firmy o obrotach powyżej 200 mln zł, a kolejne podmioty dołączą w kwietniu. [Źródło: PAP, Bankier.pl]",
                    ],
                }
            ],
        }
        impact = ai_synthesizer.extract_article_impact(art)
        self.assertEqual(impact["audience"], "Przedsiębiorcy i podatnicy")
        self.assertEqual(impact["scope"], "Portfel, podatki i rynek")
        self.assertTrue(len(impact["status"]) >= 8)

        faq = ai_synthesizer.generate_seo_faq_deterministic(art, art["full_sections"], impact=impact)
        self.assertGreaterEqual(len(faq), 2)
        self.assertLessEqual(len(faq), 3)
        for item in faq:
            self.assertTrue(item["q"].endswith("?"))
            self.assertNotIn("[Źródło:", item["a"])
            self.assertNotIn("<", item["a"])
            self.assertNotIn("&quot;", item["a"])
        self.assertTrue(any("200 mln" in item["a"] or "1 lutego 2026" in item["a"] for item in faq))

        # Walidacja Zero-Trust dla FAQPage od Gemini: zmyślona liczba odrzucona, liczba ze źródła zaakceptowana
        compressed = {
            "sources": [{"outlet": "PAP", "title": art["seo_title"], "excerpt": "System obejmie firmy powyżej 200 mln zł w 2026 r."}]
        }
        val = ai_synthesizer._validate_zero_trust_llm_output(
            {
                "seo_title": "Obowiązek KSeF dla firm powyżej 200 mln zł w 2026 r.",
                "seo_faq": [
                    {"q": "Kiedy rusza KSeF dla największych firm?", "a": "W 2026 r. system obejmie przedsiębiorstwa z obrotem powyżej 200 mln zł."},
                    {"q": "Jaka będzie kara finansowa za błąd?", "a": "Przepisy przewidują automatyczną grzywnę w wysokości 999 tys. zł."},
                    {"q": "Kogo dotyczy pierwszy etap zmian?", "a": "Zmiany obejmują podatników i przedsiębiorców raportujących faktury."},
                ],
            },
            compressed,
            [{"outlet": "PAP", "angle": "Fakty", "summary": "Tytuł", "url": "https://pap.pl/ksef"}],
            fallback_title=art["seo_title"],
        )
        valid_faq = val.get("seo_faq") or []
        self.assertEqual(len(valid_faq), 2)
        self.assertFalse(any("999" in f["a"] for f in valid_faq))

    def test_dossier_timeline_clustering_and_conflict_guards(self):
        items = [
            {
                "id": 1,
                "path": "/Polska/Gospodarka",
                "seo_url": "/Polska/Gospodarka/projekt-ksef-komisja-sejmowa",
                "seo_title": "Komisja sejmowa omawia projekt KSeF dla przedsiębiorców",
                "summary_lead": "Projekt nowelizacji KSeF trafił pod obrady sejmowej komisji finansów.",
                "published_iso": "2026-11-12T10:00:00+01:00",
                "display_date": "12.11.2026, 10:00",
            },
            {
                "id": 2,
                "path": "/Polska/Gospodarka",
                "seo_url": "/Polska/Gospodarka/sejm-przyjmuje-ksef-zmiany",
                "seo_title": "Sejm przegłosował zmiany w systemie KSeF dla przedsiębiorców",
                "summary_lead": "Posłowie przyjęli nowelizację KSeF w sprawie faktur elektronicznych.",
                "published_iso": "2026-11-14T15:00:00+01:00",
                "display_date": "14.11.2026, 15:00",
            },
            # Inna droga / inne miasto nie może się skleić w Akta Sprawy
            {
                "id": 3,
                "path": "/Polska/Regiony/Wielkopolskie",
                "seo_url": "/Polska/Regiony/Wielkopolskie/karambol-na-a2-poznan",
                "seo_title": "Utrudnienia na autostradzie A2 w okolicach Poznania po zderzeniu ciężarówek",
                "summary_lead": "Służby zablokowały pas ruchu na A2 pod Poznaniem.",
                "published_iso": "2026-11-14T12:00:00+01:00",
                "display_date": "14.11.2026, 12:00",
            },
            {
                "id": 4,
                "path": "/Polska/Regiony/Malopolskie",
                "seo_url": "/Polska/Regiony/Malopolskie/utrudnienia-a4-krakow",
                "seo_title": "Utrudnienia na autostradzie A4 w okolicach Krakowa po zderzeniu ciężarówek",
                "summary_lead": "Korki na obwodnicy A4 w Krakowie.",
                "published_iso": "2026-11-14T14:00:00+01:00",
                "display_date": "14.11.2026, 14:00",
            },
            # Różne dyscypliny w /Sport nie mogą się skleić
            {
                "id": 5,
                "path": "/Sport",
                "seo_url": "/Sport/polska-tenis-wta-swiatek-awans",
                "seo_title": "Awans Polki do półfinału turnieju WTA w tenisie",
                "summary_lead": "Tenisistka wygrała mecz ćwierćfinałowy WTA.",
                "published_iso": "2026-11-14T16:00:00+01:00",
                "display_date": "14.11.2026, 16:00",
            },
            {
                "id": 6,
                "path": "/Sport",
                "seo_url": "/Sport/polska-ekstraklasa-pilka-awans",
                "seo_title": "Awans klubu w tabeli Ekstraklasy w piłce nożnej",
                "summary_lead": "Piłkarska drużyna awansowała po wygranym meczu.",
                "published_iso": "2026-11-14T18:00:00+01:00",
                "display_date": "14.11.2026, 18:00",
            },
        ]
        clusters = ai_synthesizer.assign_dossier_timelines(items)
        self.assertEqual(clusters, 1)
        self.assertEqual(items[0]["dossier_count"], 2)
        self.assertEqual(items[0]["dossier_index"], 1)
        self.assertEqual(items[1]["dossier_index"], 2)
        self.assertEqual([x["id"] for x in items[0]["dossier_items"]], [1, 2])
        self.assertNotIn("dossier_items", items[2])
        self.assertNotIn("dossier_items", items[3])
        self.assertNotIn("dossier_items", items[4])
        self.assertNotIn("dossier_items", items[5])

    def test_og_card_png_fallback_ssr_faq_impact_dossier_and_indexnow(self):
        import io
        import shutil
        import struct
        import tempfile
        from unittest import mock

        with tempfile.TemporaryDirectory() as tmpdir:
            # CNAME -> własna domena
            with open(os.path.join(tmpdir, "CNAME"), "w", encoding="utf-8") as f:
                f.write("verity.pl\n")
            self.assertEqual(seo_builder.detect_site_base_url(tmpdir), "https://verity.pl")

            # Stary plik w og/, który powinien zostać usunięty przy przebudowie
            og_dir = os.path.join(tmpdir, "og")
            os.makedirs(og_dir, exist_ok=True)
            stale_og = os.path.join(og_dir, "999999.png")
            with open(stale_og, "wb") as f:
                f.write(b"stale")

            # Test zarówno ścieżki Pillow jak i czystego fallbacku PNG 1200x630
            fb_png = os.path.join(tmpdir, "fallback_og_test.png")
            seo_builder._write_fallback_og_png(fb_png, 1200, 630, (42, 118, 210))
            with open(fb_png, "rb") as f:
                raw_fb = f.read()
            self.assertEqual(raw_fb[:8], b"\x89PNG\r\n\x1a\n")
            self.assertEqual(struct.unpack(">II", raw_fb[16:24]), (1200, 630))

            for fname in ("styles.css", "app.js"):
                shutil.copyfile(os.path.join(ROOT_DIR, fname), os.path.join(tmpdir, fname))

            from datetime import datetime, timedelta, timezone
            _now_t = datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=1)))
            _ts_1 = (_now_t - timedelta(hours=6)).replace(microsecond=0).isoformat()
            _ts_2 = (_now_t - timedelta(hours=2)).replace(microsecond=0).isoformat()
            sample_arts = [
                {
                    "id": 8101,
                    "path": "/Polska/Energetyka",
                    "seo_url": "/Polska/Energetyka/test-taryfa-gazu-etap-1",
                    "seo_title": "URE analizuje taryfy gazu na 2027 r.",
                    "summary_lead": "Prezes URE rozpoczął analizę wniosków taryfowych dla odbiorców indywidualnych.",
                    "published_iso": _ts_1,
                    "updated_iso": _ts_1,
                    "display_date": (_now_t - timedelta(hours=6)).strftime("%d.%m.%Y, %H:%M"),
                    "status": "AUTO_PUBLISHED",
                    "sources": ["PAP", "WNP.pl"],
                    "fact_agreement_pct": 89,
                    "thumbnail_url": "",
                    "impact": {
                        "audience": "Gospodarstwa domowe i konsumenci",
                        "scope": "Energia i rachunki",
                        "status": "Potwierdzone (2 źródła)",
                    },
                    "seo_faq": [
                        {"q": "Kogo dotyczą analizowane taryfy gazu?", "a": "Wnioski obejmują gospodarstwa domowe korzystające z taryf regulowanych przez URE."},
                        {"q": "Ile redakcji potwierdziło informację?", "a": "Ustalenia potwierdziły 2 redakcje: PAP oraz WNP.pl."},
                    ],
                    "full_sections": [
                        {"heading": "Ustalenia", "paragraphs": ["Urząd Regulacji Energetyki analizuje wnioski taryfowe spółek obrotu. [Źródło: PAP, WNP.pl]"]}
                    ],
                    "perspectives": [
                        {"outlet": "PAP", "angle": "Komunikat", "summary": "Wnioski w URE", "focus": "Eksponuje tryb analizy URE.", "omits": "Pomija prognozy rynkowe.", "url": "https://pap.pl/ure-1"},
                        {"outlet": "WNP.pl", "angle": "Rynek", "summary": "Taryfy 2027", "focus": "Eksponuje koszty zakupu.", "omits": "Pomija harmonogram decyzji.", "url": "https://wnp.pl/ure-2"},
                    ],
                },
                {
                    "id": 8102,
                    "path": "/Polska/Energetyka",
                    "seo_url": "/Polska/Energetyka/test-taryfa-gazu-etap-2",
                    "seo_title": "URE zatwierdziło nową taryfę gazu dla odbiorców",
                    "summary_lead": "Nowa taryfa gazu obowiązuje odbiorców indywidualnych po decyzji URE.",
                    "published_iso": _ts_2,
                    "updated_iso": _ts_2,
                    "display_date": (_now_t - timedelta(hours=2)).strftime("%d.%m.%Y, %H:%M"),
                    "status": "AUTO_PUBLISHED",
                    "sources": ["PAP", "Bankier.pl"],
                    "fact_agreement_pct": 92,
                    "thumbnail_url": "https://example.pl/zdjecie-ure.jpg",
                    "impact": {
                        "audience": "Gospodarstwa domowe i konsumenci",
                        "scope": "Energia i rachunki",
                        "status": "Wchodzi w życie / Obowiązuje",
                    },
                    "seo_faq": [
                        {"q": "Co zmieniła decyzja URE?", "a": "Urząd zatwierdził taryfę regulowaną dla gospodarstw domowych."},
                        {"q": "Skąd pochodzą dane?", "a": "Informację potwierdziły PAP i Bankier.pl."},
                    ],
                    "full_sections": [
                        {"heading": "Decyzja", "paragraphs": ["Prezes URE wydał decyzję taryfową na kolejny okres. [Źródło: PAP, Bankier.pl]"]}
                    ],
                    "perspectives": [
                        {"outlet": "PAP", "angle": "Decyzja", "summary": "Taryfa URE", "url": "https://pap.pl/ure-ok"},
                        {"outlet": "Bankier.pl", "angle": "Koszty", "summary": "Rachunki", "url": "https://bankier.pl/ure-ok"},
                    ],
                },
            ]
            # Połącz oba artykuły w Akta Sprawy
            dossier_items = [
                {
                    "id": a["id"],
                    "seo_url": a["seo_url"],
                    "seo_title": a["seo_title"],
                    "display_date": a["display_date"],
                    "published_iso": a["published_iso"],
                }
                for a in sample_arts
            ]
            for idx, a in enumerate(sample_arts, start=1):
                a["dossier_title"] = "Taryfa · Gazu · URE"
                a["dossier_count"] = 2
                a["dossier_index"] = idx
                a["dossier_items"] = dossier_items

            seo_builder.build_all_seo_artifacts(tmpdir, sample_arts, site_base_url="https://verity.pl")

            # Stary plik usunięty, karta 8101 wygenerowana 1200x630, dla 8102 (z thumbnail_url) nie tworzona
            self.assertFalse(os.path.exists(stale_og))
            og_8101 = os.path.join(og_dir, "8101.png")
            self.assertTrue(os.path.isfile(og_8101))
            self.assertFalse(os.path.exists(os.path.join(og_dir, "8102.png")))
            with open(og_8101, "rb") as f:
                hdr = f.read(24)
            self.assertEqual(hdr[:8], b"\x89PNG\r\n\x1a\n")
            self.assertEqual(struct.unpack(">II", hdr[16:24]), (1200, 630))

            # Sprawdzenie SSR HTML artykułu bez miniatury
            art_html_path = os.path.join(tmpdir, "Polska", "Energetyka", "test-taryfa-gazu-etap-1", "index.html")
            with open(art_html_path, "r", encoding="utf-8") as f:
                art_html = f.read()
            self.assertIn('property="og:image" content="https://verity.pl/og/8101.png"', art_html)
            self.assertIn('property="og:image:width" content="1200"', art_html)
            self.assertIn('property="og:image:height" content="630"', art_html)
            self.assertIn('name="twitter:image" content="https://verity.pl/og/8101.png"', art_html)
            self.assertIn('"@type": "FAQPage"', art_html)
            self.assertIn('class="impact-strip"', art_html)
            self.assertIn('class="dossier-banner"', art_html)
            self.assertIn('id="timeline" class="dossier-timeline"', art_html)
            self.assertIn('class="faq-box"', art_html)

            # Mapa witryny zawiera kartę OG i obraz
            with open(os.path.join(tmpdir, "sitemap.xml"), "r", encoding="utf-8") as f:
                sm_txt = f.read()
            with open(os.path.join(tmpdir, "news-sitemap.xml"), "r", encoding="utf-8") as f:
                nsm_txt = f.read()
            self.assertIn("<image:loc>https://verity.pl/og/8101.png</image:loc>", sm_txt)
            self.assertIn("<image:loc>https://verity.pl/og/8101.png</image:loc>", nsm_txt)

            # Plik klucza IndexNow + test submit_indexnow_urls z mockiem HTTP
            inow_key = seo_builder.get_indexnow_key()
            key_file = os.path.join(tmpdir, f"{inow_key}.txt")
            self.assertTrue(os.path.isfile(key_file))
            with open(key_file, "r", encoding="utf-8") as f:
                self.assertEqual(f.read().strip(), inow_key)

            captured_req = {}

            class _FakeInowResp(io.BytesIO):
                status = 200
                def __enter__(self):
                    return self
                def __exit__(self, *args):
                    return False

            def _fake_urlopen(req, timeout=10):
                captured_req["url"] = req.full_url
                captured_req["body"] = json.loads(req.data.decode("utf-8"))
                return _FakeInowResp(b"ok")

            with mock.patch("seo_builder.urllib.request.urlopen", side_effect=_fake_urlopen):
                ok_inow, msg_inow = seo_builder.submit_indexnow_urls(tmpdir, articles=sample_arts)
            self.assertTrue(ok_inow, msg_inow)
            self.assertEqual(captured_req["body"]["host"], "verity.pl")
            self.assertEqual(captured_req["body"]["keyLocation"], f"https://verity.pl/{inow_key}.txt")
            self.assertIn("https://verity.pl/Polska/Energetyka/test-taryfa-gazu-etap-1/", captured_req["body"]["urlList"])


class TestStage10CommunityChatWeightsAndModeration(unittest.TestCase):
    def test_silent_vote_weight_and_anti_discord_filters(self):
        import community_db as cdb
        from datetime import datetime, timedelta, timezone

        now = datetime(2026, 11, 16, 12, 0, 0, tzinfo=timezone.utc)
        w_trusted = cdb.calculate_silent_vote_weight(
            account_created_iso=(now - timedelta(days=500)).isoformat(),
            is_trusted=True,
            read_seconds=60,
            cluster_voters_count=1,
            from_external_referrer=False,
            now_dt=now,
        )
        w_new_brigade = cdb.calculate_silent_vote_weight(
            account_created_iso=(now - timedelta(days=1)).isoformat(),
            is_trusted=False,
            read_seconds=4,
            cluster_voters_count=25,
            from_external_referrer=True,
            now_dt=now,
        )
        self.assertEqual(w_trusted, 3.0)
        self.assertLess(w_new_brigade, 0.1)
        self.assertGreater(w_trusted, w_new_brigade * 20)

    def test_community_db_chat_posts_comments_votes_and_tariff(self):
        import tempfile
        import community_db as cdb

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = cdb.init_db(tmpdir, seed_demo=False)

            # 1. Gość na czacie live: blokada linków + slow-mode
            with self.assertRaises(ValueError):
                cdb.send_chat_message(
                    tmpdir,
                    room="/Polska",
                    text="Wejdź na https://tania-reklama.pl",
                    user=None,
                    guest_key="g_test1",
                    guest_cooldown_sec=60,
                    db_path=db_path,
                )

            msg1 = cdb.send_chat_message(
                tmpdir,
                room="/Polska",
                text="Dzień dobry na czacie lokalnym!",
                user=None,
                guest_key="g_test1",
                guest_cooldown_sec=60,
                db_path=db_path,
            )
            self.assertEqual(msg1["author_kind"], "guest")
            with self.assertRaises(PermissionError):
                cdb.send_chat_message(
                    tmpdir,
                    room="/Polska",
                    text="Druga wiadomość za szybko",
                    user=None,
                    guest_key="g_test1",
                    guest_cooldown_sec=60,
                    db_path=db_path,
                )

            # 2. Gość nie może pisać w 2. kolumnie ani komentować artykułu
            with self.assertRaises(PermissionError):
                cdb.create_community_post(tmpdir, None, "/Polska", "Własna analiza", "Próba wpisu jako gość", db_path=db_path)
            with self.assertRaises(PermissionError):
                cdb.create_comment(tmpdir, None, 101, "Komentarz gościa", db_path=db_path)

            # 3. Konto 1-klik odblokowuje linki na czacie, 2. kolumnę, komentarze bez +/- i głosy
            auth = cdb.login_or_register(tmpdir, "@Jan_Weteran", demo_age_days=400, db_path=db_path)
            u_vet = auth["user"]
            msg_link = cdb.send_chat_message(
                tmpdir,
                room="/Polska",
                text="Źródło NBP: https://nbp.pl/statystyka",
                user=u_vet,
                user_cooldown_sec=0,
                db_path=db_path,
            )
            self.assertEqual(msg_link["author_kind"], "user")

            post = cdb.create_community_post(
                tmpdir,
                u_vet,
                "/Polska/Wielkopolskie",
                "Relacja na żywo",
                "Korek na moście Królowej Jadwigi w Poznaniu już rozładowany.",
                db_path=db_path,
            )
            self.assertEqual(post["path"], "/Polska/Wielkopolskie")
            posts_pl = cdb.list_community_posts(tmpdir, "/Polska", db_path=db_path)
            self.assertEqual(len(posts_pl), 1)

            c1 = cdb.create_comment(tmpdir, u_vet, 101, "Pierwszy argument merytoryczny w dyskusji.", db_path=db_path)
            c2 = cdb.create_comment(tmpdir, u_vet, 101, "Uzupełnienie z cytowaniem #1.", reply_to_id=c1["id"], db_path=db_path)
            clist = cdb.list_comments(tmpdir, 101, db_path=db_path)
            self.assertEqual([c["seq_num"] for c in clist], [1, 2])
            self.assertEqual(clist[1]["reply_to_seq"], 1)
            self.assertNotIn("upvotes", clist[0])
            self.assertNotIn("downvotes", clist[0])

            vs = cdb.toggle_article_vote(tmpdir, u_vet, 101, read_seconds=45, from_external_referrer=False, db_path=db_path)
            self.assertTrue(vs["user_voted"])
            self.assertGreaterEqual(vs["display_score"], 2)
            self.assertNotIn("raw_weight", vs)

            # 4. Taryfikator §1.1–§2.3: ODRZUCONO (0 pkt) vs MUTE (6 pkt) vs BAN (10 pkt)
            rej = cdb.apply_moderation_decision(
                tmpdir,
                account_handle="@Jan_Weteran",
                tariff_code="§2.1",
                content_excerpt="Krytyka projektu ustawy budżetowej.",
                outcome="REJECTED",
                db_path=db_path,
            )
            self.assertEqual(rej["points_delta"], 0)
            self.assertEqual(cdb.get_user_by_token(tmpdir, auth["token"], db_path=db_path)["status"], "ACTIVE")

            cdb.apply_moderation_decision(
                tmpdir,
                account_handle="@TrollTest",
                tariff_code="§1.3",
                content_excerpt="Link phishingowy",
                outcome="PUNISHED",
                db_path=db_path,
            )
            troll_auth = cdb.login_or_register(tmpdir, "@TrollTest", db_path=db_path)
            self.assertEqual(troll_auth["user"]["status"], "MUTED")
            with self.assertRaises(PermissionError):
                cdb.create_comment(tmpdir, troll_auth["user"], 101, "Próba komentarza podczas wyciszenia", db_path=db_path)

            cdb.apply_moderation_decision(
                tmpdir,
                account_handle="@TrollTest",
                tariff_code="§1.2",
                content_excerpt="Rajd multikont",
                outcome="PUNISHED",
                db_path=db_path,
            )
            with self.assertRaises(PermissionError):
                cdb.login_or_register(tmpdir, "@TrollTest", db_path=db_path)

    def test_server_community_endpoints_and_sse_stream(self):
        import shutil
        import tempfile
        import threading
        import urllib.error
        import urllib.request
        import server as verity_server

        with tempfile.TemporaryDirectory() as tmpdir:
            for fname in ("styles.css", "app.js", "community.js"):
                shutil.copyfile(os.path.join(ROOT_DIR, fname), os.path.join(tmpdir, fname))
            sample = [{
                "id": 9101,
                "path": "/Polska/Gospodarka",
                "seo_url": "/Polska/Gospodarka/test-komentarze-moderacja",
                "seo_title": "Testowa informacja gospodarcza do dyskusji",
                "summary_lead": "Krótki opis danych makroekonomicznych za ostatni kwartał.",
                "published_iso": "2026-11-16T10:00:00+01:00",
                "updated_iso": "2026-11-16T10:00:00+01:00",
                "display_date": "16.11.2026, 10:00",
                "status": "AUTO_PUBLISHED",
                "sources": ["PAP", "Bankier.pl"],
                "fact_agreement_pct": 90,
                "full_sections": [{"heading": "Dane", "paragraphs": ["Odczyt potwierdzony przez dwie redakcje. [Źródło: PAP, Bankier.pl]"]}],
                "perspectives": [
                    {"outlet": "PAP", "angle": "Depesza", "summary": "Raport", "url": "https://pap.pl/9101"},
                    {"outlet": "Bankier.pl", "angle": "Finanse", "summary": "Analiza", "url": "https://bankier.pl/9101"},
                ],
            }]
            with open(os.path.join(tmpdir, "articles.json"), "w", encoding="utf-8") as f:
                json.dump(sample, f, ensure_ascii=False)
            seo_builder.build_all_seo_artifacts(tmpdir, sample, site_base_url="https://verity.pl")

            mod_page = os.path.join(tmpdir, "moderacja", "index.html")
            self.assertTrue(os.path.isfile(mod_page))
            with open(mod_page, "r", encoding="utf-8") as f:
                mod_html = f.read()
            self.assertIn("§1.1", mod_html)
            self.assertIn("§2.3", mod_html)
            self.assertIn("community.js", mod_html)

            os.environ["VERITY_QUIET_SERVER"] = "1"
            old_guest_cd = os.environ.get("VERITY_GUEST_CHAT_COOLDOWN")
            os.environ["VERITY_GUEST_CHAT_COOLDOWN"] = "0"
            old_tok = os.environ.pop("VERITY_ADMIN_TOKEN", None)

            srv = verity_server.create_server(directory=tmpdir, host="127.0.0.1", port=0, rebuild_seo_on_write=False)
            t = threading.Thread(target=srv.serve_forever, daemon=True)
            t.start()
            port = srv.server_address[1]
            base = f"http://127.0.0.1:{port}"

            def req_json(path, method="GET", body=None, headers=None):
                hdrs = dict(headers or {})
                data_bytes = None
                if body is not None:
                    data_bytes = json.dumps(body).encode("utf-8")
                    hdrs["Content-Type"] = "application/json"
                r = urllib.request.Request(base + path, data=data_bytes, method=method, headers=hdrs)
                try:
                    with urllib.request.urlopen(r, timeout=5) as resp:
                        return resp.status, json.loads(resp.read().decode("utf-8"))
                except urllib.error.HTTPError as he:
                    return he.code, json.loads(he.read().decode("utf-8"))

            try:
                # 1. Blokada linku gościa przez HTTP 400
                st_link, d_link = req_json("/api/chat/send", method="POST", body={"room": "Globalny", "text": "Sprawdź https://spam.pl"})
                self.assertEqual(st_link, 400)
                self.assertFalse(d_link["ok"])

                # 2. Podłączenie strumienia SSE (od najnowszego id) i wysłanie wiadomości w tle
                _, init_chat = req_json("/api/chat/messages?room=Globalny")
                after_id = max((m["id"] for m in init_chat.get("messages", [])), default=0)
                sse_lines = []
                sse_ready = threading.Event()

                def _read_sse():
                    req_s = urllib.request.Request(f"{base}/api/chat/stream?room=Globalny&after_id={after_id}")
                    with urllib.request.urlopen(req_s, timeout=5) as resp:
                        while len(sse_lines) < 20:
                            line = resp.readline().decode("utf-8", errors="ignore")
                            if not line:
                                break
                            sse_lines.append(line.strip())
                            if line.startswith(": connected"):
                                sse_ready.set()
                            if line.startswith("data: ") and "Wiadomość SSE od gościa" in line:
                                break

                t_sse = threading.Thread(target=_read_sse, daemon=True)
                t_sse.start()
                self.assertTrue(sse_ready.wait(timeout=3.0))

                st_g, d_g = req_json("/api/chat/send", method="POST", body={"room": "Globalny", "text": "Wiadomość SSE od gościa"})
                self.assertEqual(st_g, 200)
                t_sse.join(timeout=3.0)
                joined_sse = "\n".join(sse_lines)
                self.assertIn("event: message", joined_sse)
                self.assertIn("Wiadomość SSE od gościa", joined_sse)

                # 3. 1-klik rejestracja, wpis 2. kolumny, głos ▲, komentarz, zgłoszenie i /api/moderation/log
                st_l, d_l = req_json("/api/auth/login", method="POST", body={"handle": "@TestServer", "demo_age_days": 120})
                self.assertEqual(st_l, 200)
                hdr = {"X-Session-Token": d_l["token"]}

                st_v, d_v = req_json("/api/votes", method="POST", body={"article_id": 9101, "read_seconds": 30}, headers=hdr)
                self.assertEqual(st_v, 200)
                self.assertTrue(d_v["vote_summary"]["user_voted"])
                self.assertGreaterEqual(d_v["vote_summary"]["display_score"], 1)

                st_c, d_c = req_json("/api/comments", method="POST", body={"article_id": 9101, "text": "Komentarz testowy REST"}, headers=hdr)
                self.assertEqual(st_c, 200)
                cid = d_c["comment"]["id"]

                st_rep, d_rep = req_json("/api/reports", method="POST", body={"target_type": "comment", "target_id": cid, "tariff_code": "§2.1"}, headers=hdr)
                self.assertEqual(st_rep, 200)

                st_pun, _ = req_json(
                    "/api/admin/moderation/punish",
                    method="POST",
                    body={
                        "report_id": d_rep["report"]["id"],
                        "account_handle": "@TestServer",
                        "content_excerpt": "Komentarz testowy REST",
                        "tariff_code": "§2.1",
                        "target_type": "comment",
                        "target_id": cid,
                        "outcome": "REJECTED",
                    },
                )
                self.assertEqual(st_pun, 200)
                st_mlog, d_mlog = req_json("/api/moderation/log")
                self.assertEqual(st_mlog, 200)
                self.assertTrue(any(row["account_handle"] == "@TestServer" and row["outcome"] == "REJECTED" for row in d_mlog["log"]))
            finally:
                srv.shutdown()
                srv.server_close()
                if old_tok is not None:
                    os.environ["VERITY_ADMIN_TOKEN"] = old_tok
                if old_guest_cd is None:
                    os.environ.pop("VERITY_GUEST_CHAT_COOLDOWN", None)
                else:
                    os.environ["VERITY_GUEST_CHAT_COOLDOWN"] = old_guest_cd

    def test_cameras_json_schema_ssr_nav_and_sitemap(self):
        cam_path = os.path.join(ROOT_DIR, "cameras.json")
        self.assertTrue(os.path.exists(cam_path), "Brak pliku cameras.json")
        cams = seo_builder._load_cameras(ROOT_DIR)
        self.assertGreaterEqual(len(cams), 16)
        pl_cams = [c for c in cams if c["scope"] == "polska"]
        world_cams = [c for c in cams if c["scope"] == "swiat"]
        self.assertGreaterEqual(len(pl_cams), 10)
        self.assertGreaterEqual(len(world_cams), 6)

        valid_regions = {v[0] for v in seo_builder.VOIVODESHIPS}
        ids = [c["id"] for c in cams]
        self.assertEqual(len(ids), len(set(ids)), "Duplikaty id w cameras.json")
        for c in pl_cams:
            self.assertIn(c["region"], valid_regions)

        ssr_html = seo_builder._render_cameras_ssr("../", cams)
        self.assertIn("Kamery na żywo", ssr_html)
        self.assertNotIn("<iframe", ssr_html.lower(), "SSR nie może zawierać osadzeń iframe przed kliknięciem")
        self.assertIn("youtube-nocookie.com/embed/", ssr_html)

        nav_html = seo_builder._render_nav_html("../", "/kamery")
        self.assertIn('data-path="/kamery"', nav_html)
        self.assertIn('class="path-chip active" data-path="/kamery"', nav_html)

        # Escaping check
        evil = [{
            "id": "evil-test",
            "name": "<script>alert(1)</script>",
            "scope": "swiat",
            "region": None,
            "country": "US",
            "city": "NYC",
            "category": "miasto",
            "type": "youtube_video",
            "youtube_video_id": "mwQ7mAEt3Iw",
            "source_name": "EarthCam",
            "source_url": "https://example.com",
        }]
        evil_ssr = seo_builder._render_cameras_ssr("../", evil)
        self.assertNotIn("<script>alert(1)</script>", evil_ssr)
        self.assertIn("&lt;script&gt;alert(1)&lt;/script&gt;", evil_ssr)

        sitemap_path = os.path.join(ROOT_DIR, "sitemap.xml")
        if os.path.exists(sitemap_path):
            with open(sitemap_path, "r", encoding="utf-8") as f:
                self.assertIn("/kamery/</loc>", f.read())


class TestLegalComplianceAndRegexGuards(unittest.TestCase):
    def test_external_thumbnails_disabled_by_default_and_purged(self):
        self.assertFalse(uln.ENABLE_THUMBNAILS)
        sample = {
            "id": 999001,
            "path": "/Polska/Regiony/Wielkopolskie",
            "seo_url": "/Polska/Regiony/Wielkopolskie/pozar-rckik-poznan",
            "seo_title": "Pożar w budynku RCKiK w Poznaniu. Interwencja straży",
            "summary_lead": "Strażacy interweniowali w piwnicy budynku przy ul. Marcelińskiej.",
            "thumbnail_url": "https://obca-redakcja.pl/wp-content/uploads/foto.jpg",
            "published_iso": "2026-11-26T02:00:00+01:00",
            "updated_iso": "2026-11-26T02:00:00+01:00",
            "display_date": "26.11.2026, 02:00",
            "status": "AUTO_PUBLISHED",
            "sources": ["ePoznan.pl", "Radio Poznań"],
            "perspectives": [
                {"outlet": "ePoznan.pl", "angle": "Relacja wiodąca", "summary": "Pożar w budynku RCKiK w Poznaniu. 10 zastępów straży", "url": "https://epoznan.pl/1"},
                {"outlet": "Radio Poznań", "angle": "Doniesienie regionalne", "summary": "Pożar w centrum krwiodawstwa w Poznaniu. Na miejscu straż", "url": "https://radiopoznan.fm/2"},
            ],
            "full_sections": [
                {"heading": "Ustalenia wspólne (2 redakcje)", "paragraphs": ["Strażacy potwierdzili pożar w piwnicy RCKiK w Poznaniu. [Źródło: ePoznan.pl, Radio Poznań]"]}
            ],
        }
        upgraded = uln._upgrade_existing_article(sample)
        self.assertIsNotNone(upgraded)
        self.assertEqual(upgraded.get("thumbnail_url"), "")

    def test_num_unit_regex_does_not_truncate_zastepow_to_za(self):
        figs = ai_synthesizer._extract_concrete_figures(
            "Na miejsce wysłano 10 zastępów straży, 14 zastępów OSP i 250 posłów głosowało za."
        )
        self.assertIn("10 zastępów", figs)
        self.assertIn("14 zastępów", figs)
        self.assertNotIn("10 za", figs)
        self.assertNotIn("14 za", figs)

    def test_articles_json_has_no_external_thumbnails(self):
        arts_path = os.path.join(ROOT_DIR, "articles.json")
        if os.path.exists(arts_path):
            with open(arts_path, "r", encoding="utf-8") as f:
                arts = json.load(f)
            external = [a.get("thumbnail_url") for a in arts if (a.get("thumbnail_url") or "").strip()]
            self.assertEqual(external, [], f"Znaleziono zewnętrzne miniatury w articles.json: {external[:3]}")

    def test_market_config_loader_and_pl_no_profiles(self):
        pl_cfg = uln.load_market_config("pl")
        no_cfg = uln.load_market_config("no")
        self.assertEqual(pl_cfg["market"], "pl")
        self.assertEqual(pl_cfg["quote_max_chars_per_outlet"], 300)
        self.assertEqual(no_cfg["market"], "no")
        self.assertEqual(no_cfg["currency"], "NOK")

    def test_art13_suspect_name_anonymization(self):
        self.assertEqual(
            uln.anonymize_suspect_names("Policja zatrzymała podejrzany Jan Kowalski w sprawie oszustwa."),
            "Policja zatrzymała podejrzany Jan K. w sprawie oszustwa.",
        )
        self.assertEqual(
            uln.anonymize_suspect_names("Prokuratura przesłuchała oskarżony Adam Nowak."),
            "Prokuratura przesłuchała oskarżony Adam N.",
        )
        # Nazwy instytucji / miejsc nie mogą zostać skrócone
        self.assertEqual(
            uln.anonymize_suspect_names("Komunikat zatrzymany Policji Warszawie."),
            "Komunikat zatrzymany Policji Warszawie.",
        )

    def test_first_person_outlet_not_attributed_to_multiple_outlets(self):
        group = [
            {
                "outlet": "ePoznan.pl",
                "title": "Pożar w budynku RCKiK w Poznaniu",
                "description": "O zdarzeniu informuje nas Czytelnik z Poznania. Strażacy potwierdzili pożar w piwnicy budynku przy ul. Marcelińskiej.",
                "link": "https://epoznan.pl/1",
                "path": "/Polska/Regiony/Wielkopolskie",
            },
            {
                "outlet": "Radio Poznań",
                "title": "Pożar w centrum krwiodawstwa w Poznaniu",
                "description": "Czytelnik z Poznania zgłosił pożar w budynku przy ul. Marcelińskiej. Na miejscu pracują strażacy.",
                "link": "https://radiopoznan.fm/2",
                "path": "/Polska/Regiony/Wielkopolskie",
            },
        ]
        secs, _ = uln.synthesize_article_sections(group, group[0]["title"])
        for sec in secs:
            for p in sec.get("paragraphs") or []:
                if "informuje nas" in p.lower():
                    self.assertNotIn("Radio Poznań", p)

    def test_numeric_discrepancies_detection(self):
        art = {
            "seo_title": "Pożar w budynku w Poznaniu",
            "perspectives": [
                {"outlet": "ePoznan.pl", "summary": "Pożar w Poznaniu. Na miejscu 10 zastępów straży.", "url": "https://epoznan.pl/1"},
                {"outlet": "Radio Poznań", "summary": "Pożar w Poznaniu. Interweniuje 12 zastępów straży.", "url": "https://radiopoznan.fm/2"},
            ],
        }
        cands = [
            {"outlet": "ePoznan.pl", "title": "Pożar w Poznaniu. Na miejscu 10 zastępów straży.", "description": "W akcji bierze udział 10 zastępów."},
            {"outlet": "Radio Poznań", "title": "Pożar w Poznaniu. Interweniuje 12 zastępów straży.", "description": "Straż wysłała 12 zastępów."},
        ]
        discs = ai_synthesizer.detect_numeric_discrepancies(art, candidates=cands)
        self.assertEqual(len(discs), 1)
        self.assertEqual(discs[0]["unit"], "zastępów")
        self.assertIn("10 zastępów", discs[0]["summary"])
        self.assertIn("12 zastępów", discs[0]["summary"])

    def test_markets_ssr_ticker_and_legal_pages_built(self):
        mkt = seo_builder._load_market_data(ROOT_DIR)
        if mkt.get("currencies", {}).get("items"):
            ticker = seo_builder._render_market_ticker_html("./", mkt)
            self.assertIn("EUR/PLN", ticker)
            self.assertIn("NOK/PLN", ticker)
            self.assertIn("/rynki", ticker)
            mkt_ssr = seo_builder._render_markets_ssr("../", mkt)
            self.assertIn("Notowania rynkowe, waluty i pogoda", mkt_ssr)
            self.assertIn("Oslo", mkt_ssr)
        for slug in ("rynki", "metodologia", "o-nas", "polityka-prywatnosci", "zglos-blad"):
            page_path = os.path.join(ROOT_DIR, slug, "index.html")
            if os.path.exists(page_path):
                with open(page_path, "r", encoding="utf-8") as f:
                    content = f.read()
                self.assertIn("VERITY", content)


if __name__ == "__main__":
    unittest.main()




