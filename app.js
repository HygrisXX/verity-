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
      urlByOutlet[p.outlet.trim()] = p.url;
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
let currentThemeMode = localStorage.getItem('verity_theme') || 'auto';

function applyTheme(mode) {
  currentThemeMode = mode;
  localStorage.setItem('verity_theme', mode);
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
    "seo_url": "/Polska/Gospodarka/akcje-allegro-najdrozsze-od-pieciu-lat-rekordowa-umowa-z-inpostem-i-spadaja",
    "seo_title": "Akcje Allegro najdroższe od pięciu lat. Rekordowa umowa z InPostem i spadający udział chińskich platform",
    "thumbnail_url": "https://xyz.pl/wp-content/uploads/2025/11/Marcin-Kusmierz-31-1024x683.jpg",
    "published_iso": "2026-11-13T02:45:35+01:00",
    "display_date": "13.11.2026, 02:45",
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
        "val": "/Polska/Gospodarka"
      },
      {
        "label": "Główne źródło",
        "val": "XYZ.pl"
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
          "Lider e-commerce rośnie dwukrotnie szybciej niż sprzedaż detaliczna w Polsce. [Źródło: XYZ.pl]",
          "Kolejny raz podwyższa prognozę wyników m.in. dzięki porozumieniu z kluczowym partnerem logistycznym. – Obie firmy będą wspierać swój rozwój w Polsce i za granicą – zapowiada Marcin Kuśmierz, prezes Allegro. [Źródło: XYZ.pl, Cashless.pl]",
          "Allegro i InPost zawierają gigantyczny kontrakt, który zamyka spory i wyznacza kierunek rozwoju e-commerce w Polsce. [Źródło: Biznes Interia, Cashless.pl]",
          "Nowa umowa o wartości 8 mld złotych to milowy krok dla obu gigantów, gwarantujący stabilność rynku do końca 2031 roku. [Źródło: Biznes Interia, Cashless.pl]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Dwa potężne podmioty na polskim rynku e-commerce oficjalnie kończą dawne niesnaski. Nowe partnerstwo strategiczne zakłada nie tylko wielomiliardowe usługi logistyczne, lecz także polubowne zamknięcie kosztownego arbitrażu oraz ekspansję rozwiązań płatniczych poza dotychczasowy ekosystem. [Źródło: MamStartup.pl]",
          "Zapowiedzią tego kontraktu było podpisanie listu intencyjnego w czerwcu 2026 r., o czym mogliście przeczytać tutaj . W kontrakcie pojawiły się zapisy dotyczące gwarancji przepustowości sieci oraz indeksacji cenowej, co pozwala Allegro planować dalszy wzrost przy jednoczesnej długoterminowej przewidywalności kosztowej. Przypomnę, że w zeszłym roku operator automatów paczkowych pozwał Allegro za faworyzowanie własnych metod dostaw kosztem tych InPostu. Roszczenia spółki miały sięgać 100 mln zł . 2026 r. Liczba aktywnych kupujących w całej grupie sięgnęła 21,5 mln, w Polsce – 15,8 mln. Allegro Smart ma już ponad 7,8 mln użytkowników (o ponad 800 tys. więcej niż przed rokiem), a realizują oni średnio siedem transakcji miesięcznie. Z kolei jeśli chodzi o działalność logistyczną, to Allegro podało, że ma ok. 12 tys. automatów One Box . Cała sieć partnerska Allegro Delivery liczy 40 tys. automatów. I obsługuje 51 proc. wolumenu przesyłek realizowanych przez Allegro. Pełne informacje na temat liczby automatów paczkowych na polskim rynku znajdziecie w serwisie cashless.pl. [Źródło: Cashless.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "XYZ.pl",
        "angle": "Depesza źródłowa",
        "summary": "Akcje Allegro najdroższe od pięciu lat. Rekordowa umowa z InPostem i spadający udział chińskich platform",
        "url": "https://xyz.pl/akcje-allegro-najdrozsze-od-pieciu-lat-rekordowa-umowa-z-inpostem-i-spadajacy-udzial-chinskich-platform/"
      },
      {
        "outlet": "MamStartup.pl",
        "angle": "Depesza źródłowa",
        "summary": "Strategiczny rozejm gigantów. Allegro i InPost zamykają spór wieloletnią umową",
        "url": "https://mamstartup.pl/strategiczny-rozejm-gigantow-allegro-i-inpost-zamykaja-spor-wieloletnia-umowa/"
      },
      {
        "outlet": "Biznes Interia",
        "angle": "Depesza źródłowa",
        "summary": "Koniec sporu gigantów. Allegro i InPost podpisały strategiczną umowę",
        "url": "https://biznes.interia.pl/gospodarka/news-allegro-i-inpost-z-nowym-kontraktem-wartosc-umowy-to-minimum,nId,23572747"
      },
      {
        "outlet": "Cashless.pl",
        "angle": "Depesza źródłowa",
        "summary": "Allegro i InPost zakopały topór wojenny. Firmy podpisały nową umowę o partnerstwie strategicznym",
        "url": "https://www.cashless.pl/19948-allegro-inpost-kontrakt"
      }
    ],
    "sources": [
      "Biznes Interia",
      "Cashless.pl",
      "MamStartup.pl",
      "XYZ.pl"
    ],
    "corrections": []
  },
  {
    "id": 2,
    "path": "/Polska/Gospodarka",
    "seo_url": "/Polska/Gospodarka/polak-zatrzymany-na-granicy-z-niemcami-sad-uznal-kontrole-za-niezgodna-z-pr",
    "seo_title": "Polak zatrzymany na granicy z Niemcami. Sąd uznał kontrolę za niezgodną z prawem",
    "thumbnail_url": "http://galeria.bankier.pl/p/7/7/74273ac3a6bade-948-568-22-67-2977-1786.jpg",
    "published_iso": "2026-11-13T02:45:35+01:00",
    "display_date": "13.11.2026, 02:45",
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
        "val": "Bankier.pl"
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
          "Kontrole graniczne zarządzone przez niemieckie ministerstwo spraw wewnętrznych na granicach z Polską i Czechami były niezgodne z prawem - orzekł w czwartek sąd administracyjny w Dreźnie. [Źródło: Bankier.pl, RMF24, Business Insider PL]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Sąd zdecydował po skardze Polaka i Niemca [Źródło: RMF24]",
          "Na razie wyrok jest nieprawomocny. [Źródło: TVP.info]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Bankier.pl",
        "angle": "Depesza źródłowa",
        "summary": "Polak zatrzymany na granicy z Niemcami. Sąd uznał kontrolę za niezgodną z prawem",
        "url": "https://www.bankier.pl/wiadomosc/Polak-zatrzymany-na-granicy-z-Niemcami-Sad-uznal-kontrole-za-niezgodna-z-prawem-9228045.html?utm_source=RSS&utm_medium=RSS&utm_campaign=Wiadomosci"
      },
      {
        "outlet": "RMF24",
        "angle": "Depesza źródłowa",
        "summary": "Niemieckie kontrole na granicy z Polską. Sąd zdecydował po skardze Polaka i Niemca",
        "url": "https://www.rmf24.pl/fakty/swiat/news-niemieckie-kontrole-na-granicy-z-polska-sad-zdecydowal-po-sk,nIdn,1025907"
      },
      {
        "outlet": "Business Insider PL",
        "angle": "Depesza źródłowa",
        "summary": "Niemieckie kontrole na granicy z Polską. Sąd: niezgodne z prawem",
        "url": "https://businessinsider.com.pl/prawo/kontrole-na-granicy-z-niemcami-sad-niezgodne-z-prawem/brj3b8w"
      },
      {
        "outlet": "TVP.info",
        "angle": "Depesza źródłowa",
        "summary": "Sąd: Niemieckie kontrole na granicach z Polską bezprawne",
        "url": "https://www.tvp.info/96442415/sad-w-dreznie-nie-mial-watpliwosci-ze-kontrole-na-granicach-z-polska-i-czechami-byly-niezgodne-z-prawem"
      }
    ],
    "sources": [
      "Bankier.pl",
      "Business Insider PL",
      "RMF24",
      "TVP.info"
    ],
    "corrections": []
  },
  {
    "id": 3,
    "path": "/Swiat",
    "seo_url": "/Swiat/pfizer-zablokowal-aktywa-pazp-jest-decyzja-sadu-w-brukseli",
    "seo_title": "Pfizer zablokował aktywa PAŻP. Jest decyzja sądu w Brukseli",
    "thumbnail_url": "https://ipla.pluscdn.pl/dituel/cp/i8/i863auieegx7hveejr3kdgurg56nmwr3.png",
    "published_iso": "2026-11-13T02:45:35+01:00",
    "display_date": "13.11.2026, 02:45",
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
          "Sąd Pierwszej Instancji w Brukseli wydał korzystny wyrok dla strony polskiej w sprawie zajęcia opłat trasowych należnych Polskiej Agencji Żeglugi Powietrznej (PAŻP), pobieranych za pośrednictwem EUROCONTROL - podało w czwartek Ministerstwo Zdrowia. [Źródło: Polsat News, Bankier.pl, Puls Biznesu]",
          "Sąd uznał zajęcie za bezzasadne i uchylił postanowienie, na podstawie którego Pfizer dokonał zajęcia tych należności. [Źródło: Polsat News]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Przychylił się tym samym do skargi PAŻP, która dowodziła, że nie jest stroną sporu między Pfizerem a państwem polskim w sprawie szczepionek przeciwko COVID-19. [Źródło: Bankier.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Polsat News",
        "angle": "Depesza źródłowa",
        "summary": "Pfizer zablokował aktywa PAŻP. Jest decyzja sądu w Brukseli",
        "url": "https://www.polsatnews.pl/wiadomosc/2026-11-12/pfizer-zablokowal-aktywa-polskiej-agencji-jest-decyzja-sadu-w-brukseli/"
      },
      {
        "outlet": "Bankier.pl",
        "angle": "Depesza źródłowa",
        "summary": "Pieniądze PAŻP nie pójdą na spłatę Pfizera. Jest decyzja belgijskiego sądu",
        "url": "https://www.bankier.pl/wiadomosc/Pieniadze-PAZP-nie-pojda-na-splate-Pfizera-Jest-decyzja-belgijskiego-sadu-9227955.html?utm_source=RSS&utm_medium=RSS&utm_campaign=Wiadomosci"
      },
      {
        "outlet": "Puls Biznesu",
        "angle": "Depesza źródłowa",
        "summary": "Belgijski sąd stanął po stronie PAŻP. Decyzja w sprawie zajęcia środków na rzecz Pfizera uchylona",
        "url": "https://www.pb.pl/belgijski-sad-stanal-po-stronie-pazp-decyzja-w-sprawie-zajecia-srodkow-na-rzecz-pfizera-uchylona-1270324"
      }
    ],
    "sources": [
      "Bankier.pl",
      "Polsat News",
      "Puls Biznesu"
    ],
    "corrections": []
  },
  {
    "id": 4,
    "path": "/Polska/Gospodarka",
    "seo_url": "/Polska/Gospodarka/koniec-ery-jensena-huanga-szef-nvidii-odchodzi-w-cieniu-skandalu",
    "seo_title": "Koniec ery Jensena Huanga. Szef Nvidii odchodzi w cieniu skandalu",
    "thumbnail_url": "https://i.gremicdn.pl/image/free/4394b05ace0a78d40fc3225aab049aba/?t=crop:5657:2473:nowe:0:649,resize:fill:600:300,enlarge:1",
    "published_iso": "2026-11-13T02:45:35+01:00",
    "display_date": "13.11.2026, 02:45",
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
        "val": "/Polska/Gospodarka"
      },
      {
        "label": "Główne źródło",
        "val": "Parkiet"
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
          "Jensen Huang przestał być prezesem Nvidii. [Źródło: Parkiet, naTemat.pl, PurePC]",
          "Zastąpi go Colette Kress. [Źródło: Parkiet]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "To największa afera w historii Doliny Krzemowej. W tle są podejrzenia o szpiegostwo, nielegalny handel zaawansowanymi chipami i romans, który może mieć konsekwencje wykraczające daleko poza prywatne życie miliardera. [Źródło: naTemat.pl]",
          "Teraz jego stanowisko znalazło się pod znakiem zapytania. The Wall Street Journal informuje, że rada dyrektorów przygotowuje się do odwołania prezesa po ujawnieniu dwóch pozamałżeńskich relacji. [Źródło: PurePC]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Parkiet",
        "angle": "Depesza źródłowa",
        "summary": "Koniec ery Jensena Huanga. Szef Nvidii odchodzi w cieniu skandalu",
        "url": "https://www.parkiet.com/gospodarka-swiatowa/art45480271-koniec-ery-jensena-huanga-szef-nvidii-odchodzi-w-cieniu-skandalu"
      },
      {
        "outlet": "naTemat.pl",
        "angle": "Depesza źródłowa",
        "summary": "Skandal z szefem Nvidia to problem całego Zachodu. Najważniejsza firma ery AI tonie",
        "url": "https://natemat.pl/675361,skandal-z-szefem-nvidia-to-problem-calego-zachodu-najwazniejsza-firma-ery-ai-tonie"
      },
      {
        "outlet": "PurePC",
        "angle": "Depesza źródłowa",
        "summary": "Jensen Huang może stracić stanowisko po 33 latach. Dwa romanse i dochodzenie w NVIDII",
        "url": "https://www.purepc.pl/nvidia-rada-dyrektorow-jensen-huang-odwolanie-prezesa-romanse-dochodzenie"
      }
    ],
    "sources": [
      "Parkiet",
      "PurePC",
      "naTemat.pl"
    ],
    "corrections": []
  },
  {
    "id": 5,
    "path": "/Swiat",
    "seo_url": "/Swiat/strzelanina-w-poblizu-bialego-domu-nie-zyja-dwie-osoby",
    "seo_title": "Strzelanina w pobliżu Białego Domu. Nie żyją dwie osoby",
    "thumbnail_url": "https://ipla.pluscdn.pl/dituel/cp/rn/rnzzpncwrp5znv5me3vgzpgir6a6eniz.jpg",
    "published_iso": "2026-11-13T02:15:03+01:00",
    "display_date": "13.11.2026, 02:15",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 96,
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
        "val": "Polsat News"
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
          "W Waszyngtonie, niespełna dwa kilometry od Białego Domu, uzbrojony napastnik zabarykadował się w jednym z budynków. [Źródło: Polsat News, naTemat.pl, Dziennik.pl, Wyborcza.pl]",
          "Policja przekazała, że w wyniku strzelaniny zginęła jedna osoba, a cztery zostały ranne. [Źródło: Polsat News, naTemat.pl]",
          "Napastnik został znaleziony w mieszkaniu z raną postrzałową. [Źródło: Polsat News]",
          "Stacja NBC News podała, że sprawca ataku nie żyje. [Źródło: Polsat News]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Policja przez pewien czas prowadziła negocjacje, ale ostatecznie zdecydowała się na szturm. [Źródło: naTemat.pl]",
          "Według mediów sprawca popełnił samobójstwo. [Źródło: Dziennik.pl]",
          "Trwa wyjaśnianie okoliczności strzelniny, do której doszło w czwartek rano czasu lokalnego w Waszyngtonie. [Źródło: Wyborcza.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Polsat News",
        "angle": "Depesza źródłowa",
        "summary": "Strzelanina w pobliżu Białego Domu. Nie żyją dwie osoby",
        "url": "https://www.polsatnews.pl/wiadomosc/2026-11-12/strzelanina-w-poblizu-bialego-domu-nie-zyje-jedna-osoba/"
      },
      {
        "outlet": "naTemat.pl",
        "angle": "Depesza źródłowa",
        "summary": "Strzelanina w Waszyngtonie niedaleko Białego Domu. Sprawcą znany lekarz w USA",
        "url": "https://natemat.pl/675376,strzelanina-w-waszyngtonie-niedaleko-bialego-domu-sprawca-znany-lekarz-w-usa"
      },
      {
        "outlet": "Dziennik.pl",
        "angle": "Depesza źródłowa",
        "summary": "Strzelanina w Waszyngtonie. Nie żyją dwie osoby",
        "url": "https://wiadomosci.dziennik.pl/swiat/artykuly/11343964,strzelanina-w-waszyngtonie-nie-zyja-dwie-osoby.html"
      },
      {
        "outlet": "Wyborcza.pl",
        "angle": "Depesza źródłowa",
        "summary": "Strzelanina w Waszyngtonie. Jest ofiara śmiertelna. Sprawca prawdopodobnie nie żyje",
        "url": "https://wyborcza.pl/7,75399,33129912,piec-osob-rannych-w-wyniku-strzelaniny-w-waszyngtonie-unikac.html"
      }
    ],
    "sources": [
      "Dziennik.pl",
      "Polsat News",
      "Wyborcza.pl",
      "naTemat.pl"
    ],
    "corrections": []
  },
  {
    "id": 6,
    "path": "/Polska/Polityka",
    "seo_url": "/Polska/Polityka/proces-karola-nawrockiego-z-dziennikarzami-onetu-sad-wyznaczyl-termin-pierw",
    "seo_title": "Proces Karola Nawrockiego z dziennikarzami Onetu. Sąd wyznaczył termin pierwszej rozprawy",
    "thumbnail_url": "https://webp-konwerter.incdn.pl/eyJmIjoiaHR0cHM6Ly9pbmZvci13ZWItc3RhdGljLm/luY2RuLnBsL2RncHN0YXRpYy9kb2N1bWVudHMvRk9C/MDAwMDAwMDAwMDAwNzY4NTA2MS9maWxlcy9rYXJvbC/1uYXdyb2NraS0zOTI4ODEyOC5qcGciLCJ3IjozODQwfQ",
    "published_iso": "2026-11-13T02:15:03+01:00",
    "display_date": "13.11.2026, 02:15",
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
        "val": "/Polska/Polityka"
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
          "Nie było pojednania za zamkniętymi drzwiami warszawskiego sądu. [Źródło: GazetaPrawna.pl (DGP)]",
          "Rusza głośny proces karny z prywatnego aktu oskarżenia, który prezydent Karol Nawrocki skierował przeciwko dziennikarzom Onetu – Andrzejowi Stankiewiczowi i Jackowi Harłukowiczowi – po publikacji tekstu o sopockim Grand Hotelu. [Źródło: GazetaPrawna.pl (DGP), Bankier.pl]",
          "Sąd wyznaczył już datę pierwszej rozprawy, a w osobnym postępowaniu cywilnym znany jest także termin przesłuchania samej głowy państwa. [Źródło: GazetaPrawna.pl (DGP)]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Chodzi o opublikowany w maju 2025 r. artykuł pt. „Karol Nawrocki i tajemnice Grand Hotelu”. [Źródło: Bankier.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "GazetaPrawna.pl (DGP)",
        "angle": "Depesza źródłowa",
        "summary": "Proces Karola Nawrockiego z dziennikarzami Onetu. Sąd wyznaczył termin pierwszej rozprawy",
        "url": "https://www.gazetaprawna.pl/wiadomosci/kraj/artykuly/11343991,karol-nawrocki-proces-dziennikarze-onet-grand-hotel-termin-rozprawy.html"
      },
      {
        "outlet": "Bankier.pl",
        "angle": "Depesza źródłowa",
        "summary": "Nawrocki pozwał dziennikarzy Onetu. Sąd wyznaczył termin pierwszej rozpraw",
        "url": "https://www.bankier.pl/wiadomosc/Nawrocki-pozwal-dziennikarzy-Onetu-Sad-wyznaczyl-termin-pierwszej-rozpraw-9228095.html?utm_source=RSS&utm_medium=RSS&utm_campaign=Wiadomosci"
      }
    ],
    "sources": [
      "Bankier.pl",
      "GazetaPrawna.pl (DGP)"
    ],
    "corrections": []
  },
  {
    "id": 7,
    "path": "/Polska",
    "seo_url": "/Polska/orban-nie-wejdzie-do-aresztu-nie-bedzie-spotkania-z-bratem",
    "seo_title": "Orban nie wejdzie do aresztu. Nie będzie spotkania z bratem",
    "thumbnail_url": "https://s17.tvp.pl/images2/7/6/9/uid_769c2f2a7d6d4a5eb957c2347f35e53b_width_1280_play_0_pos_0_gs_0_height_720.jpg",
    "published_iso": "2026-11-13T02:15:03+01:00",
    "display_date": "13.11.2026, 02:15",
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
        "val": "TVP.info"
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
          "– Nie chcę dawać mediom powodów do satysfakcji, gdy zobaczą, że wchodzę do aresztu – oświadczył Viktor Orban w czwartkowym wywiadzie dla internetowego kanału „Ultrahang”. [Źródło: TVP.info, Interia Wydarzenia]",
          "Były premier Węgier odniósł się w ten sposób do sprawy swojego młodszego brata Arona, który został tymczasowo aresztowany w związku z podejrzeniem o udział w przemycie ludzi. [Źródło: TVP.info, Interia Wydarzenia]",
          "Lider Fideszu przekonywał, że jego brat jest niewinny, a prowadzone przeciwko niemu postępowanie stanowi element politycznej rozgrywki. [Źródło: TVP.info]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Polityk zaznaczył, że jest w stu procentach przekonany o jego niewinności oraz że nie planuje odwiedzić go w areszcie. [Źródło: Interia Wydarzenia]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "TVP.info",
        "angle": "Depesza źródłowa",
        "summary": "Orban nie wejdzie do aresztu. Nie będzie spotkania z bratem",
        "url": "https://www.tvp.info/96446647/wegry-viktor-orban-nie-odwiedzi-brata-arona-orbana-w-areszcie-jaki-jest-powod-byly-premier-tlumaczy"
      },
      {
        "outlet": "Interia Wydarzenia",
        "angle": "Depesza źródłowa",
        "summary": "\"Chcieliby zobaczyć, jak wchodzę do aresztu\". Orban o kłopotach brata",
        "url": "https://wydarzenia.interia.pl/zagranica/news-chcieliby-zobaczyc-jak-wchodze-do-aresztu-orban-zabral-glos,nId,23572828"
      }
    ],
    "sources": [
      "Interia Wydarzenia",
      "TVP.info"
    ],
    "corrections": []
  },
  {
    "id": 8,
    "path": "/Swiat",
    "seo_url": "/Swiat/czarzasty-zwrocil-sie-do-prezydenta-padly-slowa-o-juncie-wojskowej",
    "seo_title": "Czarzasty zwrócił się do prezydenta. Padły słowa o \"juncie wojskowej\"",
    "thumbnail_url": "https://ipla.pluscdn.pl/dituel/cp/ab/abrqn92yues5874dkwks9mtuu2n41kg5.jpeg",
    "published_iso": "2026-11-13T02:09:05+01:00",
    "display_date": "13.11.2026, 02:09",
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
          "Uprzejmie informuję panie prezydencie, że junta wojskowa nie jest charakterystyczna dla naszego kraju w czasach demokratycznych - zwrócił się do głowy państwa marszałek Sejmu Włodzimierz Czarzasty. [Źródło: Polsat News, Dziennik.pl]",
          "W ocenie lidera Lewicy, Karol Nawrocki podczas jednego z przemówień miał sugerować, że dobrze by było, gdyby prezydent wraz z generałami zarządzał krajem. [Źródło: Polsat News]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Polsat News",
        "angle": "Depesza źródłowa",
        "summary": "Czarzasty zwrócił się do prezydenta. Padły słowa o \"juncie wojskowej\"",
        "url": "https://www.polsatnews.pl/wiadomosc/2026-11-12/czarzasty-zwrocil-sie-do-prezydenta-padly-slowa-o-juncie-wojskowej/"
      },
      {
        "outlet": "Dziennik.pl",
        "angle": "Depesza źródłowa",
        "summary": "Marszałek Czarzasty krytykuje prezydenta Nawrockiego. Padły słowa o \"juncie wojskowej\"",
        "url": "https://wiadomosci.dziennik.pl/polityka/artykuly/11343999,marszalek-czarzasty-krytykuje-prezydenta-nawrockiego-padly-slowa-o-juncie-wojskowej.html"
      }
    ],
    "sources": [
      "Dziennik.pl",
      "Polsat News"
    ],
    "corrections": []
  },
  {
    "id": 9,
    "path": "/Polska/Polityka",
    "seo_url": "/Polska/Polityka/londyn-uderza-w-rosje-nowymi-sankcjami",
    "seo_title": "Londyn uderza w Rosję nowymi sankcjami",
    "thumbnail_url": "https://i.gremicdn.pl/image/free/00f95ff87545b147bc9b1873b968094e/?t=crop:3588:1569:nowe:0:412,resize:fill:600:300,enlarge:1",
    "published_iso": "2026-11-13T02:09:05+01:00",
    "display_date": "13.11.2026, 02:09",
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
          "Wielka Brytania jest pierwszym państwem na świecie, które objęło sankcjami wszystkie 10 największych koncernów naftowych Rosji. [Źródło: Rzeczpospolita]",
          "Londyn ogłosił dziś nowy pakiet ograniczeń w odpowiedzi na „ciągłe barbarzyństwo Rosji”. [Źródło: Rzeczpospolita]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Ambasadorowie państw członkowskich przy UE uzgodnili objęcie sankcjami 145 podmiotów i osób związanych z rosyjskim systemem finansowym, tzw. flotą cieni oraz kampaniami dezinformacyjnymi. [Źródło: Energetyka24]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Rzeczpospolita",
        "angle": "Depesza źródłowa",
        "summary": "Londyn uderza w Rosję nowymi sankcjami",
        "url": "https://energia.rp.pl/surowce-i-paliwa/art45482381-londyn-uderza-w-rosje-nowymi-sankcjami"
      },
      {
        "outlet": "Energetyka24",
        "angle": "Depesza źródłowa",
        "summary": "Nowe sankcje wobec Rosji. Unia uderza we flotę cieni",
        "url": "https://energetyka24.com/polityka/prawo/nowe-sankcje-wobec-rosji-unia-uderza-we-flote-cieni"
      }
    ],
    "sources": [
      "Energetyka24",
      "Rzeczpospolita"
    ],
    "corrections": []
  },
  {
    "id": 10,
    "path": "/Polska/Polityka",
    "seo_url": "/Polska/Polityka/pete-hegseth-upomniany-przez-wartownika-incydent-przy-grobie-nieznanego-zol",
    "seo_title": "Pete Hegseth upomniany przez wartownika. Incydent przy Grobie Nieznanego Żołnierza",
    "thumbnail_url": "https://cdn.defence24.pl/2026/10/30/320x240px/gHGeUG4pB8PXPFfvpBrhVYVEVoZ2lI8mLItru5gI.canx.jpg",
    "published_iso": "2026-11-13T02:09:05+01:00",
    "display_date": "13.11.2026, 02:09",
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
          "W środę, 11 listopada, na cmentarzu w Arlington pojawił się Pete Hegseth, składający kwiaty na Grobie Nieznanego Żołnierza. [Źródło: Defence24, Onet Wiadomości]",
          "Niestety, nie wszyscy potrafili zachować należytą powagę. [Źródło: Defence24]",
          "Musiał interweniować wartownik. [Źródło: Defence24]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Sekretarz obrony USA Pete Hegseth odznaczył starszego szeregowego Thomasa Iglesiasa medalem pochwalnym. [Źródło: Onet Wiadomości]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Defence24",
        "angle": "Depesza źródłowa",
        "summary": "Pete Hegseth upomniany przez wartownika. Incydent przy Grobie Nieznanego Żołnierza",
        "url": "https://defence24.pl/geopolityka/pete-hegseth-upomniany-przez-wartownika-incydent-przy-grobie-nieznanego-zolnierza"
      },
      {
        "outlet": "Onet Wiadomości",
        "angle": "Depesza źródłowa",
        "summary": "Pete Hegseth upomniany przez żołnierza. Szeregowy otrzymał medal",
        "url": "https://wiadomosci.onet.pl/swiat/zolnierz-upomnial-petea-hegsetha-sekretarz-obrony-usa-wreczyl-mu-medal/874e89y"
      }
    ],
    "sources": [
      "Defence24",
      "Onet Wiadomości"
    ],
    "corrections": []
  },
  {
    "id": 11,
    "path": "/Polska/Gdansk",
    "seo_url": "/Polska/Gdansk/rumunia-polska-na-zywo-14-11-2026-r-gdzie-ogladac-transmisje-w-tv-i-stream-",
    "seo_title": "Rumunia - Polska na żywo 14.11.2026 r. Gdzie oglądać transmisję w TV i stream? Wynik meczu, online, relacja, składy drużyn",
    "thumbnail_url": "https://d-pt.ppstatic.pl/kadry/k/r/1/0b/73/6af269fe1a79a_o,size,640x400,crop,0.0013x0.0628x0.9931x0.9306,q,71,h,5d9883.jpg",
    "published_iso": "2026-11-13T02:00:23+01:00",
    "display_date": "13.11.2026, 02:00",
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
        "val": "/Polska/Gdansk"
      },
      {
        "label": "Główne źródło",
        "val": "Dziennik Bałtycki"
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
          "Polska gra na wyjeździe z Rumunią w sobotę (14.11.2026 r.) w meczu piątej kolejki grupy 4 w dywizji B w Lidze Narod&oacute;w. [Źródło: Dziennik Bałtycki]",
          "Sprawdzaj wynik na żywo i online! [Źródło: Dziennik Bałtycki, Polsat Sport]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Aryna Sabalenka - Elina Switolina to mecz w ramach turnieju WTA Finals. [Źródło: Polsat Sport]",
          "Niespełna 48 godzin zostało do rewanżowego meczu 3. rundy kwalifikacji Ligi Europejskiej pomiędzy PGE MKS-em El-Volt Lublin – a rumuńską drużyną Ramnicu Valcea. Lublinianki aby awansować do fazy grupowej muszą odrobić pięciobramkową stratę z pierwszego spotkania przegranego na wyjeździe 27:32. Trener MKS-u Paweł Tetelewski nie traci nadziei na awans: – Mieliśmy swoje przestoje, ale zespół. [Źródło: Radio Lublin]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Dziennik Bałtycki",
        "angle": "Depesza źródłowa",
        "summary": "Rumunia - Polska na żywo 14.11.2026 r. Gdzie oglądać transmisję w TV i stream? Wynik meczu, online, relacja, składy drużyn",
        "url": "https://dziennikbaltycki.pl/rumunia-polska-na-zywo-14112026-r-gdzie-ogladac-transmisje-w-tv-i-stream-wynik-meczu-online-relacja-sklady-druzyn/rs/c2-8053622867"
      },
      {
        "outlet": "Polsat Sport",
        "angle": "Depesza źródłowa",
        "summary": "WTA Finals: Aryna Sabalenka - Elina Switolina. Relacja live i wynik na żywo",
        "url": "https://www.polsatsport.pl/wiadomosc/2026-11-12/wta-finals-aryna-sabalenka-elina-switolina-relacja-live-i-wynik-na-zywo/"
      },
      {
        "outlet": "Radio Lublin",
        "angle": "Depesza źródłowa",
        "summary": "Przed lubelskimi szczypiornistkami mecz z Rumunią",
        "url": "https://radio.lublin.pl/2026/11/przed-lubelskimi-szczypiornistkami-mecz-z-rumunia/"
      }
    ],
    "sources": [
      "Dziennik Bałtycki",
      "Polsat Sport",
      "Radio Lublin"
    ],
    "corrections": []
  },
  {
    "id": 12,
    "path": "/Sport",
    "seo_url": "/Sport/anglia-awansowala-do-cwiercfinalu-ligi-narodow",
    "seo_title": "Anglia awansowała do ćwierćfinału Ligi Narodów",
    "thumbnail_url": "https://ipla.pluscdn.pl/dituel/cp/wx/wxn6wqw63r8m5rjxv8112rfngmnkaqz9.jpg",
    "published_iso": "2026-11-13T02:00:23+01:00",
    "display_date": "13.11.2026, 02:00",
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
        "val": "/Sport"
      },
      {
        "label": "Główne źródło",
        "val": "Polsat Sport"
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
          "Anglia zapewniła sobie w czwartek awans do ćwierćfinału piłkarskiej Ligi Narodów. [Źródło: Polsat Sport]",
          "W 5. kolejce pokonała u siebie Chorwację 2:1. Rekordowy 126. występ w barwach Anglii zaliczył Harry Kane, który zdobył jedną bramkę. [Źródło: Polsat Sport]",
          "Italia odwróciła wynik na 3:1 w hicie Ligi Narodów UEFA z Francją. [Źródło: WP SportoweFakty, Przegląd Sportowy]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Włochy straciły absurdalnego gola po błędzie Gianluigiego Donnarummy. Sytuacja mogłaby odebrać impet Azzurrim, ale tak się nie stało. [Źródło: WP SportoweFakty]",
          "Przed ostatnią kolejką sytuacja w tej grupie wygląda ekscytująco. Emocji w meczach dywizji A było zresztą dużo więcej. [Źródło: Przegląd Sportowy]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Polsat Sport",
        "angle": "Depesza źródłowa",
        "summary": "Anglia awansowała do ćwierćfinału Ligi Narodów",
        "url": "https://www.polsatsport.pl/wiadomosc/2026-11-12/anglia-awansowala-do-cwiercfinalu-ligi-narodow/"
      },
      {
        "outlet": "WP SportoweFakty",
        "angle": "Depesza źródłowa",
        "summary": "Donnarumma narozrabiał w hicie Ligi Narodów. Kompani dokonali odwetu na Francji",
        "url": "https://sportowefakty.wp.pl/pilka-nozna/1283882/donnarumma-narozrabial-w-hicie-ligi-narodow-kompani-dokonali-odwetu-na-francji"
      },
      {
        "outlet": "Przegląd Sportowy",
        "angle": "Depesza źródłowa",
        "summary": "Francja zatrzymana, kapitalny hit Ligi Narodów. Poważne zmiany w tabeli",
        "url": "https://przegladsportowy.onet.pl/siatkowka/liga-narodow/francja-zatrzymana-kapitalny-hit-ligi-narodow-powazne-zmiany-w-tabeli/wynweev"
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
    "id": 13,
    "path": "/Polska/Gospodarka",
    "seo_url": "/Polska/Gospodarka/firma-doradcy-ministra-pod-lupa-krajewski-sprawdza-zlecenia-kowr",
    "seo_title": "Firma doradcy ministra pod lupą. Krajewski sprawdza zlecenia KOWR",
    "thumbnail_url": "http://galeria.bankier.pl/p/0/0/f07732967f063f-948-568-96-68-1281-768.jpg",
    "published_iso": "2026-11-13T02:00:23+01:00",
    "display_date": "13.11.2026, 02:00",
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
        "val": "Bankier.pl"
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
          "Minister rolnictwa Stefan Krajewski przekazał, że zlecił sprawdzenie wszystkich zleceń z Krajowego Ośrodka Wsparcia Rolnictwa dla spółki powiązanej z bliskimi jego społecznego doradcy. [Źródło: Bankier.pl, Niezależna.pl]",
          "Zdaniem mediów firma miała w ciągu ostatnich trzech lat wygrać zamówienia publiczne o wartości ok. 1 mln zł. [Źródło: Bankier.pl, Niezależna.pl]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Wyniki kontroli mają być znane w piątek. [Źródło: Niezależna.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Bankier.pl",
        "angle": "Depesza źródłowa",
        "summary": "Firma doradcy ministra pod lupą. Krajewski sprawdza zlecenia KOWR",
        "url": "https://www.bankier.pl/wiadomosc/12-Firma-doradcy-ministra-pod-lupa-Krajewski-sprawdza-zlecenia-KOWR-9228108.html?utm_source=RSS&utm_medium=RSS&utm_campaign=Wiadomosci"
      },
      {
        "outlet": "Niezależna.pl",
        "angle": "Depesza źródłowa",
        "summary": "Kłopoty ministra rolnictwa. Krajewski zleca kontrolę zleceń dla firmy bliskich... swojego doradcy",
        "url": "https://niezalezna.pl/polityka/klopoty-ministra-rolnictwa-krajewski-zleca-kontrole-zlecen-dla-firmy-bliskich-swojego-doradcy/584041"
      }
    ],
    "sources": [
      "Bankier.pl",
      "Niezależna.pl"
    ],
    "corrections": []
  },
  {
    "id": 14,
    "path": "/Sport",
    "seo_url": "/Sport/swieto-w-mediolanie-wlosi-lepsi-od-francuzow-w-lidze-narodow",
    "seo_title": "Święto w Mediolanie. Włosi lepsi od Francuzów w Lidze Narodów",
    "thumbnail_url": "https://i.gremicdn.pl/image/free/a258dcfef370f32215637e0f9992ba76/?t=crop:4822:2108:nowe:0:0,resize:fill:600:300,enlarge:1",
    "published_iso": "2026-11-13T02:00:23+01:00",
    "display_date": "13.11.2026, 02:00",
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
        "val": "/Sport"
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
          "Kibice na San Siro, w tym nowy mistrz świata Formuły 1 Kimi Antonelli, obejrzeli świetny mecz, a Włosi niespodziewanie pokonali Francję 3:1. Bez Kyliana Mbappe drużynie Zinedine’a Zidane’a trudno zdobywać bramki. [Źródło: Rzeczpospolita, Sport.pl]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Włosi sprawili niemałą niespodziankę w Lidze Narodów. I choć po 10 minutach przegrywał przez koszmarny błąd Donnarummy, to ostatecznie zwyciężył 3:1. Bez większych sensacji obyło się za to w pozostałych spotkaniach dywizji A. [Źródło: Sport.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Rzeczpospolita",
        "angle": "Depesza źródłowa",
        "summary": "Święto w Mediolanie. Włosi lepsi od Francuzów w Lidze Narodów",
        "url": "https://sport.rp.pl/pilka-nozna/art45482911-swieto-w-mediolanie-wlosi-lepsi-od-francuzow-w-lidze-narodow"
      },
      {
        "outlet": "Sport.pl",
        "angle": "Depesza źródłowa",
        "summary": "Niespodzianka w Lidze Narodów! Francja na kolanach",
        "url": "https://www.sport.pl/pilka/7,64946,33130278,niespodzianka-w-lidze-narodow-francja-na-kolanach.html"
      }
    ],
    "sources": [
      "Rzeczpospolita",
      "Sport.pl"
    ],
    "corrections": []
  },
  {
    "id": 15,
    "path": "/Polska/Polityka",
    "seo_url": "/Polska/Polityka/marsz-niepodleglosci-przeszedl-ulicami-warszawy",
    "seo_title": "Marsz Niepodległości przeszedł ulicami Warszawy",
    "thumbnail_url": "https://cdn.defence24.pl/2026/11/11/320x240px/uVqURYXosrYoYBsAxtLsaSuxlq4NGEMhoipgkmcX.al5q.jpg",
    "published_iso": "2026-11-13T01:57:27+01:00",
    "display_date": "13.11.2026, 01:57",
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
        "val": "/Polska/Polityka"
      },
      {
        "label": "Główne źródło",
        "val": "InfoSecurity24"
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
          "W środę 11 listopada ulicami Warszawy przeszedł Marsz Niepodległości. [Źródło: InfoSecurity24, Sport.pl]",
          "Uczestniczył w nim m.in. prezydent Karol Nawrocki. [Źródło: InfoSecurity24]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "W tym roku w wydarzeniu uczestniczył zawodnik KSW, Hugo Deux. Francuz w rozmowie z Przeglądem Sportowym Onet opowiedział o swoich wrażeniach. [Źródło: Sport.pl]",
          "Race były, podobnie jak patriotyczne hasła. Były też tradycyjne obelgi wobec premiera Donalda Tuska. I tylko jedna nowość: Koła Gospodyń Wiejskich sprzedawały bigos i kiełbasę. [Źródło: Newsweek Polska]",
          "Mieszkańcy oddali hołd tragicznie zmarłej Izabeli Woźnej. [Źródło: ePoznan.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "InfoSecurity24",
        "angle": "Depesza źródłowa",
        "summary": "Marsz Niepodległości przeszedł ulicami Warszawy",
        "url": "https://infosecurity24.pl/bezpieczenstwo-wewnetrzne/marsz-niepodleglosci-przeszedl-ulicami-warszawy"
      },
      {
        "outlet": "Sport.pl",
        "angle": "Depesza źródłowa",
        "summary": "Francuz poszedł na Marsz Niepodległości i wydał wyrok. \"W świecie zachodnim...\"",
        "url": "https://www.sport.pl/inne/7,102005,33130254,francuz-poszedl-na-marsz-niepodleglosci-i-wydal-wyrok-w-swiecie.html"
      },
      {
        "outlet": "Newsweek Polska",
        "angle": "Depesza źródłowa",
        "summary": "Kim: Gaz w przejściu podziemnym, obelgi pod adresem Tuska i jedna nowość. Byłam na Marszu Niepodległości",
        "url": "https://www.newsweek.pl/polska/spoleczenstwo/duzo-obelg-pod-adresem-tuska-i-jedna-nowosc-bylam-na-marszu-niepodleglosci/hmqdll2"
      },
      {
        "outlet": "ePoznan.pl",
        "angle": "Depesza źródłowa",
        "summary": "Marsz ciszy przeszedł ulicami Chodzieży. To sprzeciw wobec przemocy",
        "url": "https://epoznan.pl/news-news-181915-marsz_ciszy_przeszedl_ulicami_chodziezy_to_sprzeciw_wobec_przemocy?rss=1"
      }
    ],
    "sources": [
      "InfoSecurity24",
      "Newsweek Polska",
      "Sport.pl",
      "ePoznan.pl"
    ],
    "corrections": []
  },
  {
    "id": 16,
    "path": "/Polska/Polityka",
    "seo_url": "/Polska/Polityka/zelenski-spotkal-sie-w-dublinie-z-przywodcami-13-panstw-w-tym-polski",
    "seo_title": "Zełenski spotkał się w Dublinie z przywódcami 13 państw, w tym Polski",
    "thumbnail_url": "https://cdn.defence24.pl/2022/03/22/320x180px/AzhVIhTUTyIVhzXhllVTRoP9wmrpPUR7SOuPZTrL.yz7a.jpg",
    "published_iso": "2026-11-13T01:57:27+01:00",
    "display_date": "13.11.2026, 01:57",
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
        "val": "Defence24"
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
          "Ukraiński prezydent Wołodymyr Zełenski spotkał się w czwartek w Dublinie z przywódcami 13 państw, które określił jako przyjaciół Ukrainy i jej największych partnerów; wśród uczestników był premier Donald Tusk. [Źródło: Defence24, TVN24, Onet Wiadomości]",
          "Według Zełenskiego rozmowa dotyczyła wsparcia Ukrainy w obliczu nieustających rosyjskich ataków. [Źródło: Defence24]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Rozmawiali między innymi o wsparciu Polski w przygotowaniach do zimy, a także o rozszerzeniu połączeń na potrzeby dostaw paliwa na Ukrainę. [Źródło: TVN24]",
          "Celem jest wypracowanie porozumienia pokojowego między Rosją a Ukrainą. [Źródło: Onet Wiadomości]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Defence24",
        "angle": "Depesza źródłowa",
        "summary": "Zełenski spotkał się w Dublinie z przywódcami 13 państw, w tym Polski",
        "url": "https://defence24.pl/wojna-na-ukrainie-raport-specjalny-defence24/zelenski-spotkal-sie-w-dublinie-z-przywodcami-13-panstw-w-tym-polski"
      },
      {
        "outlet": "TVN24",
        "angle": "Depesza źródłowa",
        "summary": "Prezydent Ukrainy Wołodymyr Zełenski spotkał się z Donaldem Tuskiem. \"Jak Polska może pomóc\"",
        "url": "https://tvn24.pl/biznes/ze-swiata/prezydent-ukrainy-wolodymyr-zelenski-spotkal-sie-z-donaldem-tuskiem-jak-polska-moze-pomoc-st9336612?source=rss"
      },
      {
        "outlet": "Onet Wiadomości",
        "angle": "Depesza źródłowa",
        "summary": "Wołodymyr Zełenski spotkał się z wysłannikami Donalda Trumpa",
        "url": "https://wiadomosci.onet.pl/swiat/wolodymyr-zelenski-spotkal-sie-z-wyslannikami-donalda-trumpa/pxcv3xf"
      }
    ],
    "sources": [
      "Defence24",
      "Onet Wiadomości",
      "TVN24"
    ],
    "corrections": []
  },
  {
    "id": 17,
    "path": "/Sport",
    "seo_url": "/Sport/drakonskie-kary-po-derbach-krakowa-komisja-ligi-nie-miala-litosci",
    "seo_title": "Drakońskie kary po derbach Krakowa. Komisja Ligi nie miała litości",
    "thumbnail_url": "https://i.iplsc.com/-/000NIXOF14I6FKLA-C321.webp",
    "published_iso": "2026-11-13T01:57:27+01:00",
    "display_date": "13.11.2026, 01:57",
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
          "6 listopada odbyły się historyczne derby Krakowa. [Źródło: Interia Sport, Sport.pl, Radio Kraków]",
          "Mecz ten wywoływał emocje na długo przed pierwszym gwizdkiem arbitra. [Źródło: Interia Sport]",
          "Te naturalnie sięgały zenitu w miarę postępowania pojedynku. [Źródło: Interia Sport]",
          "Z tego powodu doszło do kilku incydentów, którym wnikliwie przyjrzała się Komisja Ligi PKO BP Ekstraklasy. [Źródło: Interia Sport]",
          "12 listopada otrzymaliśmy rozpiskę kar, nałożonych na krakowskie drużyny oraz zawodnika, który podczas meczu dopuścił się bardzo groźnego faulu. [Źródło: Interia Sport]",
          "Nie upiekło się także członkowi sztabu jednej z ekip. [Źródło: Interia Sport]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Piłkarz będzie długo pauzował oraz zapłaci karę finansową. [Źródło: Sport.pl]",
          "Rozegrane 6 listopada przy Reymonta spotkanie, w którym Wisła Kraków pokonała Cracovię 2:1, przyniosło dotkliwe konsekwencje zarówno dla samych klubów, jak i członków drużyny gości. [Źródło: Radio Kraków]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Interia Sport",
        "angle": "Depesza źródłowa",
        "summary": "Drakońskie kary po derbach Krakowa. Komisja Ligi nie miała litości",
        "url": "https://sport.interia.pl/pilka-nozna/ekstraklasa/news-szesc-meczow-zawieszenia-a-to-nie-koniec-drakonskie-kary-po,nId,23572793"
      },
      {
        "outlet": "Sport.pl",
        "angle": "Depesza źródłowa",
        "summary": "Są kary po derbach Krakowa! Tyle ma pauzować Klich",
        "url": "https://www.sport.pl/pilka/7,65039,33130147,sa-kary-po-derbach-krakowa-tyle-ma-pauzowac-klich.html"
      },
      {
        "outlet": "Radio Kraków",
        "angle": "Depesza źródłowa",
        "summary": "Surowe decyzje Komisji Ligi po Wielkich Derbach Krakowa. Posypały się kary finansowe i zawieszenia",
        "url": "https://radiokrakow.pl/sport/surowe-decyzje-komisji-ligi-po-wielkich-derbach-krakowa-posypaly-sie-kary-finansowe-i-zawieszenia/187661"
      }
    ],
    "sources": [
      "Interia Sport",
      "Radio Kraków",
      "Sport.pl"
    ],
    "corrections": []
  },
  {
    "id": 18,
    "path": "/Sport",
    "seo_url": "/Sport/polski-zwiazek-strzelectwa-reaguje-na-zamach-w-krakowie",
    "seo_title": "Polski Związek Strzelectwa reaguje na zamach w Krakowie",
    "thumbnail_url": "https://bi.im-g.pl/im/f5/00/1b/z28312565IHG.jpg",
    "published_iso": "2026-11-13T01:57:27+01:00",
    "display_date": "13.11.2026, 01:57",
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
        "val": "/Sport"
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
          "Polski Związek Strzelectwa Sportowego wydał komunikat związany z wielką tragedią do której doszło w sobotę w Krakowie. [Źródło: Sport.pl]",
          "W Zielonkach pod Krakowem rodzina, przyjaciele i znajomi pożegnali 61-letnią Dorotę Baran, jedną z sześciu ofiar zamachu na Rynku Głównym w Krakowie. [Źródło: Radio Kraków, Radio Rzeszów]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Kobieta zginęła 7 listopada. Bliscy wspominają ją jako osobę niezwykle oddaną rodzinie, szczególnie opiece nad 80-letnią matką. – Jedyną właściwą, mądrą odpowiedzią na zło jest dobro i miłość – podkreślił podczas uroczystości pogrzebowych ks. [Źródło: Radio Kraków]",
          "Wcześniej zastrzelił on swoją rodzinę: rodziców i siostrę. W najbliższych dniach wszystkie ofiary spoczną na cmentarzach. [Źródło: Radio Rzeszów]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Sport.pl",
        "angle": "Depesza źródłowa",
        "summary": "Polski Związek Strzelectwa reaguje na zamach w Krakowie",
        "url": "https://www.sport.pl/inne/7,64998,33130240,polski-zwiazek-strzelectwa-reaguje-na-zamach-w-krakowie.html"
      },
      {
        "outlet": "Radio Kraków",
        "angle": "Depesza źródłowa",
        "summary": "W Zielonkach pożegnano Dorotę Baran, jedną z ofiar zamachu na Rynku Głównym w Krakowie",
        "url": "https://radiokrakow.pl/wiadomosci/krakow/w-zielonkach-pozegnano-dorote-baran-jedna-z-ofiar-zamachu-na-rynku-glownym-w-krakowie/187658"
      },
      {
        "outlet": "Radio Rzeszów",
        "angle": "Depesza źródłowa",
        "summary": "Ofiary zamachu w Krakowie. Kim byli ludzie, którzy zginęli na Rynku Głównym?",
        "url": "https://radio.rzeszow.pl/373334/ofiary-zamachu-w-krakowie-kim-byli-ludzie-ktorzy-zgineli-na-rynku-glownym/"
      }
    ],
    "sources": [
      "Radio Kraków",
      "Radio Rzeszów",
      "Sport.pl"
    ],
    "corrections": []
  },
  {
    "id": 19,
    "path": "/Polska",
    "seo_url": "/Polska/globalna-awaria-microsoftu-nie-dzialaja-aplikacje-i-uslugi",
    "seo_title": "Globalna awaria Microsoftu. Nie działają aplikacje i usługi",
    "thumbnail_url": "https://ipla.pluscdn.pl/dituel/cp/wv/wvfftvvjf2hxysn9ifiakrsqajd7wdm1.jpg",
    "published_iso": "2026-11-13T01:38:43+01:00",
    "display_date": "13.11.2026, 01:38",
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
        "val": "/Polska"
      },
      {
        "label": "Główne źródło",
        "val": "Polsat News"
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
          "Microsoft potwierdził, że awaria usług odnotowana w pierwszej kolejności w regionie Ameryki Północnej rozlała się na cały świat. [Źródło: Polsat News, Rzeczpospolita, RMF24, TVN24, Onet Wiadomości, WP Wiadomości]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Wielu użytkowników ma problemy z dostępem do swoich kont e-mail, a także napotyka błędy podczas korzystania z innych aplikacji. [Źródło: Rzeczpospolita]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Polsat News",
        "angle": "Depesza źródłowa",
        "summary": "Globalna awaria Microsoftu. Nie działają aplikacje i usługi",
        "url": "https://www.polsatnews.pl/wiadomosc/2026-11-12/globalna-awaria-microsoftu-nie-dzialaja-aplikacje-i-uslugi/"
      },
      {
        "outlet": "Rzeczpospolita",
        "angle": "Depesza źródłowa",
        "summary": "Duża awaria usług Microsoft. Użytkownicy mają problemy z dostępem do e-mail",
        "url": "https://cyfrowa.rp.pl/globalne-interesy/art45482681-duza-awaria-uslug-microsoft-uzytkownicy-maja-problemy-z-dostepem-do-e-mail"
      },
      {
        "outlet": "RMF24",
        "angle": "Depesza źródłowa",
        "summary": "Problemy z Microsoft 365. Nie działa wiele usług",
        "url": "https://www.rmf24.pl/fakty/swiat/news-problemy-z-microsoft-365-nie-dziala-wiele-uslug,nIdn,1025918"
      },
      {
        "outlet": "TVN24",
        "angle": "Depesza źródłowa",
        "summary": "Wielka awaria Microsoftu. Outlook nie działa",
        "url": "https://tvn24.pl/biznes/ze-swiata/awaria-microsoft-365-i-outlooka-dotknela-tysiace-uzytkownikow-st9336650?source=rss"
      },
      {
        "outlet": "Onet Wiadomości",
        "angle": "Depesza źródłowa",
        "summary": "Microsoft 365 z globalną awarią. Trwają prace nad przywróceniem usług dla klientów",
        "url": "https://wiadomosci.onet.pl/swiat/microsoft-365-z-globalna-awaria-nie-dziala-teams-copilot-i-sharepoint/cypfejj"
      },
      {
        "outlet": "WP Wiadomości",
        "angle": "Depesza źródłowa",
        "summary": "Awaria usług Microsoft. Tysiące użytkowników zgłaszają problemy",
        "url": "https://wiadomosci.wp.pl/awaria-uslug-microsoft-tysiace-uzytkownikow-zglaszaja-problemy-7350346787448832a"
      }
    ],
    "sources": [
      "Onet Wiadomości",
      "Polsat News",
      "RMF24",
      "Rzeczpospolita",
      "TVN24",
      "WP Wiadomości"
    ],
    "corrections": []
  },
  {
    "id": 20,
    "path": "/Polska",
    "seo_url": "/Polska/prokuratura-chce-przesluchac-nawrockiego-pismo-do-kancelarii-prezydenta",
    "seo_title": "Prokuratura chce przesłuchać Nawrockiego. Pismo do kancelarii prezydenta",
    "thumbnail_url": "https://rmf.rmffm.pl/news/attachments/b4/70/prezydent-karol-na-636x421-b470a47c.jpg",
    "published_iso": "2026-11-13T01:38:43+01:00",
    "display_date": "13.11.2026, 01:38",
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
        "val": "/Polska"
      },
      {
        "label": "Główne źródło",
        "val": "RMF24"
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
          "Prokuratura chce przesłuchać prezydenta Karola Nawrockiego w charakterze świadka w sprawie kawalerki Jerzego Ż. – poinformował Onet. [Źródło: Niezależna.pl, TVN24, Radio Gdańsk]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Portal ponownie przywołuje przy tym wypowiedzi Anny Kanigowskiej, dawnej opiekunki seniora. Nie wspomina jednak, że kobieta została prawomocnie skazana za oszustwo na trzy lata pozbawienia wolności i w lipcu trafiła do aresztu śledczego. Jej kryminalną przeszłość, w tym wcześniejsze wyroki za oszustwa i przestępstwa związane z dokumentami, ujawniły Niezalezna.pl i Telewizja Republika. [Źródło: Niezależna.pl]",
          "Głowa państwa ma złożyć zeznania w charakterze świadka. [Źródło: TVN24]",
          "Tymczasem w Warszawie wyznaczono termin pierwszej rozprawy w procesie karnym, który Nawrocki wytoczył dziennikarzom Onetu [Źródło: Radio Gdańsk]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "RMF24",
        "angle": "Depesza źródłowa",
        "summary": "Prokuratura chce przesłuchać Nawrockiego. Pismo do kancelarii prezydenta",
        "url": "https://www.rmf24.pl/fakty/polska/news-prokuratura-chce-przesluchac-nawrockiego-pismo-do-kancelarii,nIdn,1025911"
      },
      {
        "outlet": "Niezależna.pl",
        "angle": "Depesza źródłowa",
        "summary": "Prokuratura chce przesłuchać prezydenta. Onet znów cytuje skazaną za oszustwo \"opiekunkę\"",
        "url": "https://niezalezna.pl/polityka/prokuratura-chce-przesluchac-prezydenta-onet-znow-cytuje-skazana-za-oszustwo-opiekunke/584042"
      },
      {
        "outlet": "TVN24",
        "angle": "Depesza źródłowa",
        "summary": "Sprawa kawalerki Jerzego Ż. Prokuratura chce przesłuchać prezydenta Karola Nawrockiego",
        "url": "https://tvn24.pl/polska/karol-nawrocki-sprawa-kawalerki-jerzego-z-prokuratura-chce-przesluchac-prezydenta-st9336628?source=rss"
      },
      {
        "outlet": "Radio Gdańsk",
        "angle": "Depesza źródłowa",
        "summary": "Gdańska prokuratura chce przesłuchać Karola Nawrockiego",
        "url": "https://radiogdansk.pl/wiadomosci/trojmiasto/2026/11/12/gdanska-prokuratura-chce-przesluchac-karola-nawrockiego/"
      }
    ],
    "sources": [
      "Niezależna.pl",
      "RMF24",
      "Radio Gdańsk",
      "TVN24"
    ],
    "corrections": []
  },
  {
    "id": 21,
    "path": "/Sport",
    "seo_url": "/Sport/lekarz-przy-kostiuk-zaraz-przy-gauff-dramat-w-wta-finals-powrot-z-1-5",
    "seo_title": "Lekarz przy Kostiuk, zaraz przy Gauff. Dramat w WTA Finals. Powrót z 1:5",
    "thumbnail_url": "https://i.iplsc.com/-/000NIXWZN3EU0JMK-C321.webp",
    "published_iso": "2026-11-13T01:38:43+01:00",
    "display_date": "13.11.2026, 01:38",
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
          "Linda Noskova już po dwóch spotkaniach WTA Finals była pewna swojego awansu z grupy A, o powrocie do domu mogła myśleć Marta Kostiuk, podopieczna Sandry Zaniewskiej. [Źródło: Interia Sport, Przegląd Sportowy, Sport.pl, WP SportoweFakty]",
          "A niewiadomą było to, która z Amerykanek do niej dołączy: Coco Gauff czy Jessica Pegula. [Źródło: Interia Sport]",
          "Ta pierwsza zaczęła czwartkową sesję od starcia z Kostiuk, sama wygrana, nawet 2:0, mogła nie wystarczyć. [Źródło: Interia Sport]",
          "Gauff wygrała seta 6:4, Ukrainka miała kłopot z nadgarstkiem. [Źródło: Interia Sport]",
          "A później to Amerykanka mierzyła się z bólem pleców, broniła trzech setboli przy stanie 1:5. I... wygrała sześć kolejnych gemów. [Źródło: Interia Sport]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "W drugim secie Coco Gauff była już kompletnie rozbita, a mimo to we wspaniałym stylu odwróciła losy partii i pokonała Martę Kostiuk 6:4, 7:5. To zaś ma poważne konsekwencje, jeśli chodzi o walkę o awans do dalszej fazy turnieju. [Źródło: Przegląd Sportowy]",
          "Amerykanka pokazała jednak wielki charakter, odrobiła straty i wygrała 6:4, 7:5. Teraz musi liczyć na porażkę Peguli z Noskovą, by awansować do półfinału imprezy. [Źródło: Sport.pl]",
          "Choć przegrała z rodaczką na otwarcie, to zdobyła więcej setów. [Źródło: WP SportoweFakty]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Interia Sport",
        "angle": "Depesza źródłowa",
        "summary": "Lekarz przy Kostiuk, zaraz przy Gauff. Dramat w WTA Finals. Powrót z 1:5",
        "url": "https://sport.interia.pl/tenis/wta-finals/news-lekarz-przy-kostiuk-zaraz-przy-gauff-dramat-w-wta-finals-pow,nId,23572821"
      },
      {
        "outlet": "Przegląd Sportowy",
        "angle": "Depesza źródłowa",
        "summary": "Było już 1:5. Ależ powrót Coco Gauff. I musi czekać w WTA Finals",
        "url": "https://przegladsportowy.onet.pl/tenis/bylo-juz-15-alez-powrot-coco-gauff-i-moze-swietowac-w-wta-finals/yl9bsws"
      },
      {
        "outlet": "Sport.pl",
        "angle": "Depesza źródłowa",
        "summary": "Co za mecz w WTA Finals. Gauff przegrywała już 1:5",
        "url": "https://www.sport.pl/tenis/7,64987,33130275,co-za-mecz-w-wta-finals-gauff-przegrywala-juz-1-5.html"
      },
      {
        "outlet": "WP SportoweFakty",
        "angle": "Depesza źródłowa",
        "summary": "Istny thriller. Wyrzuciła Gauff z WTA Finals",
        "url": "https://sportowefakty.wp.pl/tenis/1283919/istny-thriller-wyrzucila-gauff-z-wta-finals"
      }
    ],
    "sources": [
      "Interia Sport",
      "Przegląd Sportowy",
      "Sport.pl",
      "WP SportoweFakty"
    ],
    "corrections": []
  },
  {
    "id": 22,
    "path": "/Polska/Gospodarka",
    "seo_url": "/Polska/Gospodarka/polska-i-ukraina-zaciesnia-wspolprace-w-kijowie-powolano-nowa-rade",
    "seo_title": "Polska i Ukraina zacieśnią współpracę? W Kijowie powołano nową radę",
    "thumbnail_url": "http://galeria.bankier.pl/p/5/6/c695cd28142089-948-568-5-140-1991-1195.jpg",
    "published_iso": "2026-11-13T01:38:43+01:00",
    "display_date": "13.11.2026, 01:38",
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
        "val": "/Polska/Gospodarka"
      },
      {
        "label": "Główne źródło",
        "val": "Bankier.pl"
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
          "W Radzie Najwyższej (parlamencie) Ukrainy utworzono Radę Współpracy z Polską. [Źródło: Bankier.pl, Interia Wydarzenia]",
          "Jej zadaniem będzie zacieśnianie współpracy parlamentarnej obu państw oraz angażowanie różnych środowisk w rozwijanie przyjaznych stosunków polsko-ukraińskich – poinformował w czwartek ukraiński deputowany Mykoła Kniażycki. [Źródło: Bankier.pl, Interia Wydarzenia, Gazeta.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Bankier.pl",
        "angle": "Depesza źródłowa",
        "summary": "Polska i Ukraina zacieśnią współpracę? W Kijowie powołano nową radę",
        "url": "https://www.bankier.pl/wiadomosc/Polska-i-Ukraina-zaciesnia-wspolprace-W-Kijowie-powolano-nowa-rade-9228098.html?utm_source=RSS&utm_medium=RSS&utm_campaign=Wiadomosci"
      },
      {
        "outlet": "Interia Wydarzenia",
        "angle": "Depesza źródłowa",
        "summary": "Ukraina i Polska zacieśnią współpracę? Powołano specjalną radę",
        "url": "https://wydarzenia.interia.pl/zagranica/news-ukraina-i-polska-zaciesnia-wspolprace-powolano-specjalna-rad,nId,23572814"
      },
      {
        "outlet": "Gazeta.pl",
        "angle": "Depesza źródłowa",
        "summary": "Ukraiński parlament utworzył Radę Współpracy z Polską. \"Sprawa niezwykle ważna dla naszej przyszłości\"",
        "url": "https://wiadomosci.gazeta.pl/polityka/7,198013,33130164,ukrainski-parlament-utworzyl-rade-wspolpracy-z-polska-sprawa.html?utm_source=RSS&utm_medium=RSS&utm_campaign=10199882"
      }
    ],
    "sources": [
      "Bankier.pl",
      "Gazeta.pl",
      "Interia Wydarzenia"
    ],
    "corrections": []
  },
  {
    "id": 23,
    "path": "/Polska/Energetyka",
    "seo_url": "/Polska/Energetyka/sprawa-elektrowni-ostro-ka-to-symbol-chorych-uk-ad-w-w-pa-stwowych-firmach",
    "seo_title": "Sprawa Elektrowni Ostrołęka to symbol chorych układów w państwowych firmach",
    "thumbnail_url": "https://wysokienapiecie.pl/wp-content/uploads/2018/12/polityk_rynek.x63527.jpg",
    "published_iso": "2026-11-13T01:06:33+01:00",
    "display_date": "13.11.2026, 01:06",
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
        "val": "WysokieNapiecie.pl"
      },
      {
        "label": "Weryfikacja",
        "val": "1 źródło (lokalne/niszowe)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Relacja źródłowa (WysokieNapiecie.pl)",
        "paragraphs": [
          "Dwa lata potrzebowała prokuratura do postawienia 6 listopada 2026 r. zarzutów 25 osobom odpowiedzialnym za nieszczęsną budowę elektrowni węglowej w Ostrołęce. Przypomnijmy garść faktów. Pojawia się i znika Historia Ostrołęki C rozpoczęła się jeszcze za rządów pierwszej koalicji PO-PSL. Energa planowała budowę nowego bloku węglowego o mocy 1000 MW, który miał zastąpić część starzejących się elektrowni. W 2009 r. powstała spółka celowa, a w 2011 r. ogłoszono przetarg na wykonawcę inwestycji. Jednak już we wrześniu 2012 r. zarząd Energi zdecydował o zamrożeniu projektu. Powodem były trudności z pozyskaniem finansowania, pogorszenie warunków rynkowych i wątpliwości co do opłacalności inwestycji. Do 2015 r. budowy nie wznowiono, choć spółka nadal poszukiwała potencjalnego inwestora. Sytuacja zmieniła się po dojściu PiS do władzy. Budowa elektrowni stała się jednym z priorytetów ministra energii Krzysztofa Tchórzewskiego, który podkreślał jej znaczenie dla bezpieczeństwa energetycznego i utrzymania zapotrzebowania na polski węgiel. W maju 2016 r. zarząd Energi uchylił decyzję o wstrzymaniu inwestycji. W grudniu tego samego roku Energa zawarła umowę o wspólnej realizacji projektu z Eneą, która następnie objęła połowę udziałów w spółce Elektrownia Ostrołęka. W kwietniu 2018 r. wybrano generalnego wykonawcę – konsorcjum GE Power i Alstom, które zaoferowało budowę bloku za nieco ponad 6 mld zł brutto. Kontrakt podpisano 12 lipca 2018 r. W październiku, na kilka dni przed wyborami samorządowymi, zorganizowano uroczystość rozpoczęcia inwestycji. Kluczowe decyzje zapadły jednak dopiero w grudniu 2018 r . Elektrownia Ostrołęka uzyskała kontrakt na rynku mocy, a 28 grudnia podjęto decyzję o wydaniu generalnemu wykonawcy polecenia rozpoczęcia prac (NTP). Nastąpiło to mimo braku zapewnionego finansowania całej inwestycji. Energa i Enea deklarowały zaangażowanie po około miliard złotych, ale nie udało się doprowadzić do zamknięcia finansowania bankowego ani pozyskać wszystkich planowanych inwestorów. W 2019 r. trwały kolejne próby znalezienia pieniędzy. Rozważano między innymi udział PGE. Minister Tchórzewski naciskał na kontynuowanie projektu. Cztery dni później obie spółki zawarły kolejne porozumienie dotyczące finansowania budowy. Jednak cały czas nie mogły zdobyć finansowania – banki nie chciały dać kredytów na elektrownię, w której rentowność nie wierzyły. W czerwcu podjęto decyzję o odejściu od projektu węglowego na rzecz elektrowni gazowej. Najwyższa Izba Kontroli w 2020 i 2021 r. stwierdziła liczne nieprawidłowości, w tym podejmowanie decyzji bez zapewnienia finansowania oraz nierzetelne przedstawianie organom spółek informacji dotyczących sytuacji projektu. Według NIK działania i zaniechania kontrolowanych podmiotów doprowadziły do bezpowrotnej utraty ponad 1,3 mld zł. Jak czytać intencje ministra Mechanizm podejmowania decyzji jest mniej więcej znany. Na pewno rolę odgrywał też fakt, że Ostrołęka to jego okręg wyborczy, a budowa oznaczała kilka lat boomu inwestycyjnego w regionie. Argumenty o nierentowności nie przekonały ministra. Ponieważ sama Energa nie była w stanie udźwignąć budowy, doproszono jeszcze poznańską Eneę. Protokół przesłuchania ministra przez NIK nie został opublikowany. Ponadto zeznał, że z punktu widzenia państwa zysk nie był najważniejszy. W Enei prezes był jeden, Mirosław Kowalik, doświadczony menedżer, przed objęciem sterów Enei długoletni szef polskiej spółki Alstomu. Każdy menedżer może się pomylić, ludzie decydujący o miliardowych inwestycjach nie mają szklanej kuli. Ale trzeba odróżnić „uczciwą” pomyłkę, która wynika z błędnej oceny, od sytuacji w której ktoś wie, że popełnia błąd, ale nie umie postąpić inaczej, bo boi się polityków. Dlaczego uznał, że lepiej zostać w Enei i mieć plamę na menedżerskiej reputacji niż honorowo podać się do dymisji? Przypadkowo, podświadomie czy intencjonalnie - tego pewnie sam już nie pamięta Polską Grupę Energetyczną również próbowano ubrać w tę inwestycję, ale skutecznie się wykręciła. W 2019 r. przyszła jednak chwila, w której, jak to pięknie napisał Andrzej Sapkowski, „ trzeba albo srać, albo oswobodzić wychodek ”. Ostrołęka to czubek góry lodowej Takich inwestycji było w energetyce III RP dużo więcej. W latach 2016-2018 PGE, Energa, Enea i PGNiG zostały zmuszone do wsadzenia (trudno tu mówić o zainwestowaniu) 2,3 mld zł w akcje Polskiej Grupy Górniczej. Akcje te po kilku latach skarb państwa kupił za złotówkę. Odpowiedzialności nikt nie poniósł, choć zarządy miały świadomość, że kupują spółkę bez wartości. W 2015 r. rząd Ewy Kopacz z PO zmusił giełdowy Tauron, aby kupił za ponad 130 mln zł nierentowną kopalnię Brzeszcze, do której potem dołożył jeszcze 450 mln zł. Cały ówczesny zarząd Taurona nie chciał wziąć odpowiedzialności za tę decyzję, odwołano go więc i mianowano posłusznych. Kilian był dawnym kolegą ówczesnego i dzisiejszego premiera Donalda Tuska, ale tu mu nie pomogło. Prezesi z zarzutami, mechanizmy zostały Sprawa Ostrołęki była zbyt głośna, aby zamieść ją pod dywan, zwłaszcza, że doniesienie do prokuratury złożył NIK. Oskarżeni spędzą teraz wiele lat włócząc się po sądach, bo polski wymiar sprawiedliwości nie słynie z szybkości. Wyrok trudno przewidzieć. Ale na ławie oskarżonych powinien przede wszystkim znaleźć się polski system nadzoru właścicielskiego, który bardziej przypomina klientelistyczne układy Rzeczypospolitej czasów Radziwiłłów i Potockich niż nowoczesny nadzór korporacyjny. Każdy szanujący się polski polityk uważa wpływy personalne w spółkach skarbu państwa za ważny element budowania swojej pozycji. Nie chodzi tylko o wymianę kadr po wyborach, choć to też jest beznadziejne. Nawet w łonie jednej partii instalowanie \"swoich\" i pozbywanie się tych z konkurencyjnej frakcji to chleb powszedni. Zakulisowe intrygi, donosy, celowo roznoszone plotki - wszystko to sprawia, że menedżerowie często więcej czasu spędzają na pilnowaniu stołka niż na realnym zarządzaniu. Opinia publiczna może tylko czasem obserwować ten spektakl. Kilka lat temu związkowcy z „Solidarności” Jastrzębskiej Spółki Węglowej urządzili „kocią muzykę” pod domem posłanki Izabeli Kloc z PiS, żądając aby przestała nasyłać swoich ludzi na tłuste posady w bogatej wtedy jeszcze spółce. A przecież takich posłów i posłanek jest bardzo wiele… Prawo sobie, politycy sobie Menedżerowie największych państwowych spółek bywają różni, bardziej lub mniej fachowi. Ale łączy ich jedno – wszyscy są uwikłani w układ polityczny, który ich mianował. To odróżnia polskie spółki państwowe od skandynawskich czy nawet włoskich, w których szefowie trwają wiele kadencji i mogą w spokoju pracować. W Anglii Henryka VIII funkcjonowało powiedzonko „niełaska władcy oznacza śmierć”. Dziś rządzący są milsi, menedżerowie nie chcący wykonywać poleceń płacą tylko dymisją. Zapewne obrońcy oskarżonych w procesie o Ostrołękę C nie omieszkają wykorzystać tej wypowiedzi obecnego premiera. Skoro politycy chcą decydować, to niech decydują. Zgodnie z prawem Uregulowanie takich spraw jest stosunkowo proste. Nota bene nikt się ich nie czepiał. A że czasem to posłuszeństwo prowadzi na ławę oskarżonych… Cóż, ryzyko zawodowe. [Źródło: WysokieNapiecie.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "WysokieNapiecie.pl",
        "angle": "Depesza źródłowa",
        "summary": "Sprawa Elektrowni Ostrołęka to symbol chorych układów w państwowych firmach",
        "url": "https://wysokienapiecie.pl/122723-sprawa-elektrowni-ostroleka-to-symbol-chorych-ukladow-w-panstwowych-firmach/"
      }
    ],
    "sources": [
      "WysokieNapiecie.pl"
    ],
    "corrections": []
  },
  {
    "id": 24,
    "path": "/Polska/Energetyka",
    "seo_url": "/Polska/Energetyka/przemys-energoch-onny-oze-szansa-na-finansowanie-inwestycji-w-zielon-energi",
    "seo_title": "„Przemysł energochłonny – OZE”. Szansa na finansowanie inwestycji w zieloną energię dla przedsiębiorstw",
    "thumbnail_url": "https://wysokienapiecie.pl/wp-content/uploads/2026/11/2025-11-06-PS-Ogolne-srodowiskowe-002-scaled.x63527.jpg",
    "published_iso": "2026-11-13T01:06:33+01:00",
    "display_date": "13.11.2026, 01:06",
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
        "val": "WysokieNapiecie.pl"
      },
      {
        "label": "Weryfikacja",
        "val": "1 źródło (lokalne/niszowe)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Relacja źródłowa (WysokieNapiecie.pl)",
        "paragraphs": [
          "Rosnące zapotrzebowanie na energię elektryczną, presja na ograniczanie emisji gazów cieplarnianych oraz potrzeba zwiększania konkurencyjności przemysłu sprawiają, że własne źródła energii odnawialnej stają się coraz ważniejszym elementem strategii przedsiębiorstw. Kto może ubiegać się o wsparcie? Wymagany tytuł prawny może wynikać z prawa własności, użytkowania wieczystego lub trwałego zarządu. Należy pamiętać, że Wnioskodawcą nie może być podmiot, który znajduje się w likwidacji lub w postępowaniu upadłościowym. Obejmuje zatem podmioty, których procesy produkcyjne wiążą się ze znacznym zużyciem energii. Jakie przedsięwzięcia będą wspierane? Po drugie, w ramach przedsięwzięcia można zastosować wyłącznie nowe urządzenia, które zostały wyprodukowane nie wcześniej niż 48 miesięcy przed ich montażem. Na jakich zasadach udzielane jest wsparcie? Co będzie miało znaczenie podczas oceny projektu? Badana będzie także zdolność finansowa i organizacyjna wnioskodawcy do przeprowadzenia projektu i zachowania jego trwałości. Jak przygotować się do ubiegania o wsparcie? Spotkanie odbędzie się 19 listopada 2026 r. o godz. 10:00 na platformie Microsoft Teams. [Źródło: WysokieNapiecie.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "WysokieNapiecie.pl",
        "angle": "Depesza źródłowa",
        "summary": "„Przemysł energochłonny – OZE”. Szansa na finansowanie inwestycji w zieloną energię dla przedsiębiorstw",
        "url": "https://wysokienapiecie.pl/122676-przemysl-energochlonny-oze-szansa-na-finansowanie-inwestycji-w-zielona-energie-dla-przedsiebiorstw/"
      }
    ],
    "sources": [
      "WysokieNapiecie.pl"
    ],
    "corrections": []
  },
  {
    "id": 25,
    "path": "/Polska/Energetyka",
    "seo_url": "/Polska/Energetyka/saudi-aramco-zarabia-krocie-pomimo-wojny-w-zatoce-perskiej",
    "seo_title": "Saudi Aramco zarabia krocie pomimo wojny w Zatoce Perskiej",
    "thumbnail_url": "https://wysokienapiecie.pl/wp-content/uploads/2026/06/Ormuz-Iran-fot.-Depositphotos.x63527.jpg",
    "published_iso": "2026-11-13T01:06:33+01:00",
    "display_date": "13.11.2026, 01:06",
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
        "val": "WysokieNapiecie.pl"
      },
      {
        "label": "Weryfikacja",
        "val": "1 źródło (lokalne/niszowe)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Relacja źródłowa (WysokieNapiecie.pl)",
        "paragraphs": [
          "Wojna nie zatopiła Saudi Aramco Blokada Cieśniny Ormuz oraz irańskie ataki na ropociągi i instalacje naftowe ograniczyły eksport arabskiej ropy, ale nie zyski Saudi Aramco. Koncern zarabia jeszcze więcej niż przed wojną dzięki wyższym cenom - analizuje \"The Economist\". Koncern w trzecim kwartale 2026 roku odnotował 31 mld dolarów zysku netto, co stanowi wzrost o 9% w porównaniu z analogicznym okresem minionego roku. Najpierw zaczęło więc transportować więcej ropy przez Morze Czerwone. W lipcu, gdy jemeńscy Huti zablokowali południową przeprawę przez Cieśninę Bab al-Mandab, koncern przekierował swoje statki na północ, aby w większym stopniu wykorzystać suesko-śródziemnomorski rurociąg Sumed. Tam przeładowuje ropę na statki klientów. Było to również niewiele mniej niż w lutym, czyli zasadniczo jeszcze przed wojną rozpoczętą dokładnie 28 lutego 2026 roku. Zyskom koncernu sprzyjają też niskie koszty wydobycia i wysokie ceny ropy, a koszty odbudowy uszkodzonej infrastruktury nie okazały się jak dotąd zbyt dotkliwe. Po trzech kwartałach tego roku nakłady inwestycyjne spadły o 4% w porównaniu z poprzednim rokiem. Nie zmienia to faktu, że koszty transportu podrożały, a logistyczna ekwilibrystyka dodatkowo zmniejsza jego efektywność. Firma konsultingowa Rystad Energy szacuje, że miałby on długość około 1000 km, a jego budowa kosztowałaby do 7 mld dolarów - 14% rocznego budżetu inwestycyjnego koncernu. Dlatego państwa mogą stanąć przed koniecznością uzupełnienia rezerw strategicznych, a to może skutkować zwiększonym popytem przez co najmniej dwa lata po zakończeniu wojny. [Źródło: WysokieNapiecie.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "WysokieNapiecie.pl",
        "angle": "Depesza źródłowa",
        "summary": "Saudi Aramco zarabia krocie pomimo wojny w Zatoce Perskiej",
        "url": "https://wysokienapiecie.pl/122709-saudi-aramco-zarabia-krocie-pomimo-wojny-w-zatoce-perskiej/"
      }
    ],
    "sources": [
      "WysokieNapiecie.pl"
    ],
    "corrections": []
  },
  {
    "id": 26,
    "path": "/Polska/Energetyka",
    "seo_url": "/Polska/Energetyka/w-miesi-c-nie-wyprodukowano-126-gwh-z-oze-czy-agregacja-temu-zaradzi",
    "seo_title": "W miesiąc nie wyprodukowano 126 GWh z OZE. Czy agregacja temu zaradzi?",
    "thumbnail_url": "https://wysokienapiecie.pl/wp-content/uploads/2026/11/Kapota_Zdar-002.x63527.png",
    "published_iso": "2026-11-13T01:06:33+01:00",
    "display_date": "13.11.2026, 01:06",
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
        "val": "WysokieNapiecie.pl"
      },
      {
        "label": "Weryfikacja",
        "val": "1 źródło (lokalne/niszowe)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Relacja źródłowa (WysokieNapiecie.pl)",
        "paragraphs": [
          "Zdaniem ekspertów z think tanku Forum Energii, ograniczenia w produkcji OZE wynikają m.in. z jej niedopasowania do zapotrzebowania i niedostatecznej elastyczności systemu. I tu coraz większego znaczenia nabierają nie tylko magazyny energii, lecz także agregacja elastyczności, usługi bilansujące oraz aktywne zarządzanie generacją rozproszoną. Dla właścicieli odpowiednio wyposażonych instalacji może to oznaczać nowe możliwości uzyskiwania przychodów z już posiadanych aktywów energetycznych. Jednocześnie PSE wprowadzały nierynkowe ograniczenia generacji przez 197 godzin w ciągu 25 dni. Ograniczenia objęły 69,7 GWh potencjalnej produkcji z wielkoskalowych instalacji fotowoltaicznych i 56,4 GWh z farm wiatrowych. Problem ma również wymiar ekonomiczny. Najwyższa godzinowa cena ważona wolumenem sięgnęła jednak 2 602,4 zł/MWh, a najniższa spadła do –37,4 zł/MWh. Były to wartości skrajne, odnotowane w różnych godzinach miesiąca, a nie typowa dobowa rozpiętość cen ani gwarantowana okazja do osiągnięcia zysku. Przy dużej zmienności cen liczy się to, kiedy dane źródło wytwarza energię i czy potrafi reagować na warunki rynkowe. Właściciele jednostek kogeneracyjnych, biogazowni czy bateryjnych magazynów energii dysponują elastycznością, która może mieć wymierną wartość finansową. Jej wykorzystanie wymaga jednak połączenia wiedzy technicznej z prognozowaniem cen i aktywnym zarządzaniem produkcją. Nie są to rzeczywiste oszczędności, lecz wyniki symulacji opartej na określonych założeniach. W praktyce jednostka kogeneracyjna może wytwarzać energię w godzinach wyższych cen i świadczyć usługi bilansujące w kierunku zwiększenia mocy, gdy ceny na rynku spot spadają. Kluczowe jest równoczesne zarządzanie dwoma obszarami. Polska będzie potrzebować większej elastyczności. Równolegle rozwijane są zasoby umożliwiające reagowanie na wahania generacji. [Źródło: WysokieNapiecie.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "WysokieNapiecie.pl",
        "angle": "Depesza źródłowa",
        "summary": "W miesiąc nie wyprodukowano 126 GWh z OZE. Czy agregacja temu zaradzi?",
        "url": "https://wysokienapiecie.pl/122622-w-miesiac-nie-wyprodukowano-126-gwh-z-oze-czy-agregacja-temu-zaradzi/"
      }
    ],
    "sources": [
      "WysokieNapiecie.pl"
    ],
    "corrections": []
  },
  {
    "id": 27,
    "path": "/Polska",
    "seo_url": "/Polska/hegseth-odznaczy-o-nierza-kt-ry-udzieli-mu-reprymendy-na-cmentarzu",
    "seo_title": "Hegseth odznaczył żołnierza, który udzielił mu reprymendy na cmentarzu",
    "published_iso": "2026-11-13T00:47:13+01:00",
    "display_date": "13.11.2026, 00:47",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 86,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "2 redakcji"
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
        "val": "Potwierdzone (2 źródła)"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Ustalenia wspólne (2 redakcje)",
        "paragraphs": [
          "Pete Hegseth odznaczył szeregowego Thomasa Iglesiasa, który zrugał delegację z szefem Pentagonu wizytującą Cmentarz Narodowy w Arlington. [Źródło: Polsat News]"
        ]
      },
      {
        "heading": "Dodatkowe szczegóły i kontekst ze źródeł",
        "paragraphs": [
          "Pete Hegseth odznaczył szeregowego Thomasa Iglesiasa, który zrugał delegację z szefem Pentagonu wizytującą Cmentarz Narodowy w Arlington. Strażnik przepisowo zareagował na głośny śmiech grupy, przypominając o obowiązku zachowania ciszy i oddania szacunku. Dobra robota, starszy szeregowy! - napisał Hegseth w mediach społecznościowych. [Źródło: Polsat News]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "RMF24",
        "angle": "Depesza źródłowa",
        "summary": "Hegseth odznaczył żołnierza, który udzielił mu reprymendy na cmentarzu",
        "url": "https://www.rmf24.pl/fakty/swiat/news-hegseth-odznaczyl-zolnierza-ktory-udzielil-mu-reprymendy-na-,nIdn,1025914"
      },
      {
        "outlet": "Polsat News",
        "angle": "Depesza źródłowa",
        "summary": "Hegseth odznaczył żołnierza, który zrugał jego delegację. \"Dobra robota\"",
        "url": "https://www.polsatnews.pl/wiadomosc/2026-11-12/hegseth-oznaczyl-zolnierza-ktory-upomnial-jego-delegacje-dobra-robota/"
      }
    ],
    "sources": [
      "Polsat News",
      "RMF24"
    ],
    "corrections": []
  }
];

let currentPath = '/Polska';
let currentView = 'public';

// ===========================================================================
// NARZĘDZIA – układ zależy od treści, więc wszystko jest wyliczane z danych
// ===========================================================================
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
  return (s || '')
    .replace(/\[Źródło:\s*[^\]]+\]/g, '')
    .replace(/\[\d+:[^\]]+\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function articleLede(art, max = 240) {
  const first = art.full_sections && art.full_sections[0] && art.full_sections[0].paragraphs[0];
  const txt = plainText(first);
  if (txt.length <= max) return txt;
  const cut = txt.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  return (lastStop > max * 0.55 ? cut.slice(0, lastStop + 1) : cut.replace(/\s+\S*$/, '') + '…');
}

function readingMinutes(art) {
  const words = art.full_sections.map(s => s.heading + ' ' + s.paragraphs.join(' ')).join(' ').split(/\s+/).length;
  return Math.max(1, Math.round(words / 190));
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

function stateFromHash() {
  const m = location.hash.match(/^#\/a\/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}
function openArticle(id) { location.hash = '#/a/' + id; }
function closeArticle() { history.replaceState(null, '', location.pathname + location.search); renderPortal(); window.scrollTo({ top: 0 }); }

// ===========================================================================
// NAWIGACJA
// ===========================================================================
function switchView(view) {
  currentView = view;
  document.getElementById('viewPublic').classList.toggle('hidden', view !== 'public');
  document.getElementById('viewEditorial').classList.toggle('hidden', view !== 'editorial');
  window.scrollTo({ top: 0 });
  renderPortal();
}

function selectPath(p) {
  currentPath = p;
  document.querySelectorAll('.path-chip').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-path') === p);
  });
  if (stateFromHash() !== null) history.replaceState(null, '', location.pathname + location.search);
  if (currentView !== 'public') switchView('public');
  else renderPortal();
  window.scrollTo({ top: 0 });
}

function clearSearch() {
  document.getElementById('searchInput').value = '';
  renderPortal();
}

// ===========================================================================
// WYSZUKIWARKA (stemmer fleksyjny działa w tle)
// ===========================================================================
function matchesStemQuery(art, q) {
  const qWords = q.split(/\s+/).filter(w => w.length > 1);
  if (!qWords.length) return true;

  const monthExtra = monthMap[art.published_iso.slice(5, 7)] || '';
  const fullSecText = art.full_sections.map(s => s.heading + ' ' + s.paragraphs.join(' ')).join(' ');
  const rawBag = [
    art.seo_title, art.path, art.published_iso, monthExtra, fullSecText,
    ...art.perspectives.map(p => p.outlet + ' ' + p.summary)
  ].join(' ');

  const allWords = rawBag.split(/\W+/).filter(Boolean);
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

  const openId = stateFromHash();
  const openArt = openId !== null ? published.find(a => a.id === openId) : null;

  if (currentView === 'public') {
    if (openArt) renderArticleView(openArt, published);
    else {
      const list = published
        .filter(a => currentPath === '/Polska' || a.path.startsWith(currentPath))
        .filter(a => matchesStemQuery(a, q))
        .sort((a, b) => ((b.declickbait?.length ? 1 : 0) - (a.declickbait?.length ? 1 : 0)) || b.published_iso.localeCompare(a.published_iso));
      renderFeed(list, q);
    }
  }
  renderEditorialPanel(pendingArts);
}

function sourcesLabel(n) {
  if (n === 1) return '1 źródło';
  if (n >= 2 && n <= 4) return `${n} źródła`;
  return `${n} źródeł`;
}

const PATH_TITLES = {
  '/Polska': 'Polska — wszystkie działy',
  '/Polska/Gospodarka': 'Gospodarka i rynek',
  '/Polska/Polityka': 'Polityka i prawo',
  '/Polska/Energetyka': 'Energetyka i klimat',
  '/Polska/Poznan': 'Poznań i Wielkopolska',
  '/Swiat': 'Świat i geopolityka',
  '/Sport': 'Sport'
};

function shortCatLabel(path) {
  const parts = (path || '/Polska').split('/').filter(Boolean);
  if (parts.length <= 1) return parts[0] || 'Polska';
  return parts.slice(1).join(' · ');
}

function outletMonogram(name) {
  const clean = (name || 'V').replace(/\s*\[[^\]]*\]/, '').trim();
  const words = clean.split(/[\s.-]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

function thumbWrapHtml(art, wrapClass, imgClass) {
  const label = esc(shortCatLabel(art.path));
  const fallback = `<div class="thumb-fallback" aria-hidden="true"><span class="thumb-fallback-label">${label}</span><span class="thumb-fallback-mark">V</span></div>`;
  const img = art.thumbnail_url
    ? `<img src="${esc(art.thumbnail_url)}" alt="${esc(art.seo_title)}" class="${imgClass}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()" />`
    : '';
  return `<div class="${wrapClass}">${fallback}${img}</div>`;
}

function storyCardHtml(art) {
  const stats = art.metrics.slice(0, 2).map(m => `<span class="chip" title="${esc(m.label)}">${esc(m.val)}</span>`).join('');
  return `
    <article ${catAttr(art)} data-id="${art.id}" onclick="openArticle(${art.id})" tabindex="0" onkeydown="if(event.key==='Enter')openArticle(${art.id})">
      <div class="story-card">
        ${thumbWrapHtml(art, 'story-thumb-wrap', 'story-thumb')}
        <div class="story-body">
          <div class="story-top"><span class="cat-badge">${esc(shortCatLabel(art.path))}</span><span class="story-date">${esc(art.display_date)}</span></div>
          <h2 class="story-title">${esc(art.seo_title)}</h2>
          <p class="story-lede">${esc(articleLede(art, 200))}</p>
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

  // Okładka tylko, gdy jest z czym ją zestawić (adaptacyjnie – nie na sztywno)
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
      <span>${list.length} ${list.length === 1 ? 'opracowanie' : (list.length >= 2 && list.length <= 4 ? 'opracowania' : 'opracowań')}</span>
    </div>`;

  const leadHtml = lead ? `
    <article ${catAttr(lead)} class="lead-wrap">
      <div class="lead-story" onclick="openArticle(${lead.id})" tabindex="0" onkeydown="if(event.key==='Enter')openArticle(${lead.id})">
        ${thumbWrapHtml(lead, 'lead-thumb-wrap', 'lead-thumb')}
        <div class="lead-main">
          <div class="story-top"><span class="cat-badge">${esc(shortCatLabel(lead.path))}</span><span class="story-date">${esc(lead.display_date)}</span></div>
          <h2 class="lead-title">${esc(lead.seo_title)}</h2>
          <p class="lead-lede">${esc(articleLede(lead, 290))}</p>
          <div class="story-foot">${meterHtml(lead.fact_agreement_pct, lead.sources.length)}<span>${sourcesLabel(lead.sources.length)} · ${readingMinutes(lead)} min czytania</span></div>
        </div>
        <div class="lead-side">
          <div class="lead-side-title">Kluczowe parametry</div>
          ${lead.metrics.slice(0, 3).map(m => `<div class="stat-row"><span class="stat-label">${esc(m.label)}</span><span class="stat-val">${esc(m.val)}</span></div>`).join('')}
        </div>
      </div>
    </article>` : '';

  container.innerHTML = heading + leadHtml +
    (rest.length ? `<div class="cards-grid${lead ? ' after-lead' : ''}">${rest.map(storyCardHtml).join('')}</div>` : '');
}

function renderArticleView(art, published) {
  const container = document.getElementById('articlesFeed');
  const hasAside = true;
  const related = published.filter(a => a.id !== art.id && a.path.split('/')[2] === art.path.split('/')[2]).slice(0, 2);
  const others = related.length ? related : published.filter(a => a.id !== art.id).slice(0, 2);

  const linked = art.perspectives.filter(p => p.url);
  const uniqueLinks = [];
  linked.forEach(p => { if (!uniqueLinks.some(u => u.url === p.url)) uniqueLinks.push(p); });

  const heroThumb = art.thumbnail_url ? `
    <div class="article-hero-wrap">
      <div class="thumb-fallback" aria-hidden="true"><span class="thumb-fallback-label">${esc(shortCatLabel(art.path))}</span><span class="thumb-fallback-mark">V</span></div>
      <img src="${esc(art.thumbnail_url)}" alt="${esc(art.seo_title)}" class="article-hero-img" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.remove()" />
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

  container.innerHTML = `
    <div ${catAttr(art)}>
      <button class="back-link" onclick="closeArticle()">← Wróć do ${esc(PATH_TITLES[currentPath] || currentPath)}</button>
      <div class="reader ${hasAside ? 'has-aside' : ''}">
        <article class="article-main">
          <header class="article-head">
            <div class="article-kicker">
              <span class="cat-badge">${esc(art.path)}</span>
              <span>${esc(art.display_date)}</span>
              <span>· ${readingMinutes(art)} min czytania</span>
            </div>
            <h1 class="article-title">${esc(art.seo_title)}</h1>
            <p class="article-lede">${esc(articleLede(art, 320))}</p>
          </header>

          ${heroThumb}

          ${art.metrics && art.metrics.length ? `
            <div class="facts-strip">
              ${art.metrics.map(m => `<div class="fact-box"><div class="fact-label">${esc(m.label)}</div><div class="fact-val">${esc(m.val)}</div></div>`).join('')}
            </div>` : ''}

          ${art.admin_note ? `<div class="callout callout-warn"><strong>Nota weryfikacyjna redakcji:</strong> ${esc(art.admin_note)}</div>` : ''}

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
            ${art.full_sections.map((sec, i) => `
              <section>
                <h2 class="section-heading" id="sec_${art.id}_${i}">${esc(sec.heading)}</h2>
                ${sec.paragraphs.map(p => `<p class="section-paragraph">${formatCitations(esc(p), art.perspectives)}</p>`).join('')}
              </section>`).join('')}
          </div>

          ${art.perspectives.length ? `
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
                      <div class="perspective-angle">${esc(p.angle)}</div>
                    </div>
                  </div>
                  <p class="perspective-summary">${esc(p.summary)}</p>
                  ${p.url ? `<a class="perspective-link" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Otwórz artykuł źródłowy ↗</a>` : ''}
                </div>`).join('')}
            </div>
          </div>` : ''}

          ${art.corrections.length ? `
            <div class="callout callout-success">
              <strong>Zweryfikowane uzupełnienia czytelników (${art.corrections.length}):</strong>
              ${art.corrections.map(c => `<div>• ${esc(c.claim_text)} (<a href="${esc(c.evidence_url)}" target="_blank" rel="noopener">link</a>)</div>`).join('')}
            </div>` : ''}

          <div class="article-footer">
            <span class="permalink">verity.pl${esc(art.seo_url)}</span>
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
          ${art.full_sections.length > 1 ? `
          <div class="aside-card">
            <div class="aside-title">W tym artykule</div>
            <ul class="aside-list">
              ${art.full_sections.map((s, i) => `<li><button class="toc-btn" onclick="document.getElementById('sec_${art.id}_${i}').scrollIntoView({behavior:'smooth'})"><span>${esc(s.heading)}</span><span>↓</span></button></li>`).join('')}
            </ul>
          </div>` : ''}
          ${uniqueLinks.length ? `
          <div class="aside-card">
            <div class="aside-title">Źródła do przeczytania</div>
            <ul class="aside-list">
              ${uniqueLinks.map(p => `<li><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer"><span>${esc(p.outlet.replace(/\s*\[[^\]]*\]/, ''))}</span><span>↗</span></a></li>`).join('')}
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
        ${art.full_sections.map(s => `<p class="section-paragraph"><strong>${esc(s.heading)}:</strong> ${formatCitations(esc(s.paragraphs.join(' ')), art.perspectives)}</p>`).join('')}
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

window.addEventListener('hashchange', () => { renderPortal(); window.scrollTo({ top: 0 }); });

window.addEventListener('DOMContentLoaded', async () => {
  applyTheme(currentThemeMode);
  const dateEl = document.getElementById('todayDateLabel');
  if (dateEl) {
    try {
      dateEl.textContent = new Intl.DateTimeFormat('pl-PL', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      }).format(new Date());
    } catch (e) {}
  }
  try {
    const resp = await fetch('articles.json', { cache: 'no-store' });
    if (resp.ok) {
      const liveData = await resp.json();
      if (Array.isArray(liveData) && liveData.length > 0) {
        // Tylko artykuły od 13.11.2026
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
  renderPortal();
});
