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
    "path": "/Swiat",
    "seo_url": "/Swiat/usa-wstrzymuja-wszystkie-starty-samolotow-faa-wydala-nadzwyczajny-nakaz",
    "seo_title": "USA wstrzymują wszystkie starty samolotów. FAA wydała nadzwyczajny nakaz",
    "summary_lead": "USA wstrzymują starty samolotów w całym kraju. FAA wydała nadzwyczajny nakaz w związku z rozległą awarią systemów łączności. Według NBC News to dopiero drugi taki przypadek od zamachów terrorystycznych z 11 września 2001 roku.",
    "meta_description": "USA wstrzymują starty samolotów w całym kraju. FAA wydała nadzwyczajny nakaz w związku z rozległą awarią systemów łączności.",
    "keywords": "Swiat, wstrzymują, wszystkie, starty, samolotów, wydała, nadzwyczajny",
    "thumbnail_url": "https://i.gremicdn.pl/image/free/8fed8c026bcbd62bb0a535875d7e548f/?t=crop:5500:2403:nowe:0:63.951224461564,resize:fill:600:300,enlarge:1",
    "published_iso": "2026-11-13T22:40:25+01:00",
    "display_date": "13.11.2026, 22:40",
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
        "val": "/Swiat"
      },
      {
        "label": "Główne źródło",
        "val": "Rzeczpospolita"
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
          "USA wstrzymują starty samolotów w całym kraju. FAA wydała nadzwyczajny nakaz w związku z rozległą awarią systemów łączności. Według NBC News to dopiero drugi taki przypadek od zamachów terrorystycznych z 11 września 2001 roku. [Źródło: Rzeczpospolita]",
          "Władze zapewniają, że to nie był cyberatak. [Źródło: Rzeczpospolita]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Bezprecedensowe utrudnienia w amerykańskim ruchu lotniczym. Powodem są problemy z systemami kontroli ruchu lotniczego. Amerykańskie służby powołały się na wyjątkowe okoliczności i względy bezpieczeństwa. [Źródło: Warszawa w Pigułce]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Rzeczpospolita",
        "angle": "Relacja wiodąca",
        "summary": "USA wstrzymują wszystkie starty samolotów. FAA wydała nadzwyczajny nakaz",
        "url": "https://www.rp.pl/transport/art45487771-usa-wstrzymuja-wszystkie-starty-samolotow-faa-wydala-nadzwyczajny-nakaz"
      },
      {
        "outlet": "Warszawa w Pigułce",
        "angle": "Doniesienie regionalne",
        "summary": "PILNE! USA wstrzymały starty samolotów w całym kraju. Nadzwyczajna decyzja FAA. Co z lotami z Warszawy?",
        "url": "https://warszawawpigulce.pl/pilne-usa-wstrzymaly-starty-samolotow-w-calym-kraju-nadzwyczajna-decyzja-faa-co-z-lotami-z-warszawy/"
      }
    ],
    "sources": [
      "Rzeczpospolita",
      "Warszawa w Pigułce"
    ],
    "corrections": []
  },
  {
    "id": 2,
    "path": "/Polska/Gospodarka",
    "seo_url": "/Polska/Gospodarka/odbudowa-ukrainy-za-setki-miliardow-dolarow-polska-chce-byc-przy-stole",
    "seo_title": "Odbudowa Ukrainy za setki miliardów dolarów. Polska chce być przy stole",
    "summary_lead": "Odbudowa Ukrainy może pochłonąć setki miliardów dolarów, a polskie firmy chcą uczestniczyć w tym ogromnym przedsięwzięciu.",
    "meta_description": "Odbudowa Ukrainy może pochłonąć setki miliardów dolarów, a polskie firmy chcą uczestniczyć w tym ogromnym przedsięwzięciu.",
    "keywords": "Gospodarka, Odbudowa, Ukrainy, setki, miliardów, dolarów, chce",
    "thumbnail_url": "https://pliki.wnp.pl/d/57/83/58/578358_r0_300.jpg",
    "published_iso": "2026-11-13T22:40:25+01:00",
    "display_date": "13.11.2026, 22:40",
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
        "val": "WNP.pl"
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
          "Odbudowa Ukrainy może pochłonąć setki miliardów dolarów, a polskie firmy chcą uczestniczyć w tym ogromnym przedsięwzięciu. Szanse otwierają się przede wszystkim przed przedsiębiorstwami z sektora energetycznego, rolno-spożywczego i małymi oraz średnimi firmami. [Źródło: WNP.pl]",
          "Barierą pozostają jednak problemy na granicy, przeszkody administracyjne i ograniczony dostęp do ukraińskiego rynku zamówień publicznych. [Źródło: WNP.pl]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Polska znalazła się w gronie pięciu państw, które będą reprezentować Europę w negocjacjach dotyczących zakończenia rosyjskiej wojny przeciw Ukrainie. W skład europejskiego zespołu wejdą również Francja, Niemcy, Wielka Brytania i Włochy, a także przedstawiciele instytucji unijnych – ogłosił w piątek szef Rady Europejskiej Antonio Costa. [Źródło: Puls Biznesu]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "WNP.pl",
        "angle": "Relacja wiodąca",
        "summary": "Odbudowa Ukrainy za setki miliardów dolarów. Polska chce być przy stole",
        "url": "https://www.wnp.pl/rynki/odbudowa-ukrainy-za-setki-miliardow-dolarow-polska-chce-byc-przy-stole,1119628.html"
      },
      {
        "outlet": "Puls Biznesu",
        "angle": "Perspektywa rynkowa",
        "summary": "Polska przy stole negocjacyjnym ws. Ukrainy. Costa ogłosił decyzję",
        "url": "https://www.pb.pl/polska-przy-stole-negocjacyjnym-ws-ukrainy-costa-oglosil-decyzje-1270419"
      }
    ],
    "sources": [
      "Puls Biznesu",
      "WNP.pl"
    ],
    "corrections": []
  },
  {
    "id": 3,
    "path": "/Polska/Gospodarka",
    "seo_url": "/Polska/Gospodarka/przelomowy-wyrok-w-norwegii-waza-sie-losy-zloz-na-ktorych-wydobywa-orlen",
    "seo_title": "Przełomowy wyrok w Norwegii. Ważą się losy złóż, na których wydobywa Orlen",
    "summary_lead": "Norweski Sąd Najwyższy orzekł, że plany zagospodarowania i wydobycia ropy i gazu na części norweskiego szelfu zostały zatwierdzone niezgodnie z prawem.",
    "meta_description": "Norweski Sąd Najwyższy orzekł, że plany zagospodarowania i wydobycia ropy i gazu na części norweskiego szelfu zostały zatwierdzone niezgodnie z prawem.",
    "keywords": "Gospodarka, Norwegii, Ważą, losy, złóż, których, wydobywa",
    "thumbnail_url": "https://i.gremicdn.pl/image/free/b0e1912a3a1ffe48d889681a86a78f06/?t=crop:1980:866:nowe:0:167,resize:fill:600:300,enlarge:1",
    "published_iso": "2026-11-13T22:40:25+01:00",
    "display_date": "13.11.2026, 22:40",
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
        "val": "Parkiet"
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
          "Norweski Sąd Najwyższy orzekł, że plany zagospodarowania i wydobycia ropy i gazu na części norweskiego szelfu zostały zatwierdzone niezgodnie z prawem. Państwo norweskie miało nie dochować wymaganych warunków w ocenach skutków wydobycia. Na objętych wyrokiem polach koncesje ma Orlen. [Źródło: Parkiet]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Orzeczenie dotyczy trzech strategicznych pól na Morzu Północnym, w tym złóż, w których udziały posiada polski Orlen. [Źródło: Energetyka24]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Parkiet",
        "angle": "Raport rynkowy",
        "summary": "Przełomowy wyrok w Norwegii. Ważą się losy złóż, na których wydobywa Orlen",
        "url": "https://www.parkiet.com/surowce-i-paliwa/art45485951-przelomowy-wyrok-w-norwegii-waza-sie-losy-zloz-na-ktorych-wydobywa-orlen"
      },
      {
        "outlet": "Energetyka24",
        "angle": "Kontekst sektorowy",
        "summary": "Przełomowy wyrok w Norwegii: plany wydobycia ropy i gazu bezprawne. Co ze złożami Orlenu?",
        "url": "https://energetyka24.com/surowce/ropa/przelomowy-wyrok-w-norwegii-plany-wydobycia-ropy-i-gazu-bezprawne-co-ze-zlozami-orlenu"
      }
    ],
    "sources": [
      "Energetyka24",
      "Parkiet"
    ],
    "corrections": []
  },
  {
    "id": 4,
    "path": "/Polska/Polityka",
    "seo_url": "/Polska/Polityka/pracownik-telewizji-republika-uslyszal-zarzut-minister-potwierdza",
    "seo_title": "Pracownik Telewizji Republika usłyszał zarzut. Minister potwierdza",
    "summary_lead": "Pracownik Telewizji Republika, Jarosław O., usłyszał zarzut naruszenia miru domowego – poinformował w mediach społecznościowych Waldemar Żurek.",
    "meta_description": "Pracownik Telewizji Republika, Jarosław O., usłyszał zarzut naruszenia miru domowego – poinformował w mediach społecznościowych Waldemar Żurek.",
    "keywords": "Polityka, Pracownik, Telewizji, Republika, Minister, potwierdza",
    "thumbnail_url": "https://ipla.pluscdn.pl/dituel/cp/ix/ix4j4ckqdmvgy3uawmhwhjpxnydfpe9g.jpg",
    "published_iso": "2026-11-13T22:40:25+01:00",
    "display_date": "13.11.2026, 22:40",
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
        "val": "/Polska/Polityka"
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
          "Pracownik Telewizji Republika, Jarosław O., usłyszał zarzut naruszenia miru domowego – poinformował w mediach społecznościowych Waldemar Żurek. Jak wyjaśniono sprawa dotyczy wdarcia się do strefy ochronnej budynku Prokuratury Krajowej podczas przesłuchania Tomasza Sakiewicza. [Źródło: Polsat News, WP Wiadomości]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Polsat News",
        "angle": "Relacja wiodąca",
        "summary": "Pracownik Telewizji Republika usłyszał zarzut. Minister potwierdza",
        "url": "https://www.polsatnews.pl/wiadomosc/2026-11-13/pracownik-telewizji-republika-uslyszal-zarzut-minister-potwierdza/"
      },
      {
        "outlet": "WP Wiadomości",
        "angle": "Relacja uzupełniająca",
        "summary": "Pracownik TV Republika z zarzutem. Żurek ujawnia szczegóły",
        "url": "https://wiadomosci.wp.pl/pracownik-tv-republika-z-zarzutem-zurek-ujawnia-szczegoly-7350712164108320a"
      }
    ],
    "sources": [
      "Polsat News",
      "WP Wiadomości"
    ],
    "corrections": []
  },
  {
    "id": 5,
    "path": "/Sport",
    "seo_url": "/Sport/mirra-andriejewa-diana-sznajder-relacja-na-zywo",
    "seo_title": "Mirra Andriejewa – Diana Sznajder [RELACJA NA ŻYWO]",
    "summary_lead": "Mirra Andriejewa w ostatniej chwili dowiedziała się, że jej rywalką na koniec zmagań w grupie nie będzie Karolina Muchova. Czeszkę zastąpiła Diana Sznajder. To będzie jedyny mecz Rosjanki na tym turnieju.",
    "meta_description": "Mirra Andriejewa w ostatniej chwili dowiedziała się, że jej rywalką na koniec zmagań w grupie nie będzie Karolina Muchova. Czeszkę zastąpiła Diana Sznajder.",
    "keywords": "Sport, Mirra, Andriejewa, Diana, Sznajder",
    "thumbnail_url": "https://cdn.przegladsportowy.onet.pl/1/OWGk9lBaHR0cHM6Ly9vY2RuLmV1L3B1bHNjbXMvTURBXy8zOTY0NzY1NWI1YzE5Mjk5NDVkMWUwNTNlZThkZTJlOS5qcGeSlQMAzLHNFjDNDHuTBc0JYM0GQN4AAqEwB6ExBA",
    "published_iso": "2026-11-13T21:44:09+01:00",
    "display_date": "13.11.2026, 21:44",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 96,
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
        "val": "Przegląd Sportowy"
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
          "Mirra Andriejewa w ostatniej chwili dowiedziała się, że jej rywalką na koniec zmagań w grupie nie będzie Karolina Muchova. Czeszkę zastąpiła Diana Sznajder. To będzie jedyny mecz Rosjanki na tym turnieju. [Źródło: Przegląd Sportowy, Polsat Sport]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Po 56 minutach Andriejewa cieszyła się zwycięstwem 6:2, 6:1. [Źródło: WP SportoweFakty]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Przegląd Sportowy",
        "angle": "Relacja wiodąca",
        "summary": "Mirra Andriejewa – Diana Sznajder [RELACJA NA ŻYWO]",
        "url": "https://przegladsportowy.onet.pl/tenis/mirra-andriejewa-diana-sznajder-relacja-na-zywo-wta-finals-live/ekt98d3"
      },
      {
        "outlet": "WP SportoweFakty",
        "angle": "Relacja sportowa",
        "summary": "Mecz niegodny WTA Finals? 56 minut i Mirra Andriejewa już myślami w półfinale",
        "url": "https://sportowefakty.wp.pl/tenis/1284025/mecz-niegodny-wta-finals-56-minut-i-mirra-andriejewa-myslami-w-polfinale"
      },
      {
        "outlet": "Polsat Sport",
        "angle": "Relacja sportowa",
        "summary": "WTA Finals: Mirra Andriejewa – Diana Sznajder. Relacja live i wynik na żywo",
        "url": "https://www.polsatsport.pl/wiadomosc/2026-11-13/wta-finals-mirra-andriejewa-diana-sznajder-relacja-live-i-wynik-na-zywo/"
      }
    ],
    "sources": [
      "Polsat Sport",
      "Przegląd Sportowy",
      "WP SportoweFakty"
    ],
    "corrections": []
  },
  {
    "id": 6,
    "path": "/Swiat",
    "seo_url": "/Swiat/starshield-ponownie-ograniczony-dla-ukrainy-zelenski-alarmuje",
    "seo_title": "Starshield ponownie ograniczony dla Ukrainy. Zełeński alarmuje",
    "summary_lead": "Wojska ukraińskie odnotowują poważne zakłócenia w działaniu systemu wojskowej łączności satelitarnej Starshield; utrudnia to walkę z rosyjskimi dronami odrzutowymi i ułatwia Kremlowi zabijanie cywilów – oświadczył w czwartek prezydent…",
    "meta_description": "Wojska ukraińskie odnotowują poważne zakłócenia w działaniu systemu wojskowej łączności satelitarnej Starshield; utrudnia to walkę z rosyjskimi dronami…",
    "keywords": "Swiat, Starshield, ponownie, ograniczony, Ukrainy, Zełeński, alarmuje",
    "thumbnail_url": "https://cdn.defence24.pl/2026/03/31/320x240px/2dA1VoFwswU4nhhSIURUdY60uH3hsowpoY74ZRMI.btd7.jpg",
    "published_iso": "2026-11-13T21:44:09+01:00",
    "display_date": "13.11.2026, 21:44",
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
        "val": "/Swiat"
      },
      {
        "label": "Główne źródło",
        "val": "Space24"
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
          "Wojska ukraińskie odnotowują poważne zakłócenia w działaniu systemu wojskowej łączności satelitarnej Starshield; utrudnia to walkę z rosyjskimi dronami odrzutowymi i ułatwia Kremlowi zabijanie cywilów – oświadczył w czwartek prezydent Ukrainy Wołodymyr Zełenski. [Źródło: Space24, WP Wiadomości]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Space24",
        "angle": "Analiza sektorowa",
        "summary": "Starshield ponownie ograniczony dla Ukrainy. Zełeński alarmuje",
        "url": "https://space24.pl/bezpieczenstwo/technologie-wojskowe/starshield-ponownie-ograniczony-dla-ukrainy-zelenski-alarmuje"
      },
      {
        "outlet": "WP Wiadomości",
        "angle": "Relacja uzupełniająca",
        "summary": "Ukraina ma problem z przechwytywaniem rosyjskich dronów. Zełenski alarmuje",
        "url": "https://wiadomosci.wp.pl/ukraina-ma-problem-z-przechwytywaniem-rosyjskich-dronow-zelenski-alarmuje-7350690454632448a"
      }
    ],
    "sources": [
      "Space24",
      "WP Wiadomości"
    ],
    "corrections": []
  },
  {
    "id": 7,
    "path": "/Polska",
    "seo_url": "/Polska/slawa-upa-na-pomnikach-w-trojmiescie-zatrzymano-17-latka-z-ukrainy",
    "seo_title": "\"Slawa UPA\" na pomnikach w Trójmieście. Zatrzymano 17-latka z Ukrainy",
    "summary_lead": "Obywatel Ukrainy został zatrzymany i usłyszał zarzuty związane z niszczeniem pomników i propagowaniem ustroju totalitarnego. 17-latek na siedmiu pomnikach w Trójmieście napisał Slawa UPA.",
    "meta_description": "Obywatel Ukrainy został zatrzymany i usłyszał zarzuty związane z niszczeniem pomników i propagowaniem ustroju totalitarnego.",
    "keywords": "Polska, Slawa, pomnikach, Trójmieście, 17-latka, Ukrainy",
    "thumbnail_url": "https://ipla.pluscdn.pl/dituel/cp/35/354jmv74f83g2qj21thahhe4f6ionn98.jpg",
    "published_iso": "2026-11-13T21:44:08+01:00",
    "display_date": "13.11.2026, 21:44",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 98,
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
        "val": "Polsat News"
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
          "Obywatel Ukrainy został zatrzymany i usłyszał zarzuty związane z niszczeniem pomników i propagowaniem ustroju totalitarnego. 17-latek na siedmiu pomnikach w Trójmieście napisał Slawa UPA. Zastosowano wobec niego dozór policyjny oraz zakaz opuszczania kraju. [Źródło: Polsat News, Gazeta.pl, Wyborcza.pl, Radio Gdańsk]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Na obeliskach i miejscach pamięci namalowano m.in. hasło \"Sława UPA\". Nastolatek usłyszał siedem zarzutów, w tym dotyczących propagowania ideologii faszystowskiej, nawoływania do nienawiści na tle narodowościowym i znieważenia pomników. [Źródło: Fakt.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Polsat News",
        "angle": "Relacja wiodąca",
        "summary": "\"Slawa UPA\" na pomnikach w Trójmieście. Zatrzymano 17-latka z Ukrainy",
        "url": "https://www.polsatnews.pl/wiadomosc/2026-11-13/slawa-upa-na-pomnikach-w-trojmiescie-zatrzymano-17-latka-z-ukrainy/"
      },
      {
        "outlet": "Fakt.pl",
        "angle": "Relacja uzupełniająca",
        "summary": "\"Slawa UPA\" na trójmiejskich pomnikach. Zatrzymano 17-latka",
        "url": "https://www.fakt.pl/wydarzenia/polska/trojmiasto/napisy-slawa-upa-na-pomnikach-w-gdansku-i-gdyni-17-latek-uslyszal-zarzuty/0vve7hp"
      },
      {
        "outlet": "Gazeta.pl",
        "angle": "Relacja uzupełniająca",
        "summary": "Napis \"Slawa UPA\" na kilkunastu pomnikach w Polsce. Zarzuty dla 17-letniego Ukraińca",
        "url": "https://wiadomosci.gazeta.pl/polska/7,198073,33131679,napis-slawa-upa-na-kilkunastu-pomnikach-w-polsce-zarzuty.html?utm_source=RSS&utm_medium=RSS&utm_campaign=10199882"
      },
      {
        "outlet": "Wyborcza.pl",
        "angle": "Relacja uzupełniająca",
        "summary": "Zarzuty dla 17-latka. Na polskich pomnikach umieścił napis \"Slawa UPA\"",
        "url": "https://wyborcza.pl/7,75398,33131706,zarzuty-dla-17-latka-na-polskich-pomnikach-umiescil-napis-slawa.html"
      },
      {
        "outlet": "Radio Gdańsk",
        "angle": "Doniesienie regionalne",
        "summary": "Pisał „Slawa UPA” na trójmiejskich pomnikach. Grożą mu 3 lata więzienia",
        "url": "https://radiogdansk.pl/wiadomosci/trojmiasto/2026/11/13/pisal-slawa-upa-na-trojmiejskich-pomnikach-groza-mu-3-lata-wiezienia/"
      }
    ],
    "sources": [
      "Fakt.pl",
      "Gazeta.pl",
      "Polsat News",
      "Radio Gdańsk",
      "Wyborcza.pl"
    ],
    "corrections": []
  },
  {
    "id": 8,
    "path": "/Swiat",
    "seo_url": "/Swiat/tankowiec-uderzyl-w-statek-wycieczkowy-dramatyczna-akcja-ratunkowa-na",
    "seo_title": "Tankowiec uderzył w statek wycieczkowy. Dramatyczna akcja ratunkowa na Missisipi",
    "summary_lead": "Trwa dramatyczna akcja ratunkowa na rzece Missisipi w Nowym Orleanie. W piątek (13 listopada) 160-metrowy tankowiec uderzył w zacumowany przy brzegu statek wycieczkowy.",
    "meta_description": "Trwa dramatyczna akcja ratunkowa na rzece Missisipi w Nowym Orleanie. W piątek (13 listopada) 160-metrowy tankowiec uderzył w zacumowany przy brzegu statek…",
    "keywords": "Swiat, Tankowiec, uderzył, statek, wycieczkowy, Dramatyczna, akcja",
    "thumbnail_url": "https://ocdn.eu/pulscms-transforms/1/qwRk9kuTURBXy83YTkzZjFiOC1hOTFkLTQ4NTQtYTRiMi04ZDFhMDFmMWU5M2EuanBlZ5GTAs0EsADeAAGhMAE",
    "published_iso": "2026-11-13T21:44:08+01:00",
    "display_date": "13.11.2026, 21:44",
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
        "val": "/Swiat"
      },
      {
        "label": "Główne źródło",
        "val": "Fakt.pl"
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
          "Trwa dramatyczna akcja ratunkowa na rzece Missisipi w Nowym Orleanie. W piątek (13 listopada) 160-metrowy tankowiec uderzył w zacumowany przy brzegu statek wycieczkowy. Według wstępnych informacji na pokładzie znajdowało się do 150 osób, w tym pasażerowie i członkowie załogi. [Źródło: Fakt.pl, WP Wiadomości]",
          "Na razie nie ma informacji o ofiarach śmiertelnych. [Źródło: Fakt.pl, WP Wiadomości]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Jednostka zaczęła nabierać wody. [Źródło: Onet Wiadomości]",
          "Z pierwszych doniesień amerykańskich mediów wynika, że na pokładzie wycieczkowca znajdowało się ponad 130 osób. [Źródło: TVN24]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Fakt.pl",
        "angle": "Relacja wiodąca",
        "summary": "Tankowiec uderzył w statek wycieczkowy. Dramatyczna akcja ratunkowa na Missisipi",
        "url": "https://www.fakt.pl/wydarzenia/swiat/usa-tankowiec-uderzyl-w-statek-wycieczkowy-trwa-akcja-ratunkowa-na-missisipi/4en57q0"
      },
      {
        "outlet": "Onet Wiadomości",
        "angle": "Relacja uzupełniająca",
        "summary": "Akcja ratunkowa w porcie w Nowym Orleanie. Tonie statek z prawie 150 osobami",
        "url": "https://wiadomosci.onet.pl/swiat/akcja-ratunkowa-w-porcie-w-nowym-orleanie-tonie-statek-z-prawie-150-pasazerami/9z3d6r7"
      },
      {
        "outlet": "TVN24",
        "angle": "Relacja uzupełniająca",
        "summary": "Tankowiec uderzył w statek wycieczkowy. Akcja służb w USA",
        "url": "https://tvn24.pl/swiat/statek-wycieczkowy-zderzyl-sie-z-tankowcem-w-nowym-orleanie-st9338558?source=rss"
      },
      {
        "outlet": "WP Wiadomości",
        "angle": "Relacja uzupełniająca",
        "summary": "Tankowiec staranował statek. Trwa akcja ratunkowa na Missisipi",
        "url": "https://wiadomosci.wp.pl/tankowiec-staranowal-statek-trwa-akcja-ratunkowa-na-missisipi-7350699373516800a"
      }
    ],
    "sources": [
      "Fakt.pl",
      "Onet Wiadomości",
      "TVN24",
      "WP Wiadomości"
    ],
    "corrections": []
  },
  {
    "id": 9,
    "path": "/Swiat",
    "seo_url": "/Swiat/mistrz-swiata-kandydatem-afd-na-prezydenta-niemiec-to-nie-zart",
    "seo_title": "Mistrz świata kandydatem AfD na prezydenta Niemiec. To nie żart",
    "summary_lead": "Fani międzynarodowej piłki nożnej z lat 80. i 90. mogą zapewne pamiętać Thomasa Bertholda. To podstawowy obrońca reprezentacji RFN, która w 1990 roku zdobyła mistrzostwo świata.",
    "meta_description": "Fani międzynarodowej piłki nożnej z lat 80. i 90. mogą zapewne pamiętać Thomasa Bertholda.",
    "keywords": "Swiat, Mistrz, kandydatem, prezydenta, Niemiec, żart",
    "thumbnail_url": "https://bi.im-g.pl/im/a7/98/1f/z33131687IHG,GERMANY-POLITICS-AFD-EUROPE.jpg",
    "published_iso": "2026-11-13T20:48:58+01:00",
    "display_date": "13.11.2026, 20:48",
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
        "val": "/Swiat"
      },
      {
        "label": "Główne źródło",
        "val": "Sport.pl"
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
          "Fani międzynarodowej piłki nożnej z lat 80. i 90. mogą zapewne pamiętać Thomasa Bertholda. To podstawowy obrońca reprezentacji RFN, która w 1990 roku zdobyła mistrzostwo świata. Po zakończeniu kariery były piłkarz zaangażował się m.in. w politykę. [Źródło: Sport.pl]",
          "Według doniesień niemieckich mediów partia AfD ma zamiar wystawić go jako kandydata na prezydenta kraju. Mimo że... nie ma on najmniejszych szans na zwycięstwo. [Źródło: Sport.pl]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "\"Die Welt\" przedstawia, kim jest 62-krotny reprezentant kraju i jakie ma poglądy. Wiele z nich można uznać za skrajne. [Źródło: Przegląd Sportowy]",
          "Oficjalna decyzja ma zapaść w sobotę, 14 listopada. [Źródło: WP SportoweFakty]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Sport.pl",
        "angle": "Relacja wiodąca",
        "summary": "Mistrz świata kandydatem AfD na prezydenta Niemiec. To nie żart",
        "url": "https://www.sport.pl/pilka/7,64946,33131669,mistrz-swiata-kandydatem-afd-na-prezydenta-niemiec-to-nie-zart.html"
      },
      {
        "outlet": "Przegląd Sportowy",
        "angle": "Relacja sportowa",
        "summary": "Gwiazdor może być nowym prezydentem Niemiec. AfD wskazało kandydata",
        "url": "https://przegladsportowy.onet.pl/pilka-nozna/gwiazdor-nowym-prezydentem-niemiec-afd-wskazalo-kandydata/b3httmw"
      },
      {
        "outlet": "WP SportoweFakty",
        "angle": "Relacja sportowa",
        "summary": "Może zostać prezydentem Niemiec. To były mistrz świata",
        "url": "https://sportowefakty.wp.pl/pilka-nozna/1284061/moze-zostac-prezydentem-niemiec-to-byly-mistrz-swiata"
      }
    ],
    "sources": [
      "Przegląd Sportowy",
      "Sport.pl",
      "WP SportoweFakty"
    ],
    "corrections": []
  },
  {
    "id": 10,
    "path": "/Polska/Gospodarka",
    "seo_url": "/Polska/Gospodarka/tyle-trzeba-zarabiac-na-3500-zl-emerytury-kobiety-maja-gorzej",
    "seo_title": "Tyle trzeba zarabiać na 3500 zł emerytury. Kobiety mają gorzej",
    "summary_lead": "Marzysz o spokojnej jesieni życia i emeryturze na poziomie przynajmniej 3500 zł? Choć dla wielu osób to kwota pozwalająca zaledwie na pokrycie podstawowych rachunków, wypracowanie jej w polskim systemie wymaga zarobków znacznie…",
    "meta_description": "Marzysz o spokojnej jesieni życia i emeryturze na poziomie przynajmniej 3500 zł?",
    "keywords": "Gospodarka, Tyle, trzeba, zarabiać, emerytury, gorzej",
    "thumbnail_url": "https://webp-konwerter.incdn.pl/eyJmIjoiaHR0cHM6Ly9pbmZvci13ZWItc3RhdGljLmluY2RuLnB/sL2RncHN0YXRpYy9kb2N1bWVudHMvRk9CMDAwMDAwMDAwMDAwNz/cwMTcwMS9maWxlcy9rb211LXp1cy1kb3BsYWNpLWRvLWVtZXJ5d/HVyeS1taW5pbWFsbmVqLTM5MjMyMzM2LmpwZyIsInciOjM4NDB9",
    "published_iso": "2026-11-13T20:48:58+01:00",
    "display_date": "13.11.2026, 20:48",
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
        "val": "GazetaPrawna.pl (DGP)"
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
          "Marzysz o spokojnej jesieni życia i emeryturze na poziomie przynajmniej 3500 zł? Choć dla wielu osób to kwota pozwalająca zaledwie na pokrycie podstawowych rachunków, wypracowanie jej w polskim systemie wymaga zarobków znacznie powyżej krajowej średniej. Sprawdzamy aktualne wyliczenia – różnice między kobietami a mężczyznami są ogromne. [Źródło: GazetaPrawna.pl (DGP)]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Wysokość emerytury w ZUS zależy przede wszystkim od tego, ile zarabiamy i jak długo odprowadzamy składki w trakcie pracy. Osoby, które dziś mają 40 lat i chcą w przyszłości dostawać około 5 tys. zł miesięcznie, muszą zarabiać od 10 do 17 tys. zł brutto. [Źródło: WP Finanse]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "GazetaPrawna.pl (DGP)",
        "angle": "Relacja wiodąca",
        "summary": "Tyle trzeba zarabiać na 3500 zł emerytury. Kobiety mają gorzej",
        "url": "https://www.gazetaprawna.pl/praca/emerytury-i-renty/artykuly/11344279,tyle-trzeba-zarabiac-na-3500-zl-emerytury-kobiety-maja-gorzej.html"
      },
      {
        "outlet": "WP Finanse",
        "angle": "Perspektywa rynkowa",
        "summary": "Tyle trzeba zarabiać na 5 tys. zł emerytury. Oto wyliczenia",
        "url": "https://finanse.wp.pl/tyle-trzeba-zarabiac-na-5-tys-zl-emerytury-oto-wyliczenia-7350678904064000a"
      }
    ],
    "sources": [
      "GazetaPrawna.pl (DGP)",
      "WP Finanse"
    ],
    "corrections": []
  },
  {
    "id": 11,
    "path": "/Polska",
    "seo_url": "/Polska/polska-rakieta-ilr-33-bursztyn-2k-zaliczyla-udany-lot",
    "seo_title": "Polska rakieta ILR-33 BURSZTYN 2K zaliczyła udany lot",
    "summary_lead": "Rakieta suborbitalna ILR-33 BURSZTYN 2K Łukasiewicz – Instytutu Lotnictwa zakończyła planowany lot w ramach listopadowych prób poligonowych projektu SUBCOM.",
    "meta_description": "Rakieta suborbitalna ILR-33 BURSZTYN 2K Łukasiewicz – Instytutu Lotnictwa zakończyła planowany lot w ramach listopadowych prób poligonowych projektu SUBCOM.",
    "keywords": "Polska, rakieta, ILR-33, BURSZTYN, zaliczyła, udany",
    "thumbnail_url": "https://cdn.defence24.pl/2026/11/13/320x240px/zFaoMlKkDnKggSn4OsPusHPL4ThS840YsWJgh4Ie.jpbl.jpg",
    "published_iso": "2026-11-13T20:48:58+01:00",
    "display_date": "13.11.2026, 20:48",
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
        "val": "/Polska"
      },
      {
        "label": "Główne źródło",
        "val": "Space24"
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
          "Rakieta suborbitalna ILR-33 BURSZTYN 2K Łukasiewicz – Instytutu Lotnictwa zakończyła planowany lot w ramach listopadowych prób poligonowych projektu SUBCOM. Głównym celem testu była weryfikacja systemów komunikacji, lokalizacji i śledzenia rakiety, opracowanych przez firmę Thorium Space, w warunkach rzeczywistego lotu. [Źródło: Space24, RadioMaryja.pl]",
          "Zgodnie z planowanym profilem misji rakieta rozpędziła się do dwukrotności prędkości dźwięku. [Źródło: Space24]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Space24",
        "angle": "Analiza sektorowa",
        "summary": "Polska rakieta ILR-33 BURSZTYN 2K zaliczyła udany lot",
        "url": "https://space24.pl/pojazdy-kosmiczne/systemy-nosne/polska-rakieta-ilr-33-bursztyn-2k-zaliczyla-udany-lot"
      },
      {
        "outlet": "RadioMaryja.pl",
        "angle": "Relacja uzupełniająca",
        "summary": "Udany próbny lot rakiety ILR-33 BURSZTYN 2K",
        "url": "https://www.radiomaryja.pl/informacje/udany-probny-lot-rakiety-ilr-33-bursztyn-2k/"
      }
    ],
    "sources": [
      "RadioMaryja.pl",
      "Space24"
    ],
    "corrections": []
  },
  {
    "id": 12,
    "path": "/Swiat",
    "seo_url": "/Swiat/kreml-przejal-zachodni-biznes-miliony-rubli-na-sprzet-dla-armii",
    "seo_title": "Kreml przejął zachodni biznes. Miliony rubli na sprzęt dla armii",
    "summary_lead": "Rosja wykorzystuje przejęte aktywa zachodnich przedsiębiorstw do wspierania własnej armii. Środki są przeznaczane m.in. na zakup dronów, pojazdów terenowych i sprzętu łączności – ustalił Bloomberg.",
    "meta_description": "Rosja wykorzystuje przejęte aktywa zachodnich przedsiębiorstw do wspierania własnej armii.",
    "keywords": "Swiat, Kreml, przejął, zachodni, biznes, Miliony, rubli",
    "thumbnail_url": "https://i.gremicdn.pl/image/free/3dff1114ee68ba49b4d22b9c88c2d745/?t=crop:4000:1749:nowe:0:331.34282018111,resize:fill:600:300,enlarge:1",
    "published_iso": "2026-11-13T20:48:58+01:00",
    "display_date": "13.11.2026, 20:48",
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
        "val": "/Swiat"
      },
      {
        "label": "Główne źródło",
        "val": "Rzeczpospolita"
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
          "Rosja wykorzystuje przejęte aktywa zachodnich przedsiębiorstw do wspierania własnej armii. Środki są przeznaczane m.in. na zakup dronów, pojazdów terenowych i sprzętu łączności – ustalił Bloomberg. [Źródło: Rzeczpospolita, Business Insider PL]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Rzeczpospolita",
        "angle": "Relacja wiodąca",
        "summary": "Kreml przejął zachodni biznes. Miliony rubli na sprzęt dla armii",
        "url": "https://www.rp.pl/biznes/art45487511-kreml-przejal-zachodni-biznes-miliony-rubli-na-sprzet-dla-armii"
      },
      {
        "outlet": "Business Insider PL",
        "angle": "Perspektywa rynkowa",
        "summary": "Kreml przejął zachodnie firmy. Teraz wpłacają środki na armię",
        "url": "https://businessinsider.com.pl/gospodarka/zachodnie-marki-pod-kontrola-rosji-pieniadze-trafiaja-na-front/2241jm2"
      }
    ],
    "sources": [
      "Business Insider PL",
      "Rzeczpospolita"
    ],
    "corrections": []
  },
  {
    "id": 13,
    "path": "/Polska",
    "seo_url": "/Polska/strzelal-do-policjantow-w-krakowie-funkcjonariusze-odpowiedzieli-ogniem",
    "seo_title": "Strzelał do policjantów w Krakowie. Funkcjonariusze odpowiedzieli ogniem",
    "summary_lead": "Do strzałów ze strony mężczyzny poruszającego się z bronią i policjantów doszło w czwartek po godzinie 13 w pobliżu ul. Bieżanowskiej w Krakowie – wynika z informacji krakowskiej Policji. W zdarzeniu nikt nie został ranny.",
    "meta_description": "Do strzałów ze strony mężczyzny poruszającego się z bronią i policjantów doszło w czwartek po godzinie 13 w pobliżu ul. Bieżanowskiej w Krakowie – wynika z…",
    "keywords": "Polska, Strzelał, Krakowie, Funkcjonariusze, odpowiedzieli, ogniem",
    "thumbnail_url": "https://cdn.defence24.pl/2026/09/01/320x240px/NbBjKSxEiBC1K1BTZ5pOwhZrCAGOcVBs0DvzjOB8.13zc.jpg",
    "published_iso": "2026-11-13T19:50:37+01:00",
    "display_date": "13.11.2026, 19:50",
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
        "val": "InfoSecurity24"
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
          "Do strzałów ze strony mężczyzny poruszającego się z bronią i policjantów doszło w czwartek po godzinie 13 w pobliżu ul. Bieżanowskiej w Krakowie – wynika z informacji krakowskiej Policji. W zdarzeniu nikt nie został ranny. [Źródło: InfoSecurity24]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Mężczyzna został zatrzymany po pościgu w rejonie ulic Wielickiej i Bieżanowskiej. Jak ujawniła prokuratura, 39-latek ma na koncie wyrok za zabójstwo. [Źródło: Fakt.pl]",
          "Prokuratura chce dla niego tymczasowego aresztu. [Źródło: Gazeta.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "InfoSecurity24",
        "angle": "Analiza sektorowa",
        "summary": "Strzelał do policjantów w Krakowie. Funkcjonariusze odpowiedzieli ogniem",
        "url": "https://infosecurity24.pl/sluzby-mundurowe/policja/strzelal-do-policjantow-w-krakowie-funkcjonariusze-odpowiedzieli-ogniem"
      },
      {
        "outlet": "Fakt.pl",
        "angle": "Relacja uzupełniająca",
        "summary": "Strzelał do policjantów w Krakowie. Ma kryminalną przeszłość. 39-latek usłyszał zarzuty",
        "url": "https://www.fakt.pl/wydarzenia/krakow-39-latek-strzelal-do-policjantow-prokuratura-przedstawila-mu-zarzuty/2g8njb6"
      },
      {
        "outlet": "Gazeta.pl",
        "angle": "Relacja uzupełniająca",
        "summary": "Zarzuty dla mężczyzny, który strzelał z broni gazowej do policjantów w Krakowie. \"Jest recydywistą\"",
        "url": "https://wiadomosci.gazeta.pl/polska/7,198072,33131581,zarzuty-dla-mezczyzny-ktory-strzelal-z-broni-gazowej-do-policjantow.html?utm_source=RSS&utm_medium=RSS&utm_campaign=10199882"
      }
    ],
    "sources": [
      "Fakt.pl",
      "Gazeta.pl",
      "InfoSecurity24"
    ],
    "corrections": []
  },
  {
    "id": 14,
    "path": "/Polska/Polityka",
    "seo_url": "/Polska/Polityka/zakaz-reklamy-aptek-zniesiony-ale-kary-beda-wyzsze-decyzja-prezydenta",
    "seo_title": "Zakaz reklamy aptek zniesiony, ale kary będą wyższe. Decyzja prezydenta",
    "summary_lead": "Prezydent Karol Nawrocki podpisał ustawę znoszącą całkowity zakaz reklamy aptek. Będą jednak ograniczenia dotyczące reklam, za których złamanie mają grozić kary do miliona złotych.",
    "meta_description": "Prezydent Karol Nawrocki podpisał ustawę znoszącą całkowity zakaz reklamy aptek.",
    "keywords": "Polityka, Zakaz, reklamy, aptek, zniesiony, kary, wyższe",
    "thumbnail_url": "https://i.gremicdn.pl/image/free/8376316cf12ee69552c15e62105094df/?t=crop:7360:3217:nowe:0:847,resize:fill:600:300,enlarge:1",
    "published_iso": "2026-11-13T19:50:37+01:00",
    "display_date": "13.11.2026, 19:50",
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
        "val": "Rzeczpospolita"
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
          "Prezydent Karol Nawrocki podpisał ustawę znoszącą całkowity zakaz reklamy aptek. Będą jednak ograniczenia dotyczące reklam, za których złamanie mają grozić kary do miliona złotych. [Źródło: Rzeczpospolita, Gazeta.pl]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Kancelaria Prezydenta przekazała tę informację w piątek. Nowe przepisy wprowadzają możliwość prowadzenia reklamy, choć z licznymi ograniczeniami. Za naruszenie regulacji grozi kara sięgająca miliona złotych. [Źródło: Business Insider PL]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Rzeczpospolita",
        "angle": "Relacja wiodąca",
        "summary": "Zakaz reklamy aptek zniesiony, ale kary będą wyższe. Decyzja prezydenta",
        "url": "https://www.rp.pl/prawo-w-polsce/art45487551-zakaz-reklamy-aptek-zniesiony-ale-kary-beda-wyzsze-decyzja-prezydenta"
      },
      {
        "outlet": "Business Insider PL",
        "angle": "Perspektywa rynkowa",
        "summary": "Prezydent podpisał ustawę dla aptek. Koniec zakazu, ale nie wszystko wolno",
        "url": "https://businessinsider.com.pl/prawo/zakaz-reklamy-aptek-zniesiony-prezydent-podpisal-ustawe/f2mk6h6"
      },
      {
        "outlet": "Gazeta.pl",
        "angle": "Relacja uzupełniająca",
        "summary": "Nawrocki podpisał sześć ustaw. Wśród nich zniesienie całkowitego zakazu reklamy aptek",
        "url": "https://wiadomosci.gazeta.pl/polityka/7,198012,33131546,nawrocki-podpisal-szesc-ustaw-wsrod-nich-m-in-zniesienie-calkowitego.html?utm_source=RSS&utm_medium=RSS&utm_campaign=10199882"
      }
    ],
    "sources": [
      "Business Insider PL",
      "Gazeta.pl",
      "Rzeczpospolita"
    ],
    "corrections": []
  },
  {
    "id": 15,
    "path": "/Polska/Gospodarka",
    "seo_url": "/Polska/Gospodarka/darowizny-dla-ofiar-zamachu-bez-podatku-jest-projekt-rozporzadzenia",
    "seo_title": "Darowizny dla ofiar zamachu bez podatku. Jest projekt rozporządzenia",
    "summary_lead": "Ministerstwo Finansów przygotowało projekt rozporządzenia dotyczącego zaniechania poboru podatku od spadków i darowizn w związku z zamachem w Krakowie.",
    "meta_description": "Ministerstwo Finansów przygotowało projekt rozporządzenia dotyczącego zaniechania poboru podatku od spadków i darowizn w związku z zamachem w Krakowie.",
    "keywords": "Gospodarka, Darowizny, ofiar, zamachu, podatku, projekt, rozporządzenia",
    "thumbnail_url": "https://files.niezalezna.tech/images/upload/2026/11/13/n_97e8339b7d6f267229da7b750e9cba43510d22f2c7821e8715be40856bf34511_c.jpg?r=750,400",
    "published_iso": "2026-11-13T19:50:37+01:00",
    "display_date": "13.11.2026, 19:50",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 96,
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
        "val": "Niezależna.pl"
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
          "Ministerstwo Finansów przygotowało projekt rozporządzenia dotyczącego zaniechania poboru podatku od spadków i darowizn w związku z zamachem w Krakowie. Nowe przepisy mają objąć osoby ranne w ataku z 7 listopada oraz rodziny zabitych, w tym bliskich ofiar z Ostrowca Świętokrzyskiego. Zwolnienie będzie dotyczyć darowizn przekazanych do końca 2027 roku. [Źródło: Niezależna.pl, Radio Kraków]",
          "Projekt opublikowano w piątek na stronach Rządowego Centrum Legislacji. Rozporządzenie ma wejść w życie dzień po ogłoszeniu. [Źródło: Niezależna.pl]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Jest projekt ważnych zmian dla osób dotkniętych tragedią w Krakowie oraz ich bliskich. [Źródło: Fakt.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Niezależna.pl",
        "angle": "Relacja wiodąca",
        "summary": "Darowizny dla ofiar zamachu bez podatku. Jest projekt rozporządzenia",
        "url": "https://niezalezna.pl/polska/darowizny-dla-ofiar-zamachu-bez-podatku-jest-projekt-rozporzadzenia/584119"
      },
      {
        "outlet": "Fakt.pl",
        "angle": "Relacja uzupełniająca",
        "summary": "Zamach w Krakowie. Ważna decyzja ws. darowizn na rzecz ofiar ataku i ich bliskich",
        "url": "https://www.fakt.pl/wydarzenia/krakow-darowizny-na-rzecz-ofiar-zamachu-i-ich-bliskich-beda-zwolnione-z-podatku/kdty92j"
      },
      {
        "outlet": "Radio Kraków",
        "angle": "Doniesienie regionalne",
        "summary": "Darowizny dla ofiar ataku w Krakowie bez podatku. Jest projekt rozporządzenia",
        "url": "https://radiokrakow.pl/wiadomosci/krakow/darowizny-dla-ofiar-ataku-w-krakowie-bez-podatku-jest-projekt-rozporzadzenia/187719"
      }
    ],
    "sources": [
      "Fakt.pl",
      "Niezależna.pl",
      "Radio Kraków"
    ],
    "corrections": []
  },
  {
    "id": 16,
    "path": "/Sport",
    "seo_url": "/Sport/odwazne-slowa-debiutanta-urbana-to-po-to-jest-w-kadrze-wyjde-i-pokaze",
    "seo_title": "Odważne słowa debiutanta Urbana. To po to jest w kadrze. \"Wyjdę i pokażę\"",
    "summary_lead": "Już w sobotę o godz. 20:45 piłkarska reprezentacja Polski zmierzy się z Rumunią w ramach 5. kolejki Dywizji B Ligi Narodów.",
    "meta_description": "Już w sobotę o godz. 20:45 piłkarska reprezentacja Polski zmierzy się z Rumunią w ramach 5. kolejki Dywizji B Ligi Narodów.",
    "keywords": "Sport, Odważne, słowa, debiutanta, Urbana, kadrze, Wyjdę",
    "thumbnail_url": "https://i.iplsc.com/-/000NCR1LRRID81JN-C321.webp",
    "published_iso": "2026-11-13T19:50:37+01:00",
    "display_date": "13.11.2026, 19:50",
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
          "Już w sobotę o godz. 20:45 piłkarska reprezentacja Polski zmierzy się z Rumunią w ramach 5. kolejki Dywizji B Ligi Narodów. Kadra Jana Urbana w piątek udała się do Bukaresztu, gdzie odbyła się oficjalna przedmeczowa konferencja prasowa. W niej poza selekcjonerem kadry udział wziął również debiutant, Bartosz Mazurek. [Źródło: Interia Sport]",
          "Gracz Red Bull Salzburg został zapytany m.in. o swoją drogę, gdyż jeszcze rok temu był w znacznie innym miejscu. Do tego zdradził, co ma zamiar zrobić w narodowych barwach. Mniej więcej rok temu nie trafiałem karnego w III lidze – powiedział na konferencji prasowej przed meczem z Rumunią. [Źródło: Interia Sport]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Bartosz Mazurek znakomicie zaadaptował się do gry w RB Salzburg, a teraz otrzymał debiutanckie powołanie do reprezentacji Polski. Choć 19-latek czuł, że prędzej czy później zaistnieje w kadrze, nie spodziewał się, że stanie się to tak szybko. [Źródło: Sport.pl]",
          "Kariera Bartosza Mazurka nabrała tempa. 19-latek stoi przed szansą debiutu w reprezentacji Polski. [Źródło: WP SportoweFakty]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Interia Sport",
        "angle": "Relacja wiodąca",
        "summary": "Odważne słowa debiutanta Urbana. To po to jest w kadrze. \"Wyjdę i pokażę\"",
        "url": "https://sport.interia.pl/pilka-nozna/reprezentacja-polski/news-debiutant-urbana-powiedzial-wprost-to-po-to-jest-w-kadrze-wy,nId,23573309"
      },
      {
        "outlet": "Sport.pl",
        "angle": "Relacja sportowa",
        "summary": "\"Rok temu zepsułem karnego w III lidze\". Debiutant w kadrze Urbana mówi wprost",
        "url": "https://www.sport.pl/pilka/7,65037,33131592,rok-temu-zepsulem-karnego-w-iii-lidze-debiutant-w-kadrze.html"
      },
      {
        "outlet": "WP SportoweFakty",
        "angle": "Relacja sportowa",
        "summary": "Rok temu grał w III lidze, teraz czeka na debiut w kadrze. \"Uznałbym to za abstrakcję\"",
        "url": "https://sportowefakty.wp.pl/pilka-nozna/1284033/kadrowicz-byl-szczery-do-bolu-uznalbym-to-za-abstrakcje"
      }
    ],
    "sources": [
      "Interia Sport",
      "Sport.pl",
      "WP SportoweFakty"
    ],
    "corrections": []
  },
  {
    "id": 17,
    "path": "/Polska",
    "seo_url": "/Polska/polska-wsrod-panstw-negocjujacych-w-sprawie-wojny-rosji-bruksela-oglasza",
    "seo_title": "Polska wśród państw negocjujących w sprawie wojny Rosji. Bruksela ogłasza",
    "summary_lead": "Polska znajdzie się wśród państw negocjujących w sprawie wojny Rosji przeciw Ukrainie – poinformował szef Rady Europejskiej Antonio Costa.",
    "meta_description": "Polska znajdzie się wśród państw negocjujących w sprawie wojny Rosji przeciw Ukrainie – poinformował szef Rady Europejskiej Antonio Costa.",
    "keywords": "Polska, wśród, państw, negocjujących, wojny, Rosji, Bruksela",
    "thumbnail_url": "https://i.iplsc.com/-/000NJ34XL08644A1-C321.webp",
    "published_iso": "2026-11-13T18:46:12+01:00",
    "display_date": "13.11.2026, 18:46",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 98,
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
        "val": "Interia Wydarzenia"
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
          "Polska znajdzie się wśród państw negocjujących w sprawie wojny Rosji przeciw Ukrainie – poinformował szef Rady Europejskiej Antonio Costa. Jak dodał, oprócz naszego kraju w rozmowach udział wezmą: Francja, Niemcy, Wielka Brytania i Włochy oraz instytucje Unii Europejskiej. [Źródło: Interia Wydarzenia, Onet Wiadomości, TVN24, WP Wiadomości, Wyborcza.pl]",
          "— Polska będzie w tym formacie odgrywała kluczową rolę – wskazał premier Donald Tusk. [Źródło: Interia Wydarzenia, Onet Wiadomości, TVN24, Wyborcza.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Interia Wydarzenia",
        "angle": "Relacja wiodąca",
        "summary": "Polska wśród państw negocjujących w sprawie wojny Rosji. Bruksela ogłasza",
        "url": "https://wydarzenia.interia.pl/zagranica/news-polska-wsrod-panstw-negocjujacych-w-sprawie-wojny-rosji-bruk,nId,23573329"
      },
      {
        "outlet": "Onet Wiadomości",
        "angle": "Relacja uzupełniająca",
        "summary": "Polska wśród państw negocjujących z Rosją w sprawie Ukrainy. Jest decyzja",
        "url": "https://wiadomosci.onet.pl/swiat/polska-wsrod-panstw-negocjujacych-z-rosja-w-sprawie-ukrainy-jest-decyzja/5s1fwm0"
      },
      {
        "outlet": "TVN24",
        "angle": "Relacja uzupełniająca",
        "summary": "Polska wśród krajów UE negocjujących w sprawie wojny Rosji przeciwko Ukrainie. \"Ucieszyłem się\"",
        "url": "https://tvn24.pl/swiat/polska-wsrod-krajow-ue-negocjujacych-z-rosja-w-sprawie-wojny-w-ukrainie-st9338400?source=rss"
      },
      {
        "outlet": "WP Wiadomości",
        "angle": "Relacja uzupełniająca",
        "summary": "Costa: Polska wśród państw negocjujących ws. Ukrainy",
        "url": "https://wiadomosci.wp.pl/costa-polska-wsrod-panstw-negocjujacych-ws-ukrainy-7350647710607360a"
      },
      {
        "outlet": "Wyborcza.pl",
        "angle": "Relacja uzupełniająca",
        "summary": "Polska wśród państw, które będą negocjować w sprawie Ukrainy",
        "url": "https://wyborcza.pl/7,75399,33131600,polska-wsrod-panstw-ktore-beda-negocjowac-w-sprawie-ukrainy.html"
      }
    ],
    "sources": [
      "Interia Wydarzenia",
      "Onet Wiadomości",
      "TVN24",
      "WP Wiadomości",
      "Wyborcza.pl"
    ],
    "corrections": []
  },
  {
    "id": 18,
    "path": "/Swiat",
    "seo_url": "/Swiat/kreml-zazadal-wyjscia-finlandii-z-nato-helsinki-reaguja-na-doniesienia",
    "seo_title": "Kreml zażądał wyjścia Finlandii z NATO? Helsinki reagują na doniesienia",
    "summary_lead": "Według niemieckiej gazety, rosyjska propozycja w sprawie „nowego ładu bezpieczeństwa w Europie” zakłada m.in. wycofanie się sił NATO w Estonii, na Łotwie i Litwie oraz wyjście z Sojuszu Finlandii, która wstąpiła do niego w 2023 roku.",
    "meta_description": "Według niemieckiej gazety, rosyjska propozycja w sprawie „nowego ładu bezpieczeństwa w Europie” zakłada m.in. wycofanie się sił NATO w Estonii, na Łotwie i…",
    "keywords": "Swiat, Kreml, zażądał, wyjścia, Finlandii, NATO, Helsinki",
    "thumbnail_url": "https://s19.tvp.pl/images2/9/e/c/uid_9ec1edcc48194a0cb46efe8a77021934_width_1280_play_0_pos_0_gs_0_height_720.jpg",
    "published_iso": "2026-11-13T18:46:12+01:00",
    "display_date": "13.11.2026, 18:46",
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
        "val": "/Swiat"
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
          "Według niemieckiej gazety, rosyjska propozycja w sprawie „nowego ładu bezpieczeństwa w Europie” zakłada m.in. wycofanie się sił NATO w Estonii, na Łotwie i Litwie oraz wyjście z Sojuszu Finlandii, która wstąpiła do niego w 2023 roku. [Źródło: TVP.info]",
          "Wśród swoich warunków wymienił też przejęcie całego Donbasu, w tym części obwodów donieckiego i ługańskiego, które obecnie znajdują się pod kontrolą Kijowa. Ponadto Ukraina miałaby przyjąć status państwa niezaangażowanego i zrzec się planów przystąpienia do NATO, przy czym opcja członkostwa w Unii Europejskiej pozostałaby otwarta. [Źródło: TVP.info]",
          "Według rosyjskiego planu porty w Odessie i Mikołajowie zostałyby zdemilitaryzowane, aby Ukraina nie mogła wykorzystywać ich jako baz morskich. Propozycja zawiera również zapisy dotyczące swobody żeglugi na Morzu Czarnym i Bałtyckim. Według „Bilda” żądania Moskwy dotyczą także Mołdawii. [Źródło: TVP.info]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Według niemieckiego dziennika \"Bild\" takie kwestie miały znaleźć się na stole podczas negocjacji pokojowych w Abu Zabi. Helsinki stanowczo odrzucają rosyjskie żądania. [Źródło: WP Wiadomości]",
          "W zamian miałaby wycofać broń jądrową z Białorusi. [Źródło: Kresy.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "TVP.info",
        "angle": "Relacja wiodąca",
        "summary": "Kreml zażądał wyjścia Finlandii z NATO? Helsinki reagują na doniesienia",
        "url": "https://www.tvp.info/96459710/finlandia-ma-wyjsc-z-nato-kreml-stawia-warunki-w-negocjacjach-pokojowych"
      },
      {
        "outlet": "WP Wiadomości",
        "angle": "Relacja uzupełniająca",
        "summary": "Rosja chce wyjścia Finlandii z NATO? Ostra reakcja Helsinek",
        "url": "https://wiadomosci.wp.pl/rosja-chce-wyjscia-finlandii-z-nato-ostra-reakcja-helsinek-7350645734774784a"
      },
      {
        "outlet": "Kresy.pl",
        "angle": "Relacja uzupełniająca",
        "summary": "Media: Rosja chce wspólnie z USA ustalić nowy porządek w Europie. Finlandia poza NATO, Mołdawia państwem federalnym",
        "url": "https://kresy.pl/wydarzenia/media-rosja-chce-wspolnie-z-usa-ustalic-nowy-porzadek-w-europie-finlandia-poza-nato-moldawia-panstwem-federalnym/"
      }
    ],
    "sources": [
      "Kresy.pl",
      "TVP.info",
      "WP Wiadomości"
    ],
    "corrections": []
  },
  {
    "id": 19,
    "path": "/Swiat",
    "seo_url": "/Swiat/negocjacje-z-udzialem-europy-czy-bez-jest-dwuglos-rosja-stawia-warunek",
    "seo_title": "Negocjacje z udziałem Europy czy bez? Jest dwugłos, Rosja stawia warunek",
    "summary_lead": "— Kiedy zrozumiemy prawdziwe intencje Europejczyków i chęć wniesienia wkładu w proces pokojowy, będziemy mogli podjąć decyzję o prowadzeniu rozmów w rozszerzonym formacie – w ten sposób Dmitrij Pieskow skomentował doniesienia o…",
    "meta_description": "— Kiedy zrozumiemy prawdziwe intencje Europejczyków i chęć wniesienia wkładu w proces pokojowy, będziemy mogli podjąć decyzję o prowadzeniu rozmów w…",
    "keywords": "Swiat, Negocjacje, udziałem, Europy, dwugłos, Rosja, stawia",
    "thumbnail_url": "https://ipla.pluscdn.pl/dituel/cp/an/anj1f1beu4zi915s5nrnnt2a6so295ts.jpg",
    "published_iso": "2026-11-13T18:46:12+01:00",
    "display_date": "13.11.2026, 18:46",
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
        "val": "/Swiat"
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
          "— Kiedy zrozumiemy prawdziwe intencje Europejczyków i chęć wniesienia wkładu w proces pokojowy, będziemy mogli podjąć decyzję o prowadzeniu rozmów w rozszerzonym formacie – w ten sposób Dmitrij Pieskow skomentował doniesienia o udziale przedstawicieli Starego Kontynentu w negocjacjach na temat wojny w Ukrainie. [Źródło: Polsat News, TVP.info, TVN24]",
          "Wcześniej USA komunikowały, iż Moskwa i Kijów wyraziły na to zgodę. [Źródło: Polsat News, TVP.info]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Polsat News",
        "angle": "Relacja wiodąca",
        "summary": "Negocjacje z udziałem Europy czy bez? Jest dwugłos, Rosja stawia warunek",
        "url": "https://www.polsatnews.pl/wiadomosc/2026-11-13/negocjacje-z-udzialem-europy-czy-bez-jest-dwuglos-rosja-stawia-warunek/"
      },
      {
        "outlet": "TVP.info",
        "angle": "Relacja uzupełniająca",
        "summary": "Kolejna runda negocjacji. Rosja wciąż się waha w sprawie Europy",
        "url": "https://www.tvp.info/96458008/negocjacje-pokojowe-ukraina-rosja-ze-wsparciem-usa-rosja-nie-podjela-decyzji"
      },
      {
        "outlet": "TVN24",
        "angle": "Relacja uzupełniająca",
        "summary": "Europa przy negocjacjach z Rosją? Kaja Kallas: Jared Kushner w końcu to przyznał",
        "url": "https://tvn24.pl/swiat/europa-przy-negocjacjach-z-rosja-kaja-kallas-o-spotkaniu-w-dublinie-z-wyslannikami-prezydenta-usa-st9337555?source=rss"
      }
    ],
    "sources": [
      "Polsat News",
      "TVN24",
      "TVP.info"
    ],
    "corrections": []
  },
  {
    "id": 20,
    "path": "/Polska",
    "seo_url": "/Polska/doniosl-na-policjanta-ktory-zatrzymal-zamachowca-w-krakowie-prokuratura",
    "seo_title": "Doniósł na policjanta, który zatrzymał zamachowca w Krakowie. Prokuratura zajmie się zawiadomieniem",
    "summary_lead": "Do prokuratury wpłynęło zawiadomienie dotyczące Jakuba Kulika – policjanta, który wraz z kolegą z patrolu zatrzymał w sobotę sprawcę zamachu w Krakowie.",
    "meta_description": "Do prokuratury wpłynęło zawiadomienie dotyczące Jakuba Kulika – policjanta, który wraz z kolegą z patrolu zatrzymał w sobotę sprawcę zamachu w Krakowie.",
    "keywords": "Polska, Doniósł, policjanta, zatrzymał, zamachowca, Krakowie, Prokuratura",
    "thumbnail_url": "https://cdn.defence24.pl/2026/11/13/320x240px/jjs67nlqqbgiz913hpgez0rrkfy3uucljtnjt6xo.bwvd.jpg",
    "published_iso": "2026-11-13T18:46:12+01:00",
    "display_date": "13.11.2026, 18:46",
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
        "val": "InfoSecurity24"
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
          "Do prokuratury wpłynęło zawiadomienie dotyczące Jakuba Kulika – policjanta, który wraz z kolegą z patrolu zatrzymał w sobotę sprawcę zamachu w Krakowie. Autor pisma domaga się zbadania legalności użycia broni palnej przez funkcjonariusza. [Źródło: InfoSecurity24]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Dwóch młodych policjantów rzuciło się na uzbrojonego zamachowca i przypłaciło to ciężkimi ranami. Jeden z nich dopiero co wybudził się ze śpiączki farmakologicznej. Cała Polska nazywa ich bohaterami. [Źródło: Niezależna.pl]",
          "Funkcjonariusze otrzymali m.in. Krzyże Oficerskie Orderu Odrodzenia Polski oraz Krzyże Rycerskie za Męstwo, Ratowanie Życia i Ochronę Mienia. Kierownictwo policji przyznało im też po 100 tys. zł zapomogi. [Źródło: Fakt.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "InfoSecurity24",
        "angle": "Analiza sektorowa",
        "summary": "Doniósł na policjanta, który zatrzymał zamachowca w Krakowie. Prokuratura zajmie się zawiadomieniem",
        "url": "https://infosecurity24.pl/sluzby-mundurowe/policja/doniosl-na-policjanta-ktory-zatrzymal-sprawce-strzelaniny-w-krakowie-prokuratura-zajmie-sie-zawiadomieniem"
      },
      {
        "outlet": "Niezależna.pl",
        "angle": "Relacja uzupełniająca",
        "summary": "Wiadomo, kto doniósł na policjantów z Krakowa? Sam się pochwalił w sieci",
        "url": "https://blaskonline.pl/wiadomo-kto-doniosl-na-policjantow-z-krakowa-sam-sie-pochwalil-w-sieci/"
      },
      {
        "outlet": "Fakt.pl",
        "angle": "Relacja uzupełniająca",
        "summary": "Zatrzymali zamachowca w Krakowie. Teraz dostali odznaczenia. \"To nasi bohaterowie\"",
        "url": "https://www.fakt.pl/wydarzenia/polska/krakow/krakow-artur-moranski-i-jakub-kulik-nagrodzeni-za-odwage-podczas-zamachu/yn79cfn"
      }
    ],
    "sources": [
      "Fakt.pl",
      "InfoSecurity24",
      "Niezależna.pl"
    ],
    "corrections": []
  },
  {
    "id": 21,
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
    "id": 22,
    "path": "/Swiat",
    "seo_url": "/Swiat/rosyjskie-zadania-ws-wystapienia-finlandii-z-nato-po-prostu-oburzajace",
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
        "val": "/Swiat"
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
    "keywords": "Swiat, Rosyjskie, żądania, Finlandii, NATO"
  },
  {
    "id": 23,
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
    "id": 24,
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
    "id": 25,
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
    "id": 26,
    "path": "/Swiat",
    "seo_url": "/Swiat/ponad-100-okretow-wokol-tajwanu-nieogloszone-manewry-chin",
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
        "val": "/Swiat"
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
    "keywords": "Swiat, okrętów, wokół, Tajwanu, Nieogłoszone, manewry, Chin"
  },
  {
    "id": 27,
    "path": "/Polska",
    "seo_url": "/Polska/dlugie-weekendy-2027-jak-zaplanowac-urlop-w-przyszlym-roku-kalendarzowym",
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
        "val": "/Polska"
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
    "keywords": "Polska, Długie, weekendy, zaplanować, urlop, przyszłym, kalendarzowym"
  },
  {
    "id": 28,
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
    "id": 29,
    "path": "/Polska/Polityka",
    "seo_url": "/Polska/Polityka/oswiadczenie-korwin-piotrowskiej-tk-przeglada-sto-najpilniejszych-spraw",
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
        "val": "/Polska/Polityka"
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
    "keywords": "Polityka, Oświadczenie, Korwin-Piotrowskiej, przegląda, najpilniejszych"
  },
  {
    "id": 30,
    "path": "/Polska/Polityka",
    "seo_url": "/Polska/Polityka/morawiecki-o-kluczowej-decyzji-ws-wyborow-mamy-zupelnie-inne-podejscie",
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
        "val": "/Polska/Polityka"
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
    "keywords": "Polityka, Morawiecki, kluczowej, wyborów, Mamy, zupełnie, inne"
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
  let activeBtn = null;
  document.querySelectorAll('.path-chip').forEach(btn => {
    const isAct = btn.getAttribute('data-path') === currentPath;
    btn.classList.toggle('active', isAct);
    if (isAct) activeBtn = btn;
  });
  if (activeBtn && activeBtn.parentElement) {
    const nav = activeBtn.parentElement;
    const left = activeBtn.offsetLeft - 12;
    const right = activeBtn.offsetLeft + activeBtn.offsetWidth + 12;
    if (left < nav.scrollLeft) {
      nav.scrollLeft = Math.max(0, left);
    } else if (right > nav.scrollLeft + nav.clientWidth) {
      nav.scrollLeft = Math.max(0, right - nav.clientWidth);
    }
  }
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

  const validCat = p => (p && PATH_TITLES[p]) ? p : '/Polska';

  if (!relPath) {
    if (window.VERITY_INITIAL_ARTICLE_URL) {
      const artInit = articles.find(a => a.seo_url === window.VERITY_INITIAL_ARTICLE_URL);
      if (artInit) return { path: validCat(artInit.path), articleId: artInit.id, notFound: false };
    }
    const pInit = window.VERITY_INITIAL_PATH;
    return { path: validCat(pInit), articleId: null, notFound: false };
  }

  const slashRel = '/' + relPath;
  if (PATH_TITLES[slashRel]) {
    return { path: slashRel, articleId: null, notFound: false };
  }

  const exactArt = articles.find(a => a.seo_url === slashRel);
  if (exactArt) {
    return { path: validCat(exactArt.path), articleId: exactArt.id, notFound: false };
  }

  const slugSeg = relPath.split('/').pop();
  if (slugSeg && slugSeg.length >= 12) {
    const bySlug = articles.find(a => {
      const aSlug = (a.seo_url || '').split('/').pop();
      return aSlug === slugSeg || aSlug.startsWith(slugSeg.slice(0, 36)) || slugSeg.startsWith(aSlug.slice(0, 36));
    });
    if (bySlug) {
      return { path: validCat(bySlug.path), articleId: bySlug.id, notFound: false, recoveredUrl: articleHref(bySlug.seo_url) };
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
    const prettyCrumb = { Polska: 'Polska', Swiat: 'Świat', Sport: 'Sport', Gospodarka: 'Gospodarka', Polityka: 'Polityka', Energetyka: 'Energetyka', Poznan: 'Poznań' };
    const crumbs = [{ '@type': 'ListItem', position: 1, name: 'VERITY', item: `${CANONICAL_ORIGIN}/` }];
    let acc = '';
    parts.forEach(p => {
      acc += '/' + p;
      if (PATH_TITLES[acc]) {
        crumbs.push({ '@type': 'ListItem', position: crumbs.length + 1, name: prettyCrumb[p] || p, item: `${CANONICAL_ORIGIN}${acc}/` });
      }
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
    const catArts = (published || []).filter(a => (a.path || '').startsWith(currentPath));
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
        .filter(a => q ? true : (a.path || '').startsWith(currentPath))
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
  const pretty = {
    Swiat: 'Świat',
    Poznan: 'Poznań',
    Krakow: 'Kraków',
    Wroclaw: 'Wrocław',
    Gdansk: 'Gdańsk',
    Lodz: 'Łódź',
    Bialystok: 'Białystok',
    Rzeszow: 'Rzeszów',
    Slask: 'Śląsk'
  };
  const parts = (path || '/Polska').split('/').filter(Boolean).map(p => pretty[p] || p);
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
  const noThumbCls = art.thumbnail_url ? '' : ' no-thumb';
  const fallback = `<div class="thumb-fallback" aria-hidden="true"><span class="thumb-fallback-label">${label}</span><span class="thumb-fallback-mark">V</span></div>`;
  const img = art.thumbnail_url
    ? `<img src="${esc(art.thumbnail_url)}" alt="${esc(art.seo_title)}" class="${imgClass}" loading="${eager ? 'eager' : 'lazy'}" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add('no-thumb');this.closest('.lead-story')?.classList.add('no-thumb');this.remove()" />`
    : '';
  return `<div class="${wrapClass}${noThumbCls}">${fallback}${img}</div>`;
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
    container.innerHTML = `<div class="empty-state">${q ? `Brak opracowań dla zapytania „${esc(q)}”.` : `Brak opracowań w dziale <strong>${esc(currentPath)}</strong>.`}</div>`;
    return;
  }

  const useLead = !q && list.length >= 3;
  const lead = useLead ? list[0] : null;
  const rest = useLead ? list.slice(1) : list;

  const crumbText = q ? 'Wszystkie działy' : currentPath;
  const titleText = q ? `Wyniki dla „${esc(q)}”` : esc(PATH_TITLES[currentPath] || currentPath);
  const heading = `
    <div class="feed-heading">
      <div>
        <span class="feed-crumb">${esc(crumbText)}</span>
        <h1>${titleText}</h1>
      </div>
      <span>${countArticlesLabel(list.length)}</span>
    </div>`;

  let leadHtml = '';
  if (lead) {
    const lHref = esc(articleHref(lead.seo_url));
    const lJsUrl = esc(lead.seo_url || '');
    const lNoThumbCls = lead.thumbnail_url ? '' : ' no-thumb';
    leadHtml = `
    <article ${catAttr(lead)} class="lead-wrap">
      <div class="lead-story${lNoThumbCls}" onclick="if(!event.target.closest('a'))openArticleLink(event, ${lead.id}, '${lJsUrl}')">
        <a class="lead-thumb-wrap${lNoThumbCls}" href="${lHref}" onclick="return openArticleLink(event, ${lead.id}, '${lJsUrl}')" tabindex="-1" aria-hidden="true">
          <div class="thumb-fallback" aria-hidden="true"><span class="thumb-fallback-label">${esc(shortCatLabel(lead.path))}</span><span class="thumb-fallback-mark">V</span></div>
          ${lead.thumbnail_url ? `<img src="${esc(lead.thumbnail_url)}" alt="${esc(lead.seo_title)}" class="lead-thumb" loading="eager" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add('no-thumb');this.closest('.lead-story')?.classList.add('no-thumb');this.remove()" />` : ''}
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

  const topCat = '/' + ((art.path || '/Polska').split('/').filter(Boolean)[0] || 'Polska');
  let related = published.filter(a => a.id !== art.id && a.path === art.path).slice(0, 2);
  if (related.length < 2) {
    const moreTop = published.filter(a => a.id !== art.id && !related.includes(a) && (a.path || '').startsWith(topCat));
    related = related.concat(moreTop).slice(0, 2);
  }
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
              <span class="cat-badge">${esc(shortCatLabel(art.path))}</span>
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
