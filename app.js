/* ==========================================================================
   VERITY – Silnik Portalu (Vanilla JS)
   - Prawdziwe, bieżące artykuły z polskich źródeł (PAP, Rzeczpospolita, Radio Poznań, epoznan.pl)
   - Automatyczne wykrywanie motywu urządzenia (prefers-color-scheme)
   - Polski Stemmer Fleksyjny działający w tle wyszukiwarki
   - Pełne artykuły merytoryczne, Ramka „Kto jak to przedstawia” z bezpośrednimi linkami do źródeł
   ========================================================================== */

const suffixes = [
  'iejszymi','iejszych','iejszym','iejszej','iejsza','iejsze',
  'owskiego','owskiemu','owskich','owskimi','owskim','owskiej','owska','owski',
  'skiego','skiemu','skich','skimi','skim','skiej','ska','ski',
  'aniami','aniach','aniom','aniem','ania','aniu','anie',
  'eniami','eniach','eniom','eniem','enia','eniu','enie',
  'iami','iach','iemu','iego','imi','ich','iej',
  'ami','ach','owi','omu','emu','ego','iom','iem','om','ow',
  'ie','iu','em','a','u','y','i','e','o'
];

const stemMap = {
  wypadk: 'wypadek', podatc: 'podatk', podatek: 'podatk',
  styczn: 'styczen', pozn: 'poznan', listopad: 'listopad'
};

const synonymGroups = [
  ['podatk', 'pit', 'cit', 'ryczalt', 'danin', 'sejm', 'senat', 'budzet', 'ustaw'],
  ['gaz', 'prad', 'energi', 'tge', 'domansk', 'deficyt', 'rachunk'],
  ['poznan', 'wielkopolsk'],
  ['niepodleglosc', 'marsz', 'marcin'],
  ['handel', 'niedziel', 'sklep', 'zakaz']
];

const monthMap = {
  '01': 'styczeń stycznia styczniu styczen',
  '02': 'luty lutego lutym',
  '10': 'październik października październiku pazdziernik',
  '11': 'listopad listopada listopadzie'
};

function norm(s) {
  return (s || '').toLowerCase()
    .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e')
    .replace(/ł/g, 'l').replace(/ń/g, 'n').replace(/ó/g, 'o')
    .replace(/ś/g, 's').replace(/ź/g, 'z').replace(/ż/g, 'z');
}

function polishStem(word) {
  let w = norm(word.trim());
  if (w.length <= 3) return w;
  for (const suf of suffixes) {
    if (w.endsWith(suf) && (w.length - suf.length) >= 3) {
      w = w.slice(0, -suf.length);
      break;
    }
  }
  return stemMap[w] || w;
}

function formatCitations(text, perspectives = []) {
  const urlByOutlet = {};
  (perspectives || []).forEach(p => {
    if (p && p.outlet && p.url) {
      const cleanName = p.outlet.trim();
      urlByOutlet[cleanName] = p.url;
      urlByOutlet[esc(cleanName)] = p.url;
    }
  });

  return text
    .replace(/\[Źródło:\s*([^\]]+)\]/g, (_, rawList) => {
      const outlets = rawList.split(',').map(s => s.trim()).filter(Boolean);
      const badges = outlets.map(name => {
        const href = urlByOutlet[name];
        if (href) {
          return `<a class="cite-tag cite-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer" title="Otwórz artykuł źródłowy w: ${name}">${name} ↗</a>`;
        }
        return `<span class="cite-tag">${name}</span>`;
      });
      return badges.join(' ');
    })
    .replace(/\[(\d+:[^\]]+)\]/g, '<span class="cite-tag">[$1]</span>');
}

// =========================================================================
// AUTOMATYCZNE WYKRYWANIE MOTYWU URZĄDZENIA + RĘCZNY PRZEŁĄCZNIK
// =========================================================================
let currentThemeMode = 'auto';
try { currentThemeMode = localStorage.getItem('verity_theme') || 'auto'; } catch (e) {}

function applyTheme(mode) {
  currentThemeMode = mode;
  try { localStorage.setItem('verity_theme', mode); } catch (e) {}
  const root = document.documentElement;

  if (mode === 'auto') {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    root.setAttribute('data-theme', mode);
  }

  ['auto', 'light', 'dark'].forEach(m => {
    const btn = document.getElementById('themeBtn_' + m);
    if (btn) {
      btn.classList.toggle('active', m === mode);
    }
  });
}

if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (currentThemeMode === 'auto') applyTheme('auto');
  });
}

// =========================================================================
// PRAWDZIWE ARTYKUŁY Z POLSKICH REDAKCJI (Z BEZPOŚREDNIMI LINKAMI ŹRÓDŁOWYMI)
// =========================================================================
let articles = [
  {
    "id": 1,
    "path": "/Polska/Gospodarka",
    "seo_url": "/Polska/Gospodarka/autopay-celem-cyberataku-chodzi-o-dane-dotyczace-platnosci",
    "seo_title": "Autopay celem cyberataku. Chodzi o dane dotyczące płatności",
    "thumbnail_url": "",
    "published_iso": "2026-11-13T17:46:33+01:00",
    "display_date": "13.11.2026, 17:46",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 86,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "2 redakcje"
      },
      {
        "label": "Kategoria",
        "val": "/Polska/Gospodarka"
      },
      {
        "label": "Główne źródło",
        "val": "Puls Biznesu"
      },
      {
        "label": "Weryfikacja",
        "val": "Potwierdzone (2 źródła)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Ustalenia wspólne (2 redakcje)",
        "paragraphs": [
          "Autopay poinformowało o cyberataku, do którego doszło 11 listopada. Nieuprawnione osoby uzyskały dostęp do infrastruktury spółki i części danych związanych z przetwarzanymi płatnościami. Firma nie wyklucza, że informacje mogły zostać skopiowane lub wykorzystane, dlatego ostrzega klientów i zaleca im sprawdzanie historii transakcji. [Źródło: Puls Biznesu]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Napisano, że wszystkie osoby, których to może dotyczyć, są informowane o tym bezpośrednio. [Źródło: Cashless.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Puls Biznesu",
        "angle": "Raport rynkowy",
        "summary": "Autopay celem cyberataku. Chodzi o dane dotyczące płatności",
        "url": "https://www.pb.pl/autopay-celem-cyberataku-chodzi-o-dane-dotyczace-platnosci-1270418"
      },
      {
        "outlet": "Cashless.pl",
        "angle": "Perspektywa rynkowa",
        "summary": "Firma Autopay podała, że była celem cyberataku",
        "url": "https://www.cashless.pl/19964-autopay-wyciek-danych"
      }
    ],
    "sources": [
      "Cashless.pl",
      "Puls Biznesu"
    ],
    "corrections": [],
    "summary_lead": "Autopay poinformowało o cyberataku, do którego doszło 11 listopada. Nieuprawnione osoby uzyskały dostęp do infrastruktury spółki i części danych związanych z przetwarzanymi płatnościami.",
    "meta_description": "Autopay poinformowało o cyberataku, do którego doszło 11 listopada. Nieuprawnione osoby uzyskały dostęp do infrastruktury spółki i części danych związanych z…",
    "keywords": "Gospodarka, Autopay, cyberataku, dane, płatności"
  },
  {
    "id": 2,
    "path": "/Polska",
    "seo_url": "/Polska/rosyjskie-zadania-ws-wystapienia-finlandii-z-nato-po-prostu-oburzajace",
    "seo_title": "Rosyjskie żądania ws. wystąpienia Finlandii z NATO. \"Po prostu oburzające\"",
    "thumbnail_url": "https://ipla.pluscdn.pl/dituel/cp/kk/kkgwe64iadork5obpp6x44eayzdp66in.jpg",
    "published_iso": "2026-11-13T17:46:33+01:00",
    "display_date": "13.11.2026, 17:46",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 88,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "2 redakcje"
      },
      {
        "label": "Kategoria",
        "val": "/Polska"
      },
      {
        "label": "Główne źródło",
        "val": "Polsat News"
      },
      {
        "label": "Weryfikacja",
        "val": "Potwierdzone (2 źródła)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Ustalenia wspólne (2 redakcje)",
        "paragraphs": [
          "Fiński minister obrony Antti Hakkanen stanowczo zareagował na doniesienia o żądaniach przedstawicieli Rosji podczas rozmów pokojowych w Abu Zabi, którzy mieli się domagać m.in. wystąpienia Finlandii z NATO. [Źródło: Polsat News, Dziennik.pl]",
          "— Takie sprawy w żadnym wypadku nie podlegają negocjacjom. [Źródło: Polsat News]",
          "Rosja o tym wie – stwierdził i nazwał postulaty Rosjan oburzającymi. [Źródło: Polsat News]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Polsat News",
        "angle": "Relacja wiodąca",
        "summary": "Rosyjskie żądania ws. wystąpienia Finlandii z NATO. \"Po prostu oburzające\"",
        "url": "https://www.polsatnews.pl/wiadomosc/2026-11-13/finlandia-reaguje-na-zadania-rosji-po-prostu-oburzajace/"
      },
      {
        "outlet": "Dziennik.pl",
        "angle": "Relacja uzupełniająca",
        "summary": "Rosja przedstawiła żądania w sprawie NATO. \"To jest po prostu oburzające\"",
        "url": "https://wiadomosci.dziennik.pl/swiat/artykuly/11344321,rosja-przedstawila-zadania-w-sprawie-nato-to-jest-po-prostu-oburzaja.html"
      }
    ],
    "sources": [
      "Dziennik.pl",
      "Polsat News"
    ],
    "corrections": [],
    "summary_lead": "Fiński minister obrony Antti Hakkanen stanowczo zareagował na doniesienia o żądaniach przedstawicieli Rosji podczas rozmów pokojowych w Abu Zabi, którzy mieli się domagać m.in. wystąpienia Finlandii z NATO.",
    "meta_description": "Fiński minister obrony Antti Hakkanen stanowczo zareagował na doniesienia o żądaniach przedstawicieli Rosji podczas rozmów pokojowych w Abu Zabi, którzy…",
    "keywords": "Polska, Rosyjskie, żądania, Finlandii, NATO"
  },
  {
    "id": 3,
    "path": "/Polska/Gospodarka",
    "seo_url": "/Polska/Gospodarka/miliardy-euro-oszczednosci-dla-przemyslu-ue-zwieksza-pule-uprawnien-ets",
    "seo_title": "Miliardy euro oszczędności dla przemysłu. UE zwiększa pulę uprawnień ETS",
    "thumbnail_url": "https://rmf.rmffm.pl/news/attachments/3e/d8/zdjecie-ilustracyjne-636x421-3ed8a736.jpg",
    "published_iso": "2026-11-13T17:46:33+01:00",
    "display_date": "13.11.2026, 17:46",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 86,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "2 redakcje"
      },
      {
        "label": "Kategoria",
        "val": "/Polska/Gospodarka"
      },
      {
        "label": "Główne źródło",
        "val": "RMF24"
      },
      {
        "label": "Weryfikacja",
        "val": "Potwierdzone (2 źródła)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Ustalenia wspólne (2 redakcje)",
        "paragraphs": [
          "Europejski przemysł otrzyma dodatkowe uprawnienia do emisji dwutlenku węgla. Oznacza to, że nie zostanie obciążony 10 mld euro. [Źródło: Business Insider PL]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Negocjatorzy Unii Europejskiej wypracowali kompromis dotyczący rozszerzenia systemu ETS, który oszczędzi branże: chemiczną, papierniczą, spożywczą, ceramiczną oraz szklarską. Ta decyzja może wpłynąć na spadek notowań praw do emisji. [Źródło: Business Insider PL]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "RMF24",
        "angle": "Relacja wiodąca",
        "summary": "Miliardy euro oszczędności dla przemysłu. UE zwiększa pulę uprawnień ETS",
        "url": "https://www.rmf24.pl/fakty/ekonomia/news-miliardy-euro-oszczednosci-dla-przemyslu-ue-zwieksza-pule-up,nIdn,1026042"
      },
      {
        "outlet": "Business Insider PL",
        "angle": "Perspektywa rynkowa",
        "summary": "Przemysł odetchnął z ulgą. Unia zwiększa pulę uprawnień ETS",
        "url": "https://businessinsider.com.pl/gospodarka/przemysl-odetchnal-z-ulga-unia-zgodzila-sie-na-zlagodzenie-swoich-planow/ye6q01d"
      }
    ],
    "sources": [
      "Business Insider PL",
      "RMF24"
    ],
    "corrections": [],
    "summary_lead": "Europejski przemysł otrzyma dodatkowe uprawnienia do emisji dwutlenku węgla. Oznacza to, że nie zostanie obciążony 10 mld euro.",
    "meta_description": "Europejski przemysł otrzyma dodatkowe uprawnienia do emisji dwutlenku węgla. Oznacza to, że nie zostanie obciążony 10 mld euro.",
    "keywords": "Gospodarka, Miliardy, euro, oszczędności, przemysłu, zwiększa, pulę"
  },
  {
    "id": 4,
    "path": "/Polska/Polityka",
    "seo_url": "/Polska/Polityka/nielegalne-tresci-mialy-znikac-z-internetu-szybciej-nawrocki-zawetowal",
    "seo_title": "Nielegalne treści miały znikać z internetu szybciej. Nawrocki zawetował przepisy",
    "thumbnail_url": "https://i.gremicdn.pl/image/free/536a0c4bebac2fcbe889c8b8e9f567df/?t=crop:1914:837:nowe:0:35.40926201399,resize:fill:600:300,enlarge:1",
    "published_iso": "2026-11-13T16:48:28+01:00",
    "display_date": "13.11.2026, 16:48",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 94,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "6 redakcji"
      },
      {
        "label": "Kategoria",
        "val": "/Polska/Polityka"
      },
      {
        "label": "Główne źródło",
        "val": "Rzeczpospolita"
      },
      {
        "label": "Weryfikacja",
        "val": "Potwierdzone (6 źródeł)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Ustalenia wspólne (6 redakcji)",
        "paragraphs": [
          "Prezydent zawetował ustawę wdrażającą Akt o usługach cyfrowych (DSA), która miała pozwolić na blokowanie nielegalnych treści w internecie. [Źródło: Rzeczpospolita, Radio Kraków]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Celem zmian było wprowadzenie procedury, dzięki której możliwe byłoby szybkie wydawanie nakazów ograniczających dostęp do treści naruszających prawo w internecie, przy jednoczesnym poszanowaniu praw użytkowników sieci. [Źródło: Dziennik.pl]",
          "W mocnych słowach przekazał swoją opinię na temat napisanego przez rząd prawa. Wykorzystano tragedię, zastosowano szantaż emocjonalny, by przepchnąć przepisy, które dają rządowi w zasadzie arbitralną kontrolę – mówił prezydent. [Źródło: WP Wiadomości]",
          "Prezydent uzasadnia swoją decyzję odmową ulegania szantażom rządzących. [Źródło: Business Insider PL]",
          "Prezydent ostrzegł przed cenzurą i arbitralnymi decyzjami administracji. Jednocześnie podpisał sześć innych ustaw, w tym dotyczącą wychowania patriotycznego. „Wróciło widmo urzędnika cenzora” [Źródło: Kresy.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Rzeczpospolita",
        "angle": "Relacja wiodąca",
        "summary": "Nielegalne treści miały znikać z internetu szybciej. Nawrocki zawetował przepisy",
        "url": "https://www.rp.pl/kraj/art45486421-nielegalne-tresci-mialy-znikac-z-internetu-szybciej-nawrocki-zawetowal-przepisy"
      },
      {
        "outlet": "Dziennik.pl",
        "angle": "Relacja uzupełniająca",
        "summary": "Kolejne weto prezydenta Nawrockiego. Chodzi o ustawę blokującą nielegalne treści w internecie",
        "url": "https://wiadomosci.dziennik.pl/polityka/artykuly/11344335,kolejne-weto-prezydenta-nawrockiego-chodzi-o-ustawe-blokujaca-nielegalne-tresci-w-internecie.html"
      },
      {
        "outlet": "WP Wiadomości",
        "angle": "Relacja uzupełniająca",
        "summary": "\"Szantaż emocjonalny\". Nawrocki zawetował kolejną ustawę",
        "url": "https://wiadomosci.wp.pl/szantaz-emocjonalny-nawrocki-zawetowal-kolejna-ustawe-7350621369714720v"
      },
      {
        "outlet": "Business Insider PL",
        "angle": "Perspektywa rynkowa",
        "summary": "Prezydent Nawrocki zawetował ustawę o blokowaniu treści. \"Nadużycie władzy\"",
        "url": "https://businessinsider.com.pl/prawo/nie-bede-ulegal-szantazom-weto-prezydenta-do-ustawy-o-blokowaniu-tresci/bjfm3dz"
      },
      {
        "outlet": "Kresy.pl",
        "angle": "Relacja uzupełniająca",
        "summary": "Nawrocki zawetował ustawę o blokowaniu treści w internecie. „Wróciło widmo urzędnika cenzora”",
        "url": "https://kresy.pl/wydarzenia/nawrocki-zawetowal-ustawe-o-blokowaniu-tresci-w-internecie-wrocilo-widmo-urzednika-cenzora/"
      },
      {
        "outlet": "Radio Kraków",
        "angle": "Doniesienie regionalne",
        "summary": "Prezydent zawetował ustawę dot. blokowania nielegalnych treści w internecie; miała wdrożyć DSA",
        "url": "https://radiokrakow.pl/wiadomosci/kraj/prezydent-zawetowal-ustawe-dot-blokowania-nielegalnych-tresci-w-internecie-miala-wdrozyc-dsa/187713"
      }
    ],
    "sources": [
      "Business Insider PL",
      "Dziennik.pl",
      "Kresy.pl",
      "Radio Kraków",
      "Rzeczpospolita",
      "WP Wiadomości"
    ],
    "corrections": [],
    "summary_lead": "Prezydent zawetował ustawę wdrażającą Akt o usługach cyfrowych (DSA), która miała pozwolić na blokowanie nielegalnych treści w internecie.",
    "meta_description": "Prezydent zawetował ustawę wdrażającą Akt o usługach cyfrowych (DSA), która miała pozwolić na blokowanie nielegalnych treści w internecie.",
    "keywords": "Polityka, Nielegalne, treści, internetu, Nawrocki, zawetował"
  },
  {
    "id": 5,
    "path": "/Polska/Olsztyn",
    "seo_url": "/Polska/Olsztyn/tragedia-pod-mragowem-30-latek-uslyszal-zarzut-zabojstwa",
    "seo_title": "Tragedia pod Mrągowem. 30-latek usłyszał zarzut zabójstwa",
    "thumbnail_url": "https://radioolsztyn.pl/wp-content/uploads/2026/11/Zrzut-ekranu-2026-11-13-104004.png",
    "published_iso": "2026-11-13T16:48:28+01:00",
    "display_date": "13.11.2026, 16:48",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": null,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "1 redakcja"
      },
      {
        "label": "Kategoria",
        "val": "/Polska/Olsztyn"
      },
      {
        "label": "Główne źródło",
        "val": "Radio Olsztyn"
      },
      {
        "label": "Weryfikacja",
        "val": "1 źródło (lokalne/niszowe)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Relacja źródłowa (Radio Olsztyn)",
        "paragraphs": [
          "Syn zabił ojca w gminie Mrągowo. Prokuratura potwierdziła, że 30-letni mężczyzna usłyszał zarzut zabójstwa 64-latka. Chodzi o tragedię, do której doszło we wtorek późnym popołudniem w miejscowości Krzywe.",
          "Wczoraj przeprowadzono sekcję zwłok mężczyzny, którego ciało znaleziono w jednym z domów we wsi. Badanie wykazało liczne obrażenia obejmujące różne części ciała. O szczegółach poinformował Radio Olsztyn [Źródło: Radio Olsztyn]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Radio Olsztyn",
        "angle": "Relacja wiodąca",
        "summary": "Tragedia pod Mrągowem. 30-latek usłyszał zarzut zabójstwa",
        "url": "https://radioolsztyn.pl/tragedia-pod-mragowem-30-latek-uslyszal-zarzut-zabojstwa/01901089"
      }
    ],
    "sources": [
      "Radio Olsztyn"
    ],
    "corrections": [],
    "summary_lead": "Syn zabił ojca w gminie Mrągowo. Prokuratura potwierdziła, że 30-letni mężczyzna usłyszał zarzut zabójstwa 64-latka. Chodzi o tragedię, do której doszło we wtorek późnym popołudniem w miejscowości Krzywe.",
    "meta_description": "Syn zabił ojca w gminie Mrągowo. Prokuratura potwierdziła, że 30-letni mężczyzna usłyszał zarzut zabójstwa 64-latka.",
    "keywords": "Olsztyn, Mrągowem, 30-latek, zabójstwa"
  },
  {
    "id": 6,
    "path": "/Polska/Polityka",
    "seo_url": "/Polska/Polityka/ponad-100-okretow-wokol-tajwanu-nieogloszone-manewry-chin",
    "seo_title": "Ponad 100 okrętów wokół Tajwanu. Nieogłoszone manewry Chin",
    "thumbnail_url": "https://cdn.defence24.pl/2019/01/17/320x240px/meCqiBUu4SE4H11wSaZ5eurDh5nYKJORi9BR9vzE.zqj6.jpg",
    "published_iso": "2026-11-13T16:48:28+01:00",
    "display_date": "13.11.2026, 16:48",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 86,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "2 redakcje"
      },
      {
        "label": "Kategoria",
        "val": "/Polska/Polityka"
      },
      {
        "label": "Główne źródło",
        "val": "Defence24"
      },
      {
        "label": "Weryfikacja",
        "val": "Potwierdzone (2 źródła)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Ustalenia wspólne (2 redakcje)",
        "paragraphs": [
          "Na początku listopada Chińska Republika Ludowa przeprowadziła na zachodnim Pacyfiku i w rejonie Tajwanu niezapowiedziane manewry morskie z udziałem ponad 100 okrętów wojennych i jednostek straży przybrzeżnej. To jedno z największych tego typu zgrupowań w ostatnich latach – informują tajwańskie media. Działania określane są jako forma „cichego zastraszania”. [Źródło: Defence24]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "— Jakby rabuś ukrywał broń w kieszeni płaszcza z lufą wycelowaną w kasjera – ocenił tajwański urzędnik. [Źródło: TVN24]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Defence24",
        "angle": "Analiza sektorowa",
        "summary": "Ponad 100 okrętów wokół Tajwanu. Nieogłoszone manewry Chin",
        "url": "https://defence24.pl/geopolityka/ponad-100-okretow-wokol-tajwanu-nieogloszone-manewry-chin"
      },
      {
        "outlet": "TVN24",
        "angle": "Relacja uzupełniająca",
        "summary": "\"Ciche zastraszanie\". Ponad 100 chińskich okrętów wokół Tajwanu",
        "url": "https://tvn24.pl/swiat/ponad-100-chinskich-okretow-na-manewrach-wokol-tajwanu-ciche-zastraszanie-st9338179?source=rss"
      }
    ],
    "sources": [
      "Defence24",
      "TVN24"
    ],
    "corrections": [],
    "summary_lead": "Na początku listopada Chińska Republika Ludowa przeprowadziła na zachodnim Pacyfiku i w rejonie Tajwanu niezapowiedziane manewry morskie z udziałem ponad 100 okrętów wojennych i jednostek straży przybrzeżnej.",
    "meta_description": "Na początku listopada Chińska Republika Ludowa przeprowadziła na zachodnim Pacyfiku i w rejonie Tajwanu niezapowiedziane manewry morskie z udziałem ponad 100…",
    "keywords": "Polityka, okrętów, wokół, Tajwanu, Nieogłoszone, manewry, Chin"
  },
  {
    "id": 7,
    "path": "/Polska/Gospodarka",
    "seo_url": "/Polska/Gospodarka/dlugie-weekendy-2027-jak-zaplanowac-urlop-w-przyszlym-roku-kalendarzowym",
    "seo_title": "Długie weekendy 2027. Jak zaplanować urlop w przyszłym roku kalendarzowym?",
    "thumbnail_url": "https://webp-konwerter.incdn.pl/eyJmIjoiaHR0cHM6Ly9pbmZvci13ZWItc3RhdGljLWZvcn/NhbC5pbmNkbi5wbC9mb3JzYWwvZG9jdW1lbnRzL0ZPQjAw/MDAwMDAwMDAwMDc1MjAxODcvZmlsZXMvZG5pLXdvbG5lLX/ctMjAyNi1yb2t1LTM5MjIwMzgyLmpwZyIsInciOjM4NDB9",
    "published_iso": "2026-11-13T16:48:28+01:00",
    "display_date": "13.11.2026, 16:48",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 86,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "2 redakcje"
      },
      {
        "label": "Kategoria",
        "val": "/Polska/Gospodarka"
      },
      {
        "label": "Główne źródło",
        "val": "Forsal.pl"
      },
      {
        "label": "Weryfikacja",
        "val": "Potwierdzone (2 źródła)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Ustalenia wspólne (2 redakcje)",
        "paragraphs": [
          "W 2027 roku kalendarz świąt będzie sprzyjał pracownikom planującym dłuższy wypoczynek. Kilka dni ustawowo wolnych od pracy przypada w poniedziałki lub piątki, dzięki czemu pojawi się sporo okazji do przedłużenia weekendów. Dodatkowo za dwa święta wypadające w sobotę pracownikom będą przysługiwały inne dni wolne. [Źródło: Forsal.pl]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Tylko dwa z tych świąt oddadzą nam wolny dzień w tygodniu, a cztery przepadną. Sklepy w niedzielę będą otwarte osiem razy. [Źródło: naTemat.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Forsal.pl",
        "angle": "Raport rynkowy",
        "summary": "Długie weekendy 2027. Jak zaplanować urlop w przyszłym roku kalendarzowym?",
        "url": "https://forsal.pl/praca/artykuly/11344168,dlugie-weekendy-2027-jak-zaplanowac-urlop-w-przyszlym-roku-kalendarzowym.html"
      },
      {
        "outlet": "naTemat.pl",
        "angle": "Relacja uzupełniająca",
        "summary": "Dni wolne na 2027 rok policzone. 2 soboty do odebrania i 7 długich weekendów",
        "url": "https://natemat.pl/675451,dni-wolne-na-2027-rok-policzone-2-soboty-do-odebrania-i-7-dlugich-weekendow"
      }
    ],
    "sources": [
      "Forsal.pl",
      "naTemat.pl"
    ],
    "corrections": [],
    "summary_lead": "W 2027 roku kalendarz świąt będzie sprzyjał pracownikom planującym dłuższy wypoczynek. Kilka dni ustawowo wolnych od pracy przypada w poniedziałki lub piątki, dzięki czemu pojawi się sporo okazji do przedłużenia weekendów.",
    "meta_description": "W 2027 roku kalendarz świąt będzie sprzyjał pracownikom planującym dłuższy wypoczynek.",
    "keywords": "Gospodarka, Długie, weekendy, zaplanować, urlop, przyszłym, kalendarzowym"
  },
  {
    "id": 8,
    "path": "/Polska",
    "seo_url": "/Polska/ai-wygenerowala-glos-lektora-przelomowy-wyrok-warszawskiego-sadu",
    "seo_title": "AI wygenerowała głos lektora. Przełomowy wyrok warszawskiego sądu",
    "thumbnail_url": "https://rmf.rmffm.pl/news/attachments/c7/e1/radek-pietruszka-636x421-c7e17337.jpg",
    "published_iso": "2026-11-13T15:43:30+01:00",
    "display_date": "13.11.2026, 15:43",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 92,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "5 redakcji"
      },
      {
        "label": "Kategoria",
        "val": "/Polska"
      },
      {
        "label": "Główne źródło",
        "val": "RMF24"
      },
      {
        "label": "Weryfikacja",
        "val": "Potwierdzone (5 źródeł)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Ustalenia wspólne (5 redakcji)",
        "paragraphs": [
          "Sąd ocenił, że wygenerowane treści mają charakter deepfake i zasądził ich usunięcie, a także zadośćuczynienie oraz przeprosiny dla lektora. Sprawa przed Wydziałem Własności Intelektualnej warszawskiego SO toczyła się od końca stycznia. [Źródło: Radio Zachód]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "— Mam nadzieję, że ten precedens z czasem znajdzie swoją drogę do zapisów w polskim prawie – skomentował w rozmowie z tvn24.pl Łukomski. [Źródło: TVN24]",
          "Wyrok uznał, że głos stanowi dobro osobiste każdego człowieka podlegające ochronie prawnej. [Źródło: Business Insider PL]",
          "Sąd Okręgowy w Warszawie wydał w piątek (13 listopada) wyrok w precedensowym procesie dotyczącym wykorzystania przez firmę w reklamach wygenerowanego przez AI głosu znanego lektora. [Źródło: Wirtualnemedia.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "RMF24",
        "angle": "Relacja wiodąca",
        "summary": "AI wygenerowała głos lektora. Przełomowy wyrok warszawskiego sądu",
        "url": "https://www.rmf24.pl/fakty/polska/news-ai-wygenerowala-glos-lektora-przelomowy-wyrok-warszawskiego-,nIdn,1026031"
      },
      {
        "outlet": "Radio Zachód",
        "angle": "Doniesienie regionalne",
        "summary": "Precedensowy wyrok sądu: sztuczna inteligencja „ukradła” głos lektora. Jarosław Łukomski wygrał proces!",
        "url": "https://zachod.pl/1589929/precedensowy-wyrok-sadu-sztuczna-inteligencja-ukradla-glos-lektora-jaroslaw-lukomski-wygral-proces/"
      },
      {
        "outlet": "TVN24",
        "angle": "Relacja uzupełniająca",
        "summary": "Głos wygenerowany przez AI \"łudząco podobny\" do głosu lektora. Zapadł ważny wyrok",
        "url": "https://tvn24.pl/biznes/prawo/jaroslaw-lukomski-firma-uzyla-glosu-wygenerowanego-przez-ai-zapadl-wazny-wyrok-st9338031?source=rss"
      },
      {
        "outlet": "Business Insider PL",
        "angle": "Perspektywa rynkowa",
        "summary": "Precedensowy w Polsce wyrok w sprawie AI. Lektor wygrał prawo do swojego głosu",
        "url": "https://businessinsider.com.pl/prawo/sztuczna-inteligencja-przegrala-w-sadzie-glos-lektora-wykorzystany-bezprawnie/l7q0lge"
      },
      {
        "outlet": "Wirtualnemedia.pl",
        "angle": "Relacja uzupełniająca",
        "summary": "Głos znanego lektora w reklamie oczyszczalni ścieków. Zapadł wyrok sądu",
        "url": "https://www.wirtualnemedia.pl/lektor-jaroslaw-lukomski-glos-ai-reklama-oczyszczalnia-sciekow-jfc-polska-eleven-labs-precedens,7350609600051200a"
      }
    ],
    "sources": [
      "Business Insider PL",
      "RMF24",
      "Radio Zachód",
      "TVN24",
      "Wirtualnemedia.pl"
    ],
    "corrections": [],
    "summary_lead": "Sąd ocenił, że wygenerowane treści mają charakter deepfake i zasądził ich usunięcie, a także zadośćuczynienie oraz przeprosiny dla lektora. Sprawa przed Wydziałem Własności Intelektualnej warszawskiego SO toczyła się od końca stycznia.",
    "meta_description": "Sąd ocenił, że wygenerowane treści mają charakter deepfake i zasądził ich usunięcie, a także zadośćuczynienie oraz przeprosiny dla lektora.",
    "keywords": "Polska, wygenerowała, głos, lektora, warszawskiego"
  },
  {
    "id": 9,
    "path": "/Polska",
    "seo_url": "/Polska/oswiadczenie-korwin-piotrowskiej-tk-przeglada-sto-najpilniejszych-spraw",
    "seo_title": "Oświadczenie Korwin-Piotrowskiej: TK przegląda sto najpilniejszych spraw",
    "thumbnail_url": "https://s20.tvp.pl/images2/0/5/1/uid_051198f010a34ab59b4225dc7c3584f9_width_1280_play_0_pos_0_gs_0_height_720.jpg",
    "published_iso": "2026-11-13T15:43:30+01:00",
    "display_date": "13.11.2026, 15:43",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 92,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "3 redakcje"
      },
      {
        "label": "Kategoria",
        "val": "/Polska"
      },
      {
        "label": "Główne źródło",
        "val": "TVP.info"
      },
      {
        "label": "Weryfikacja",
        "val": "Potwierdzone (3 źródła)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Ustalenia wspólne (3 redakcje)",
        "paragraphs": [
          "— Przeglądamy wszystkie sprawy w Trybunale. [Źródło: TVP.info, Gazeta.pl]",
          "Najpierw wzięliśmy sto najstarszych spraw. To są sprawy, które wpłynęły między 2013 rokiem a 2021. W bardzo wielu tych sprawach prawie od siedmiu lat niepodejmowane są żadne czynności – opowiada na nagraniu sędzia. [Źródło: TVP.info]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Poinformowała także, że odmówiła przyjęcia wniosku prokuratury w sprawie uchylenia immunitetu Bogdana Święczkowskiego z powodu braków formalnych. [Źródło: Onet Wiadomości]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "TVP.info",
        "angle": "Relacja wiodąca",
        "summary": "Oświadczenie Korwin-Piotrowskiej: TK przegląda sto najpilniejszych spraw",
        "url": "https://www.tvp.info/96456613/oswiadczenie-anny-korwin-piotrowskiej-sedzia-mowi-o-planowanych-pracach-trybunalu-konstytucyjnego"
      },
      {
        "outlet": "Onet Wiadomości",
        "angle": "Relacja uzupełniająca",
        "summary": "Nowe oświadczenie Anny Korwin-Piotrowskiej. Odmówiła przyjęcia wniosku prokuratury",
        "url": "https://wiadomosci.onet.pl/kraj/nowe-oswiadczenie-anny-korwin-piotrowskiej-przekazala-czym-zajmuja-sie-sedziowie/7hwjme7"
      },
      {
        "outlet": "Gazeta.pl",
        "angle": "Relacja uzupełniająca",
        "summary": "Nowe oświadczenie Korwin-Piotrowskiej. \"Przeglądamy sto najstarszych spraw w Trybunale\"",
        "url": "https://wiadomosci.gazeta.pl/polityka/7,198012,33131393,nowe-oswiadczenie-korwin-piotrowskiej-przegladamy-sto-najstarszych.html?utm_source=RSS&utm_medium=RSS&utm_campaign=10199882"
      }
    ],
    "sources": [
      "Gazeta.pl",
      "Onet Wiadomości",
      "TVP.info"
    ],
    "corrections": [],
    "summary_lead": "— Przeglądamy wszystkie sprawy w Trybunale.",
    "meta_description": "— Przeglądamy wszystkie sprawy w Trybunale. Najpierw wzięliśmy sto najstarszych spraw. To są sprawy, które wpłynęły między 2013 rokiem a 2021.",
    "keywords": "Polska, Oświadczenie, Korwin-Piotrowskiej, przegląda, najpilniejszych"
  },
  {
    "id": 10,
    "path": "/Polska",
    "seo_url": "/Polska/morawiecki-o-kluczowej-decyzji-ws-wyborow-mamy-zupelnie-inne-podejscie",
    "seo_title": "Morawiecki o kluczowej decyzji ws. wyborów. \"Mamy zupełnie inne podejście\"",
    "thumbnail_url": "https://ipla.pluscdn.pl/dituel/cp/3n/3n85gbwvdqy81cw2zntw687crvx1sbcb.jpg",
    "published_iso": "2026-11-13T15:43:30+01:00",
    "display_date": "13.11.2026, 15:43",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 86,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "2 redakcje"
      },
      {
        "label": "Kategoria",
        "val": "/Polska"
      },
      {
        "label": "Główne źródło",
        "val": "Polsat News"
      },
      {
        "label": "Weryfikacja",
        "val": "Potwierdzone (2 źródła)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Ustalenia wspólne (2 redakcje)",
        "paragraphs": [
          "Mateusz Morawiecki skomentował słowa Jarosława Kaczyńskiego, który podczas Marszu Niepodległości zapowiedział starania o stworzenie jednej listy prawicowej opozycji w wyborach do Sejmu. [Źródło: Polsat News]",
          "— Idziemy oczywiście sami do wyborów. (...) Nie chcesz Tuska, nie chcesz Brauna, wybierz Rozwój Plus. [Źródło: Polsat News]",
          "To jest nasze podejście do wyborów – zadeklarował były premier. [Źródło: Polsat News]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Widzę te zachęty kierownictwa PiS, aby iść razem z Braunem, z Konfederacją obecną. [Źródło: Niezależna.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Polsat News",
        "angle": "Relacja wiodąca",
        "summary": "Morawiecki o kluczowej decyzji ws. wyborów. \"Mamy zupełnie inne podejście\"",
        "url": "https://www.polsatnews.pl/wiadomosc/2026-11-13/morawiecki-o-kluczowej-decyzji-ws-wyborow-mamy-zupelnie-inne-podejscie/"
      },
      {
        "outlet": "Niezależna.pl",
        "angle": "Relacja uzupełniająca",
        "summary": "Morawiecki odpowiada na postulat Kaczyńskiego. \"My mamy zupełnie inne podejście\"",
        "url": "https://niezalezna.pl/polityka/morawiecki-odpowiada-na-postulat-kaczynskiego-my-mamy-zupelnie-inne-podejscie/584096"
      }
    ],
    "sources": [
      "Niezależna.pl",
      "Polsat News"
    ],
    "corrections": [],
    "summary_lead": "Mateusz Morawiecki skomentował słowa Jarosława Kaczyńskiego, który podczas Marszu Niepodległości zapowiedział starania o stworzenie jednej listy prawicowej opozycji w wyborach do Sejmu.",
    "meta_description": "Mateusz Morawiecki skomentował słowa Jarosława Kaczyńskiego, który podczas Marszu Niepodległości zapowiedział starania o stworzenie jednej listy prawicowej…",
    "keywords": "Polska, Morawiecki, kluczowej, wyborów, Mamy, zupełnie, inne"
  },
  {
    "id": 11,
    "path": "/Polska/Gospodarka",
    "seo_url": "/Polska/Gospodarka/burger-drwala-wraca-do-mcdonald-s-cena-bez-zmian-premiera-pelnej-oferty",
    "seo_title": "Burger Drwala wraca do McDonald‘s. Cena bez zmian, premiera pełnej oferty w Kielcach",
    "thumbnail_url": "https://static.wiadomoscihandlowe.pl/images/2026/11/13/10821334.webp",
    "published_iso": "2026-11-13T15:43:30+01:00",
    "display_date": "13.11.2026, 15:43",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 86,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "2 redakcje"
      },
      {
        "label": "Kategoria",
        "val": "/Polska/Gospodarka"
      },
      {
        "label": "Główne źródło",
        "val": "Wiadomości Handlowe"
      },
      {
        "label": "Weryfikacja",
        "val": "Potwierdzone (2 źródła)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Ustalenia wspólne (2 redakcje)",
        "paragraphs": [
          "McDonald’s Polska zainaugurował swoją najważniejszą sezonową kampanię sprzedażową – z okazji 15-lecia Burgera Drwala sieć wprowadziła do oferty nowy wariant smakowy, utrzymując jednocześnie ceny na ubiegłorocznym poziomie. Przedpremierowe degustacje pełnej linii produktowej ruszyły właśnie w Kielcach, na kilka dni przed ogólnopolskim startem. [Źródło: Wiadomości Handlowe]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "McDonald's wrócił ze swoją stałą już jesienno-zimowa pozycją. Po raz drugi w historii tej kultowej kanapki cena nie podskoczyła. Oznacza to, że legenda porównywana do Pumkin Spice Latte Starbucksa chwilowo straciła status popkulturowej miary polskiej inflacji. [Źródło: Bankier.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Wiadomości Handlowe",
        "angle": "Relacja wiodąca",
        "summary": "Burger Drwala wraca do McDonald‘s. Cena bez zmian, premiera pełnej oferty w Kielcach",
        "url": "https://www.wiadomoscihandlowe.pl/konsument-i-trendy-zakupowe/marketing-i-strategie-promocyjne/nowa-wersja-burgera-drwala-w-mcdonald-s-cena-bez-zmian-pierwsze-degustacje-w-kielcach-2539400"
      },
      {
        "outlet": "Bankier.pl",
        "angle": "Perspektywa rynkowa",
        "summary": "Cena kultowej kanapki w McDonald's zaskakuje. Burger Drwala powrócił do menu",
        "url": "https://www.bankier.pl/wiadomosc/Cena-kultowej-kanapki-w-McDonald-s-zaskakuje-Burger-Drwala-powrocil-do-menu-9228230.html?utm_source=RSS&utm_medium=RSS&utm_campaign=Wiadomosci"
      }
    ],
    "sources": [
      "Bankier.pl",
      "Wiadomości Handlowe"
    ],
    "corrections": [],
    "summary_lead": "McDonald’s Polska zainaugurował swoją najważniejszą sezonową kampanię sprzedażową – z okazji 15-lecia Burgera Drwala sieć wprowadziła do oferty nowy wariant smakowy, utrzymując jednocześnie ceny na ubiegłorocznym poziomie.",
    "meta_description": "McDonald’s Polska zainaugurował swoją najważniejszą sezonową kampanię sprzedażową – z okazji 15-lecia Burgera Drwala sieć wprowadziła do oferty nowy wariant…",
    "keywords": "Gospodarka, Burger, Drwala, wraca, McDonald, Cena, premiera"
  },
  {
    "id": 12,
    "path": "/Sport",
    "seo_url": "/Sport/manchester-united-podal-nazwisko-nowego-trenera",
    "seo_title": "Manchester United podał nazwisko nowego trenera",
    "thumbnail_url": "https://rmf.rmffm.pl/news/attachments/ac/38/east-news-636x421-ac3837db.jpg",
    "published_iso": "2026-11-13T14:11:13+01:00",
    "display_date": "13.11.2026, 14:11",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 92,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "6 redakcji"
      },
      {
        "label": "Kategoria",
        "val": "/Sport"
      },
      {
        "label": "Główne źródło",
        "val": "RMF24"
      },
      {
        "label": "Weryfikacja",
        "val": "Potwierdzone (6 źródeł)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Ustalenia wspólne (6 redakcji)",
        "paragraphs": [
          "Katastrofalny start sezonu spowodował kolejną zmianę rządów w Manchesterze United. Argentyńczyk pracuje obecnie jako selekcjoner reprezentacji USA, a na Wyspy Brytyjskie przeniesie się tuż po przerwie reprezentacyjnej. [Źródło: Interia Sport]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Zmiana szkoleniowca Czerwonych Diabłów nastąpiła po najsłabszym od czterech dekad początku sezonu. [Źródło: Polsat Sport]",
          "W piątek (13 listopada) klub poinformował, że zawarł porozumienie z argentyńskim szkoleniowcem. Cała transakcja – według relacji brytyjskich mediów – będzie \"Czerwone Diabły\" słono kosztować. [Źródło: Sport.pl]",
          "Argentyńczyk miał umowę z narodową kadrą do 2030 r. [Źródło: Przegląd Sportowy]",
          "Argentyńczyk rozpocznie pracę 18 listopada po zakończeniu obowiązków przy reprezentacji USA. [Źródło: WP SportoweFakty]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "RMF24",
        "angle": "Relacja wiodąca",
        "summary": "Manchester United podał nazwisko nowego trenera",
        "url": "https://www.rmf24.pl/fakty/sport/news-manchester-united-podal-nazwisko-nowego-trenera,nIdn,1026018"
      },
      {
        "outlet": "Interia Sport",
        "angle": "Relacja sportowa",
        "summary": "Koszmarny start sezonu Manchesteru United. Wybrano nowego trenera",
        "url": "https://sport.interia.pl/pilka-nozna/premier-league/news-katastrofa-na-starcie-sezonu-gigant-zmienil-trenera-ogloszon,nId,23573171"
      },
      {
        "outlet": "Polsat Sport",
        "angle": "Relacja sportowa",
        "summary": "Potwierdziło się. Znamy nowego trenera Manchesteru United",
        "url": "https://www.polsatsport.pl/wiadomosc/2026-11-13/potwierdzilo-sie-znamy-nowego-trenera-manchesteru-united/"
      },
      {
        "outlet": "Sport.pl",
        "angle": "Relacja sportowa",
        "summary": "Manchester United ma nowego trenera! Ten zakup będzie słono kosztował",
        "url": "https://www.sport.pl/pilka/7,65080,33130994,manchester-united-ma-nowego-trenera-ten-zakup-bedzie-slono.html"
      },
      {
        "outlet": "Przegląd Sportowy",
        "angle": "Relacja sportowa",
        "summary": "Oficjalnie. Manchester United ma nowego trenera. Musi dźwignąć giganta z dna",
        "url": "https://przegladsportowy.onet.pl/pilka-nozna/premier-league/oficjalnie-manchester-united-ma-nowego-trenera-musi-dzwignac-giganta-z-dna/l0ehtrl"
      },
      {
        "outlet": "WP SportoweFakty",
        "angle": "Relacja sportowa",
        "summary": "To już pewne. Manchester United ma nowego trenera",
        "url": "https://sportowefakty.wp.pl/pilka-nozna/1283992/to-juz-pewne-manchester-united-ma-nowego-trenera"
      }
    ],
    "sources": [
      "Interia Sport",
      "Polsat Sport",
      "Przegląd Sportowy",
      "RMF24",
      "Sport.pl",
      "WP SportoweFakty"
    ],
    "corrections": [],
    "summary_lead": "Katastrofalny start sezonu spowodował kolejną zmianę rządów w Manchesterze United. Argentyńczyk pracuje obecnie jako selekcjoner reprezentacji USA, a na Wyspy Brytyjskie przeniesie się tuż po przerwie reprezentacyjnej.",
    "meta_description": "Katastrofalny start sezonu spowodował kolejną zmianę rządów w Manchesterze United.",
    "keywords": "Sport, Manchester, United, podał, nazwisko, nowego, trenera"
  },
  {
    "id": 13,
    "path": "/Polska/Polityka",
    "seo_url": "/Polska/Polityka/twarda-deklaracja-morawieckiego-idziemy-sami",
    "seo_title": "Twarda deklaracja Morawieckiego: Idziemy sami",
    "thumbnail_url": "https://rmf.rmffm.pl/news/attachments/ab/7d/prezes-stowarzyszenia-rozwoj-plus-mateusz-morawiecki-przemawia-podczas-poznanskiego-kongresu-gospodarczego-636x421-ab7d060b.jpg",
    "published_iso": "2026-11-13T14:11:13+01:00",
    "display_date": "13.11.2026, 14:11",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 94,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "3 redakcje"
      },
      {
        "label": "Kategoria",
        "val": "/Polska/Polityka"
      },
      {
        "label": "Główne źródło",
        "val": "RMF24"
      },
      {
        "label": "Weryfikacja",
        "val": "Potwierdzone (3 źródła)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Ustalenia wspólne (3 redakcje)",
        "paragraphs": [
          "Idziemy do wyborów sami — zadeklarował w Poznaniu lider Rozwoju Plus oraz były premier Mateusz Morawiecki. Ocenił jednocześnie, że na polskiej prawicy nie ma obecnie hegemona, tak jak to było kiedyś. [Źródło: Business Insider PL, Onet Wiadomości]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "RMF24",
        "angle": "Relacja wiodąca",
        "summary": "Twarda deklaracja Morawieckiego: Idziemy sami",
        "url": "https://www.rmf24.pl/fakty/polityka/news-twarda-deklaracja-morawieckiego-idziemy-sami,nIdn,1026013"
      },
      {
        "outlet": "Business Insider PL",
        "angle": "Perspektywa rynkowa",
        "summary": "\"Idziemy sami\". Mateusz Morawiecki deklaruje",
        "url": "https://businessinsider.com.pl/wiadomosci/widze-te-zachety-mateusz-morawiecki-nie-chce-startowac-z-pis/ht1fq8x"
      },
      {
        "outlet": "Onet Wiadomości",
        "angle": "Relacja uzupełniająca",
        "summary": "Mateusz Morawiecki nie chce iść do wyborów z PiS. Zamierza być alternatywą dla dwóch partii",
        "url": "https://wiadomosci.onet.pl/kraj/ugrupowanie-morawieckiego-pojdzie-z-pis-do-wyborow-jasna-deklaracja/yhcyegm"
      }
    ],
    "sources": [
      "Business Insider PL",
      "Onet Wiadomości",
      "RMF24"
    ],
    "corrections": [],
    "summary_lead": "Idziemy do wyborów sami — zadeklarował w Poznaniu lider Rozwoju Plus oraz były premier Mateusz Morawiecki. Ocenił jednocześnie, że na polskiej prawicy nie ma obecnie hegemona, tak jak to było kiedyś.",
    "meta_description": "Idziemy do wyborów sami — zadeklarował w Poznaniu lider Rozwoju Plus oraz były premier Mateusz Morawiecki.",
    "keywords": "Polityka, Twarda, deklaracja, Morawieckiego, Idziemy, sami"
  },
  {
    "id": 14,
    "path": "/Sport",
    "seo_url": "/Sport/reprezentacja-na-lasce-lewandowskiego-do-turcji-jezdzi-sie-na-wakacje",
    "seo_title": "Reprezentacja na łasce Lewandowskiego. \"Do Turcji jeździ się na wakacje\"",
    "thumbnail_url": "https://i.iplsc.com/-/000NIZ85PLTFO5NW-C321.webp",
    "published_iso": "2026-11-13T14:11:13+01:00",
    "display_date": "13.11.2026, 14:11",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 90,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "3 redakcje"
      },
      {
        "label": "Kategoria",
        "val": "/Sport"
      },
      {
        "label": "Główne źródło",
        "val": "Interia Sport"
      },
      {
        "label": "Weryfikacja",
        "val": "Potwierdzone (3 źródła)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Ustalenia wspólne (3 redakcje)",
        "paragraphs": [
          "— 50 procent kadry jest do wymiany – mówi były napastnik reprezentacji Polski Paweł Kryszałowicz przed meczem z Rumunią. [Źródło: Interia Sport]",
          "— Żeby do czegoś dojść, my musimy w końcu przyznać, że z pewnymi zawodnikami już nic nie zrobimy, że postępu nie będzie. [Źródło: Interia Sport]",
          "Z pewnej grupy trzeba zrezygnować, nie ma sensu ciągnąć jej za uszy – dodaje snajper z drużyny Jerzego Engela i wylicza całą litanię problemów przed kluczowym spotkaniem. Pyta też o sens odmładzania kadry, teraz gdy potrzeba nam punktów, a nie eksperymentów. [Źródło: Interia Sport]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Cezary Kucharski był bardzo krytyczny wobec Roberta Lewandowskiego przed sobotnim meczem Rumunia – Polska. Bez względu na wiek, ostatnie zgrupowanie pokazało, że wybiera sobie mecze. Wykartkował się z premedytacją na rewanżowe spotkanie z Bośnią. [Źródło: Sport.pl]",
          "— Gra pod siebie, statystyki, które chce wyśrubować, kontrakty reklamowe – dlatego przyjeżdża na kadrę – mówi nam Cezary Kucharski. [Źródło: WP SportoweFakty]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Interia Sport",
        "angle": "Relacja wiodąca",
        "summary": "Reprezentacja na łasce Lewandowskiego. \"Do Turcji jeździ się na wakacje\"",
        "url": "https://sport.interia.pl/pilka-nozna/reprezentacja-polski/news-reprezentacja-polski-na-lasce-lewandowskiego-do-turcji-jezdz,nId,23573028"
      },
      {
        "outlet": "Sport.pl",
        "angle": "Relacja sportowa",
        "summary": "\"Lewandowski jest problemem reprezentacji. Nie widzę szans\"",
        "url": "https://www.sport.pl/pilka/7,65037,33131169,lewandowski-jest-problemem-reprezentacji-nie-widze-szans.html"
      },
      {
        "outlet": "WP SportoweFakty",
        "angle": "Relacja sportowa",
        "summary": "Kucharski szokuje. \"Lewandowski jest problemem reprezentacji\"",
        "url": "https://sportowefakty.wp.pl/pilka-nozna/1283836/kucharski-szokuje-lewandowski-jest-problemem-reprezentacji"
      }
    ],
    "sources": [
      "Interia Sport",
      "Sport.pl",
      "WP SportoweFakty"
    ],
    "corrections": [],
    "summary_lead": "— 50 procent kadry jest do wymiany – mówi były napastnik reprezentacji Polski Paweł Kryszałowicz przed meczem z Rumunią.",
    "meta_description": "— 50 procent kadry jest do wymiany – mówi były napastnik reprezentacji Polski Paweł Kryszałowicz przed meczem z Rumunią.",
    "keywords": "Sport, Reprezentacja, łasce, Lewandowskiego, Turcji, jeździ, wakacje"
  },
  {
    "id": 15,
    "path": "/Polska/Lublin",
    "seo_url": "/Polska/Lublin/mial-dozywotni-zakaz-prowadzenia-pojazdow-ale-go-zlamal-39-latek",
    "seo_title": "Miał dożywotni zakaz prowadzenia pojazdów, ale go złamał. 39-latek zatrzymany przez policjantów",
    "thumbnail_url": "https://www.lublin112.pl/wp-content/uploads/2026/11/61-677111.jpg",
    "published_iso": "2026-11-13T14:11:13+01:00",
    "display_date": "13.11.2026, 14:11",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 86,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "2 redakcje"
      },
      {
        "label": "Kategoria",
        "val": "/Polska/Lublin"
      },
      {
        "label": "Główne źródło",
        "val": "Lublin112.pl"
      },
      {
        "label": "Weryfikacja",
        "val": "Potwierdzone (2 źródła)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Ustalenia wspólne (2 redakcje)",
        "paragraphs": [
          "Dzielnicowi z Tomaszowa Lubelskiego zatrzymali 39-latka poszukiwanego do odbycia kary sześciu miesięcy pozbawienia wolności za niestosowanie się do sądowego zakazu prowadzenia pojazdów. Podczas czynności policjanci znaleźli przy mężczyźnie substancje psychotropowe, a kolejne narkotyki ujawnili w miejscu jego zamieszkania. Zatrzymany usłyszał dodatkowe zarzuty. [Źródło: Lublin112.pl]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "62-letni mężczyzna został zatrzymany przez policjantów, którzy podczas przeszukania jego posesji znaleźli i zabezpieczyli niebezpieczne narzędzie. [Źródło: Radio Gdańsk]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Lublin112.pl",
        "angle": "Relacja wiodąca",
        "summary": "Miał dożywotni zakaz prowadzenia pojazdów, ale go złamał. 39-latek zatrzymany przez policjantów",
        "url": "https://www.lublin112.pl/mial-dozywotni-zakaz-prowadzenia-pojazdow-ale-go-zlamal-39-latek-zatrzymany-przez-policjantow/"
      },
      {
        "outlet": "Radio Gdańsk",
        "angle": "Doniesienie regionalne",
        "summary": "Groził sąsiadce, miał przy sobie maczetę",
        "url": "https://radiogdansk.pl/wiadomosci/region/powisle/2026/11/13/grozil-sasiadce-mial-przy-sobie-maczete/"
      }
    ],
    "sources": [
      "Lublin112.pl",
      "Radio Gdańsk"
    ],
    "corrections": [],
    "summary_lead": "Dzielnicowi z Tomaszowa Lubelskiego zatrzymali 39-latka poszukiwanego do odbycia kary sześciu miesięcy pozbawienia wolności za niestosowanie się do sądowego zakazu prowadzenia pojazdów.",
    "meta_description": "Dzielnicowi z Tomaszowa Lubelskiego zatrzymali 39-latka poszukiwanego do odbycia kary sześciu miesięcy pozbawienia wolności za niestosowanie się do sądowego…",
    "keywords": "Lublin, dożywotni, zakaz, prowadzenia, pojazdów, złamał, 39-latek"
  },
  {
    "id": 16,
    "path": "/Sport",
    "seo_url": "/Sport/alez-debiut-polki-w-pucharze-swiata-jest-podium-decydowaly-setne-sekundy",
    "seo_title": "Ależ debiut Polki w Pucharze Świata. Jest podium. Decydowały setne sekundy",
    "thumbnail_url": "https://i.iplsc.com/-/000NJ0C3OEXISHYI-C321.webp",
    "published_iso": "2026-11-13T12:56:54+01:00",
    "display_date": "13.11.2026, 12:56",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 98,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "4 redakcje"
      },
      {
        "label": "Kategoria",
        "val": "/Sport"
      },
      {
        "label": "Główne źródło",
        "val": "Interia Sport"
      },
      {
        "label": "Weryfikacja",
        "val": "Potwierdzone (4 źródła)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Ustalenia wspólne (4 redakcje)",
        "paragraphs": [
          "Panczenistka Wiktoria Dąbrowska zajęła trzecie miejsce na dystansie 1000 metrów. To był debiut 20-latki w zawodach Pucharu Świata. Napisał się piękny scenariusz. [Źródło: Interia Sport, Niezależna.pl]",
          "Jej dobrą formę było widać już podczas mistrzostw Polski. [Źródło: Interia Sport]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Wiktoria Dąbrowska zapowiadała, że po sukcesach wśród juniorek chce na dobre wejść do seniorskiego łyżwiarstwa. [Źródło: WP SportoweFakty]",
          "Polka uzyskała czas 1.15,85. Zwyciężyła Holenderka Angel Daleman (1.14,07). Na 13. pozycji w grupie A uplasowała się Karolina Bosiek. [Źródło: Radio PiK]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Interia Sport",
        "angle": "Relacja wiodąca",
        "summary": "Ależ debiut Polki w Pucharze Świata. Jest podium. Decydowały setne sekundy",
        "url": "https://sport.interia.pl/zimowe/news-alez-debiut-polki-w-pucharze-swiata-jest-podium-decydowaly-s,nId,23572984"
      },
      {
        "outlet": "Niezależna.pl",
        "angle": "Relacja sportowa",
        "summary": "Wymarzony debiut Polki w Pucharze Świata. Wiktoria Dąbrowska na podium w Pekinie",
        "url": "https://niezalezna.pl/sport/wymarzony-debiut-polski-w-pucharze-swiata-wiktoria-dabrowska-na-podium-w-pekinie/584094"
      },
      {
        "outlet": "WP SportoweFakty",
        "angle": "Relacja sportowa",
        "summary": "20-letnia Polka odpaliła w Pekinie. Jest podium PŚ",
        "url": "https://sportowefakty.wp.pl/lyzwiarstwo-szybkie/1283988/20-letnia-polka-odpalila-w-pekinie-jest-podium-ps"
      },
      {
        "outlet": "Radio PiK",
        "angle": "Doniesienie regionalne",
        "summary": "Debiut w PŚ i od razu podium. Panczenistka Wiktoria Dąbrowska wywalczyła trzecie miejsce",
        "url": "https://www.radiopik.pl/40,143671,debiut-w-ps-i-od-razu-podium-panczenistka-wiktor"
      }
    ],
    "sources": [
      "Interia Sport",
      "Niezależna.pl",
      "Radio PiK",
      "WP SportoweFakty"
    ],
    "corrections": [],
    "summary_lead": "Panczenistka Wiktoria Dąbrowska zajęła trzecie miejsce na dystansie 1000 metrów. To był debiut 20-latki w zawodach Pucharu Świata. Napisał się piękny scenariusz.",
    "meta_description": "Panczenistka Wiktoria Dąbrowska zajęła trzecie miejsce na dystansie 1000 metrów. To był debiut 20-latki w zawodach Pucharu Świata.",
    "keywords": "Sport, Ależ, debiut, Polki, Pucharze, podium, Decydowały"
  },
  {
    "id": 17,
    "path": "/Polska/Energetyka",
    "seo_url": "/Polska/Energetyka/spor-o-podatek-od-zyskow-orlen-lietuva-minister-motyka-spolka-ma",
    "seo_title": "Spór o podatek od zysków Orlen Lietuva. Minister Motyka: spółka ma nadzwyczajne straty",
    "thumbnail_url": "https://cdn.defence24.pl/2026/03/23/320x240px/pLlxqVSco6x0GGKQPSN9QKMR7DpLUQNqc55akCky.utci.jpg",
    "published_iso": "2026-11-13T12:56:54+01:00",
    "display_date": "13.11.2026, 12:56",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 92,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "3 redakcje"
      },
      {
        "label": "Kategoria",
        "val": "/Polska/Energetyka"
      },
      {
        "label": "Główne źródło",
        "val": "Energetyka24"
      },
      {
        "label": "Weryfikacja",
        "val": "Potwierdzone (3 źródła)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Ustalenia wspólne (3 redakcje)",
        "paragraphs": [
          "W obecnej sytuacji Orlen Lietuva ma nadzwyczajne straty, a nie zyski – stwierdził minister energii Miłosz Motyka, odnosząc się do planów litewskiego rządu wprowadzenia podatku od nadmiarowych zysków koncernów paliwowych, wzorowanego niejako na polskim rozwiązaniu. [Źródło: Energetyka24, Bankier.pl, Puls Biznesu]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Energetyka24",
        "angle": "Analiza sektorowa",
        "summary": "Spór o podatek od zysków Orlen Lietuva. Minister Motyka: spółka ma nadzwyczajne straty",
        "url": "https://energetyka24.com/surowce/ropa/spor-o-podatek-od-zyskow-orlen-lietuva-minister-motyka-spolka-ma-nadzwyczajne-straty"
      },
      {
        "outlet": "Bankier.pl",
        "angle": "Doniesienie regionalne",
        "summary": "Minister energii: Orlen Litwa ma nadzwyczajne straty, a nie nadzwyczajne zyski",
        "url": "https://www.bankier.pl/wiadomosc/Orlen-Lietuva-ma-nadzwyczajne-straty-a-nie-zyski-minister-Motyka-o-windfall-tax-na-Litwie-9228430.html?utm_source=RSS&utm_medium=RSS&utm_campaign=Wiadomosci"
      },
      {
        "outlet": "Puls Biznesu",
        "angle": "Doniesienie regionalne",
        "summary": "Litwa chce wprowadzić windfall tax. „Orlen Lietuva ma nadzwyczajne straty, a nie zyski”",
        "url": "https://www.pb.pl/litwa-chce-wprowadzic-windfall-tax-orlen-lietuva-ma-nadzwyczajne-straty-a-nie-zyski-1270402"
      }
    ],
    "sources": [
      "Bankier.pl",
      "Energetyka24",
      "Puls Biznesu"
    ],
    "corrections": [],
    "summary_lead": "W obecnej sytuacji Orlen Lietuva ma nadzwyczajne straty, a nie zyski – stwierdził minister energii Miłosz Motyka, odnosząc się do planów litewskiego rządu wprowadzenia podatku od nadmiarowych zysków koncernów paliwowych, wzorowanego…",
    "meta_description": "W obecnej sytuacji Orlen Lietuva ma nadzwyczajne straty, a nie zyski – stwierdził minister energii Miłosz Motyka, odnosząc się do planów litewskiego rządu…",
    "keywords": "Energetyka, Spór, podatek, zysków, Orlen, Lietuva, Minister"
  },
  {
    "id": 18,
    "path": "/Polska/Polityka",
    "seo_url": "/Polska/Polityka/trump-odsuwa-j-v-vance-a-w-tle-wojna-i-negocjacje-z-iranem",
    "seo_title": "Trump odsuwa J.V. Vance'a. W tle wojna i negocjacje z Iranem",
    "thumbnail_url": "https://cdn.defence24.pl/2026/10/20/320x240px/2ckkEZL3mZo6X4MLhTyx0gf6w2AW2HhaKHQZHG5T.t7gd.jpg",
    "published_iso": "2026-11-13T12:56:54+01:00",
    "display_date": "13.11.2026, 12:56",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 86,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "2 redakcje"
      },
      {
        "label": "Kategoria",
        "val": "/Polska/Polityka"
      },
      {
        "label": "Główne źródło",
        "val": "Defence24"
      },
      {
        "label": "Weryfikacja",
        "val": "Potwierdzone (2 źródła)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Ustalenia wspólne (2 redakcje)",
        "paragraphs": [
          "Prezydent USA Donald Trump opublikował post, w którym opisał swoją wizję dalszej przyszłości J.D. Vance’a w swojej administracji. Wiceprezydent od teraz ma się skupić wyłącznie na polityce krajowej i zrezygnować z angażowania się w amerykańską politykę zagraniczną. [Źródło: Defence24]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "J.D. Vance wskazał wojnę z Iranem jako powód porażki Republikanów w wyborach śródokresowych. Narasta spór na najwyższych szczeblach władzy w USA — jeszcze do niedawna taki rozłam był nie do pomyślenia. [Źródło: Onet Wiadomości]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Defence24",
        "angle": "Analiza sektorowa",
        "summary": "Trump odsuwa J.V. Vance'a. W tle wojna i negocjacje z Iranem",
        "url": "https://defence24.pl/polityka-obronna/trump-odsuwa-jv-vancea-w-tle-wojna-i-negocjacje-z-iranem"
      },
      {
        "outlet": "Onet Wiadomości",
        "angle": "Relacja uzupełniająca",
        "summary": "Donald Trump odrzuca umowę z Iranem i gani J.D. Vance'a. Narasta rozłam w Białym Domu",
        "url": "https://wiadomosci.onet.pl/swiat/trump-odrzuca-umowe-z-iranem-i-gani-vancea-rozlam-w-bialym-domu/22ptr5h"
      }
    ],
    "sources": [
      "Defence24",
      "Onet Wiadomości"
    ],
    "corrections": [],
    "summary_lead": "Prezydent USA Donald Trump opublikował post, w którym opisał swoją wizję dalszej przyszłości J.D. Vance’a w swojej administracji.",
    "meta_description": "Prezydent USA Donald Trump opublikował post, w którym opisał swoją wizję dalszej przyszłości J.D. Vance’a w swojej administracji.",
    "keywords": "Polityka, Trump, odsuwa, Vance, wojna, negocjacje, Iranem"
  },
  {
    "id": 19,
    "path": "/Polska/Energetyka",
    "seo_url": "/Polska/Energetyka/plonie-rafineria-w-wolgogradzie-ukrainskie-ataki-znaczaco-zmniejszaja",
    "seo_title": "Płonie rafineria w Wołgogradzie. Ukraińskie ataki znacząco zmniejszają rosyjskie moce",
    "thumbnail_url": "https://cdn.defence24.pl/2026/11/13/320x240px/ZJENIT2LyLl26tn4mwcIbf761ei7uhDx1wXEbRhG.yh4w.png",
    "published_iso": "2026-11-13T12:56:54+01:00",
    "display_date": "13.11.2026, 12:56",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": null,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "1 redakcja"
      },
      {
        "label": "Kategoria",
        "val": "/Polska/Energetyka"
      },
      {
        "label": "Główne źródło",
        "val": "Energetyka24"
      },
      {
        "label": "Weryfikacja",
        "val": "1 źródło (lokalne/niszowe)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Relacja źródłowa (Energetyka24)",
        "paragraphs": [
          "W nocy z czwartku na piątek ukraińskie drony zaatakowały obwód wołgogradzki w europejskiej części Rosji. Celem ataku miała być Wołgogradzka Rafineria Ropy Naftowej, która należy do koncernu Łukoil. [Źródło: Energetyka24]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Energetyka24",
        "angle": "Analiza sektorowa",
        "summary": "Płonie rafineria w Wołgogradzie. Ukraińskie ataki znacząco zmniejszają rosyjskie moce",
        "url": "https://energetyka24.com/surowce/ropa/plonie-rafineria-w-wolgogradzie-ukrainskie-ataki-znaczaco-zmniejszaja-rosyjskie-moce"
      }
    ],
    "sources": [
      "Energetyka24"
    ],
    "corrections": [],
    "summary_lead": "W nocy z czwartku na piątek ukraińskie drony zaatakowały obwód wołgogradzki w europejskiej części Rosji. Celem ataku miała być Wołgogradzka Rafineria Ropy Naftowej, która należy do koncernu Łukoil.",
    "meta_description": "W nocy z czwartku na piątek ukraińskie drony zaatakowały obwód wołgogradzki w europejskiej części Rosji.",
    "keywords": "Energetyka, Płonie, rafineria, Wołgogradzie, Ukraińskie, znacząco, zmniejszają"
  },
  {
    "id": 20,
    "path": "/Polska/Energetyka",
    "seo_url": "/Polska/Energetyka/ile-zaplacisz-za-paliwo-w-weekend-bedzie-taniej-niz-w-piatek",
    "seo_title": "Ile zapłacisz za paliwo w weekend? Będzie taniej niż w piątek",
    "thumbnail_url": "https://cdn.defence24.pl/2026/09/02/320x240px/pGqjNb4kx0i6Rzsy1Sebrqa487LZAGxGizv8YAGq.diny.jpg",
    "published_iso": "2026-11-13T11:50:05+01:00",
    "display_date": "13.11.2026, 11:50",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 96,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "6 redakcji"
      },
      {
        "label": "Kategoria",
        "val": "/Polska/Energetyka"
      },
      {
        "label": "Główne źródło",
        "val": "Energetyka24"
      },
      {
        "label": "Weryfikacja",
        "val": "Potwierdzone (6 źródeł)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Ustalenia wspólne (6 redakcji)",
        "paragraphs": [
          "W najbliższą sobotę, niedzielę i poniedziałek litr benzyny 95 będzie kosztował nie więcej niż 6,02 zł, benzyny 98 – 6,66 zł, a oleju napędowego – 7,52 zł – wynika z piątkowego obwieszczenia Ministra Energii. Ceny maksymalne tych paliw będą więc niższe niż w piątek. [Źródło: Energetyka24, Rzeczpospolita, TVN24]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Kierowców czeka zmiana układu cen przy dystrybutorach i to bardzo dobra wiadomość. Warto czekać z tankowaniem benzyny i ON do jutra. Ministerstwo Energii wyznaczyło stawki na cały weekend, rozpoczynając od jutra, czyli 14 listopada. [Źródło: Auto Świat]",
          "W sobotę, niedzielę i poniedziałek (14-16.11.) na stacjach benzynowych obowiązywać będą nowe stawki. [Źródło: Biznes Interia]",
          "Za litr benzyny 95 zapłacimy 6 zł 2 gr, najmniej odkąd funkcjonuje trzecia edycja programu CPN. [Źródło: Business Insider PL]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Energetyka24",
        "angle": "Analiza sektorowa",
        "summary": "Ile zapłacisz za paliwo w weekend? Będzie taniej niż w piątek",
        "url": "https://energetyka24.com/surowce/ropa/ile-zaplacisz-za-paliwo-w-weekend-bedzie-taniej-niz-w-piatek"
      },
      {
        "outlet": "Rzeczpospolita",
        "angle": "Doniesienie regionalne",
        "summary": "Ceny paliwa na weekend. Pb 95 tanieje, trzech groszy zabrakło do piątki z przodu",
        "url": "https://energia.rp.pl/paliwa/art45484571-ceny-paliwa-na-weekend-pb-95-tanieje-trzech-groszy-zabraklo-do-piatki-z-przodu"
      },
      {
        "outlet": "Auto Świat",
        "angle": "Doniesienie regionalne",
        "summary": "Ceny paliw na weekend 14-16 listopada. PB95 za 6,02 zł, ON taniej, a LPG wita się z czwórką",
        "url": "https://www.auto-swiat.pl/wiadomosci/aktualnosci/ceny-paliw-na-weekend-14-16-listopada-taniej-choc-lpg-wita-sie-z-czworka/7rn4wlr"
      },
      {
        "outlet": "Biznes Interia",
        "angle": "Doniesienie regionalne",
        "summary": "Ile zapłacimy za paliwa w weekend i poniedziałek? Są nowe maksymalne ceny",
        "url": "https://biznes.interia.pl/gospodarka/news-maksymalne-ceny-paliw-na-weekend-tyle-zaplacimy-za-benzyne-i,nId,23573017"
      },
      {
        "outlet": "Business Insider PL",
        "angle": "Doniesienie regionalne",
        "summary": "Znamy maksymalne ceny paliw na weekend. Tankowanie znowu tańsze",
        "url": "https://businessinsider.com.pl/wiadomosci/pakiet-cpn-i-maksymalne-ceny-paliw-w-weekend-zaplacimy-mniej-za-benzyne-i-olej/1m0gcsd"
      },
      {
        "outlet": "TVN24",
        "angle": "Doniesienie regionalne",
        "summary": "Ceny paliw na weekend. Nowe stawki",
        "url": "https://tvn24.pl/biznes/pieniadze/ceny-paliw-w-polsce-14-16-listopada-2026-ile-kierowcy-zaplaca-za-litr-pb95-pb98-oraz-on-st9336990?source=rss"
      }
    ],
    "sources": [
      "Auto Świat",
      "Biznes Interia",
      "Business Insider PL",
      "Energetyka24",
      "Rzeczpospolita",
      "TVN24"
    ],
    "corrections": [],
    "summary_lead": "W najbliższą sobotę, niedzielę i poniedziałek litr benzyny 95 będzie kosztował nie więcej niż 6,02 zł, benzyny 98 – 6,66 zł, a oleju napędowego – 7,52 zł – wynika z piątkowego obwieszczenia Ministra Energii.",
    "meta_description": "W najbliższą sobotę, niedzielę i poniedziałek litr benzyny 95 będzie kosztował nie więcej niż 6,02 zł, benzyny 98 – 6,66 zł, a oleju napędowego – 7,52 zł –…",
    "keywords": "Energetyka, zapłacisz, paliwo, weekend, taniej"
  },
  {
    "id": 21,
    "path": "/Polska",
    "seo_url": "/Polska/lukasz-gibala-z-pilna-prosba-do-donalda-tuska-padla-kwota-10-mln",
    "seo_title": "Łukasz Gibała z \"pilną prośbą\" do Donalda Tuska. Padła kwota 10 mln",
    "thumbnail_url": "https://ipla.pluscdn.pl/dituel/cp/en/enyo3ijimz77f4uk7mmd8iaertks9bdq.jpeg",
    "published_iso": "2026-11-13T11:50:05+01:00",
    "display_date": "13.11.2026, 11:50",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 92,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "3 redakcje"
      },
      {
        "label": "Kategoria",
        "val": "/Polska"
      },
      {
        "label": "Główne źródło",
        "val": "Polsat News"
      },
      {
        "label": "Weryfikacja",
        "val": "Potwierdzone (3 źródła)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Ustalenia wspólne (3 redakcje)",
        "paragraphs": [
          "Zwróciłem się do premiera Donalda Tuska z pilną prośbą o przyznanie z budżetu państwa 10 mln zł – przekazał prezydent Krakowa Łukasz Gibała na platformie X. Pieniądze mają zostać przeznaczone na wyposażenie Centrum Bezpieczeństwa i Monitoringu Miasta. [Źródło: Polsat News, Niezależna.pl]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Mowa o kwocie 10 mln złotych. Wniosek to pokłosie tragicznej strzelaniny na Rynku Głównym. [Źródło: Interia Wydarzenia]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Polsat News",
        "angle": "Relacja wiodąca",
        "summary": "Łukasz Gibała z \"pilną prośbą\" do Donalda Tuska. Padła kwota 10 mln",
        "url": "https://www.polsatnews.pl/wiadomosc/2026-11-13/lukasz-gibala-z-pilna-prosba-do-donalda-tuska-padla-kwota-10-mln/"
      },
      {
        "outlet": "Interia Wydarzenia",
        "angle": "Relacja uzupełniająca",
        "summary": "Gibała zwrócił się do Tuska, \"pilna prośba\". Ma poparcie parlamentarzystów",
        "url": "https://wydarzenia.interia.pl/malopolskie/news-gibala-zwrocil-sie-do-tuska-pilna-prosba-ma-poparcie-parlame,nId,23573009"
      },
      {
        "outlet": "Niezależna.pl",
        "angle": "Relacja uzupełniająca",
        "summary": "Gibała zwrócił się do Tuska o pieniądze",
        "url": "https://niezalezna.pl/polska/gibala-zwrocil-sie-do-tuska-o-pieniadze/584088"
      }
    ],
    "sources": [
      "Interia Wydarzenia",
      "Niezależna.pl",
      "Polsat News"
    ],
    "corrections": [],
    "summary_lead": "Zwróciłem się do premiera Donalda Tuska z pilną prośbą o przyznanie z budżetu państwa 10 mln zł – przekazał prezydent Krakowa Łukasz Gibała na platformie X.",
    "meta_description": "Zwróciłem się do premiera Donalda Tuska z pilną prośbą o przyznanie z budżetu państwa 10 mln zł – przekazał prezydent Krakowa Łukasz Gibała na platformie X.",
    "keywords": "Polska, Łukasz, Gibała, pilną, prośbą, Donalda, Tuska"
  },
  {
    "id": 22,
    "path": "/Polska",
    "seo_url": "/Polska/rece-precz-od-republiki-atak-na-biuro-posla-ko",
    "seo_title": "„Ręce precz od Republiki”. Atak na biuro posła KO",
    "thumbnail_url": "https://rmf.rmffm.pl/news/attachments/6b/5a/michal-jaros-fot-636x421-6b5af87c.jpg",
    "published_iso": "2026-11-13T11:50:05+01:00",
    "display_date": "13.11.2026, 11:50",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 90,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "3 redakcje"
      },
      {
        "label": "Kategoria",
        "val": "/Polska"
      },
      {
        "label": "Główne źródło",
        "val": "RMF24"
      },
      {
        "label": "Weryfikacja",
        "val": "Potwierdzone (3 źródła)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Ustalenia wspólne (3 redakcje)",
        "paragraphs": [
          "Nieznani sprawcy pomalowali farbą filię biura poselskiego Michała Jarosa w Trzebnicy. Na witrynach i elewacji budynku pojawiły się hasła odnoszące się do Telewizji Republika i premiera Donalda Tuska. [Źródło: WP Wiadomości]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "— Skoro już robicie Republice reklamę, mam dobrą wiadomość.",
          "Przy biurze też są kamery – komentuje w rozmowie z Wirtualną Polską wiceminister rozwoju, poseł Koalicji Obywatelskiej. [Źródło: Onet Wiadomości]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "RMF24",
        "angle": "Relacja wiodąca",
        "summary": "„Ręce precz od Republiki”. Atak na biuro posła KO",
        "url": "https://www.rmf24.pl/fakty/polska/news-rece-precz-od-republiki-atak-na-biuro-posla-ko,nIdn,1025994"
      },
      {
        "outlet": "WP Wiadomości",
        "angle": "Relacja uzupełniająca",
        "summary": "\"Ręce precz od Republiki\". Zdewastowali biuro wiceministra",
        "url": "https://wiadomosci.wp.pl/rece-precz-od-republiki-zdewastowali-biuro-wiceministra-7350539292428320a"
      },
      {
        "outlet": "Onet Wiadomości",
        "angle": "Relacja uzupełniająca",
        "summary": "\"Ręce precz od Republiki\". Ktoś zdewastował fasadę biura posła KO Michała Jarosa",
        "url": "https://wiadomosci.onet.pl/wroclaw/rece-precz-od-republiki-ktos-zdewastowal-fasade-biura-posla-michala-jarosa/f6xz2cy"
      }
    ],
    "sources": [
      "Onet Wiadomości",
      "RMF24",
      "WP Wiadomości"
    ],
    "corrections": [],
    "summary_lead": "Nieznani sprawcy pomalowali farbą filię biura poselskiego Michała Jarosa w Trzebnicy. Na witrynach i elewacji budynku pojawiły się hasła odnoszące się do Telewizji Republika i premiera Donalda Tuska.",
    "meta_description": "Nieznani sprawcy pomalowali farbą filię biura poselskiego Michała Jarosa w Trzebnicy.",
    "keywords": "Polska, Ręce, precz, Republiki, biuro, posła"
  },
  {
    "id": 23,
    "path": "/Polska",
    "seo_url": "/Polska/stan-rannych-w-zamachu-systematycznie-sie-poprawia-ale-pozostaja-w",
    "seo_title": "Stan rannych w zamachu systematycznie się poprawia, ale pozostają w szpitalach",
    "thumbnail_url": "",
    "published_iso": "2026-11-13T11:50:05+01:00",
    "display_date": "13.11.2026, 11:50",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 94,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "3 redakcje"
      },
      {
        "label": "Kategoria",
        "val": "/Polska"
      },
      {
        "label": "Główne źródło",
        "val": "Niedziela.pl"
      },
      {
        "label": "Weryfikacja",
        "val": "Potwierdzone (3 źródła)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Ustalenia wspólne (3 redakcje)",
        "paragraphs": [
          "11 rannych w tragicznym ataku w Krakowie pozostaje w pięciu krakowskich szpitalach. Ich stan systematycznie się poprawia – przekazał w piątek rano wojewoda małopolski Krzysztof Jan Klęczar. [Źródło: Niedziela.pl, Radio Kielce, RadioMaryja.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Niedziela.pl",
        "angle": "Relacja wiodąca",
        "summary": "Stan rannych w zamachu systematycznie się poprawia, ale pozostają w szpitalach",
        "url": "https://www.niedziela.pl/artykul/129806/Stan-rannych-w-zamachu-systematycznie-sie-poprawia-ale-pozostaja-w-szpitalach"
      },
      {
        "outlet": "Radio Kielce",
        "angle": "Doniesienie regionalne",
        "summary": "Stan rannych w zamachu poprawia się, ale pozostają w szpitalach",
        "url": "https://radiokielce.pl/1457434/stan-rannych-w-zamachu-poprawia-sie-ale-pozostaja-w-szpitalach/"
      },
      {
        "outlet": "RadioMaryja.pl",
        "angle": "Relacja uzupełniająca",
        "summary": "Kraków: stan rannych w zamachu systematycznie się poprawia, ale pozostają w szpitalach",
        "url": "https://www.radiomaryja.pl/informacje/krakow-stan-rannych-w-zamachu-systematycznie-sie-poprawia-ale-pozostaja-w-szpitalach/"
      }
    ],
    "sources": [
      "Niedziela.pl",
      "Radio Kielce",
      "RadioMaryja.pl"
    ],
    "corrections": [],
    "summary_lead": "11 rannych w tragicznym ataku w Krakowie pozostaje w pięciu krakowskich szpitalach. Ich stan systematycznie się poprawia – przekazał w piątek rano wojewoda małopolski Krzysztof Jan Klęczar.",
    "meta_description": "11 rannych w tragicznym ataku w Krakowie pozostaje w pięciu krakowskich szpitalach.",
    "keywords": "Polska, Stan, rannych, zamachu, systematycznie, poprawia, pozostają"
  },
  {
    "id": 24,
    "path": "/Polska/Polityka",
    "seo_url": "/Polska/Polityka/cyberatak-w-niemczech-przez-producenta-dronow-hakerzy-trafili-do",
    "seo_title": "Cyberatak w Niemczech. Przez producenta dronów hakerzy trafili do niemieckiej armii",
    "thumbnail_url": "https://i.gremicdn.pl/image/free/60e3dd06e527c52f1f3e1a8d52db7605/dron-rozpoznawczy-vector?t=crop:4349:1901:nowe:0:129,resize:fill:600:300,enlarge:1",
    "published_iso": "2026-11-13T10:54:04+01:00",
    "display_date": "13.11.2026, 10:54",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 98,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "6 redakcji"
      },
      {
        "label": "Kategoria",
        "val": "/Polska/Polityka"
      },
      {
        "label": "Główne źródło",
        "val": "Rzeczpospolita"
      },
      {
        "label": "Weryfikacja",
        "val": "Potwierdzone (6 źródeł)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Ustalenia wspólne (6 redakcji)",
        "paragraphs": [
          "Na serwerze z aktualizacjami oprogramowania monachijskiego producenta dronów Quantum Systems, który dostarcza drony zarówno niemieckiej, jak i ukraińskiej armii, pojawiło się szkodliwe oprogramowanie. O sprawie pisze „Der Spiegel”. Jako pierwszy o incydencie poinformował brytyjski dziennik „Financial Times”. [Źródło: Rzeczpospolita, Bankier.pl, CyberDefence24, RMF24, Dziennik.pl, TVN24]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Rzeczpospolita",
        "angle": "Relacja wiodąca",
        "summary": "Cyberatak w Niemczech. Przez producenta dronów hakerzy trafili do niemieckiej armii",
        "url": "https://radar.rp.pl/przemysl-obronny/art45484091-cyberatak-w-niemczech-przez-producenta-dronow-hakerzy-trafili-do-niemieckiej-armii"
      },
      {
        "outlet": "Bankier.pl",
        "angle": "Perspektywa rynkowa",
        "summary": "Cyberatak na producenta dronów. Niemcy uziemiają flotę \"Sokołów\"",
        "url": "https://www.bankier.pl/wiadomosc/Cyberatak-na-producenta-dronow-Niemcy-uziemiaja-flote-Sokolow-9228335.html?utm_source=RSS&utm_medium=RSS&utm_campaign=Wiadomosci"
      },
      {
        "outlet": "CyberDefence24",
        "angle": "Kontekst technologiczny",
        "summary": "Producent dronów dla Niemiec i Ukrainy ofiarą cyberataku. Bundeswehra uziemiła bezzałogowce",
        "url": "https://cyberdefence24.pl/armia-i-sluzby/cyberatak-na-niemieckiego-producenta-bundeswehra-uziemila-drony"
      },
      {
        "outlet": "RMF24",
        "angle": "Relacja uzupełniająca",
        "summary": "Flota niemieckiej armii była uziemiona. Cyberatak na producenta dronów",
        "url": "https://www.rmf24.pl/fakty/swiat/news-flota-niemieckiej-armii-byla-uziemiona-cyberatak-na-producen,nIdn,1025972"
      },
      {
        "outlet": "Dziennik.pl",
        "angle": "Relacja uzupełniająca",
        "summary": "Cyberatak na producenta dronów dla Bundeswehry i Ukrainy. Uziemiono flotę",
        "url": "https://wiadomosci.dziennik.pl/swiat/artykuly/11344131,cyberatak-na-producenta-dronow-dla-bundeswehry-i-ukrainy-uziemiono-fl.html"
      },
      {
        "outlet": "TVN24",
        "angle": "Relacja uzupełniająca",
        "summary": "Cyberatak na producenta dronów dla armii Niemiec i Ukrainy",
        "url": "https://tvn24.pl/biznes/ze-swiata/quantum-systems-cyberatak-na-producenta-dronow-dla-armii-niemiec-i-ukrainy-st9337163?source=rss"
      }
    ],
    "sources": [
      "Bankier.pl",
      "CyberDefence24",
      "Dziennik.pl",
      "RMF24",
      "Rzeczpospolita",
      "TVN24"
    ],
    "corrections": [],
    "summary_lead": "Na serwerze z aktualizacjami oprogramowania monachijskiego producenta dronów Quantum Systems, który dostarcza drony zarówno niemieckiej, jak i ukraińskiej armii, pojawiło się szkodliwe oprogramowanie. O sprawie pisze „Der Spiegel”.",
    "meta_description": "Na serwerze z aktualizacjami oprogramowania monachijskiego producenta dronów Quantum Systems, który dostarcza drony zarówno niemieckiej, jak i ukraińskiej…",
    "keywords": "Polityka, Cyberatak, Niemczech, producenta, dronów, hakerzy, trafili"
  },
  {
    "id": 25,
    "path": "/Polska/Gospodarka",
    "seo_url": "/Polska/Gospodarka/jak-bardzo-wzrosly-ceny-sa-nowe-dane-o-inflacji",
    "seo_title": "Jak bardzo wzrosły ceny? Są nowe dane o inflacji",
    "thumbnail_url": "https://webp-konwerter.incdn.pl/eyJmIjoiaHR0cHM6Ly9pbmZvci13ZWItc3RhdGljLWZvc/nNhbC5pbmNkbi5wbC9mb3JzYWwvZG9jdW1lbnRzL0ZPQj/AwMDAwMDAwMDAwMDc3MDE1NDcvZmlsZXMvc3VwZXJtYXJ/rZXQtemFrdXB5LTM5MzA4MzM0LmpwZyIsInciOjM4NDB9",
    "published_iso": "2026-11-13T10:54:04+01:00",
    "display_date": "13.11.2026, 10:54",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 94,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "4 redakcje"
      },
      {
        "label": "Kategoria",
        "val": "/Polska/Gospodarka"
      },
      {
        "label": "Główne źródło",
        "val": "Forsal.pl"
      },
      {
        "label": "Weryfikacja",
        "val": "Potwierdzone (4 źródła)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Ustalenia wspólne (4 redakcje)",
        "paragraphs": [
          "Główny Urząd Statystyczny podał dziś najnowsze dane. [Źródło: Forsal.pl, Biznes Interia]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Okazały się one zgodne z tzw. odczytem flash. [Źródło: Puls Biznesu]",
          "W porównaniu z poprzednim miesiącem ceny towarów i usług spadły o 0,4 procent. [Źródło: TVN24]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Forsal.pl",
        "angle": "Raport rynkowy",
        "summary": "Jak bardzo wzrosły ceny? Są nowe dane o inflacji",
        "url": "https://forsal.pl/gospodarka/inflacja/artykuly/11344132,jak-bardzo-wzrosly-ceny-sa-nowe-dane-o-inflacji.html"
      },
      {
        "outlet": "Puls Biznesu",
        "angle": "Perspektywa rynkowa",
        "summary": "GUS potwierdził mocny spadek inflacji w październiku. Są finalne dane",
        "url": "https://www.pb.pl/gus-potwierdzil-mocny-spadek-inflacji-w-pazdzierniku-sa-finalne-dane-1270383"
      },
      {
        "outlet": "TVN24",
        "angle": "Relacja uzupełniająca",
        "summary": "Inflacja w Polsce. Nowe dane",
        "url": "https://tvn24.pl/biznes/pieniadze/inflacja-w-pazdzierniku-2026-w-polsce-najnowsze-dane-gus-st9336880?source=rss"
      },
      {
        "outlet": "Biznes Interia",
        "angle": "Perspektywa rynkowa",
        "summary": "Wiadomo, co z cenami w październiku. GUS podał nowe dane o inflacji",
        "url": "https://biznes.interia.pl/gospodarka/news-wiadomo-co-z-cenami-w-pazdzierniku-gus-podal-nowe-dane-o-inf,nId,23572876"
      }
    ],
    "sources": [
      "Biznes Interia",
      "Forsal.pl",
      "Puls Biznesu",
      "TVN24"
    ],
    "corrections": [],
    "summary_lead": "Główny Urząd Statystyczny podał dziś najnowsze dane.",
    "meta_description": "Główny Urząd Statystyczny podał dziś najnowsze dane. Okazały się one zgodne z tzw. odczytem flash.",
    "keywords": "Gospodarka, wzrosły, ceny, dane, inflacji"
  },
  {
    "id": 26,
    "path": "/Polska/Gospodarka",
    "seo_url": "/Polska/Gospodarka/przelewy-natychmiastowe-w-ii-kw-2026-kolejne-rekordy-express-elixira",
    "seo_title": "Przelewy natychmiastowe w II kw. 2026: kolejne rekordy Express Elixira, BlueCash z wzrostem wartości",
    "thumbnail_url": "https://cashless.86eccc8cd4d75212496aabd35095cfe4.eu.r2.cloudflarestorage.com/system/uploads/ckeditor/pictures/3417/content_kir.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&amp;X-Amz-Credential=3b14ef0c715f100a6ab42ce1213f28b0%2F20261109%2Fauto%2Fs3%2Faws4_request&amp;X-Amz-Date=20261109T000000Z&amp;X-Amz-Expires=604800&amp;X-Amz-SignedHeaders=host&amp;X-Amz-Signature=44b18807085014473919410b46f412b0996c489c3a96d45ef84011e8a9ad4ae6",
    "published_iso": "2026-11-13T10:54:04+01:00",
    "display_date": "13.11.2026, 10:54",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 90,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "2 redakcje"
      },
      {
        "label": "Kategoria",
        "val": "/Polska/Gospodarka"
      },
      {
        "label": "Główne źródło",
        "val": "Cashless.pl"
      },
      {
        "label": "Weryfikacja",
        "val": "Potwierdzone (2 źródła)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Ustalenia wspólne (2 redakcje)",
        "paragraphs": [
          "W przypadku Express Elixira przelewy na telefon Blik stanowiły 82 proc. liczby i 28 proc. wartości rozliczeń w systemie Narodowy Bank Polski opublikował analizy dotyczące cyklicznie monitorowanych przez bank centralny danych dotyczących liczby transakcji oszukańczych, kart płatniczych czy cen usług bankowych za II kw. 2026 r. i wyniosła w analizowanym okresie 520 zł. [Źródło: Cashless.pl, MamStartup.pl]",
          "W perspektywie ostatnich lat widać, że wartość przelewów znów wykazuje tendencję wzrostową (po kilku dołkach, jak w II I kw. [Źródło: Cashless.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Cashless.pl",
        "angle": "Relacja wiodąca",
        "summary": "Przelewy natychmiastowe w II kw. 2026: kolejne rekordy Express Elixira, BlueCash z wzrostem wartości",
        "url": "https://www.cashless.pl/19958-nbp-express-elixir-autopay-blue-cash"
      },
      {
        "outlet": "MamStartup.pl",
        "angle": "Perspektywa rynkowa",
        "summary": "SKOK-i dołączają do Express Elixir. Klienci zyskają dostęp do przelewów natychmiastowych i P2P Blikiem",
        "url": "https://mamstartup.pl/skok-i-dolaczaja-do-express-elixir-klienci-zyskaja-dostep-do-przelewow-natychmiastowych-i-p2p-blikiem/"
      }
    ],
    "sources": [
      "Cashless.pl",
      "MamStartup.pl"
    ],
    "corrections": [],
    "summary_lead": "W przypadku Express Elixira przelewy na telefon Blik stanowiły 82 proc. liczby i 28 proc. wartości rozliczeń w systemie Narodowy Bank Polski opublikował analizy dotyczące cyklicznie monitorowanych przez bank centralny danych…",
    "meta_description": "W przypadku Express Elixira przelewy na telefon Blik stanowiły 82 proc. liczby i 28 proc. wartości rozliczeń w systemie Narodowy Bank Polski opublikował…",
    "keywords": "Gospodarka, Przelewy, natychmiastowe, rekordy, Express, Elixira, BlueCash"
  },
  {
    "id": 27,
    "path": "/Polska/Gospodarka",
    "seo_url": "/Polska/Gospodarka/blik-place-pozniej-z-opcja-rat-bank-millennium-otwiera-nowy-rozdzial-w",
    "seo_title": "Blik Płacę Później z opcją rat. Bank Millennium otwiera nowy rozdział w płatnościach odroczonych",
    "thumbnail_url": "https://mamstartup.pl/wp-content/uploads/2023/02/blik.jpg",
    "published_iso": "2026-11-13T10:54:04+01:00",
    "display_date": "13.11.2026, 10:54",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 86,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "2 redakcje"
      },
      {
        "label": "Kategoria",
        "val": "/Polska/Gospodarka"
      },
      {
        "label": "Główne źródło",
        "val": "MamStartup.pl"
      },
      {
        "label": "Weryfikacja",
        "val": "Potwierdzone (2 źródła)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Ustalenia wspólne (2 redakcje)",
        "paragraphs": [
          "Usługa Blik Płacę Później przestaje być wyłącznie narzędziem do jednorazowego odraczania płatności o 30 dni. Bank Millennium wprowadził jako pierwszy na rynku możliwość rozkładania takich transakcji na miesięczne raty. Z rozwiązania mogą korzystać zarówno dotychczasowi, jak i nowi użytkownicy. [Źródło: MamStartup.pl]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Należności mogą spłacać w trzech, sześciu lub 12 ratach. Oprocentowanie zadłużenia naliczane jest od momentu zakupu, a odsetki wynoszą 14,5 proc. rocznie. Nie ma dodatkowej prowizji za skorzystanie z rat. [Źródło: Cashless.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "MamStartup.pl",
        "angle": "Relacja wiodąca",
        "summary": "Blik Płacę Później z opcją rat. Bank Millennium otwiera nowy rozdział w płatnościach odroczonych",
        "url": "https://mamstartup.pl/blik-place-pozniej-z-opcja-rat-bank-millennium-otwiera-nowy-rozdzial-w-platnosciach-odroczonych/"
      },
      {
        "outlet": "Cashless.pl",
        "angle": "Perspektywa rynkowa",
        "summary": "Blik Płacę Później to już nie tylko płatności odroczone. Millennium wprowadza w ramach tej usługi raty",
        "url": "https://www.cashless.pl/19954-blik-place-pozniej-millennium-raty"
      }
    ],
    "sources": [
      "Cashless.pl",
      "MamStartup.pl"
    ],
    "corrections": [],
    "summary_lead": "Usługa Blik Płacę Później przestaje być wyłącznie narzędziem do jednorazowego odraczania płatności o 30 dni. Bank Millennium wprowadził jako pierwszy na rynku możliwość rozkładania takich transakcji na miesięczne raty.",
    "meta_description": "Usługa Blik Płacę Później przestaje być wyłącznie narzędziem do jednorazowego odraczania płatności o 30 dni.",
    "keywords": "Gospodarka, Blik, Płacę, Później, opcją, Bank, Millennium"
  },
  {
    "id": 28,
    "path": "/Polska/Gospodarka",
    "seo_url": "/Polska/Gospodarka/cena-euro-dolara-i-franka-kursy-walut-13-11-2026",
    "seo_title": "Cena euro, dolara i franka. Kursy walut 13.11.2026",
    "thumbnail_url": "https://webp-konwerter.incdn.pl/eyJmIjoiaHR0cHM6Ly9pbmZvci13ZWItc3RhdGljLWZvcnNhbC5pbmN/kbi5wbC9mb3JzYWwvZG9jdW1lbnRzL0ZPQjAwMDAwMDAwMDAwMDc2OD/E1MjQvZmlsZXMvd2FsdXRhLXdhbHV0eS1ub3Rvd2FuaWEtZWJ1cnktd/3J6ZXNpZW4tb2JsaWdhY2plLTM5MjgzNjA2LnBuZyIsInciOjM4NDB9",
    "published_iso": "2026-11-13T09:54:25+01:00",
    "display_date": "13.11.2026, 09:54",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 90,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "3 redakcje"
      },
      {
        "label": "Kategoria",
        "val": "/Polska/Gospodarka"
      },
      {
        "label": "Główne źródło",
        "val": "Forsal.pl"
      },
      {
        "label": "Weryfikacja",
        "val": "Potwierdzone (3 źródła)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Ustalenia wspólne (3 redakcje)",
        "paragraphs": [
          "Dziś Główny Urząd Statystyczny opublikował nowe dane o PKB i inflacji, ale zdaniem analityków informacje te raczej nie będą istotnym wsparciem dla krajowej waluty. [Źródło: Forsal.pl]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "W piątek za jednego dolara (USD) trzeba zapłacić 3.983 zł. [Źródło: Money.pl]",
          "W piątek, 13.11.2026 r. o poranku polski złoty wyraźnie traci względem głównych konkurentów na rynku Forex. Dzisiejsza sesja charakteryzuje się następującymi zmianami na parach walutowych: GBP/PLN (-0,03%), CHF/PLN (-0,02%), USD/PLN (+0,06%) oraz EUR/PLN (+0,10%). Największa zmienność występuje w przypadku euro, które wraca w rejon 4,40 zł. Para walutowa dolar-złoty wraca okolice 3,98 zł Notowania EUR/PLN. [Źródło: Comparic.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Forsal.pl",
        "angle": "Raport rynkowy",
        "summary": "Cena euro, dolara i franka. Kursy walut 13.11.2026",
        "url": "https://forsal.pl/finanse/waluty/artykuly/11344111,cena-euro-dolara-i-franka-kursy-walut-13112026.html"
      },
      {
        "outlet": "Money.pl",
        "angle": "Perspektywa rynkowa",
        "summary": "Ile kosztuje dolar? Kurs dolara do złotego PLN/USD 13.11.2026",
        "url": "https://www.money.pl/pieniadze/ile-kosztuje-dolar-kurs-dolara-do-zlotego-pln-usd-13-11-2026-7350476023773184a.html"
      },
      {
        "outlet": "Comparic.pl",
        "angle": "Perspektywa rynkowa",
        "summary": "Dolar zmierza w stronę 4 zł! Co z kursem złotego w piątek 13.11.2026 r.?",
        "url": "https://comparic.pl/dolar-zmierza-w-strone-4-zl-co-z-kursem-zlotego-w-piatek-13-11-2026-r/"
      }
    ],
    "sources": [
      "Comparic.pl",
      "Forsal.pl",
      "Money.pl"
    ],
    "corrections": [],
    "summary_lead": "Dziś Główny Urząd Statystyczny opublikował nowe dane o PKB i inflacji, ale zdaniem analityków informacje te raczej nie będą istotnym wsparciem dla krajowej waluty.",
    "meta_description": "Dziś Główny Urząd Statystyczny opublikował nowe dane o PKB i inflacji, ale zdaniem analityków informacje te raczej nie będą istotnym wsparciem dla krajowej…",
    "keywords": "Gospodarka, Cena, euro, dolara, franka, Kursy, walut"
  },
  {
    "id": 29,
    "path": "/Polska",
    "seo_url": "/Polska/eksplozja-auta-w-moskwie-na-pokladzie-postac-z-otoczenia-bylego",
    "seo_title": "Eksplozja auta w Moskwie. Na pokładzie postać z otoczenia byłego premiera Ukrainy",
    "thumbnail_url": "https://ipla.pluscdn.pl/dituel/cp/hh/hhs32zkd5svjag7ov2w4q4hoyopm8ckf.jpeg",
    "published_iso": "2026-11-13T09:54:25+01:00",
    "display_date": "13.11.2026, 09:54",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 90,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "3 redakcje"
      },
      {
        "label": "Kategoria",
        "val": "/Polska"
      },
      {
        "label": "Główne źródło",
        "val": "Polsat News"
      },
      {
        "label": "Weryfikacja",
        "val": "Potwierdzone (3 źródła)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Ustalenia wspólne (3 redakcje)",
        "paragraphs": [
          "Były rzecznik prasowy dawnego premiera Ukrainy Mykoły Azarowa ucierpiał w wyniku wybuchu samochodu w Moskwie – podają rosyjskie media. Mężczyzna przetransportowany został do szpitala. To już druga eksplozja auta w Rosji w ciągu dwóch dni. [Źródło: Polsat News]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Rankiem 13 listopada SUV eksplodował na ul. Kirowogradzkiej w moskiewskiej dzielnicy Czertanowo, prawdopodobnie w wyniku detonacji podłożonego pod nim ładunku wybuchowego. [Źródło: Onet Wiadomości]",
          "Ranny został w ciężkim stanie przewieziony do szpitala. [Źródło: Interia Wydarzenia]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Polsat News",
        "angle": "Relacja wiodąca",
        "summary": "Eksplozja auta w Moskwie. Na pokładzie postać z otoczenia byłego premiera Ukrainy",
        "url": "https://www.polsatnews.pl/wiadomosc/2026-11-13/eksplozja-auta-w-moskwie-na-pokladzie-postac-z-otoczenia-bylego-premiera-ukrainy/"
      },
      {
        "outlet": "Onet Wiadomości",
        "angle": "Relacja uzupełniająca",
        "summary": "Eksplozja w Moskwie. Ranny były rzecznik premiera Ukrainy",
        "url": "https://wiadomosci.onet.pl/swiat/eksplozja-w-moskwie-ranny-byly-rzecznik-premiera-ukrainy/m60leds"
      },
      {
        "outlet": "Interia Wydarzenia",
        "angle": "Relacja uzupełniająca",
        "summary": "Eksplozja w Moskwie. Media: Ranny rzecznik byłego premiera Ukrainy",
        "url": "https://wydarzenia.interia.pl/ukraina-rosja/news-eksplozja-w-moskwie-media-ranny-rzecznik-bylego-premiera-ukr,nId,23572951"
      }
    ],
    "sources": [
      "Interia Wydarzenia",
      "Onet Wiadomości",
      "Polsat News"
    ],
    "corrections": [],
    "summary_lead": "Były rzecznik prasowy dawnego premiera Ukrainy Mykoły Azarowa ucierpiał w wyniku wybuchu samochodu w Moskwie – podają rosyjskie media. Mężczyzna przetransportowany został do szpitala.",
    "meta_description": "Były rzecznik prasowy dawnego premiera Ukrainy Mykoły Azarowa ucierpiał w wyniku wybuchu samochodu w Moskwie – podają rosyjskie media.",
    "keywords": "Polska, Eksplozja, auta, Moskwie, pokładzie, postać, otoczenia"
  },
  {
    "id": 30,
    "path": "/Polska/Polityka",
    "seo_url": "/Polska/Polityka/pracowal-w-nato-i-szpiegowal-na-rzecz-rosji-podpulkownika-us-army",
    "seo_title": "Pracował w NATO i szpiegował na rzecz Rosji? Podpułkownika US Army zatrzymano w Wielkiej Brytanii",
    "thumbnail_url": "https://cdn.defence24.pl/2026/09/22/320x240px/IiLUUjKK7gS1SRXVVQHfvzAS533Rs3p1wfV8Qyxw.zxla.jpg",
    "published_iso": "2026-11-13T09:54:25+01:00",
    "display_date": "13.11.2026, 09:54",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 86,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "2 redakcje"
      },
      {
        "label": "Kategoria",
        "val": "/Polska/Polityka"
      },
      {
        "label": "Główne źródło",
        "val": "InfoSecurity24"
      },
      {
        "label": "Weryfikacja",
        "val": "Potwierdzone (2 źródła)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Ustalenia wspólne (2 redakcje)",
        "paragraphs": [
          "Amerykański oficer pełniący służbę w dowództwie Sojuszniczego Korpusu Szybkiego Reagowania NATO został zatrzymany w Wielkiej Brytanii w związku z podejrzeniem szpiegostwa na rzecz Rosji. Według ustaleń mediów ma stopień podpułkownika, pracował w pionie kadrowym i był uprawniony do zapoznawania się z materiałami oznaczonymi klauzulą „NATO Secret”. [Źródło: InfoSecurity24]",
          "Stopień wojskowy oraz miejsce służby nadają sprawie szczególne znaczenie. Z doniesień prasowych wynika jednocześnie, że działania służb mogły zapobiec przekazaniu informacji Moskwie. [Źródło: InfoSecurity24]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Urzędnik wysyłał maila, a kopia szła do Moskwy. [Źródło: Spider's Web]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "InfoSecurity24",
        "angle": "Analiza sektorowa",
        "summary": "Pracował w NATO i szpiegował na rzecz Rosji? Podpułkownika US Army zatrzymano w Wielkiej Brytanii",
        "url": "https://infosecurity24.pl/za-granica/pracowal-w-nato-i-szpiegowal-na-rzecz-rosji-podpulkownika-us-army-zatrzymano-w-wielkiej-brytanii"
      },
      {
        "outlet": "Spider's Web",
        "angle": "Kontekst technologiczny",
        "summary": "Urzędnik wysyłał maila, a kopia szła do Moskwy. Rosjanie szpiegowali NATO i UE",
        "url": "https://spidersweb.pl/2026/11/rosja-szpiegostwo-maile-nato-ue-eset.html"
      }
    ],
    "sources": [
      "InfoSecurity24",
      "Spider's Web"
    ],
    "corrections": [],
    "summary_lead": "Amerykański oficer pełniący służbę w dowództwie Sojuszniczego Korpusu Szybkiego Reagowania NATO został zatrzymany w Wielkiej Brytanii w związku z podejrzeniem szpiegostwa na rzecz Rosji.",
    "meta_description": "Amerykański oficer pełniący służbę w dowództwie Sojuszniczego Korpusu Szybkiego Reagowania NATO został zatrzymany w Wielkiej Brytanii w związku z…",
    "keywords": "Polityka, Pracował, NATO, szpiegował, rzecz, Rosji, Podpułkownika"
  }
];

const CANONICAL_ORIGIN = (
  typeof window !== 'undefined' && typeof window.VERITY_CANONICAL_ORIGIN === 'string' && window.VERITY_CANONICAL_ORIGIN
) ? window.VERITY_CANONICAL_ORIGIN.replace(/\/+$/, '') : 'https://hygrisxx.github.io/verity-';

const PATH_TITLES = {
  '/Polska': 'Polska — wszystkie działy',
  '/Polska/Gospodarka': 'Gospodarka i rynek',
  '/Polska/Polityka': 'Polityka i prawo',
  '/Polska/Energetyka': 'Energetyka i klimat',
  '/Polska/Poznan': 'Poznań i Wielkopolska',
  '/Swiat': 'Świat i geopolityka',
  '/Sport': 'Sport'
};

const PATH_DESCRIPTIONS = {
  '/Polska': 'Najważniejsze potwierdzone informacje z Polski — weryfikacja krzyżowa z 97 redakcji.',
  '/Polska/Gospodarka': 'Zweryfikowane informacje o gospodarce, finansach, podatkach, giełdzie i biznesie w Polsce.',
  '/Polska/Polityka': 'Fakty i decyzje legislacyjne z wielu źródeł, bez komentarzy publicystycznych.',
  '/Polska/Energetyka': 'Ceny energii, transformacja energetyczna, OZE, gaz i rynek paliw w Polsce.',
  '/Polska/Poznan': 'Najważniejsze informacje z Poznania i Wielkopolski — transport, inwestycje i wydarzenia lokalne.',
  '/Swiat': 'Potwierdzone depesze ze świata, bezpieczeństwo międzynarodowe, technologie i cyberbezpieczeństwo.',
  '/Sport': 'Wyniki, rozgrywki reprezentacji i najważniejsze wydarzenia sportowe w faktograficznym skrócie.'
};

const ROOT_URL = (() => {
  if (typeof window === 'undefined' || typeof location === 'undefined') return '/';
  let baseHint = typeof window.VERITY_BASE === 'string' ? window.VERITY_BASE : '';
  const isHttp = location.protocol === 'http:' || location.protocol === 'https:';
  if (window.VERITY_IS_404 && baseHint.startsWith('/') && !location.pathname.startsWith(baseHint)) {
    baseHint = '/';
  }
  let hrefBase = location.href;
  if (baseHint === '' && !location.pathname.endsWith('/') && !location.pathname.endsWith('.html')) {
    hrefBase = location.origin + location.pathname + '/' + location.search + location.hash;
  }
  try {
    const resolved = new URL(baseHint || './', hrefBase);
    return isHttp ? resolved.pathname : resolved.href;
  } catch (e) {
    return '/';
  }
})();

let currentPath = '/Polska';
let currentView = 'public';
let activeArticleId = null;
let isNotFoundState = Boolean(typeof window !== 'undefined' && window.VERITY_IS_404);
let lastFeedHref = null;

// ===========================================================================
// NARZĘDZIA, TYPOGRAFIA POLSKA I ROUTING SEO
// ===========================================================================
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function metricValHtml(val) {
  return esc(val).replace(/\//g, '/<wbr>');
}

function decodeEntities(s) {
  let t = String(s == null ? '' : s);
  if (!t.includes('&')) return t.replace(/\u00A0/g, ' ');
  if (typeof document !== 'undefined') {
    const ta = document.createElement('textarea');
    for (let i = 0; i < 2; i++) {
      ta.innerHTML = t;
      const dec = ta.value;
      if (dec === t) break;
      t = dec;
    }
  }
  return t.replace(/\u00A0/g, ' ');
}

function plTypography(s) {
  let t = decodeEntities(s);
  for (let i = 0; i < 2; i++) {
    t = t.replace(/(^|[\s(„"—–-])([aiouwzAIOUWZ]) +/g, '$1$2\u00A0');
  }
  t = t.replace(
    /(\d)[ ]+(r\.|tys\.|mln|mld|proc\.|zł|euro|USD|km|MW|GW|MWh|GWh|osób|osoby|min|lat|lata)(?=$|[\s.,;:!?()„”"—–-])/g,
    '$1\u00A0$2'
  );
  return t;
}

function cleanOutletName(name) {
  return String(name || '').replace(/\s*\[[^\]]*\]/g, '').trim();
}

function resolveAsset(rel) {
  return ROOT_URL + String(rel || '').replace(/^\/+/, '');
}

function pathHref(path) {
  const clean = String(path || '').replace(/^\/+|\/+$/g, '');
  if (!clean) return ROOT_URL;
  return ROOT_URL + clean + '/';
}

function articleHref(seoUrl) {
  const clean = String(seoUrl || '').replace(/^\/+|\/+$/g, '');
  return clean ? (ROOT_URL + clean + '/') : ROOT_URL;
}

const KNOWN_HUES = { gospodarka: 150, polityka: 215, energetyka: 38, poznan: 350, swiat: 265, sport: 15, prawo: 190 };
function pathHue(path) {
  const last = norm((path || '').split('/').filter(Boolean).pop() || '');
  if (KNOWN_HUES[last] !== undefined) return KNOWN_HUES[last];
  let h = 0;
  for (const ch of last) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

function plainText(s) {
  return decodeEntities(s || '')
    .replace(/\[Źródło:\s*[^\]]+\]/g, '')
    .replace(/\[\d+:[^\]]+\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const ABBREV_STOP = new Set([
  'm.in.', 'np.', 'ok.', 'godz.', 'tys.', 'mln.', 'mld.', 'proc.',
  'zł.', 'r.', 'ust.', 'art.', 'pkt.', 'tzw.', 'dr.', 'prof.', 'ul.', 'nr.', 'woj.'
]);

function truncateSafe(txt, max = 240) {
  if (!txt || txt.length <= max) return txt || '';
  const cut = txt.slice(0, max);
  const minPos = Math.floor(max * 0.45);
  let bestStop = -1;
  const re = /[.!?](?:\s|$)/g;
  let m;
  while ((m = re.exec(cut)) !== null) {
    const pos = m.index;
    if (pos < minPos) continue;
    const prefix = cut.slice(0, pos + 1);
    const wMatch = prefix.match(/([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż0-9.]+\.)$/);
    if (wMatch && ABBREV_STOP.has(wMatch[1].toLowerCase())) continue;
    bestStop = pos + 1;
  }
  if (bestStop > 0) return cut.slice(0, bestStop).trim();
  const trimmed = cut.replace(/\s+\S*$/, '').replace(/[,;:-]+$/, '').replace(/\s+(?:m\.in|np|ok|tzw|godz)\.$/i, '');
  return trimmed + '…';
}

function articleLede(art, max = 240) {
  let lead = plainText(art.summary_lead || '');
  if (!lead) {
    const first = art.full_sections && art.full_sections[0] && art.full_sections[0].paragraphs[0];
    lead = plainText(first);
  }
  return truncateSafe(lead, max);
}

function readingMinutes(art) {
  const words = (art.full_sections || [])
    .map(s => (s.heading || '') + ' ' + (s.paragraphs || []).join(' '))
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 190));
}

function minutesLabel(n) {
  if (n === 1) return '1 minuta czytania';
  if ((n >= 2 && n <= 4) || (n > 20 && n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14))) {
    return `${n} minuty czytania`;
  }
  return `${n} minut czytania`;
}

function countArticlesLabel(n) {
  if (n === 1) return '1 opracowanie';
  if ((n >= 2 && n <= 4) || (n > 20 && n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14))) {
    return `${n} opracowania`;
  }
  return `${n} opracowań`;
}

function sourcesLabel(n) {
  if (n === 1) return '1 źródło';
  if ((n >= 2 && n <= 4) || (n > 20 && n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14))) {
    return `${n} źródła`;
  }
  return `${n} źródeł`;
}

function meterClass(p) { return p >= 85 ? 'ok' : p >= 70 ? 'mid' : 'low'; }
function meterHtml(p, sourcesCount = 2) {
  if (sourcesCount < 2 || p == null) {
    return `<span class="meter neutral" title="Temat lokalny lub niszowy z pojedynczej redakcji — bez oceny %">Temat lokalny/niszowy</span>`;
  }
  return `<span class="meter ${meterClass(p)}" title="Zbieżność faktów potwierdzona w ${sourcesCount} redakcjach">
    <span class="meter-bar"><span class="meter-fill" style="width:${p}%"></span></span>${p}% zgodności</span>`;
}

function catAttr(art) { return `class="cat" style="--h:${pathHue(art.path)}"`; }

function isModifiedClick(e) {
  return Boolean(e && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (typeof e.button === 'number' && e.button !== 0)));
}

function syncNavActive() {
  document.querySelectorAll('.path-chip').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-path') === currentPath);
  });
}

function syncStaticNavHrefs() {
  const brand = document.querySelector('a.brand');
  if (brand) brand.setAttribute('href', ROOT_URL);
  document.querySelectorAll('.path-chip[data-path]').forEach(a => {
    const p = a.getAttribute('data-path');
    if (p) a.setAttribute('href', pathHref(p));
  });
  document.querySelectorAll('.footer-links a').forEach(a => {
    const href = a.getAttribute('href') || '';
    const file = href.split('/').pop();
    if (file) a.setAttribute('href', resolveAsset(file));
  });
}

function resolveStateFromLocation() {
  const mHash = (location.hash || '').match(/^#\/a\/(\d+)/);
  if (mHash) {
    return { path: currentPath, articleId: parseInt(mHash[1], 10), notFound: false };
  }

  let relPath = '';
  if (location.protocol !== 'file:') {
    let pn = location.pathname || '/';
    if (ROOT_URL.startsWith('/') && ROOT_URL !== '/' && pn.startsWith(ROOT_URL)) {
      pn = pn.slice(ROOT_URL.length);
    } else if (ROOT_URL.startsWith('/') && ROOT_URL !== '/' && pn === ROOT_URL.replace(/\/$/, '')) {
      pn = '';
    }
    relPath = pn.replace(/^\/+|\/+$/g, '').replace(/(?:^|\/)index\.html$/, '');
  }

  if (!relPath) {
    if (window.VERITY_INITIAL_ARTICLE_URL) {
      const artInit = articles.find(a => a.seo_url === window.VERITY_INITIAL_ARTICLE_URL);
      if (artInit) return { path: artInit.path || '/Polska', articleId: artInit.id, notFound: false };
    }
    const pInit = window.VERITY_INITIAL_PATH;
    return { path: (pInit && PATH_TITLES[pInit]) ? pInit : '/Polska', articleId: null, notFound: false };
  }

  const slashRel = '/' + relPath;
  if (PATH_TITLES[slashRel]) {
    return { path: slashRel, articleId: null, notFound: false };
  }

  const exactArt = articles.find(a => a.seo_url === slashRel);
  if (exactArt) {
    return { path: exactArt.path || '/Polska', articleId: exactArt.id, notFound: false };
  }

  const slugSeg = relPath.split('/').pop();
  if (slugSeg && slugSeg.length >= 12) {
    const bySlug = articles.find(a => {
      const aSlug = (a.seo_url || '').split('/').pop();
      return aSlug === slugSeg || aSlug.startsWith(slugSeg.slice(0, 36)) || slugSeg.startsWith(aSlug.slice(0, 36));
    });
    if (bySlug) {
      return { path: bySlug.path || '/Polska', articleId: bySlug.id, notFound: false, recoveredUrl: articleHref(bySlug.seo_url) };
    }
  }

  if (window.VERITY_IS_404) {
    return { path: '/Polska', articleId: null, notFound: true };
  }
  return { path: '/Polska', articleId: null, notFound: false };
}

function openArticleLink(event, id, seoUrl) {
  if (isModifiedClick(event)) return true;
  if (event && event.preventDefault) event.preventDefault();
  openArticle(id, seoUrl);
  return false;
}

function openArticle(id, seoUrlOverride) {
  const published = articles.filter(a => a.status === 'AUTO_PUBLISHED');
  const art = published.find(a => a.id === id) || articles.find(a => a.id === id);
  if (!art) return;
  if (activeArticleId === null && !isNotFoundState) {
    lastFeedHref = location.pathname;
  }
  activeArticleId = art.id;
  currentPath = PATH_TITLES[art.path] ? art.path : currentPath;
  isNotFoundState = false;
  syncNavActive();
  const targetUrl = articleHref(seoUrlOverride || art.seo_url);
  if (location.protocol !== 'file:' && location.pathname !== targetUrl) {
    try { history.pushState({ path: currentPath, articleId: art.id }, '', targetUrl); } catch (e) {}
  } else if (location.protocol === 'file:') {
    location.hash = '#/a/' + art.id;
  }
  if (currentView !== 'public') {
    currentView = 'public';
    document.getElementById('viewPublic')?.classList.remove('hidden');
    document.getElementById('viewEditorial')?.classList.add('hidden');
  }
  renderPortal();
  window.scrollTo({ top: 0 });
}

function selectPathLink(event, p) {
  if (isModifiedClick(event)) return true;
  if (event && event.preventDefault) event.preventDefault();
  const fromBrand = Boolean(event && event.currentTarget && event.currentTarget.classList && event.currentTarget.classList.contains('brand'));
  if (fromBrand) {
    const si = document.getElementById('searchInput');
    if (si) si.value = '';
  }
  selectPath(p, fromBrand);
  return false;
}

function selectPath(p, toRootHome = false) {
  currentPath = PATH_TITLES[p] ? p : '/Polska';
  activeArticleId = null;
  isNotFoundState = false;
  syncNavActive();
  const targetUrl = toRootHome ? ROOT_URL : pathHref(currentPath);
  lastFeedHref = targetUrl;
  if (location.protocol !== 'file:' && (location.pathname !== targetUrl || location.hash)) {
    try { history.pushState({ path: currentPath, articleId: null }, '', targetUrl); } catch (e) {}
  } else if (location.protocol === 'file:' && location.hash) {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  }
  if (currentView !== 'public') switchView('public');
  else renderPortal();
  window.scrollTo({ top: 0 });
}

function closeArticle(event) {
  if (isModifiedClick(event)) return true;
  if (event && event.preventDefault) event.preventDefault();
  activeArticleId = null;
  isNotFoundState = false;
  const targetUrl = lastFeedHref || pathHref(currentPath);
  if (location.protocol !== 'file:' && (location.pathname !== targetUrl || location.hash)) {
    try { history.pushState({ path: currentPath, articleId: null }, '', targetUrl); } catch (e) {}
  } else if (location.protocol === 'file:' && location.hash) {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  }
  renderPortal();
  window.scrollTo({ top: 0 });
  return false;
}

// ===========================================================================
// NAWIGACJA I WYSZUKIWANIE
// ===========================================================================
function switchView(view) {
  currentView = view;
  document.getElementById('viewPublic')?.classList.toggle('hidden', view !== 'public');
  document.getElementById('viewEditorial')?.classList.toggle('hidden', view !== 'editorial');
  window.scrollTo({ top: 0 });
  renderPortal();
}

function handleSearchInput() {
  if (activeArticleId !== null) {
    activeArticleId = null;
    if (location.protocol !== 'file:') {
      try { history.replaceState({ path: currentPath, articleId: null }, '', pathHref(currentPath)); } catch (e) {}
    }
  }
  if (isNotFoundState) isNotFoundState = false;
  if (currentView !== 'public') {
    currentView = 'public';
    document.getElementById('viewPublic')?.classList.remove('hidden');
    document.getElementById('viewEditorial')?.classList.add('hidden');
  }
  renderPortal();
}

function clearSearch() {
  const si = document.getElementById('searchInput');
  if (si) si.value = '';
  renderPortal();
}

function copyPermalink(btn, url) {
  const done = () => {
    if (!btn) return;
    const orig = btn.dataset.origLabel || btn.textContent;
    btn.dataset.origLabel = orig;
    btn.textContent = 'Skopiowano ✓';
    btn.classList.add('copied');
    clearTimeout(btn._copyTimer);
    btn._copyTimer = setTimeout(() => {
      btn.textContent = orig;
      btn.classList.remove('copied');
    }, 2000);
  };
  const fallbackCopy = () => {
    try {
      const inp = document.createElement('input');
      inp.value = url;
      document.body.appendChild(inp);
      inp.select();
      document.execCommand('copy');
      inp.remove();
      done();
    } catch (e) {}
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(done).catch(fallbackCopy);
  } else {
    fallbackCopy();
  }
}

function updateReadingProgress() {
  const bar = document.getElementById('readingProgress');
  const artEl = document.querySelector('.article-main');
  const readingActive = currentView === 'public' && activeArticleId !== null && Boolean(artEl);
  if (!bar || !readingActive) {
    document.body.classList.remove('is-reading');
    if (bar) bar.style.width = '0%';
    return;
  }
  const rect = artEl.getBoundingClientRect();
  const startY = window.scrollY + rect.top;
  const scrollable = Math.max(200, artEl.offsetHeight - window.innerHeight * 0.65);
  const raw = ((window.scrollY - startY + window.innerHeight * 0.25) / scrollable) * 100;
  const pct = Math.max(0, Math.min(100, raw));
  const show = window.scrollY > 24;
  document.body.classList.toggle('is-reading', show);
  bar.style.width = `${pct.toFixed(1)}%`;
}

// ===========================================================================
// WYSZUKIWARKA (stemmer fleksyjny działa w tle)
// ===========================================================================
function matchesStemQuery(art, q) {
  const qWords = q.split(/\s+/).filter(w => w.length > 1);
  if (!qWords.length) return true;

  const monthExtra = monthMap[(art.published_iso || '').slice(5, 7)] || '';
  const fullSecText = (art.full_sections || []).map(s => (s.heading || '') + ' ' + (s.paragraphs || []).join(' ')).join(' ');
  const rawBag = [
    art.seo_title, art.summary_lead || '', art.keywords || '', art.path, art.published_iso, monthExtra, fullSecText,
    ...(art.perspectives || []).map(p => (p.outlet || '') + ' ' + (p.summary || ''))
  ].join(' ');

  const allWords = rawBag.split(/[^\p{L}\p{N}_]+/u).filter(Boolean);
  const itemStems = new Set(allWords.map(polishStem));
  allWords.forEach(w => itemStems.add(norm(w)));

  synonymGroups.forEach(grp => {
    if (grp.some(g => itemStems.has(g) || itemStems.has(polishStem(g)))) {
      grp.forEach(g => { itemStems.add(g); itemStems.add(polishStem(g)); });
    }
  });

  return qWords.every(qw => {
    const qs = polishStem(qw);
    for (const tok of itemStems) {
      if (tok === qs || (tok.length >= 3 && tok.startsWith(qs)) || (tok.length >= 5 && qs.startsWith(tok))) return true;
    }
    return false;
  });
}

// ===========================================================================
// DYNAMICZNE SEO HEAD (title, description, robots, canonical, OG, JSON-LD)
// ===========================================================================
function setMetaTag(attrName, attrVal, content) {
  let el = document.querySelector(`meta[${attrName}="${attrVal}"]`);
  if (content == null || content === '') {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attrName, attrVal);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function syncSeoHead(openArt, published, query) {
  if (typeof document === 'undefined') return;
  const robots = (currentView === 'editorial' || Boolean(query) || isNotFoundState)
    ? 'noindex, follow'
    : 'index, follow, max-image-preview:large, max-snippet:-1';
  setMetaTag('name', 'robots', robots);

  let title, desc, canUrl, ogType, ogImg, ldObj;
  if (currentView === 'public' && openArt) {
    title = `${openArt.seo_title} — VERITY`;
    desc = openArt.meta_description || articleLede(openArt, 158);
    canUrl = `${CANONICAL_ORIGIN}${openArt.seo_url}/`;
    ogType = 'article';
    ogImg = openArt.thumbnail_url || '';
    const parts = (openArt.path || '/Polska').split('/').filter(Boolean);
    const crumbs = [{ '@type': 'ListItem', position: 1, name: 'VERITY', item: `${CANONICAL_ORIGIN}/` }];
    let acc = '';
    parts.forEach((p, idx) => {
      acc += '/' + p;
      crumbs.push({ '@type': 'ListItem', position: idx + 2, name: p, item: `${CANONICAL_ORIGIN}${acc}/` });
    });
    crumbs.push({ '@type': 'ListItem', position: crumbs.length + 1, name: openArt.seo_title, item: canUrl });
    const newsLd = {
      '@context': 'https://schema.org',
      '@type': 'NewsArticle',
      mainEntityOfPage: { '@type': 'WebPage', '@id': canUrl },
      headline: (openArt.seo_title || '').slice(0, 110),
      description: desc,
      datePublished: openArt.published_iso || '',
      dateModified: openArt.published_iso || '',
      inLanguage: 'pl',
      isAccessibleForFree: true,
      articleSection: shortCatLabel(openArt.path || '/Polska'),
      author: { '@type': 'Organization', name: 'Zespół Redakcyjny VERITY', url: `${CANONICAL_ORIGIN}/` },
      publisher: { '@type': 'Organization', name: 'VERITY', url: `${CANONICAL_ORIGIN}/` }
    };
    if (ogImg) newsLd.image = [ogImg];
    if (openArt.keywords) newsLd.keywords = openArt.keywords;
    const cites = (openArt.perspectives || []).filter(p => p.url).map(p => ({
      '@type': 'NewsArticle',
      headline: p.summary || openArt.seo_title,
      url: p.url,
      publisher: { '@type': 'Organization', name: p.outlet || '' }
    }));
    if (cites.length) newsLd.citation = cites;
    ldObj = [newsLd, { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs }];
  } else {
    const isRootHome = currentPath === '/Polska' && (location.pathname === ROOT_URL || location.pathname === ROOT_URL + 'index.html');
    const catTitle = PATH_TITLES[currentPath] || currentPath;
    title = isNotFoundState
      ? 'Strona nie została znaleziona — VERITY'
      : (isRootHome ? 'VERITY – Wieloźródłowa Weryfikacja i Synteza Informacji' : `${catTitle} — VERITY`);
    desc = isRootHome
      ? 'Wieloźródłowa weryfikacja i synteza informacji z 97 redakcji ogólnopolskich, regionalnych (16 województw) i branżowych. Pełna treść faktograficzna, zero clickbaitu, bezpośrednie linki do źródeł.'
      : (PATH_DESCRIPTIONS[currentPath] || PATH_DESCRIPTIONS['/Polska']);
    canUrl = isRootHome ? `${CANONICAL_ORIGIN}/` : `${CANONICAL_ORIGIN}${currentPath}/`;
    ogType = 'website';
    const catArts = (published || []).filter(a => currentPath === '/Polska' || (a.path || '').startsWith(currentPath));
    ogImg = (catArts.find(a => a.thumbnail_url) || {}).thumbnail_url || '';
    ldObj = [
      {
        '@context': 'https://schema.org',
        '@type': isRootHome ? 'WebSite' : 'CollectionPage',
        name: title,
        description: desc,
        url: canUrl,
        inLanguage: 'pl'
      },
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: catArts.slice(0, 15).map((a, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          url: `${CANONICAL_ORIGIN}${a.seo_url}/`,
          name: a.seo_title
        }))
      }
    ];
  }

  document.title = title;
  setMetaTag('name', 'description', desc);
  const canEl = document.querySelector('link[rel="canonical"]');
  if (canEl) canEl.setAttribute('href', canUrl);
  setMetaTag('property', 'og:type', ogType);
  setMetaTag('property', 'og:title', title);
  setMetaTag('property', 'og:description', desc);
  setMetaTag('property', 'og:url', canUrl);
  setMetaTag('property', 'og:image', ogImg);
  setMetaTag('name', 'twitter:card', ogImg ? 'summary_large_image' : 'summary');
  setMetaTag('name', 'twitter:title', title);
  setMetaTag('name', 'twitter:description', desc);
  setMetaTag('name', 'twitter:image', ogImg);
  const ldEl = document.getElementById('dynamicJsonLd');
  if (ldEl) ldEl.textContent = JSON.stringify(ldObj, null, 2);
}

// ===========================================================================
// RENDER
// ===========================================================================
function renderPortal() {
  const q = (document.getElementById('searchInput')?.value || '').trim();
  const clearBtn = document.getElementById('clearSearchBtn');
  if (clearBtn) clearBtn.classList.toggle('hidden', !q);

  const published = articles.filter(a => a.status === 'AUTO_PUBLISHED');
  const pendingArts = articles.filter(a => a.status === 'PENDING_ADMIN');
  const badgeEl = document.getElementById('pendingBadge');
  if (badgeEl) badgeEl.textContent = pendingArts.length;

  const openArt = activeArticleId !== null ? published.find(a => a.id === activeArticleId) : null;

  if (currentView === 'public') {
    if (openArt) {
      renderArticleView(openArt, published);
    } else if (isNotFoundState && !q) {
      const container = document.getElementById('articlesFeed');
      if (container) {
        container.innerHTML = `<div class="empty-state"><h2>Nie znaleziono strony (404)</h2><p style="margin-top:0.6rem">Wybrany adres nie istnieje lub został zaktualizowany.</p><p style="margin-top:1rem"><a class="btn-primary" style="text-decoration:none;display:inline-block" href="${esc(ROOT_URL)}" onclick="return selectPathLink(event, '/Polska')">Wróć na stronę główną VERITY</a></p></div>`;
      }
    } else {
      const list = published
        .filter(a => currentPath === '/Polska' || a.path.startsWith(currentPath))
        .filter(a => matchesStemQuery(a, q))
        .sort((a, b) => ((b.declickbait?.length ? 1 : 0) - (a.declickbait?.length ? 1 : 0)) || b.published_iso.localeCompare(a.published_iso));
      renderFeed(list, q);
    }
  }
  renderEditorialPanel(pendingArts);
  syncSeoHead(openArt, published, q);
  updateReadingProgress();
}

function shortCatLabel(path) {
  const parts = (path || '/Polska').split('/').filter(Boolean);
  if (parts.length <= 1) return parts[0] || 'Polska';
  return parts.slice(1).join(' · ');
}

function outletMonogram(name) {
  const clean = cleanOutletName(name || 'V');
  const words = clean.split(/[\s.-]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

function thumbWrapHtml(art, wrapClass, imgClass, eager = false) {
  const label = esc(shortCatLabel(art.path));
  const fallback = `<div class="thumb-fallback" aria-hidden="true"><span class="thumb-fallback-label">${label}</span><span class="thumb-fallback-mark">V</span></div>`;
  const img = art.thumbnail_url
    ? `<img src="${esc(art.thumbnail_url)}" alt="${esc(art.seo_title)}" class="${imgClass}" loading="${eager ? 'eager' : 'lazy'}" referrerpolicy="no-referrer" onerror="this.remove()" />`
    : '';
  return `<div class="${wrapClass}">${fallback}${img}</div>`;
}

function storyCardHtml(art) {
  const stats = (art.metrics || []).slice(0, 2).map(m => `<span class="chip" title="${esc(m.label)}">${esc(m.val)}</span>`).join('');
  const href = esc(articleHref(art.seo_url));
  const jsUrl = esc(art.seo_url || '');
  return `
    <article ${catAttr(art)} data-id="${art.id}">
      <div class="story-card" onclick="if(!event.target.closest('a'))openArticleLink(event, ${art.id}, '${jsUrl}')">
        <a class="card-media-link" href="${href}" onclick="return openArticleLink(event, ${art.id}, '${jsUrl}')" tabindex="-1" aria-hidden="true">
          ${thumbWrapHtml(art, 'story-thumb-wrap', 'story-thumb')}
        </a>
        <div class="story-body">
          <div class="story-top"><span class="cat-badge">${esc(shortCatLabel(art.path))}</span><span class="story-date">${esc(art.display_date)}</span></div>
          <h2 class="story-title"><a class="story-title-link" href="${href}" onclick="return openArticleLink(event, ${art.id}, '${jsUrl}')">${esc(plTypography(art.seo_title))}</a></h2>
          <p class="story-lede">${esc(plTypography(articleLede(art, 200)))}</p>
          ${stats ? `<div class="story-chips">${stats}</div>` : ''}
          <div class="story-foot">${meterHtml(art.fact_agreement_pct, art.sources.length)}<span>${sourcesLabel(art.sources.length)} · ${readingMinutes(art)} min</span></div>
        </div>
      </div>
    </article>`;
}

function renderFeed(list, q) {
  const container = document.getElementById('articlesFeed');
  if (!container) return;

  if (!list.length) {
    container.innerHTML = `<div class="empty-state">Brak opracowań w ścieżce <strong>${esc(currentPath)}</strong>${q ? ' dla zapytania „' + esc(q) + '”' : ''}.</div>`;
    return;
  }

  const useLead = !q && list.length >= 3;
  const lead = useLead ? list[0] : null;
  const rest = useLead ? list.slice(1) : list;

  const titleText = q ? `Wyniki dla „${esc(q)}”` : esc(PATH_TITLES[currentPath] || currentPath);
  const heading = `
    <div class="feed-heading">
      <div>
        <span class="feed-crumb">${esc(currentPath)}</span>
        <h1>${titleText}</h1>
      </div>
      <span>${countArticlesLabel(list.length)}</span>
    </div>`;

  let leadHtml = '';
  if (lead) {
    const lHref = esc(articleHref(lead.seo_url));
    const lJsUrl = esc(lead.seo_url || '');
    leadHtml = `
    <article ${catAttr(lead)} class="lead-wrap">
      <div class="lead-story" onclick="if(!event.target.closest('a'))openArticleLink(event, ${lead.id}, '${lJsUrl}')">
        <a class="lead-thumb-wrap" href="${lHref}" onclick="return openArticleLink(event, ${lead.id}, '${lJsUrl}')" tabindex="-1" aria-hidden="true">
          <div class="thumb-fallback" aria-hidden="true"><span class="thumb-fallback-label">${esc(shortCatLabel(lead.path))}</span><span class="thumb-fallback-mark">V</span></div>
          ${lead.thumbnail_url ? `<img src="${esc(lead.thumbnail_url)}" alt="${esc(lead.seo_title)}" class="lead-thumb" loading="eager" referrerpolicy="no-referrer" onerror="this.remove()" />` : ''}
        </a>
        <div class="lead-main">
          <div class="story-top"><span class="cat-badge">${esc(shortCatLabel(lead.path))}</span><span class="story-date">${esc(lead.display_date)}</span></div>
          <h2 class="lead-title"><a class="story-title-link" href="${lHref}" onclick="return openArticleLink(event, ${lead.id}, '${lJsUrl}')">${esc(plTypography(lead.seo_title))}</a></h2>
          <p class="lead-lede">${esc(plTypography(articleLede(lead, 290)))}</p>
          <div class="story-foot">${meterHtml(lead.fact_agreement_pct, lead.sources.length)}<span>${sourcesLabel(lead.sources.length)} · ${minutesLabel(readingMinutes(lead))}</span></div>
        </div>
        <div class="lead-side">
          <div class="lead-side-title">Kluczowe parametry</div>
          ${(lead.metrics || []).slice(0, 3).map(m => `<div class="stat-row"><span class="stat-label">${esc(m.label)}</span><span class="stat-val">${metricValHtml(m.val)}</span></div>`).join('')}
        </div>
      </div>
    </article>`;
  }

  container.innerHTML = heading + leadHtml +
    (rest.length ? `<div class="cards-grid${lead ? ' after-lead' : ''}">${rest.map(storyCardHtml).join('')}</div>` : '');
}

function reconcileLeadAndFirstPara(art) {
  const secs = art.full_sections || [];
  const allParas = [];
  secs.forEach((s, si) => (s.paragraphs || []).forEach((p, pi) => allParas.push({ si, pi, p })));
  if (!allParas.length) {
    const lead = plainText(art.summary_lead || '');
    return { showLede: Boolean(lead), summaryLead: lead, skipFirstPara: false, firstParaOverride: '' };
  }

  const firstRaw = allParas[0].p;
  const firstPlain = plainText(firstRaw);
  let summaryLead = plainText(art.summary_lead || '');
  if (!summaryLead && allParas.length >= 2) {
    summaryLead = articleLede(art, 280);
  }

  const normL = summaryLead.toLowerCase().replace(/[^\p{L}\p{N}_]+/gu, '');
  const normP = firstPlain.toLowerCase().replace(/[^\p{L}\p{N}_]+/gu, '');
  if (allParas.length === 1 && normL && normP.startsWith(normL.slice(0, Math.min(50, normL.length)))) {
    return { showLede: false, summaryLead: '', skipFirstPara: false, firstParaOverride: firstRaw };
  }
  if (!summaryLead) {
    return { showLede: false, summaryLead: '', skipFirstPara: false, firstParaOverride: firstRaw };
  }

  if (summaryLead.endsWith('…')) {
    const prefixNoEllip = summaryLead.slice(0, -1).trimEnd();
    if (firstPlain.startsWith(prefixNoEllip) && firstPlain.length <= 340) {
      return { showLede: true, summaryLead: firstPlain, skipFirstPara: true, firstParaOverride: '' };
    }
  }

  if (normL && normP && (normP === normL || (normL.length > 50 && normP.startsWith(normL.slice(0, 50)) && normP.length <= normL.length + 30))) {
    return { showLede: true, summaryLead, skipFirstPara: true, firstParaOverride: '' };
  }

  if (!summaryLead.endsWith('…') && firstPlain.startsWith(summaryLead)) {
    const tailPlain = firstPlain.slice(summaryLead.length).trim();
    if (tailPlain.length >= 25 && /^[A-ZĄĆĘŁŃÓŚŹŻ„"—–-]/.test(tailPlain)) {
      const trimmedRaw = decodeEntities(firstRaw).trim();
      if (trimmedRaw.startsWith(summaryLead)) {
        return { showLede: true, summaryLead, skipFirstPara: false, firstParaOverride: trimmedRaw.slice(summaryLead.length).trimStart() };
      }
      const cites = trimmedRaw.match(/\[Źródło:\s*[^\]]+\]/g);
      return { showLede: true, summaryLead, skipFirstPara: false, firstParaOverride: cites ? `${tailPlain} ${cites.join(' ')}` : tailPlain };
    }
  }

  return { showLede: true, summaryLead, skipFirstPara: false, firstParaOverride: firstRaw };
}

function renderArticleView(art, published) {
  const container = document.getElementById('articlesFeed');
  if (!container) return;

  const related = published.filter(a => a.id !== art.id && a.path === art.path).slice(0, 2);
  const others = related.length ? related : published.filter(a => a.id !== art.id).slice(0, 2);

  const linked = (art.perspectives || []).filter(p => p.url);
  const uniqueLinks = [];
  linked.forEach(p => { if (!uniqueLinks.some(u => u.url === p.url)) uniqueLinks.push(p); });

  const mins = readingMinutes(art);
  const secs = art.full_sections || [];
  const { showLede, summaryLead, skipFirstPara, firstParaOverride } = reconcileLeadAndFirstPara(art);

  const ledeHtml = showLede
    ? `<p class="article-lede">${esc(plTypography(summaryLead))}</p>`
    : `<p class="article-context-line">Synteza faktograficzna na podstawie ${sourcesLabel((art.sources || []).length)} · Bezpośrednie odnośniki do publikacji źródłowych poniżej.</p>`;

  let dropcapApplied = false;
  const sectionsHtml = secs.map((sec, si) => {
    const pHtmls = [];
    (sec.paragraphs || []).forEach((rawP, pi) => {
      if (si === 0 && pi === 0) {
        if (skipFirstPara) return;
        if (firstParaOverride) rawP = firstParaOverride;
      }
      let pText = decodeEntities(rawP);
      const plainP = plainText(pText);
      const isQuote = /^\s*[—–-]\s+/.test(plainP);
      const pClasses = ['section-paragraph'];
      if (isQuote) {
        pClasses.push('is-quote');
        pText = pText.replace(/^\s*[—–-]\s+/, '—\u00A0');
      } else if (!dropcapApplied && /^[A-ZĄĆĘŁŃÓŚŹŻ]/.test(plainP) && plainP.length >= 140) {
        pClasses.push('has-dropcap');
        dropcapApplied = true;
      }
      pHtmls.push(`<p class="${pClasses.join(' ')}">${formatCitations(esc(plTypography(pText)), art.perspectives)}</p>`);
    });
    if (!pHtmls.length) return '';
    return `
      <section>
        <h2 class="section-heading" id="sec_${art.id}_${si}">${esc(sec.heading)}</h2>
        ${pHtmls.join('')}
      </section>`;
  }).join('');

  const heroThumb = art.thumbnail_url ? `
    <div class="article-hero-wrap">
      <div class="thumb-fallback" aria-hidden="true"><span class="thumb-fallback-label">${esc(shortCatLabel(art.path))}</span><span class="thumb-fallback-mark">V</span></div>
      <img src="${esc(art.thumbnail_url)}" alt="${esc(art.seo_title)}" class="article-hero-img" loading="eager" referrerpolicy="no-referrer" onerror="this.parentElement.remove()" />
    </div>` : '';

  const asideVerifHtml = (art.sources.length >= 2 && art.fact_agreement_pct != null)
    ? `
      <div class="aside-card">
        <div class="aside-title">Zgodność danych</div>
        <div class="big-meter meter ${meterClass(art.fact_agreement_pct)}">${art.fact_agreement_pct}%<small>${sourcesLabel(art.sources.length)}</small></div>
        <div class="meter-bar wide"><span class="meter-fill" style="width:${art.fact_agreement_pct}%"></span></div>
      </div>`
    : `
      <div class="aside-card">
        <div class="aside-title">Status źródeł</div>
        <div class="aside-status">1 redakcja (lokalne / branżowe)</div>
        <div class="aside-note">
          Informacja niszowa z pojedynczego źródła — publikowana bez wskaźnika % zgodności krzyżowej.
        </div>
      </div>`;

  const backTarget = lastFeedHref || pathHref(currentPath);
  const canonicalFull = `${CANONICAL_ORIGIN}${art.seo_url}/`;

  container.innerHTML = `
    <div ${catAttr(art)}>
      <a class="back-link" href="${esc(backTarget)}" onclick="return closeArticle(event)">← Wróć do ${esc(PATH_TITLES[currentPath] || currentPath)}</a>
      <div class="reader has-aside">
        <article class="article-main">
          <header class="article-head">
            <div class="article-kicker">
              <span class="cat-badge">${esc(art.path)}</span>
              <time datetime="${esc(art.published_iso || '')}">${esc(art.display_date)}</time>
              <span>${minutesLabel(mins)}</span>
            </div>
            <h1 class="article-title">${esc(plTypography(art.seo_title))}</h1>
            ${ledeHtml}
          </header>

          ${heroThumb}

          ${art.metrics && art.metrics.length ? `
            <div class="facts-strip">
              ${art.metrics.map(m => `<div class="fact-box"><div class="fact-label">${esc(m.label)}</div><div class="fact-val">${metricValHtml(m.val)}</div></div>`).join('')}
            </div>` : ''}

          ${art.admin_note ? `<div class="callout callout-warn"><strong>Nota weryfikacyjna redakcji:</strong> ${esc(plTypography(art.admin_note))}</div>` : ''}

          ${art.declickbait && art.declickbait.length ? `
            <div class="callout callout-clickbait">
              <div class="callout-title">Odfiltrowany clickbait</div>
              ${art.declickbait.map(dc => `
                <div class="cb-item">
                  <div class="cb-strike">„${esc(dc.original)}” <em>— ${esc(dc.outlet)}</em></div>
                  <div class="cb-fact">→ ${esc(dc.fact)}</div>
                </div>`).join('')}
            </div>` : ''}

          <div class="article-sections">
            ${sectionsHtml}
          </div>

          ${(art.perspectives || []).length ? `
          <div class="perspectives-box">
            <div class="perspectives-header">
              <span class="perspectives-title">Kto jak to przedstawia?</span>
              <span class="perspectives-sources">Źródła: ${art.sources.map(esc).join(', ')}</span>
            </div>
            <div class="perspectives-grid">
              ${art.perspectives.map(p => `
                <div class="perspective-col">
                  <div class="perspective-head">
                    <span class="outlet-mono" aria-hidden="true">${esc(outletMonogram(p.outlet))}</span>
                    <div>
                      <div class="perspective-outlet">${esc(p.outlet)}</div>
                      <div class="perspective-angle">${esc(p.angle || 'Depesza źródłowa')}</div>
                    </div>
                  </div>
                  <p class="perspective-summary">${esc(plTypography(p.summary))}</p>
                  ${p.url ? `<a class="perspective-link" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Otwórz artykuł źródłowy ↗</a>` : ''}
                </div>`).join('')}
            </div>
          </div>` : ''}

          ${art.corrections && art.corrections.length ? `
            <div class="callout callout-success">
              <strong>Zweryfikowane uzupełnienia czytelników (${art.corrections.length}):</strong>
              ${art.corrections.map(c => `<div>• ${esc(c.claim_text)} (<a href="${esc(c.evidence_url)}" target="_blank" rel="noopener noreferrer">link</a>)</div>`).join('')}
            </div>` : ''}

          <div class="article-footer">
            <div class="permalink-wrap">
              <span class="permalink">${esc(canonicalFull)}</span>
              <button type="button" class="copy-link-btn" onclick="copyPermalink(this, '${esc(canonicalFull)}')" title="Kopiuj link do artykułu">Kopiuj link</button>
            </div>
            <button class="btn-outline" onclick="toggleCorr(${art.id})">Zgłoś sprostowanie (wymagany link do źródła)</button>
          </div>
          <div id="corrDrawer_${art.id}" class="correction-drawer hidden">
            <div class="corr-intro">Zgłoś korektę faktograficzną – przyjmujemy wyłącznie zgłoszenia z linkiem do dokumentu lub źródła:</div>
            <div class="form-row">
              <input id="corrClaim_${art.id}" type="text" class="text-input" placeholder="Co wymaga korekty?" />
              <input id="corrUrl_${art.id}" type="text" class="text-input" placeholder="Link do dowodu: https://..." />
            </div>
            <div class="corr-actions">
              <span id="corrMsg_${art.id}" class="corr-msg"></span>
              <button class="btn-primary" onclick="submitCorr(${art.id})">Wyślij korektę</button>
            </div>
          </div>
        </article>

        <aside class="article-aside">
          ${asideVerifHtml}
          ${secs.length > 1 ? `
          <div class="aside-card">
            <div class="aside-title">W tym artykule</div>
            <ul class="aside-list">
              ${secs.map((s, i) => `<li><button class="toc-btn" onclick="document.getElementById('sec_${art.id}_${i}').scrollIntoView({behavior:'smooth'})"><span>${esc(s.heading)}</span><span>↓</span></button></li>`).join('')}
            </ul>
          </div>` : ''}
          ${uniqueLinks.length ? `
          <div class="aside-card">
            <div class="aside-title">Źródła do przeczytania</div>
            <ul class="aside-list">
              ${uniqueLinks.map(p => `<li><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer"><span>${esc(cleanOutletName(p.outlet))}</span><span>↗</span></a></li>`).join('')}
            </ul>
          </div>` : ''}
        </aside>
      </div>

      ${others.length ? `
        <section class="related">
          <h2>Czytaj dalej</h2>
          <div class="cards-grid">${others.map(storyCardHtml).join('')}</div>
        </section>` : ''}
    </div>`;
}

function renderEditorialPanel(pending) {
  const container = document.getElementById('editorialQueue');
  if (!container) return;

  if (!pending.length) {
    container.innerHTML = `<div class="empty-state success">Wszystkie artykuły z kolejki zostały zatwierdzone i opublikowane.</div>`;
    return;
  }

  container.innerHTML = pending.map(art => `
    <div class="article-card queue-card">
      <div class="queue-card-top">
        <span class="queue-status">Oczekuje na akceptację redakcji</span>
        <span class="queue-path">${esc(art.path)}</span>
      </div>
      <h3 class="queue-title">${esc(art.seo_title)}</h3>
      <div class="queue-body">
        ${art.full_sections.map(s => `<p class="section-paragraph"><strong>${esc(s.heading)}:</strong> ${formatCitations(esc(plTypography(s.paragraphs.join(' '))), art.perspectives)}</p>`).join('')}
      </div>
      <div>
        <label class="queue-label" for="adminNoteInput_${art.id}">Nota weryfikacyjna redakcji (wyświetli się nad artykułem):</label>
        <input id="adminNoteInput_${art.id}" type="text" class="text-input" value="${esc(art.admin_note)}" />
      </div>
      <div class="queue-actions">
        <button class="btn-primary" onclick="approveArt(${art.id})">Zatwierdź i opublikuj</button>
        <button class="btn-outline" onclick="rejectArt(${art.id})">Odrzuć</button>
      </div>
    </div>`).join('');
}

function toggleCorr(id) {
  document.getElementById('corrDrawer_' + id)?.classList.toggle('hidden');
}

function submitCorr(id) {
  const claim = document.getElementById('corrClaim_' + id).value.trim();
  const url = document.getElementById('corrUrl_' + id).value.trim();
  const msg = document.getElementById('corrMsg_' + id);

  if (!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(url)) {
    msg.textContent = 'Wymagany jest poprawny adres URL (https://...) do dokumentu lub źródła.';
    msg.style.color = 'var(--danger)';
    return;
  }
  if (claim.length < 15) {
    msg.textContent = 'Opisz jednym zdaniem, czego dotyczy korekta.';
    msg.style.color = 'var(--warning)';
    return;
  }
  const art = articles.find(a => a.id === id);
  if (art) {
    art.corrections.push({ claim_text: claim, evidence_url: url });
    renderPortal();
  }
}

function approveArt(id) {
  const note = document.getElementById('adminNoteInput_' + id).value.trim();
  const art = articles.find(a => a.id === id);
  if (art) {
    art.status = 'AUTO_PUBLISHED';
    art.admin_note = note;
  }
  switchView('public');
}

function rejectArt(id) {
  articles = articles.filter(a => a.id !== id);
  renderPortal();
}

window.addEventListener('popstate', e => {
  if (e.state && (e.state.path !== undefined || e.state.articleId !== undefined)) {
    currentPath = PATH_TITLES[e.state.path] ? e.state.path : '/Polska';
    activeArticleId = e.state.articleId ?? null;
    isNotFoundState = false;
  } else {
    const st = resolveStateFromLocation();
    currentPath = st.path;
    activeArticleId = st.articleId;
    isNotFoundState = st.notFound;
  }
  syncNavActive();
  renderPortal();
  window.scrollTo({ top: 0 });
});

window.addEventListener('hashchange', () => {
  const mHash = (location.hash || '').match(/^#\/a\/(\d+)/);
  if (mHash) {
    activeArticleId = parseInt(mHash[1], 10);
    isNotFoundState = false;
    renderPortal();
    window.scrollTo({ top: 0 });
  }
});

window.addEventListener('scroll', updateReadingProgress, { passive: true });
window.addEventListener('resize', updateReadingProgress, { passive: true });
document.addEventListener('keydown', e => {
  const activeTag = (document.activeElement && document.activeElement.tagName || '').toUpperCase();
  if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
    const si = document.getElementById('searchInput');
    if (si) {
      e.preventDefault();
      si.focus();
      si.select();
    }
  } else if (e.key === 'Escape' && document.activeElement && document.activeElement.id === 'searchInput') {
    const si = document.getElementById('searchInput');
    if (si && si.value) {
      e.preventDefault();
      clearSearch();
    }
  }
});

window.addEventListener('DOMContentLoaded', async () => {
  applyTheme(currentThemeMode);
  syncStaticNavHrefs();
  const dateEl = document.getElementById('todayDateLabel');
  if (dateEl) {
    try {
      dateEl.textContent = new Intl.DateTimeFormat('pl-PL', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      }).format(new Date());
    } catch (e) {}
  }
  try {
    const resp = await fetch(resolveAsset('articles.json'), { cache: 'no-store' });
    if (resp.ok) {
      const liveData = await resp.json();
      if (Array.isArray(liveData) && liveData.length > 0) {
        const fresh = liveData.filter(a => (a.published_iso || '').slice(0, 10) >= '2026-11-13');
        if (fresh.length > 0) {
          articles = fresh.map((a, i) => {
            const srcs = a.sources || [];
            return {
              id: a.id || (i + 1),
              status: a.status || 'AUTO_PUBLISHED',
              admin_note: a.admin_note || '',
              metrics: a.metrics || [],
              declickbait: a.declickbait || [],
              perspectives: a.perspectives || [],
              sources: srcs,
              corrections: a.corrections || [],
              full_sections: a.full_sections || [],
              display_date: a.display_date || '',
              seo_url: a.seo_url || '',
              ...a,
              fact_agreement_pct: srcs.length >= 2 ? (a.fact_agreement_pct || 85) : null
            };
          });
        }
      }
    }
  } catch (e) {
    // Używa wbudowanych bieżących artykułów
  }
  const initSt = resolveStateFromLocation();
  currentPath = initSt.path;
  activeArticleId = initSt.articleId;
  isNotFoundState = initSt.notFound;
  if (initSt.recoveredUrl && location.protocol !== 'file:') {
    try { history.replaceState({ path: currentPath, articleId: activeArticleId }, '', initSt.recoveredUrl); } catch (e) {}
  }
  syncNavActive();
  renderPortal();
});
