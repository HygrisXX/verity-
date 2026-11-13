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

function formatCitations(text) {
  return text.replace(/\[(\d+:[^\]]+)\]/g, '<span class="cite-tag">[$1]</span>');
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
    "path": "/Polska",
    "seo_url": "/Polska/prokuratura-chce-przesluchac-nawrockiego-pismo-do-kancelarii-prezydenta",
    "seo_title": "Prokuratura chce przesłuchać Nawrockiego. Pismo do kancelarii prezydenta",
    "thumbnail_url": "https://rmf.rmffm.pl/news/attachments/b4/70/prezydent-karol-na-636x421-b470a47c.jpg",
    "published_iso": "2026-11-13T01:35:54+01:00",
    "display_date": "13.11.2026, 01:35",
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
        "val": "/Polska"
      },
      {
        "label": "Główne źródło",
        "val": "RMF24"
      },
      {
        "label": "Weryfikacja",
        "val": "Fakty / RSS"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Relacja źródłowa: RMF24",
        "paragraphs": [
          "Prokuratura chce przesłuchać Nawrockiego. Pismo do kancelarii prezydenta [Źródło: RMF24]"
        ]
      },
      {
        "heading": "Relacja źródłowa: Niezależna.pl",
        "paragraphs": [
          "Prokuratura chce przesłuchać prezydenta Karola Nawrockiego w charakterze świadka w sprawie kawalerki Jerzego Ż. – poinformował Onet. Portal ponownie przywołuje przy tym wypowiedzi Anny Kanigowskiej, dawnej opiekunki seniora. Nie wspomina jednak, że kobieta została prawomocnie skazana za oszustwo na trzy lata pozbawienia wolności i w lipcu trafiła do aresztu śledczego. Jej kryminalną przeszłość, w tym wcześniejsze wyroki za oszustwa i przestępstwa związane z dokumentami, ujawniły Niezalezna.pl i Telewizja Republika. [Źródło: Niezależna.pl]"
        ]
      },
      {
        "heading": "Relacja źródłowa: TVN24",
        "paragraphs": [
          "Gdańska prokuratura zamierza przesłuchać prezydenta Karola Nawrockiego w sprawie przejęcia przez niego mieszkania od Jerzego Ż. Do prezydenckiej kancelarii wpłynęło pismo w tej sprawie. Głowa państwa ma złożyć zeznania w charakterze świadka. [Źródło: TVN24]"
        ]
      },
      {
        "heading": "Relacja źródłowa: Radio Gdańsk",
        "paragraphs": [
          "Prokuratura chce przesłuchać Karola Nawrockiego w sprawie mieszkania Jerzego Ż. Śledczy z Gdańska uznali, że prezydent powinien wystąpić w charakterze świadka. Tymczasem w Warszawie wyznaczono termin pierwszej rozprawy w procesie karnym, który Nawrocki wytoczył dziennikarzom Onetu [Źródło: Radio Gdańsk]"
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
    "id": 2,
    "path": "/Swiat",
    "seo_url": "/Swiat/duza-awaria-uslug-microsoft-uzytkownicy-maja-problemy-z-dostepem-do-e-mail",
    "seo_title": "Duża awaria usług Microsoft. Użytkownicy mają problemy z dostępem do e-mail",
    "thumbnail_url": "https://i.gremicdn.pl/image/free/2da38a1aca65b05d9e4e6cab2cfbfa4d/?t=crop:4000:1749:nowe:0:310.1724137931,resize:fill:600:300,enlarge:1",
    "published_iso": "2026-11-13T01:35:54+01:00",
    "display_date": "13.11.2026, 01:35",
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
        "val": "Rzeczpospolita"
      },
      {
        "label": "Weryfikacja",
        "val": "Fakty / RSS"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Relacja źródłowa: Rzeczpospolita",
        "paragraphs": [
          "W czwartek doszło do rozległej awarii usług Microsoftu, w tym poczty Outlook. Wielu użytkowników ma problemy z dostępem do swoich kont e-mail, a także napotyka błędy podczas korzystania z innych aplikacji. Awaria dotyczy także usług w Polsce. [Źródło: Rzeczpospolita]"
        ]
      },
      {
        "heading": "Relacja źródłowa: RMF24",
        "paragraphs": [
          "Problemy z Microsoft 365. Nie działa wiele usług [Źródło: RMF24]"
        ]
      },
      {
        "heading": "Relacja źródłowa: Onet Wiadomości",
        "paragraphs": [
          "Użytkownicy mogą nie być w stanie połączyć się z wieloma usługami Microsoft 365 — poinformowała w czwartek wieczorem firma. Chodzi m.in. o działanie aplikacji takich jak Microsoft Teams, SharePoint Online czy Microsoft Copilot 365. Firma pracuje nad przywróceniem pełnej funkcjonalności. [Źródło: Onet Wiadomości]"
        ]
      },
      {
        "heading": "Relacja źródłowa: WP Wiadomości",
        "paragraphs": [
          "W czwartek użytkownicy zgłaszali problemy z działaniem Outlooka, Microsoft 365 i Teams. Jak podał serwis Downdetector.com, liczba raportów dotyczących samego Outlooka przekroczyła 97 tys. Microsoft poinformował o działaniach mających przywrócić prawidłowe funkcjonowanie usług. [Źródło: WP Wiadomości]"
        ]
      }
    ],
    "perspectives": [
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
      "RMF24",
      "Rzeczpospolita",
      "WP Wiadomości"
    ],
    "corrections": []
  },
  {
    "id": 3,
    "path": "/Sport",
    "seo_url": "/Sport/lekarz-przy-kostiuk-zaraz-przy-gauff-dramat-w-wta-finals-powrot-z-1-5",
    "seo_title": "Lekarz przy Kostiuk, zaraz przy Gauff. Dramat w WTA Finals. Powrót z 1:5",
    "thumbnail_url": "https://i.iplsc.com/-/000NIXWZN3EU0JMK-C321.webp",
    "published_iso": "2026-11-13T01:35:54+01:00",
    "display_date": "13.11.2026, 01:35",
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
        "val": "Fakty / RSS"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Relacja źródłowa: Interia Sport",
        "paragraphs": [
          "Linda Noskova już po dwóch spotkaniach WTA Finals była pewna swojego awansu z grupy A, o powrocie do domu mogła myśleć Marta Kostiuk, podopieczna Sandry Zaniewskiej. A niewiadomą było to, która z Amerykanek do niej dołączy: Coco Gauff czy Jessica Pegula. Ta pierwsza zaczęła czwartkową sesję od starcia z Kostiuk, sama wygrana, nawet 2:0, mogła nie wystarczyć. Gauff wygrała seta 6:4, Ukrainka miała kłopot z nadgarstkiem. A później to Amerykanka mierzyła się z bólem pleców, broniła trzech setboli przy stanie 1:5. I... wygrała sześć kolejnych gemów. Kto więc zagra w półfinale? [Źródło: Interia Sport]"
        ]
      },
      {
        "heading": "Relacja źródłowa: Przegląd Sportowy",
        "paragraphs": [
          "Nieprawdopodobne sceny w WTA Finals! W drugim secie Coco Gauff była już kompletnie rozbita, a mimo to we wspaniałym stylu odwróciła losy partii i pokonała Martę Kostiuk 6:4, 7:5. To zaś ma poważne konsekwencje, jeśli chodzi o walkę o awans do dalszej fazy turnieju. [Źródło: Przegląd Sportowy]"
        ]
      },
      {
        "heading": "Relacja źródłowa: Sport.pl",
        "paragraphs": [
          "Coco Gauff przegrywała aż 1:5 w drugim secie meczu fazy grupowej WTA Finals z Martą Kostiuk. Amerykanka pokazała jednak wielki charakter, odrobiła straty i wygrała 6:4, 7:5. Teraz musi liczyć na porażkę Peguli z Noskovą, by awansować do półfinału imprezy. [Źródło: Sport.pl]"
        ]
      },
      {
        "heading": "Relacja źródłowa: WP SportoweFakty",
        "paragraphs": [
          "Coco Gauff wygrała dwa mecze, ale nie wystąpi w półfinale WTA Finals. To efekt tego, że Jessica Pegula w kluczowym spotkaniu pokonała Lindę Noskovą po trzysetowym boju. Choć przegrała z rodaczką na otwarcie, to zdobyła więcej setów. [Źródło: WP SportoweFakty]"
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
    "id": 4,
    "path": "/Polska/Polityka",
    "seo_url": "/Polska/Polityka/zelenski-spotkal-sie-w-dublinie-z-przywodcami-13-panstw-w-tym-polski",
    "seo_title": "Zełenski spotkał się w Dublinie z przywódcami 13 państw, w tym Polski",
    "thumbnail_url": "https://cdn.defence24.pl/2022/03/22/320x180px/AzhVIhTUTyIVhzXhllVTRoP9wmrpPUR7SOuPZTrL.yz7a.jpg",
    "published_iso": "2026-11-13T01:35:54+01:00",
    "display_date": "13.11.2026, 01:35",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 93,
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
        "val": "Fakty / RSS"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Relacja źródłowa: Defence24",
        "paragraphs": [
          "Ukraiński prezydent Wołodymyr Zełenski spotkał się w czwartek w Dublinie z przywódcami 13 państw, które określił jako przyjaciół Ukrainy i jej największych partnerów; wśród uczestników był premier Donald Tusk. Według Zełenskiego rozmowa dotyczyła wsparcia Ukrainy w obliczu nieustających rosyjskich ataków. [Źródło: Defence24]"
        ]
      },
      {
        "heading": "Relacja źródłowa: TVN24",
        "paragraphs": [
          "Prezydent Wołodymyr Zełenski poinformował w czwartek, że spotkał się w Dublinie z premierem Polski Donaldem Tuskiem. Rozmawiali między innymi o wsparciu Polski w przygotowaniach do zimy, a także o rozszerzeniu połączeń na potrzeby dostaw paliwa na Ukrainę. [Źródło: TVN24]"
        ]
      },
      {
        "heading": "Relacja źródłowa: Onet Wiadomości",
        "paragraphs": [
          "Wołodymyr Zełenski spotkał się w Irlandii z wysłannikami Donalda Trumpa: Steve'em Witkoffem i Jaredem Kushnerem. Celem jest wypracowanie porozumienia pokojowego między Rosją a Ukrainą. [Źródło: Onet Wiadomości]"
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
    "id": 5,
    "path": "/Polska/Energetyka",
    "seo_url": "/Polska/Energetyka/sprawa-elektrowni-ostro-ka-to-symbol-chorych-uk-ad-w-w-pa-stwowych-firmach",
    "seo_title": "Sprawa Elektrowni Ostrołęka to symbol chorych układów w państwowych firmach",
    "thumbnail_url": "https://wysokienapiecie.pl/wp-content/uploads/2018/12/polityk_rynek.x63527.jpg",
    "published_iso": "2026-11-13T01:06:33+01:00",
    "display_date": "13.11.2026, 01:06",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 81,
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
        "val": "Fakty / RSS"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Relacja źródłowa: WysokieNapiecie.pl",
        "paragraphs": [
          "Dwa lata potrzebowała prokuratura do postawienia 6 listopada 2026 r. zarzutów 25 osobom odpowiedzialnym za nieszczęsną budowę elektrowni węglowej w Ostrołęce. Przypomnijmy garść faktów. Pojawia się i znika Historia Ostrołęki C rozpoczęła się jeszcze za rządów pierwszej koalicji PO-PSL. Energa planowała budowę nowego bloku węglowego o mocy 1000 MW, który miał zastąpić część starzejących się elektrowni. W 2009 r. powstała spółka celowa, a w 2011 r. ogłoszono przetarg na wykonawcę inwestycji. Jednak już we wrześniu 2012 r. zarząd Energi zdecydował o zamrożeniu projektu. Powodem były trudności z pozyskaniem finansowania, pogorszenie warunków rynkowych i wątpliwości co do opłacalności inwestycji. Do 2015 r. budowy nie wznowiono, choć spółka nadal poszukiwała potencjalnego inwestora. Sytuacja zmieniła się po dojściu PiS do władzy. Budowa elektrowni stała się jednym z priorytetów ministra energii Krzysztofa Tchórzewskiego, który podkreślał jej znaczenie dla bezpieczeństwa energetycznego i utrzymania zapotrzebowania na polski węgiel. W maju 2016 r. zarząd Energi uchylił decyzję o wstrzymaniu inwestycji. W grudniu tego samego roku Energa zawarła umowę o wspólnej realizacji projektu z Eneą, która następnie objęła połowę udziałów w spółce Elektrownia Ostrołęka. W kwietniu 2018 r. wybrano generalnego wykonawcę – konsorcjum GE Power i Alstom, które zaoferowało budowę bloku za nieco ponad 6 mld zł brutto. Kontrakt podpisano 12 lipca 2018 r. W październiku, na kilka dni przed wyborami samorządowymi, zorganizowano uroczystość rozpoczęcia inwestycji. Kluczowe decyzje zapadły jednak dopiero w grudniu 2018 r . Elektrownia Ostrołęka uzyskała kontrakt na rynku mocy, a 28 grudnia podjęto decyzję o wydaniu generalnemu wykonawcy polecenia rozpoczęcia prac (NTP). Nastąpiło to mimo braku zapewnionego finansowania całej inwestycji. Energa i Enea deklarowały zaangażowanie po około miliard złotych, ale nie udało się doprowadzić do zamknięcia finansowania bankowego ani pozyskać wszystkich planowanych inwestorów. W 2019 r. trwały kolejne próby znalezienia pieniędzy. Rozważano między innymi udział PGE. Minister Tchórzewski naciskał na kontynuowanie projektu. W ujawnionym przez Onet w 2022 r. &nbsp;piśmie z 26 kwietnia 2019 r. do organów Energi i Enei zarzucał zarządom niechętny stosunek do inwestycji i sygnalizował, że jako przedstawiciel akcjonariusza będzie rozliczał ich działania. Cztery dni później obie spółki zawarły kolejne porozumienie dotyczące finansowania budowy. Jednak cały czas nie mogły zdobyć finansowania – banki nie chciały dać kredytów na elektrownię, w której rentowność nie wierzyły. Pomimo to zapadła decyzja o rozpoczęciu budowy. Po wyborach w 2019 zmieniła się konfiguracja rządowa – Tchórzewski stracił tekę ministra energii, a stery nad energetyką przejął Jacek Sasin. &nbsp;&nbsp;Energa i Enea zawiesiły finansowanie inwestycji, wskazując na zmianę warunków rynkowych i regulacyjnych. W czerwcu podjęto decyzję o odejściu od projektu węglowego na rzecz elektrowni gazowej. Wkrótce Enea wycofała się z dalszego udziału w przedsięwzięciu, a główną rolę przejął Orlen kierowany przez Daniela Obajtka, który wcześniej kupił Energę. W marcu 2021 r. rozpoczęła się rozbiórka części konstrukcji niedokończonego bloku węglowego. Najwyższa Izba Kontroli w 2020 i 2021 r. stwierdziła liczne nieprawidłowości, w tym podejmowanie decyzji bez zapewnienia finansowania oraz nierzetelne przedstawianie organom spółek informacji dotyczących sytuacji projektu. Według NIK działania i zaniechania kontrolowanych podmiotów doprowadziły do bezpowrotnej utraty ponad 1,3 mld zł. Łącznie projekt niedokończonego bloku węglowego pochłonął ponad 1,5 mld zł. Jak czytać intencje ministra Mechanizm podejmowania decyzji jest mniej więcej znany. Minister energii Krzysztof Tchórzewski chciał tej inwestycji, wierzył, że jest potrzebna. Na pewno rolę odgrywał też fakt, że Ostrołęka to jego okręg wyborczy, a budowa oznaczała kilka lat boomu inwestycyjnego w regionie. Argumenty o nierentowności nie przekonały ministra. Ponieważ sama Energa nie była w stanie udźwignąć budowy, doproszono jeszcze poznańską Eneę. Protokół przesłuchania ministra przez NIK nie został opublikowany. Z dostępnych fragmentów wiadomo, że powiedział kontrolerom, że ministerstwu zależało na tym, aby dać zbyt na polski węgiel, a jednocześnie zapewnić bezpieczeństwo energetyczne, a uzyskanie finansowania na tę inwestycję nie było problemem. Ponadto zeznał, że z punktu widzenia państwa zysk nie był najważniejszy. Chodziło o to, żeby projekty realizowane z punktu widzenia bezpieczeństwa państwa zamykały się na poziomie rentowności powyżej 0%. Sęk w tym, że już wtedy było wiadomo, że ta inwestycja może nie osiągnąć „poziomu powyżej 0%”. Czytaj więcej: Nowa Ostrołęka – elektrownia, która się słupkom nie kłania Zarządy zwlekają i marudzą Kolejni prezesów Energi zmieniano jak rękawiczki, tylko w latach prześwietlonych przez NIK czyli 2018 -2019 było ich aż trójka: Barbara Klimiuk, Grzegorz Ksepko i Jacek Goliński. W Enei prezes był jeden, Mirosław Kowalik, doświadczony menedżer, przed objęciem sterów Enei długoletni szef polskiej spółki Alstomu. Gdyby ci ludzie mieli swobodę podejmowania decyzji, zapewne nigdy nie wpadliby na pomysł realizacji takiego projektu. Każdy menedżer może się pomylić, ludzie decydujący o miliardowych inwestycjach nie mają szklanej kuli. Ale trzeba odróżnić „uczciwą” pomyłkę, która wynika z błędnej oceny, od sytuacji w której ktoś wie, że popełnia błąd, ale nie umie postąpić inaczej, bo boi się polityków. Dziś Mirosław Kowalik jest szefem polskiej spółki Westinghouse, czyli amerykańskiej firmy, która ma wyprodukować reaktor dla polskiej elektrowni. Dlaczego uznał, że lepiej zostać w Enei i mieć plamę na menedżerskiej reputacji niż honorowo podać się do dymisji? Wbicie symbolicznej pierwszej łopaty pod budowę Ostrołęki w 2018 r. Wszyscy obecni dumnie prezentują swoje narzędzia z pamiątkowym grawerem, tylko prezes Enei Mirosław Kowalik trzyma łopatę odwrotnie. Przypadkowo, podświadomie czy intencjonalnie - tego pewnie sam już nie pamięta Polską Grupę Energetyczną również próbowano ubrać w tę inwestycję, ale skutecznie się wykręciła. Być może wynikało to z mocniejszej pozycji politycznej ówczesnego szefa spółki Henryka Baranowskiego. &nbsp; Jeśli dojdzie do procesu sądowego, to być może poznamy kulisy podejmowania decyzji i mechanizmy nacisku. Sam Krzysztof Tchórzewski powiedział kontrolerom NIK, że nie kazał budować elektrowni, ale \" wola budowy była sygnalizowana na zgromadzeniach akcjonariuszy\". W 2022 r. Onet ujawnił list Tchórzewskiego z 2019 r. do zarządów Enei i Energi, w którym ostrzega iż „ zauważa niechętny stosunek obu zarządów do tej inwestycji i jako akcjonariusz większościowy bacznie obserwuje działania zarządów i rozliczenie tego zadania\". Rzeczywiście można odnieść wrażenie, że zarządy – zwłaszcza Enei - robiły wszystko żeby przeciągać moment podjęcia decyzji. Zamawiano dodatkowe analizy, wymyślano piętrowe konstrukcje inżynierii finansowej, które jednak nie chciały się złożyć bo banki nie wierzyły w optymistyczne prognozy. W 2019 r. przyszła jednak chwila, w której, jak to pięknie napisał Andrzej Sapkowski, „ trzeba albo srać, albo oswobodzić wychodek ”. Podjęto więc decyzję o budowie Ostrołęki bez zapewnionego finansowania. Finał znamy. Ostrołęka to czubek góry lodowej Takich inwestycji było w energetyce III RP dużo więcej. W latach 2016-2018 PGE, Energa, Enea i PGNiG zostały zmuszone do wsadzenia (trudno tu mówić o zainwestowaniu) 2,3 mld zł w akcje Polskiej Grupy Górniczej. Akcje te po kilku latach skarb państwa kupił za złotówkę. Odpowiedzialności nikt nie poniósł, choć zarządy miały świadomość, że kupują spółkę bez wartości. W 2015 r. rząd Ewy Kopacz z PO zmusił giełdowy Tauron, aby kupił za ponad 130 mln zł nierentowną kopalnię Brzeszcze, do której potem dołożył jeszcze 450 mln zł. Cały ówczesny zarząd Taurona nie chciał wziąć odpowiedzialności za tę decyzję, odwołano go więc i mianowano posłusznych. Skarb państwa po kilku latach odkupił od Taurona tę i inne kopalnie za złotówkę. Krzysztof Kilian, prezes zarządu PGE w 2013 r. nie chciał budować nowych bloków węglowych w elektrowni Opole, bo uważał, że będą to źle wydane pieniądze. Kilian był dawnym kolegą ówczesnego i dzisiejszego premiera Donalda Tuska, ale tu mu nie pomogło. Został odwołany, a nowy zarząd przystąpił do budowy Opola. Szefowie Enei i Energi nie znaleźli w sobie siły, aby powiedzieć ministrowi „nie”. Prezesi z zarzutami, mechanizmy zostały Sprawa Ostrołęki była zbyt głośna, aby zamieść ją pod dywan, zwłaszcza, że doniesienie do prokuratury złożył NIK. Oskarżeni spędzą teraz wiele lat włócząc się po sądach, bo polski wymiar sprawiedliwości nie słynie z szybkości. Wyrok trudno przewidzieć. Ale na ławie oskarżonych powinien przede wszystkim znaleźć się polski system nadzoru właścicielskiego, który bardziej przypomina klientelistyczne układy Rzeczypospolitej czasów Radziwiłłów i Potockich niż nowoczesny nadzór korporacyjny. Każdy szanujący się polski polityk uważa wpływy personalne w spółkach skarbu państwa za ważny element budowania swojej pozycji. Nie chodzi tylko o wymianę kadr po wyborach, choć to też jest beznadziejne. Nawet w łonie jednej partii instalowanie \"swoich\" i pozbywanie się tych z konkurencyjnej frakcji to chleb powszedni. Zakulisowe intrygi, donosy, celowo roznoszone plotki - wszystko to sprawia, że menedżerowie często więcej czasu spędzają na pilnowaniu stołka niż na realnym zarządzaniu. Opinia publiczna może tylko czasem obserwować ten spektakl. Kilka lat temu związkowcy z „Solidarności” Jastrzębskiej Spółki Węglowej urządzili „kocią muzykę” pod domem posłanki Izabeli Kloc z PiS, żądając aby przestała nasyłać swoich ludzi na tłuste posady w bogatej wtedy jeszcze spółce. A przecież takich posłów i posłanek jest bardzo wiele… Prawo sobie, politycy sobie Menedżerowie największych państwowych spółek bywają różni, bardziej lub mniej fachowi. Ale łączy ich jedno – wszyscy są uwikłani w układ polityczny, który ich mianował. To odróżnia polskie spółki państwowe od skandynawskich czy nawet włoskich, w których szefowie trwają wiele kadencji i mogą w spokoju pracować. W Anglii Henryka VIII funkcjonowało powiedzonko „niełaska władcy oznacza śmierć”. Dziś rządzący są milsi, menedżerowie nie chcący wykonywać poleceń płacą tylko dymisją. Czytaj też: Czy spółki skarbu państwa mogą być zbawione od polityków? Swoje credo dotyczące relacji polityków z prezesami państwowych spółek energetycznych wygłosił w zeszłym roku premier Donald Tusk. &nbsp; \" Pierwszym zadaniem państwowego menedżera, nawet jeśli stoi na czele giełdowej spółki, np. w przypadku spółki energetycznej jest zapewnianie bezpieczeństwa energetycznego państwu polskiemu, zapewnienie możliwie taniej, powszechnej energii polskim rodzinom, gospodarstwom domowym i przedsiębiorcom, a niekoniecznie maksymalizacja zysków spółki Skarbu Państwa. Gdyby to tylko maksymalizacja zysku Skarbu Państwa miała sens, to właściwie po co państwo w takiej spółce \". Czytaj też: Po co spółkom energetycznym potrzebna jest giełda? Zapewne obrońcy oskarżonych w procesie o Ostrołękę C nie omieszkają wykorzystać tej wypowiedzi obecnego premiera. Przecież Krzysztof Tchórzewski też uzasadniał budowę tej elektrowni „bezpieczeństwem energetycznym”. Tymczasem żaden przepis prawa – ani kodeks spółek handlowych ani ustawa o zarządzaniu mieniem państwowym – nie daje politykom prawa do wyznaczania jakiegoś dopuszczalnego poziomu „maksymalizacji zysków”, zwłaszcza w spółkach giełdowych, w których skarb państwa jest tylko jednym z akcjonariuszy. Kilka lat temu do statutu ówczesnego PGNiG (dziś Orlenu) wprowadzono zapis o „ inwestycjach mogących trwale lub przejściowo pogorszyć efektywność ekonomiczną działalności Spółki, ale koniecznych do realizacji zadania dla zapewnienia bezpieczeństwa energetycznego” . Żadna ustawa nie rozstrzyga przy tym jakie to mają być inwestycje, więc można sobie spokojnie wyobrazić, że jutro jakiś minister każe wybudować rurę bądź linię energetyczną na swoją działkę „pośrodku niczego”, bo oczywiście jest to niezbędne dla bezpieczeństwa energetycznego. Jeśli prezes spółki będzie miał odwagę, to odmówi. A jeśli nie? Wydaje się, że finanse spółek giełdowych powinny mieć lepsze zabezpieczenie niż obecność przysłowiowych męskich organów płciowych u członków zarządów. Skoro politycy chcą decydować, to niech decydują. Zgodnie z prawem Uregulowanie takich spraw jest stosunkowo proste. Jeśli państwo tj. reprezentujący je politycy oczekują od jakiejś spółki niezbędnych dla państwa inwestycji, a zarząd spółki uważa, że inwestycje te przyniosą jej straty, to politycy powinni wskazać źródło ewentualnego pokrycia tych strat. Może to być budżet państwa, może być jakaś państwowa instytucja finansowa – BGK, NFOŚiGW, czy PFR. Jest to banalne rozwiązanie, które można wpisać do ustawy o zarządzaniu mieniem państwowym. Decyzję powinni podejmować politycy bo to im - a nie menedżerom - na niej zależy. W 2021 r. szef Polskiego Funduszu Rozwoju Paweł Borys uznał, że nie weźmie odpowiedzialności za miliardową pożyczkę dla plajtującej Polskiej Grupy Górniczej, bo spółka nigdy jej nie zwróci i zażądał uchwały Rady Ministrów w tej sprawie. Rząd uchwałę przyjął, PFR pieniądze wypłacił, PGG oczywiście ich nie oddała i nie odda, ale odpowiedzialność wzięli politycy. Nota bene nikt się ich nie czepiał. To uczciwsze niż zakulisowe naciski i oczekiwania, jak w Ostrołęce. &nbsp; Przydałoby się też powołanie specjalnej prokuratury przy NIK (oraz Komisji Nadzoru Finansowego), aby prokuratorzy nie dublowali działań NIK, tak jak to było w przypadku Ostrołęki. Problem w tym, że nikt – ani politycy, ani mianowani przez nich menedżerowie – nie jest zainteresowany w likwidacji układu, w którym politycy mianują menedżerów i &nbsp;w razie potrzeby ich bronią przed innymi politykami, a menedżerowie &nbsp;odwdzięczają się przysługami i posłuszeństwem. A że czasem to posłuszeństwo prowadzi na ławę oskarżonych… Cóż, ryzyko zawodowe. [Źródło: WysokieNapiecie.pl]"
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
    "id": 6,
    "path": "/Polska/Energetyka",
    "seo_url": "/Polska/Energetyka/przemys-energoch-onny-oze-szansa-na-finansowanie-inwestycji-w-zielon-energi",
    "seo_title": "„Przemysł energochłonny – OZE”. Szansa na finansowanie inwestycji w zieloną energię dla przedsiębiorstw",
    "thumbnail_url": "https://wysokienapiecie.pl/wp-content/uploads/2026/11/2025-11-06-PS-Ogolne-srodowiskowe-002-scaled.x63527.jpg",
    "published_iso": "2026-11-13T01:06:33+01:00",
    "display_date": "13.11.2026, 01:06",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 81,
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
        "val": "Fakty / RSS"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Relacja źródłowa: WysokieNapiecie.pl",
        "paragraphs": [
          "Rosnące zapotrzebowanie na energię elektryczną, presja na ograniczanie emisji gazów cieplarnianych oraz potrzeba zwiększania konkurencyjności przemysłu sprawiają, że własne źródła energii odnawialnej stają się coraz ważniejszym elementem strategii przedsiębiorstw. W odpowiedzi na te potrzeby, Narodowy Fundusz Ochrony Środowiska i Gospodarki Wodnej 2 listopada 2026 r. rozpoczął już po raz trzeci nabór wniosków w ramach Programu Priorytetowego „ Przemysł energochłonny – OZE ”, którego celem jest zmniejszenie emisyjności energochłonnych branż polskiego przemysłu poprzez zwiększenie wytwarzania energii elektrycznej z odnawialnych źródeł energii. Nabór dotyczy wyłącznie wytwarzania energii elektrycznej w instalacjach odnawialnego źródła energii, a zatem do dofinansowania nie kwalifikują się instalacje wytwarzające energię elektryczną i ciepło w skojarzeniu, nawet jeśli byłyby oparte o OZE. Nabór skierowany jest dla tych przedsiębiorców, którzy chcą budować lub rozbudować własną infrastrukturę energetyczną, ograniczać zależność od zewnętrznych dostaw energii, a jednocześnie mieć wpływ na zmniejszenie oddziaływania swojej działalności na środowisko. Kto może ubiegać się o wsparcie? Wnioski o wsparcie mogą składać wszyscy przedsiębiorcy, posiadający tytuł prawny do instalacji objętej systemem handlu uprawnieniami do emisji gazów cieplarnianych, czyli systemem EU ETS . Wymagany tytuł prawny może wynikać z prawa własności, użytkowania wieczystego lub trwałego zarządu. Należy pamiętać, że Wnioskodawcą nie może być podmiot, który znajduje się w likwidacji lub w postępowaniu upadłościowym. W praktyce konkurs skierowany jest przede wszystkim do przedsiębiorstw działających w branżach energochłonnych, takich jak hutnictwo stali, przemysł cementowy, chemiczny i koksowniczy, produkcja papieru, aluminium oraz biopaliw. Obejmuje zatem podmioty, których procesy produkcyjne wiążą się ze znacznym zużyciem energii. Jakie przedsięwzięcia będą wspierane? Wsparcie obejmuje inwestycje dotyczące budowy lub przebudowy jednostek wytwórczych energii elektrycznej z odnawialnych źródeł energii wraz z magazynem energii, bądź podłączeniem ich do sieci zakładowej i/lub dystrybucyjnej/przesyłowej. Warunkiem udzielenia wsparcia na magazyn energii jest zintegrowanie go ze źródłem energii, które będzie realizowane równolegle w ramach inwestycji. Warto również pamiętać, że inwestycja nie może być zakończona przed złożeniem wniosku, a koszty kwalifikowane programu mogą obejmować okres od 1 stycznia 2022 r. do 30 września 2030 r. Istotne znaczenie mają dwa warunki techniczne. Po pierwsze, co najmniej 80% energii elektrycznej wytworzonej przez instalację musi zostać wykorzystane na potrzeby własne Wnioskodawcy. Oznacza to, że planowana instalacja powinna odpowiadać przede wszystkim na potrzeby własne przedsiębiorstwa, a nie być projektowana wyłącznie z myślą o sprzedaży energii. Po drugie, w ramach przedsięwzięcia można zastosować wyłącznie nowe urządzenia, które zostały wyprodukowane nie wcześniej niż 48 miesięcy przed ich montażem. Na jakich zasadach udzielane jest wsparcie? W ramach trzeciego naboru przewidziano dofinansowanie w formie pożyczki, z możliwością częściowego umorzenia. Zgodnie z warunkami określonymi w dokumentacji konkursowej, pożyczka może objąć nawet 100% kosztów kwalifikowanych. W przypadku inwestycji realizowanych w formule project finance wymagany jest wkład własny w wysokości co najmniej 15% kosztów kwalifikowanych, wniesiony w formie kapitału zakładowego pokrytego wkładem pieniężnym. Finansowanie w formie pożyczki dostępne jest w wysokości od 5 mln zł do 300 mln zł. Maksymalny okres finansowania wynosi 20 lat, a oprocentowanie na warunkach preferencyjnych jest powiązane ze wskaźnikiem WIBOR 3M, przy minimalnym poziomie 1,5 proc. w skali roku. Możliwość częściowego umorzenia pożyczki Dodatkowym instrumentem, który przewidział NFOŚiGW jest premia w postaci umorzenia nawet do 30% pożyczki. &nbsp;Poziom premii jest uzależniony od produktywności wspieranej instalacji, a jej przyznanie wiąże się z koniecznością osiągnięcia i potwierdzenia założonego efektu ekologicznego. Budżet i terminy składania wniosków Na prowadzony obecnie nabór przeznaczono około 348 &nbsp;mln zł w formie pożyczek. Nabór trwa od 2 listopada 2026 r. do 30 kwietnia 2027 r. lub do wyczerpania dostępnej alokacji, a takie przypadki jak wyczerpany budżet coraz częściej się zdarzają. Wnioski składa się wyłącznie elektronicznie za pośrednictwem Generatora Wniosków o Dofinansowanie (GWD), z zastosowaniem wymaganego podpisu elektronicznego. Co będzie miało znaczenie podczas oceny projektu? Poza formalnym spełnieniem warunków dostępu istotne jest odpowiednie przygotowanie merytoryczne inwestycji. Wnioski będą oceniane pod kątem wiarygodności i realności założeń przedłożonych od wyliczenia efektu ekologicznego, harmonogramu realizacji, szacowania kosztów czy wyboru odpowiedniej technologii. Badana będzie także zdolność finansowa i organizacyjna wnioskodawcy do przeprowadzenia projektu i zachowania jego trwałości. Istotnym elementem jest także przygotowanie administracyjne Wnioskodawcy, w tym przygotowanie dokumentacji projektowej, dostęp do gruntów lub obiektów, wymagane pozwolenia, tj. decyzja środowiskowa, warunki przyłączenia czy pozwolenie na budowę. Ekoinnowacyjność jako element podejścia do inwestycji Podczas oceny wniosków, będzie można otrzymać dodatkowe punkty, jeśli projekt będzie przewidywał wdrożenie ekoinnowacyjności, czyli zastosowanie w praktyce gospodarczej nowej albo znacząco udoskonalonej technologii, która zapewni poprawę efektywności wykorzystania zasobów naturalnych, ograniczanie presję na środowisko albo zwiększy odporności gospodarki na zagrożenia środowiskowe. Jak przygotować się do ubiegania o wsparcie? Dla przedsiębiorstw zainteresowanych udziałem w naborze kluczowe będzie odpowiednio wczesne rozpoczęcie prac przygotowawczych i dokładne przeanalizowanie dokumentacji konkursowej. Ostateczne decyzje inwestycyjne oraz sposób przygotowania wniosku powinny opierać się na aktualnych dokumentach programu i regulaminie III naboru. Przedsiębiorców rozważających realizację inwestycji i ubieganie się o dofinansowanie, zainteresowanych poznaniem szczegółowych wytycznych programu oraz praktycznych aspektów przygotowania dokumentacji aplikacyjnej, METROPOLIS Doradztwo Gospodarcze zaprasza na bezpłatne webinarium w formule online. Spotkanie odbędzie się 19 listopada 2026 r. o godz. 10:00 na platformie Microsoft Teams. Webinarium poprowadzi Anna Zrobczyńska, Project Manager w METROPOLIS Doradztwo Gospodarcze, posiadająca ponad 17-letnie doświadczenie w pozyskiwaniu finansowania dla projektów z obszaru energetyki i ochrony środowiska. Zapisy: www.metropolisdg.pl/webinar W przypadku dodatkowych pytań kontakt możliwy jest również drogą mailową: anna.zrobczynska(at)metropolisdg.pl [Źródło: WysokieNapiecie.pl]"
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
    "id": 7,
    "path": "/Polska/Energetyka",
    "seo_url": "/Polska/Energetyka/saudi-aramco-zarabia-krocie-pomimo-wojny-w-zatoce-perskiej",
    "seo_title": "Saudi Aramco zarabia krocie pomimo wojny w Zatoce Perskiej",
    "thumbnail_url": "https://wysokienapiecie.pl/wp-content/uploads/2026/06/Ormuz-Iran-fot.-Depositphotos.x63527.jpg",
    "published_iso": "2026-11-13T01:06:33+01:00",
    "display_date": "13.11.2026, 01:06",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 81,
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
        "val": "Fakty / RSS"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Relacja źródłowa: WysokieNapiecie.pl",
        "paragraphs": [
          "Wojna nie zatopiła Saudi Aramco Blokada Cieśniny Ormuz oraz irańskie ataki na ropociągi i instalacje naftowe ograniczyły eksport arabskiej ropy, ale nie zyski Saudi Aramco. Koncern zarabia jeszcze więcej niż przed wojną dzięki wyższym cenom - analizuje \"The Economist\". Koncern w trzecim kwartale 2026 roku odnotował 31 mld dolarów zysku netto, co stanowi wzrost o 9% w porównaniu z analogicznym okresem minionego roku. Tygodnik wskazuje, że od momentu wybuchu wojny Saudi Aramco jest zmuszone do ciągłej adaptacji do trudnego otoczenia. Najpierw zaczęło więc transportować więcej ropy przez Morze Czerwone. W lipcu, gdy jemeńscy Huti zablokowali południową przeprawę przez Cieśninę Bab al-Mandab, koncern przekierował swoje statki na północ, aby w większym stopniu wykorzystać suesko-śródziemnomorski rurociąg Sumed. Z kolei we wrześniu, gdy ataki na kluczowy w Arabii Saudyjskiej rurociąg Wschód-Zachód ograniczyły ilość ropy docierającej do Morza Czerwonego, zaczęło wysyłać tankowce przez Cieśninę Ormuz do Zatoki Omańskiej. Tam przeładowuje ropę na statki klientów. W październiku Saudi Aramco wprowadzało na rynek około 7 mln baryłek ropy dziennie wobec 4,5 mln w lipcu. Było to również niewiele mniej niż w lutym, czyli zasadniczo jeszcze przed wojną rozpoczętą dokładnie 28 lutego 2026 roku. Zyskom koncernu sprzyjają też niskie koszty wydobycia i wysokie ceny ropy, a koszty odbudowy uszkodzonej infrastruktury nie okazały się jak dotąd zbyt dotkliwe. Po trzech kwartałach tego roku nakłady inwestycyjne spadły o 4% w porównaniu z poprzednim rokiem. Nie zmienia to faktu, że koszty transportu podrożały, a logistyczna ekwilibrystyka dodatkowo zmniejsza jego efektywność. Dlatego Saudi Aramco oprócz rozbudowy rurociągu Wschód-Zachód, zamierza rozwijać też nowe połączenia. Wśród nich znajduje się rurociąg ze złóż ropy naftowej na wschodzie Arabii Saudyjskiej do Duqm na wybrzeżu Omanu. Firma konsultingowa Rystad Energy szacuje, że miałby on długość około 1000 km, a jego budowa kosztowałaby do 7 mld dolarów - 14% rocznego budżetu inwestycyjnego koncernu. Amin Naser, prezes Aramco, przekonuje, że inwestycje w rurociągi szybko się zwrócą, gdyż globalne zapasy ropy naftowej są na wyczerpaniu. Dlatego państwa mogą stanąć przed koniecznością uzupełnienia rezerw strategicznych, a to może skutkować zwiększonym popytem przez co najmniej dwa lata po zakończeniu wojny. Zobacz także: Amerykańskie koncerny naftowe zarabiają krocie dzięki wojnie Katar będzie handlował amerykańskim LNG Jeszcze kilka lat temu Katar był największym producentem skroplonego gazu na świecie, nim utracił to miano na rzecz USA. Natomiast teraz, na skutek wojny i blokady Cieśniny Ormuz, Katar staje się największym nabywcą amerykańskiego LNG - donosi \"Financial Times\". Dziennik wskazuje, że pod koniec października kontrolowana przez państwo spółka QatarEnergy podpisała dwie umowy, które zwiększają zakupy LNG produkowanego w USA o 7 mln ton rocznie. Dzięki temu, łącznie ze swoimi udziałami w projekcie Golden Pass w Teksasie, QatarEnergy jest na dobrej drodze, aby do 2033 roku kontrolować blisko 24 mln ton amerykańskiego surowca. Dzięki temu stanie się największym nabywcą LNG z USA, wyprzedzając takie koncerny jak TotalEnergies, Shell, Woodside Energy, ConocoPhillips, JERA czy ExxonMobil. Katar był największym na świecie dostawcą LNG do 2023 roku, gdyż został wyprzedzony przez USA dzięki trwającej tam rewolucji łupkowej. Koszty produkcji skroplonego gazu w Katarze należą do najniższych na świecie, ale obecnie te atuty nie mogą być wykorzystywane. QatarEnergy wstrzymał produkcję LNG i ogłosiło stan siły wyższej wobec swoich odbiorców kilka dni po zaatakowaniu Iranu przez USA i Izrael. Po irańskich atakach odwetowych na infrastrukturę gazową oraz blokadzie Cieśniny Ormuz, przez którą wiedzie jedyny szlak do klientów spoza Zatoki Perskiej, eksport katarskiego LNG spadł w tym roku do mniej niż jednej trzeciej standardowego poziomu. W tej sytuacji QatarEnergy chce odbudować nadszarpniętą przez wojnę reputację niezawodnego dostawcy i zawiera umowy na kupno surowca, aby następnie móc go zaoferować swoim klientom. Analitycy spodziewają się, że w najbliższym czasie spółka może zawrzeć jeszcze 2-3 kontrakty w USA lub innych krajach. \"Financial Times\" zwraca jednak uwagę, że podpisane pod koniec ubiegłego miesiąca umowy przewidują rozpoczęcie dostaw LNG w latach 2030-2031. Dlatego nie przyniosą one znaczącej ulgi dla napiętej sytuacji, która panuje na globalnym rynku gazu. Niemniej jest to istotny czynnik dla długoterminowych perspektyw sektora. Zobacz również: Orlen powiększył kluczowy magazyn gazu. Ale to wciąż za mało dla bezpieczeństwa systemu Demokraci mogą przystopować budowę centrów danych Około 40% planowanej mocy centrów danych w USA znajduje się w stanach, w których nowo wybrani gubernatorzy z Partii Demokratycznej w kampanii wyborczej zapowiadali zahamowanie lub wstrzymanie budowy takich obiektów - wskazuje Bloomberg. Agencja dodaje, że chodzi o takie stany jak Ohio, Georgia, Michigan, Nowy Meksyk i Teksas. Z kolei gubernatorzy w Nowym Jorku i Oregonie zobowiązali się do przedłużenia już obowiązujących moratoriów. Wyborów ostatecznie nie rozstrzygnięto jeszcze w Kansas i Alasce, ale prowadzący tam Demokraci również wzywają do ogłoszenia moratoriów. Łącznie, jak wyliczyła firma analityczna Cleanview, w powyższych stanach znajduje się około 40% planowanej mocy centrów danych w USA. Do tego dochodzi jeszcze 46 lokalnych inicjatyw referendalnych - zatwierdzonych lub czekających na zatwierdzenie. Pośród nich co najmniej 17 dotyczy całkowitego zakazu budowy dużych centrów danych. Bloomberg podkreśla, że zagraża to planom koncernów technologicznych, które inwestują dziesiątki miliardów dolarów w centra danych dla sztucznej inteligencji (AI). W reakcji na zwycięstwo Demokratów w wyborach połówkowych do Kongresu, w tym takich bastionach Republikanów jak Teksas, akcje firm związanych z sektorem AI zareagowały spadkiem. Sprzeciw wobec budowy wielkoskalowych centrów danych narasta. Według grupy badawczej Data Center Watch sprzeciw lokalnych społeczności utrudnił już realizację co najmniej 45 projektów w drugim kwartale 2026 roku. Bloomberg Intelligence szacuje, że wygrana Demokratów w wyborach może skutkować uszczupleniem wartego około 1,4 bln dolarów boomu inwestycyjnego o 5-7% w 2027 roku. Kwota ta obejmuje wydatki związane z budową centrów danych, czyli m.in. zakup gruntów, prace budowlane, dostawy chipów i sprzętu IT, a także inwestycje związane z zaopatrzeniem w energię. Jak szacują analitycy, spodziewane spowolnienie wydawania zgód administracyjnych może spowodować, że w przyszłym roku nie uda się uruchomić zgodnie z planem nawet 10 GW mocy w centrach danych. Zobacz także: Co unijne etykiety energetyczne oznaczają dla polskich centrów danych? Długa kolejka baterii do niemieckich sieci Bateryjne magazyny energii stały się jedną najatrakcyjniejszych inwestycji na niemieckim rynku energii. Jednak wdrażanie projektów do realizacji utrudniają niejednolite zasady przyłączania instalacji do sieci, które nie promują najbardziej dojrzałych przedsięwzięć - analizuje Montel. Portal wskazuje, że w 2025 roku operatorzy otrzymali ponad 18 tysięcy wniosków o przyłączenie do sieci baterii o łącznej mocy około 574 GW. Jednocześnie w ubiegłym roku operatorzy wydali warunki przyłączenia dla 54 GW magazynów, wliczając w to również wnioski, które spłynęły w latach wcześniejszych. Z kolei moc eksploatowanych już baterii, podłączonych do średniego i wysokiego napięcia, to zaledwie 3,6 GW. Większość projektów aplikuje o przyłącza do sieci dystrybucyjnych, a ich operatorzy nie mają jednolitych reguł, według których rozpatrują wnioski. Niemniej dominuje tryb postępowania w myśl zasady \"kto pierwszy, ten lepszy\", czyli kluczowe jest miejsce w kolejce, a nie gotowość do realizacji inwestycji pod względem zgód administracyjnych, finansowania czy łańcuchów dostaw. Obok magazynów energii w kolejkach ustawiają się też inwestorzy, którzy chcą budować farmy fotowoltaiczne, wiatraki, centra danych czy obiekty przemysłowe. W rezultacie spada efektywność całego procesu przyłączeniowego. Montel podkreśla, że w rozładowaniu kolejek pomogłoby dystrybutorom energii pójście śladem operatorów sieci przesyłowych. Od kwietnia 2026 roku stosują oni nowe zasady procesu przyłączeniowego, które opierają się ocenianiu dojrzałości projektów do realizacji. W efekcie większe szanse na przyłącze do sieci mają realne przedsięwzięcia, a nie te spekulacyjne. Portal przyznaje, że ten system nie jest idealny, gdyż naturalnie premiuje tych deweloperów, którzy dysponują największymi budżetami. Niemniej wspólne i klarowne zasady gry u wszystkich operatorów byłyby o wiele lepsze niż obecna formula, która spowalnia transformację energetyczną. Zobacz też: Nowe technologie baterii z Europy. Oto co rozwijamy [Źródło: WysokieNapiecie.pl]"
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
    "id": 8,
    "path": "/Polska/Energetyka",
    "seo_url": "/Polska/Energetyka/w-miesi-c-nie-wyprodukowano-126-gwh-z-oze-czy-agregacja-temu-zaradzi",
    "seo_title": "W miesiąc nie wyprodukowano 126 GWh z OZE. Czy agregacja temu zaradzi?",
    "thumbnail_url": "https://wysokienapiecie.pl/wp-content/uploads/2026/11/Kapota_Zdar-002.x63527.png",
    "published_iso": "2026-11-13T01:06:33+01:00",
    "display_date": "13.11.2026, 01:06",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 81,
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
        "val": "Fakty / RSS"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Relacja źródłowa: WysokieNapiecie.pl",
        "paragraphs": [
          "Zdaniem ekspertów z think tanku Forum Energii, ograniczenia w produkcji OZE wynikają m.in. z jej niedopasowania do zapotrzebowania i niedostatecznej elastyczności systemu. I tu coraz większego znaczenia nabierają nie tylko magazyny energii, lecz także agregacja elastyczności, usługi bilansujące oraz aktywne zarządzanie generacją rozproszoną. Dla właścicieli odpowiednio wyposażonych instalacji może to oznaczać nowe możliwości uzyskiwania przychodów z już posiadanych aktywów energetycznych. OZE produkują coraz więcej energii. System nie zawsze jest w stanie odebrać całą dostępną produkcję Jak wynika z Miesięcznika Forum Energii , produkcja energii elektrycznej z OZE we wrześniu 2026 r. była o 22,1% wyższa niż rok wcześniej. Jednocześnie PSE wprowadzały nierynkowe ograniczenia generacji przez 197 godzin w ciągu 25 dni. Ograniczenia objęły 69,7 GWh potencjalnej produkcji z wielkoskalowych instalacji fotowoltaicznych i 56,4 GWh z farm wiatrowych. Od początku roku do końca września ograniczono łącznie 1 736,9 GWh potencjalnej produkcji z OZE, czyli o 48,8% więcej niż w analogicznym okresie 2025 r. Skala ograniczeń nie wynika wyłącznie z rosnącego udziału odnawialnych źródeł energii. Forum Energii zwraca również uwagę na ograniczoną elastyczność elektrowni konwencjonalnych i elektrociepłowni (CHP), a także niewystarczające możliwości przesuwania zużycia energii na godziny wysokiej produkcji z OZE . Problem ma również wymiar ekonomiczny. Według analizy Forum Energii średnia cena na rynku dnia następnego (RDN) we wrześniu wynosiła około 665 zł/MWh. Najwyższa godzinowa cena ważona wolumenem sięgnęła jednak 2 602,4 zł/MWh, a najniższa spadła do –37,4 zł/MWh. Były to wartości skrajne, odnotowane w różnych godzinach miesiąca, a nie typowa dobowa rozpiętość cen ani gwarantowana okazja do osiągnięcia zysku. Pokazują jednak, jak istotna jest możliwość dostosowywania produkcji i zużycia energii elektrycznej do warunków rynkowych. – Maksymalizacja liczby godzin pracy instalacji nie zawsze oznacza maksymalizację jej rentowności. Przy dużej zmienności cen liczy się to, kiedy dane źródło wytwarza energię i czy potrafi reagować na warunki rynkowe. Właściciele jednostek kogeneracyjnych, biogazowni czy bateryjnych magazynów energii dysponują elastycznością, która może mieć wymierną wartość finansową. Jej wykorzystanie wymaga jednak połączenia wiedzy technicznej z prognozowaniem cen i aktywnym zarządzaniem produkcją. Przedsiębiorstwa, które potrafią zarządzać nie tylko samym urządzeniem, ale także jego pozycją na rynku energii, mogą zyskiwać coraz większą przewagę konkurencyjną – mówi Nikola Štěpánková, odpowiedzialna za rozwój biznesu aggregaat w Polsce. Bilansowanie energii: potencjalne korzyści liczone w milionach złotych Znaczenie aktywnego zarządzania portfelem ilustruje raport PSE dotyczący bilansowania handlowego w sierpniu 2026 r. Operator zbadał hipotetyczny scenariusz, w którym 40% wolumenu niezbilansowania skorygowano po cenach rynku dnia następnego (RDN), kolejne 40% – po cenach rynku dnia bieżącego (RDB), a pozostałe 20% rozliczono po cenach niezbilansowania. W tym modelu potencjalne korzyści dla wszystkich podmiotów odpowiedzialnych za bilansowanie handlowe (POB) wyniosły 202 mln zł w ciągu jednego miesiąca. Pięć spośród dziesięciu podmiotów o największych wolumenach niezbilansowania mogłoby uzyskać łącznie 96 mln zł korzyści. Nie są to rzeczywiste oszczędności, lecz wyniki symulacji opartej na określonych założeniach. Raport potwierdza znaczenie prognozowania, aktywnego handlu na rynku dnia następnego i rynku dnia bieżącego oraz reagowania na odchylenia. Bilansowanie własnej pozycji handlowej wymaga nie tylko odpowiednich umów, ale również dostępu do zasobów, którymi można sterować. To właśnie w tym obszarze coraz większą rolę odgrywa profesjonalne zarządzanie elastycznością aktywów energetycznych. Elektrownie wirtualne: jak działa agregacja elastyczności? Jednym ze sposobów wykorzystania już istniejących zasobów jest agregacja elastyczności . Polega ona na połączeniu wielu rozproszonych źródeł wytwórczych, magazynów energii oraz odbiorców, których zużyciem można sterować, w jeden wspólnie zarządzany portfel. W ten sposób powstaje elektrownia wirtualna (VPP), zdolna reagować na zmiany cen energii elektrycznej i zapotrzebowania systemu. Dzięki temu mniejsze instalacje, które samodzielnie nie spełniałyby określonych wymogów rynkowych, mogą uzyskać dostęp do dodatkowych mechanizmów wynagradzania. W praktyce jednostka kogeneracyjna może wytwarzać energię w godzinach wyższych cen i świadczyć usługi bilansujące w kierunku zwiększenia mocy, gdy ceny na rynku spot spadają. Biogazownia dysponująca odpowiednią pojemnością magazynowania biogazu może przesuwać część produkcji na korzystniejsze godziny i świadczyć usługi bilansujące w kierunku zmniejszenia mocy, uzyskując dodatkowe przychody. Z kolei bateryjny magazyn energii (BESS) może wykorzystywać różnice cen, a po spełnieniu odpowiednich wymogów technicznych i rynkowych świadczyć usługi bilansujące w obu kierunkach – zarówno zwiększania, jak i zmniejszania mocy. Przykładem takiego podejścia jest elektrownia wirtualna aggregaat , której model biznesowy łączy techniczną agregację elastyczności z optymalizacją handlową. Autorska platforma aggregaat Virtuel monitoruje ponad 200 parametrów pracy urządzeń, a centrum dyspozytorskie wspiera sterowanie nimi na podstawie danych technicznych, prognoz i warunków panujących na rynku energii. Kluczowe jest równoczesne zarządzanie dwoma obszarami. Pierwszy z nich to elastyczność techniczna , obejmująca rezerwację i aktywację mocy w ramach usług bilansujących. Drugi to elastyczność handlowa , czyli optymalizacja sprzedaży i zakupu energii elektrycznej oraz bilansowanie portfela. Połączenie obu obszarów może zwiększyć wartość instalacji, pod warunkiem przestrzegania ograniczeń technicznych i unikania sprzecznych zobowiązań na różnych rynkach. – Agregator nie powinien być jedynie pośrednikiem w sprzedaży usług systemowych. Jego rolą jest łączenie możliwości technicznych aktywa z warunkami handlowymi i ograniczeniami wynikającymi z eksploatacji urządzeń. W aggregaat wykorzystujemy platformę Virtuel oraz nasze kompetencje dyspozytorskie i handlowe. Pozwala nam to planować pracę urządzeń z uwzględnieniem ich dostępności, cen energii elektrycznej i zobowiązań na różnych rynkach. Dla właściciela instalacji liczy się ostatecznie jej wynik finansowy, a nie sama liczba aktywacji czy godzin pracy – podkreśla Nikola Štěpánková. Polska będzie potrzebować większej elastyczności. Nie każda instalacja uzyska z niej takie same przychody Rosnąca liczba źródeł OZE, magazynów energii i innych sterowalnych zasobów zwiększa znaczenie koordynacji ich pracy. Nie oznacza to jednak, że każda instalacja automatycznie zacznie przynosić dodatkowe przychody. Kluczowe są jej parametry techniczne, możliwość sterowania, wymagania kwalifikacyjne i warunki handlowe. Dla właścicieli rozproszonych źródeł wytwórczych coraz ważniejsze staje się więc pytanie, jak wykorzystać istniejące zasoby na różnych rynkach i czy można poprawić ich wyniki finansowe. Istotny jest również dobór odpowiedniego modelu współpracy z agregatorem energii : od podziału dodatkowych przychodów i rozwiązań z gwarantowanym wynagrodzeniem po outsourcing dyspozytorski i korzystanie ze specjalistycznego oprogramowania. W polskiej energetyce wartość powstaje coraz częściej nie tylko dzięki nowym megawatom, lecz także dzięki efektywniejszemu wykorzystaniu mocy już pracujących w systemie. Zgodnie z Krajowym planem w dziedzinie energii i klimatu , przyjętym przez polski rząd w czerwcu 2026 r., udział OZE w krajowej produkcji energii elektrycznej ma do 2030 r. wynieść 51,6–53,2%, zależnie od scenariusza. Równolegle rozwijane są zasoby umożliwiające reagowanie na wahania generacji. W zaktualizowanej strategii do 2035 r. PGE zakłada osiągnięcie 18 GWh pojemności magazynów energii, natomiast TGE i NODES przygotowują pilotażową platformę lokalnych usług elastyczności. [Źródło: WysokieNapiecie.pl]"
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
    "id": 9,
    "path": "/Polska",
    "seo_url": "/Polska/hegseth-odznaczy-o-nierza-kt-ry-udzieli-mu-reprymendy-na-cmentarzu",
    "seo_title": "Hegseth odznaczył żołnierza, który udzielił mu reprymendy na cmentarzu",
    "published_iso": "2026-11-13T00:47:13+01:00",
    "display_date": "13.11.2026, 00:47",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 85,
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
        "val": "Fakty / RSS"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Relacja źródłowa: RMF24",
        "paragraphs": [
          "Hegseth odznaczył żołnierza, który udzielił mu reprymendy na cmentarzu [Źródło: RMF24]"
        ]
      },
      {
        "heading": "Relacja źródłowa: Polsat News",
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
  },
  {
    "id": 10,
    "path": "/Polska/Gospodarka",
    "seo_url": "/Polska/Gospodarka/warszawa-liderem-wzrost-w-w-europie-allegro-orlen-i-banki-ci-gn-gpw-w-g-r",
    "seo_title": "Warszawa liderem wzrostów w Europie. Allegro, Orlen i banki ciągną GPW w górę",
    "published_iso": "2026-11-13T00:47:13+01:00",
    "display_date": "13.11.2026, 00:47",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 80,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "1 redakcji"
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
        "val": "Fakty / RSS"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Relacja źródłowa: Bankier.pl",
        "paragraphs": [
          "Czwartkowa sesja na warszawskim parkiecie przyniosła wyraźną przewagę strony popytowej, czyniąc z głównych indeksów GPW najsilniejsze benchmarki w Europie. Warszawska giełda skutecznie oparła się ospałym nastrojom na rynkach bazowych. Lokomotywą wzrostów w indeksie WIG20 było Allegro, napędzane lepszymi od oczekiwań wynikami. Pozytywny sentyment wspierały również Orlen oraz sektor bankowy. [Źródło: Bankier.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Bankier.pl",
        "angle": "Depesza źródłowa",
        "summary": "Warszawa liderem wzrostów w Europie. Allegro, Orlen i banki ciągną GPW w górę",
        "url": "https://www.bankier.pl/wiadomosc/Warszawa-liderem-wzrostow-w-Europie-Allegro-Orlen-i-banki-ciagna-GPW-w-gore-9227989.html?utm_source=RSS&utm_medium=RSS&utm_campaign=Wiadomosci"
      }
    ],
    "sources": [
      "Bankier.pl"
    ],
    "corrections": []
  },
  {
    "id": 11,
    "path": "/Polska/Gospodarka",
    "seo_url": "/Polska/Gospodarka/pieni-dze-pa-p-nie-p-jd-na-sp-at-pfizera-jest-decyzja-belgijskiego-s-du",
    "seo_title": "Pieniądze PAŻP nie pójdą na spłatę Pfizera. Jest decyzja belgijskiego sądu",
    "published_iso": "2026-11-13T00:47:13+01:00",
    "display_date": "13.11.2026, 00:47",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 80,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "1 redakcji"
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
        "val": "Fakty / RSS"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Relacja źródłowa: Bankier.pl",
        "paragraphs": [
          "Sąd w Belgii uchylił w czwartek o zajęciu środków Polskiej Agencji Żeglugi Powietrznej (PAŻP) na rzecz koncernu farmaceutycznego Pfizer. Przychylił się tym samym do skargi PAŻP, która dowodziła, że nie jest stroną sporu między Pfizerem a państwem polskim w sprawie szczepionek przeciwko COVID-19. [Źródło: Bankier.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Bankier.pl",
        "angle": "Depesza źródłowa",
        "summary": "Pieniądze PAŻP nie pójdą na spłatę Pfizera. Jest decyzja belgijskiego sądu",
        "url": "https://www.bankier.pl/wiadomosc/Pieniadze-PAZP-nie-pojda-na-splate-Pfizera-Jest-decyzja-belgijskiego-sadu-9227955.html?utm_source=RSS&utm_medium=RSS&utm_campaign=Wiadomosci"
      }
    ],
    "sources": [
      "Bankier.pl"
    ],
    "corrections": []
  },
  {
    "id": 12,
    "path": "/Polska/Gospodarka",
    "seo_url": "/Polska/Gospodarka/polak-zatrzymany-na-granicy-z-niemcami-s-d-uzna-kontrol-za-niezgodn-z-prawe",
    "seo_title": "Polak zatrzymany na granicy z Niemcami. Sąd uznał kontrolę za niezgodną z prawem",
    "published_iso": "2026-11-13T00:47:13+01:00",
    "display_date": "13.11.2026, 00:47",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 80,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "1 redakcji"
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
        "val": "Fakty / RSS"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Relacja źródłowa: Bankier.pl",
        "paragraphs": [
          "Kontrole graniczne zarządzone przez niemieckie ministerstwo spraw wewnętrznych na granicach z Polską i Czechami były niezgodne z prawem - orzekł w czwartek sąd administracyjny w Dreźnie. Wyroki są nieprawomocne. [Źródło: Bankier.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Bankier.pl",
        "angle": "Depesza źródłowa",
        "summary": "Polak zatrzymany na granicy z Niemcami. Sąd uznał kontrolę za niezgodną z prawem",
        "url": "https://www.bankier.pl/wiadomosc/Polak-zatrzymany-na-granicy-z-Niemcami-Sad-uznal-kontrole-za-niezgodna-z-prawem-9228045.html?utm_source=RSS&utm_medium=RSS&utm_campaign=Wiadomosci"
      }
    ],
    "sources": [
      "Bankier.pl"
    ],
    "corrections": []
  },
  {
    "id": 13,
    "path": "/Polska/Gospodarka",
    "seo_url": "/Polska/Gospodarka/huti-uderzyli-w-obiekty-aramco-celem-tak-e-strategiczny-ropoci-g",
    "seo_title": "Huti uderzyli w obiekty Aramco. Celem także strategiczny ropociąg",
    "published_iso": "2026-11-13T00:47:13+01:00",
    "display_date": "13.11.2026, 00:47",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 80,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "1 redakcji"
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
        "val": "Fakty / RSS"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Relacja źródłowa: Bankier.pl",
        "paragraphs": [
          "Jemeńscy proirańscy rebelianci Huti poinformowali w czwartek o zaatakowaniu ropociągu Wschód-Zachód oraz terminalu naftowego w mieście Janbu w Arabii Saudyjskiej. Zapewnili też, że nie zaatakowali Mekki. [Źródło: Bankier.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Bankier.pl",
        "angle": "Depesza źródłowa",
        "summary": "Huti uderzyli w obiekty Aramco. Celem także strategiczny ropociąg",
        "url": "https://www.bankier.pl/wiadomosc/Huti-uderzyli-w-obiekty-Aramco-Celem-takze-strategiczny-ropociag-9228123.html?utm_source=RSS&utm_medium=RSS&utm_campaign=Wiadomosci"
      }
    ],
    "sources": [
      "Bankier.pl"
    ],
    "corrections": []
  },
  {
    "id": 14,
    "path": "/Polska/Gospodarka",
    "seo_url": "/Polska/Gospodarka/wstrz-s-w-nvidii-jensen-huang-odchodzi-po-aferze-szpiegowskiej",
    "seo_title": "Wstrząs w Nvidii. Jensen Huang odchodzi po aferze szpiegowskiej",
    "published_iso": "2026-11-13T00:47:13+01:00",
    "display_date": "13.11.2026, 00:47",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 80,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "1 redakcji"
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
        "val": "Fakty / RSS"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Relacja źródłowa: Bankier.pl",
        "paragraphs": [
          "Szef i współzałożyciel Nvidii Jensen Huang zrezygnował w czwartek ze stanowisk prezesa, dyrektora generalnego (CEO) oraz członka rady dyrektorów ze skutkiem natychmiastowym - poinformowała firma w komunikacie. [Źródło: Bankier.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Bankier.pl",
        "angle": "Depesza źródłowa",
        "summary": "Wstrząs w Nvidii. Jensen Huang odchodzi po aferze szpiegowskiej",
        "url": "https://www.bankier.pl/wiadomosc/Wstrzas-w-Nvidii-Jensen-Huang-odchodzi-po-aferze-szpiegowskiej-9227904.html?utm_source=RSS&utm_medium=RSS&utm_campaign=Wiadomosci"
      }
    ],
    "sources": [
      "Bankier.pl"
    ],
    "corrections": []
  },
  {
    "id": 15,
    "path": "/Polska/Gospodarka",
    "seo_url": "/Polska/Gospodarka/zus-automatycznie-umorzy-nale-no-ci-sprzed-1999-r-oto-skutki",
    "seo_title": "ZUS automatycznie umorzy należności sprzed 1999 r. Oto skutki",
    "published_iso": "2026-11-13T00:47:13+01:00",
    "display_date": "13.11.2026, 00:47",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 80,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "1 redakcji"
      },
      {
        "label": "Kategoria",
        "val": "/Polska/Gospodarka"
      },
      {
        "label": "Główne źródło",
        "val": "Money.pl"
      },
      {
        "label": "Weryfikacja",
        "val": "Fakty / RSS"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Relacja źródłowa: Money.pl",
        "paragraphs": [
          "Zakład Ubezpieczeń Społecznych umorzy 1 maja 2027&nbsp;r. należności wobec ZUS sprzed 1999 r. Nie trzeba składać w tej sprawie żadnego wniosku. Aby zrezygnować z umorzenia, trzeba będzie złożyć oświadczenie – poinformował w czwartek ZUS. Podkreślił też, że umorzenie może wpłynąć na wysokość przyszłej emerytury. [Źródło: Money.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Money.pl",
        "angle": "Depesza źródłowa",
        "summary": "ZUS automatycznie umorzy należności sprzed 1999 r. Oto skutki",
        "url": "https://www.money.pl/finanse/zus-automatycznie-umorzy-naleznosci-sprzed-1999-r-oto-skutki-7350261849696256a.html"
      }
    ],
    "sources": [
      "Money.pl"
    ],
    "corrections": []
  },
  {
    "id": 16,
    "path": "/Polska/Gospodarka",
    "seo_url": "/Polska/Gospodarka/reklamy-w-republice-brzoska-odpowiada-dziennikarzowi-dezinformacja-dla-clic",
    "seo_title": "Reklamy w Republice. Brzoska odpowiada dziennikarzowi: dezinformacja dla clickbaitu",
    "published_iso": "2026-11-13T00:47:13+01:00",
    "display_date": "13.11.2026, 00:47",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 80,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "1 redakcji"
      },
      {
        "label": "Kategoria",
        "val": "/Polska/Gospodarka"
      },
      {
        "label": "Główne źródło",
        "val": "Money.pl"
      },
      {
        "label": "Weryfikacja",
        "val": "Fakty / RSS"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Relacja źródłowa: Money.pl",
        "paragraphs": [
          "Rafał Brzoska zabrał głos ws. Republiki, gdy Bartosz Wieliński z \"Gazety Wyborczej\" zarzucił firmie InPost, że ta reklamuje się w telewizji. Przedsiębiorca we wpisie na portalu X odpowiedział, że \"reklamy kupuje się pakietowo\" i pracownicy firmy nie decydują \"w jakim kanale ukaże się reklama\". Brzoska zarzucił Wielińskiemu dezinformację. [Źródło: Money.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Money.pl",
        "angle": "Depesza źródłowa",
        "summary": "Reklamy w Republice. Brzoska odpowiada dziennikarzowi: dezinformacja dla clickbaitu",
        "url": "https://www.money.pl/finanse/reklamy-w-republice-brzoska-odpowiada-dziennikarzowi-dezinformacja-dla-clickbaitu-7350185856707040a.html"
      }
    ],
    "sources": [
      "Money.pl"
    ],
    "corrections": []
  },
  {
    "id": 17,
    "path": "/Polska/Gospodarka",
    "seo_url": "/Polska/Gospodarka/sp-ka-mentzen-ze-strat-przychody-spad-y",
    "seo_title": "Spółka Mentzen ze stratą. Przychody spadły",
    "published_iso": "2026-11-13T00:47:13+01:00",
    "display_date": "13.11.2026, 00:47",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 80,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "1 redakcji"
      },
      {
        "label": "Kategoria",
        "val": "/Polska/Gospodarka"
      },
      {
        "label": "Główne źródło",
        "val": "Money.pl"
      },
      {
        "label": "Weryfikacja",
        "val": "Fakty / RSS"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Relacja źródłowa: Money.pl",
        "paragraphs": [
          "Spółka Mentzen zakończyła III kwartał 2026 r. stratą netto 288,8 tys. zł. Jej przychody zmniejszyły się o 16,5 proc., do 3,1 mln zł, a wyniki były słabsze niż rok wcześniej – podaje \"Rzeczpospolita\". [Źródło: Money.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Money.pl",
        "angle": "Depesza źródłowa",
        "summary": "Spółka Mentzen ze stratą. Przychody spadły",
        "url": "https://www.money.pl/gielda/spolka-mentzen-ze-strata-przychody-spadly-7350168404494784a.html"
      }
    ],
    "sources": [
      "Money.pl"
    ],
    "corrections": []
  },
  {
    "id": 18,
    "path": "/Polska/Gospodarka",
    "seo_url": "/Polska/Gospodarka/burza-wok-republiki-co-z-reklamami-firmy-t-umacz",
    "seo_title": "Burza wokół Republiki. Co z reklamami? Firmy tłumaczą",
    "published_iso": "2026-11-13T00:47:13+01:00",
    "display_date": "13.11.2026, 00:47",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 80,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "1 redakcji"
      },
      {
        "label": "Kategoria",
        "val": "/Polska/Gospodarka"
      },
      {
        "label": "Główne źródło",
        "val": "Money.pl"
      },
      {
        "label": "Weryfikacja",
        "val": "Fakty / RSS"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Relacja źródłowa: Money.pl",
        "paragraphs": [
          "Wycofanie reklam RTV Euro AGD z TV Republika i apel Tomasza Sakiewicza o bojkot sieci otworzyły dyskusję o odpowiedzialności reklamodawców. Eksperci w rozmowach z Wirtualnymi Mediami oceniają, że skutki sporu mogą dotknąć zarówno marki, jak i samą stację. – Czas antenowy na potrzeby kampanii marki Krakus kupujemy w pakietach – tłumaczy firma Animex. [Źródło: Money.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Money.pl",
        "angle": "Depesza źródłowa",
        "summary": "Burza wokół Republiki. Co z reklamami? Firmy tłumaczą",
        "url": "https://www.money.pl/biznes/maja-reklamy-w-tv-republika-teraz-tlumacza-nie-ma-bezposredniej-umowy-7350148635347392a.html"
      }
    ],
    "sources": [
      "Money.pl"
    ],
    "corrections": []
  },
  {
    "id": 19,
    "path": "/Polska/Gospodarka",
    "seo_url": "/Polska/Gospodarka/ile-kosztuje-dolar-kurs-dolara-do-z-otego-pln-usd-12-11-2026",
    "seo_title": "Ile kosztuje dolar? Kurs dolara do złotego PLN/USD 12.11.2026",
    "published_iso": "2026-11-13T00:47:13+01:00",
    "display_date": "13.11.2026, 00:47",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 80,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "1 redakcji"
      },
      {
        "label": "Kategoria",
        "val": "/Polska/Gospodarka"
      },
      {
        "label": "Główne źródło",
        "val": "Money.pl"
      },
      {
        "label": "Weryfikacja",
        "val": "Fakty / RSS"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Relacja źródłowa: Money.pl",
        "paragraphs": [
          "Kurs dolara - 12.11.2026. W czwartek za jednego dolara (USD) trzeba zapłacić 3.9804 zł. [Źródło: Money.pl]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Money.pl",
        "angle": "Depesza źródłowa",
        "summary": "Ile kosztuje dolar? Kurs dolara do złotego PLN/USD 12.11.2026",
        "url": "https://www.money.pl/pieniadze/ile-kosztuje-dolar-kurs-dolara-do-zlotego-pln-usd-12-11-2026-7350122464508384a.html"
      }
    ],
    "sources": [
      "Money.pl"
    ],
    "corrections": []
  },
  {
    "id": 20,
    "path": "/Polska/Polityka",
    "seo_url": "/Polska/Polityka/elastyczno-czyli-jak-kupowa-gaz-i-na-tym-zyska",
    "seo_title": "Elastyczność, czyli jak kupować gaz i na tym zyskać",
    "published_iso": "2026-11-13T00:47:13+01:00",
    "display_date": "13.11.2026, 00:47",
    "status": "AUTO_PUBLISHED",
    "fact_agreement_pct": 80,
    "admin_note": "",
    "metrics": [
      {
        "label": "Liczba źródeł",
        "val": "1 redakcji"
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
        "val": "Fakty / RSS"
      }
    ],
    "declickbait": [],
    "full_sections": [
      {
        "heading": "Relacja źródłowa: Rzeczpospolita",
        "paragraphs": [
          "Najnowsze dane Towarowej Giełdy Energii dotyczące średnich cen gazu ziemnego w kontraktach spotowych i rocznych budzą obawy. Choć na sytuację na rynku wpływają przede wszystkim czynniki zewnętrzne, nie oznacza to, że odbiorcy są pozbawieni możliwości działania. Jednym ze sposobów ograniczenia kosztów jest kontrolowanie rachunków za gaz, a przede wszystkim wybór odpowiedniego kontraktu zakupowego. [Źródło: Rzeczpospolita]"
        ]
      }
    ],
    "perspectives": [
      {
        "outlet": "Rzeczpospolita",
        "angle": "Depesza źródłowa",
        "summary": "Elastyczność, czyli jak kupować gaz i na tym zyskać",
        "url": "https://energia.rp.pl/nowa-energia/art45482221-elastycznosc-czyli-jak-kupowac-gaz-i-na-tym-zyskac"
      }
    ],
    "sources": [
      "Rzeczpospolita"
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

function plainText(s) { return (s || '').replace(/\[\d+:[^\]]+\]/g, '').replace(/\s{2,}/g, ' ').trim(); }

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
function meterHtml(p) {
  return `<span class="meter ${meterClass(p)}" title="Zgodność danych między źródłami">
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

function storyCardHtml(art) {
  const stats = art.metrics.slice(0, 2).map(m => `<span class="chip" title="${esc(m.label)}">${esc(m.val)}</span>`).join('');
  const thumbHtml = art.thumbnail_url ? `
    <div class="story-thumb-wrap">
      <img src="${esc(art.thumbnail_url)}" alt="${esc(art.seo_title)}" class="story-thumb" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.remove()" />
    </div>` : '';
  return `
    <article ${catAttr(art)} data-id="${art.id}" onclick="openArticle(${art.id})" tabindex="0" onkeydown="if(event.key==='Enter')openArticle(${art.id})">
      <div class="story-card" style="border-top-color:var(--cat)">
        ${thumbHtml}
        <div class="story-top"><span class="cat-badge">${esc(art.path)}</span><span class="story-date">${esc(art.display_date)}</span></div>
        <h2 class="story-title">${esc(art.seo_title)}</h2>
        <p class="story-lede">${esc(articleLede(art, 200))}</p>
        ${stats ? `<div class="story-chips">${stats}</div>` : ''}
        <div class="story-foot">${meterHtml(art.fact_agreement_pct)}<span>${art.sources.length} ${art.sources.length === 1 ? 'źródło' : 'źródła/źródeł'} · ${readingMinutes(art)} min czytania</span></div>
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

  const heading = `
    <div class="feed-heading">
      <h1>${q ? 'Wyniki wyszukiwania' : esc(currentPath)}</h1>
      <span>${list.length} ${list.length === 1 ? 'opracowanie' : 'opracowań'}</span>
    </div>`;

  const leadThumb = lead && lead.thumbnail_url ? `
    <div class="lead-thumb-wrap">
      <img src="${esc(lead.thumbnail_url)}" alt="${esc(lead.seo_title)}" class="lead-thumb" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.remove()" />
    </div>` : '';

  const leadHtml = lead ? `
    <article ${catAttr(lead)} style="display:block">
      <div class="lead-story" style="border-top-color:var(--cat)" onclick="openArticle(${lead.id})" tabindex="0" onkeydown="if(event.key==='Enter')openArticle(${lead.id})">
        <div class="lead-main">
          ${leadThumb}
          <div class="story-top"><span class="cat-badge">${esc(lead.path)}</span><span class="story-date">${esc(lead.display_date)}</span></div>
          <h2 class="lead-title">${esc(lead.seo_title)}</h2>
          <p class="lead-lede">${esc(articleLede(lead, 300))}</p>
          <div class="story-foot" style="border-top:none;padding-top:0">${meterHtml(lead.fact_agreement_pct)}<span>${lead.sources.length} źródeł · ${readingMinutes(lead)} min czytania</span></div>
        </div>
        <div class="lead-side">
          <div class="lead-side-title">Kluczowe dane</div>
          ${lead.metrics.map(m => `<div class="stat-row"><span class="stat-label">${esc(m.label)}</span><span class="stat-val">${esc(m.val)}</span></div>`).join('')}
        </div>
      </div>
    </article>` : '';

  container.innerHTML = heading + leadHtml +
    (rest.length ? `<div class="cards-grid" style="${lead ? 'margin-top:1.1rem' : ''}">${rest.map(storyCardHtml).join('')}</div>` : '');
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
      <img src="${esc(art.thumbnail_url)}" alt="${esc(art.seo_title)}" class="article-hero-img" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.remove()" />
    </div>` : '';

  container.innerHTML = `
    <div ${catAttr(art)}>
      <button class="back-link" onclick="closeArticle()">← Wróć do ${esc(currentPath)}</button>
      <div class="reader ${hasAside ? 'has-aside' : ''}">
        <article class="article-main">
          ${heroThumb}
          <header class="article-head">
            <div class="article-kicker">
              <span class="cat-badge">${esc(art.path)}</span>
              <span>${esc(art.display_date)}</span>
              <span>· ${readingMinutes(art)} min czytania</span>
            </div>
            <h1 class="article-title">${esc(art.seo_title)}</h1>
            <p class="article-lede">${esc(articleLede(art, 320))}</p>
          </header>

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
                ${sec.paragraphs.map(p => `<p class="section-paragraph">${formatCitations(esc(p))}</p>`).join('')}
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
                  <div class="perspective-outlet">${esc(p.outlet)}</div>
                  <div class="perspective-angle">${esc(p.angle)}</div>
                  <p class="perspective-summary">${esc(p.summary)}</p>
                  ${p.url ? `<a class="perspective-link" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Otwórz artykuł źródłowy ↗</a>` : ''}
                </div>`).join('')}
            </div>
          </div>` : ''}

          ${art.corrections.length ? `
            <div class="callout callout-warn" style="margin-top:1.2rem;border-left-color:var(--success);background:var(--success-soft)">
              <strong>Zweryfikowane uzupełnienia czytelników (${art.corrections.length}):</strong>
              ${art.corrections.map(c => `<div style="margin-top:0.25rem">• ${esc(c.claim_text)} (<a href="${esc(c.evidence_url)}" target="_blank" rel="noopener">link</a>)</div>`).join('')}
            </div>` : ''}

          <div class="article-footer">
            <span class="permalink">verity.pl${esc(art.seo_url)}</span>
            <button class="btn-outline" onclick="toggleCorr(${art.id})">Zgłoś sprostowanie (wymagany link do źródła)</button>
          </div>
          <div id="corrDrawer_${art.id}" class="correction-drawer hidden">
            <div style="font-size:0.8rem;font-weight:600">Zgłoś korektę faktograficzną – przyjmujemy wyłącznie zgłoszenia z linkiem do dokumentu lub źródła:</div>
            <div class="form-row">
              <input id="corrClaim_${art.id}" type="text" class="text-input" placeholder="Co wymaga korekty?" />
              <input id="corrUrl_${art.id}" type="text" class="text-input" placeholder="Link do dowodu: https://..." />
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap">
              <span id="corrMsg_${art.id}" style="font-size:0.78rem"></span>
              <button class="btn-primary" onclick="submitCorr(${art.id})">Wyślij korektę</button>
            </div>
          </div>
        </article>

        <aside class="article-aside">
          <div class="aside-card">
            <div class="aside-title">Zgodność danych</div>
            <div class="big-meter meter ${meterClass(art.fact_agreement_pct)}" style="font-size:1.7rem">${art.fact_agreement_pct}%<small>${art.sources.length} ${art.sources.length === 1 ? 'źródło' : 'źródeł'}</small></div>
            <div class="meter-bar" style="width:100%;height:0.45rem;margin-top:0.6rem"><span class="meter-fill" style="width:${art.fact_agreement_pct}%;background:var(--m,var(--success))"></span></div>
          </div>
          ${art.full_sections.length > 1 ? `
          <div class="aside-card">
            <div class="aside-title">W tym artykule</div>
            <ul class="aside-list">
              ${art.full_sections.map((s, i) => `<li><button class="toc-btn" onclick="document.getElementById('sec_${art.id}_${i}').scrollIntoView({behavior:'smooth'})">${esc(s.heading)}</button></li>`).join('')}
            </ul>
          </div>` : ''}
          ${uniqueLinks.length ? `
          <div class="aside-card">
            <div class="aside-title">Źródła do przeczytania</div>
            <ul class="aside-list">
              ${uniqueLinks.map(p => `<li><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.outlet.replace(/\s*\[[^\]]*\]/, ''))} ↗</a></li>`).join('')}
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
    container.innerHTML = `<div class="empty-state" style="color:var(--success);font-weight:600">Wszystkie artykuły z kolejki zostały zatwierdzone i opublikowane.</div>`;
    return;
  }

  container.innerHTML = pending.map(art => `
    <div class="article-card" style="padding:1.5rem;border-color:var(--warning)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;flex-wrap:wrap;gap:0.5rem">
        <span style="font-size:0.78rem;font-weight:700;color:var(--warning)">OCZEKUJE NA AKCEPTACJĘ REDAKCJI</span>
        <span style="font-family:monospace;font-size:0.8rem;color:var(--text-muted)">${esc(art.path)}</span>
      </div>
      <h3 style="font-family:Georgia,serif;font-size:1.25rem;font-weight:700;margin-bottom:0.75rem">${esc(art.seo_title)}</h3>
      <div style="margin-bottom:1rem">
        ${art.full_sections.map(s => `<p class="section-paragraph"><strong>${esc(s.heading)}:</strong> ${formatCitations(esc(s.paragraphs.join(' ')))}</p>`).join('')}
      </div>
      <div style="margin-bottom:1rem">
        <label style="display:block;font-size:0.8rem;font-weight:700;margin-bottom:0.35rem;color:var(--warning)">Nota weryfikacyjna redakcji (wyświetli się nad artykułem):</label>
        <input id="adminNoteInput_${art.id}" type="text" class="text-input" value="${esc(art.admin_note)}" />
      </div>
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap">
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
  try {
    const resp = await fetch('articles.json', { cache: 'no-store' });
    if (resp.ok) {
      const liveData = await resp.json();
      if (Array.isArray(liveData) && liveData.length > 0) {
        // Tylko artykuły od 13.11.2026
        const fresh = liveData.filter(a => (a.published_iso || '').slice(0, 10) >= '2026-11-13');
        if (fresh.length > 0) {
          articles = fresh.map((a, i) => ({
            id: a.id || (i + 1),
            status: a.status || 'AUTO_PUBLISHED',
            fact_agreement_pct: a.fact_agreement_pct || 80,
            admin_note: a.admin_note || '',
            metrics: a.metrics || [],
            declickbait: a.declickbait || [],
            perspectives: a.perspectives || [],
            sources: a.sources || [],
            corrections: a.corrections || [],
            full_sections: a.full_sections || [],
            display_date: a.display_date || '',
            seo_url: a.seo_url || '',
            ...a
          }));
        }
      }
    }
  } catch (e) {
    // Używa wbudowanych bieżących artykułów
  }
  renderPortal();
});
