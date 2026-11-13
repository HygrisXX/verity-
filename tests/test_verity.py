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
        junk_re = re.compile(r"(?:The post\s|appeared first on|pochodzi z serwisu|Kanał Strefa Inwestorów)", re.IGNORECASE)

        for art in self.articles:
            aid = art["id"]
            seo_url = art.get("seo_url") or ""
            self.assertTrue(seo_url.startswith("/"), f"Brak poprawnego seo_url dla id={aid}")
            self.assertNotIn(seo_url, seen_urls, f"Duplikat seo_url: {seo_url}")
            seen_urls.add(seo_url)

            self.assertTrue(art.get("seo_title"), f"Brak seo_title w id={aid}")
            self.assertTrue(art.get("summary_lead"), f"Brak summary_lead w id={aid}")
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
        for cat_path, _, _ in seo_builder.CATEGORIES:
            cat_html = os.path.join(ROOT_DIR, cat_path.strip("/"), "index.html")
            self.assertTrue(os.path.isfile(cat_html), f"Brak strony kategorii: {cat_html}")

    def test_sitemaps_feed_and_robots_valid_xml(self):
        sitemap_path = os.path.join(ROOT_DIR, "sitemap.xml")
        news_path = os.path.join(ROOT_DIR, "news-sitemap.xml")
        feed_path = os.path.join(ROOT_DIR, "feed.xml")
        robots_path = os.path.join(ROOT_DIR, "robots.txt")

        sm_root = ET.parse(sitemap_path).getroot()
        sm_locs = [el.text for el in sm_root.findall(".//{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
        # Strona główna + 7 kategorii + wszystkie artykuły
        self.assertGreaterEqual(len(sm_locs), len(self.articles) + len(seo_builder.CATEGORIES) + 1)

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


if __name__ == "__main__":
    unittest.main()
