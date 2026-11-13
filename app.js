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
    id: 1,
    path: '/Polska/Gospodarka',
    seo_url: '/Polska/Gospodarka/nowelizacja-pit-cit-ryczalt-uchwalona-sejm-stawka-24-proc',
    seo_title: 'Sejm po raz drugi uchwalił nowelizację PIT, CIT i ryczałtu: nowa stawka 24% PIT, podwyżka CIT do 22% i limit ryczałtu 250 tys. euro',
    published_iso: '2026-11-05T16:40:00+01:00',
    display_date: '5 listopada 2026',
    status: 'AUTO_PUBLISHED',
    fact_agreement_pct: 97,
    admin_note: '',
    metrics: [
      { label: 'Wynik w Sejmie', val: '236 za / 207 przeciw' },
      { label: 'Nowy próg i stawka PIT', val: '24% (130–150 tys. zł)' },
      { label: 'Podwyżka CIT (>50 mln €)', val: 'z 19% do 22%' },
      { label: 'Nowy limit ryczałtu', val: '250 tys. € (z 2 mln €)' }
    ],
    declickbait: [
      {
        outlet: 'Komunikat rządowy',
        original: 'Niższe podatki dla 3,5 mln Polaków! Nawet 7,2 tys. zł zysku dla rodziny!',
        fact: 'Podniesieniu pierwszego progu PIT ze 120 do 130 tys. zł towarzyszy ośmiokrotne obniżenie limitu ryczałtu (dotknie 43 tys. firm), wzrost CIT z 19% do 22% (4,6 tys. spółek) oraz wzrost daniny solidarnościowej z 4% do 5%.'
      }
    ],
    full_sections: [
      {
        heading: 'Wynik głosowania i przyczyna ponownego złożenia ustawy przez rząd',
        paragraphs: [
          'Sejm uchwalił po raz drugi rządową nowelizację ustaw o podatku dochodowym od osób fizycznych (PIT), podatku dochodowym od osób prawnych (CIT) oraz o zryczałtowanym podatku dochodowym. Za przyjęciem ustawy głosowało 236 posłów, przeciw było 207, nikt nie wstrzymał się od głosu. Dzień później ustawę bez poprawek zaakceptował Senat [1: PAP][2: Rzeczpospolita].',
          'Złożenie drugiego projektu wynikało z wątpliwości konstytucyjnych wokół pierwszej ustawy: posłowie wykreślili z niej podwyżkę CIT i dodali coroczną waloryzację progów PIT, po czym Senat próbował przywrócić podwyżkę CIT poprawką senacką. Biuro Legislacyjne Senatu uznało taką poprawkę za wykraczającą poza materię ustawy przekazaną z Sejmu, dlatego rząd przeprowadził ekspresowo nową ścieżkę legislacyjną [1: PAP][2: Rzeczpospolita].'
        ]
      },
      {
        heading: 'Nowa skala podatkowa PIT: próg 130 tys. zł i pośrednia stawka 24%',
        paragraphs: [
          'Uchwalona ustawa podnosi pierwszy próg podatkowy ze 120 000 zł do 130 000 zł przy zachowaniu stawki 12%. Jednocześnie wprowadza nowy, pośredni próg podatkowy dla dochodów w przedziale od 130 000 zł do 150 000 zł rocznie, objęty stawką 24%. Dochody przekraczające 150 000 zł pozostają opodatkowane stawką 32% [1: PAP][3: Biznes PAP].',
          'Według wyliczeń Ministerstwa Finansów na modyfikacji skali PIT skorzysta 3,5 mln podatników, a maksymalna korzyść wyniesie do 3 600 zł rocznie na jednego podatnika (do 7 200 zł przy wspólnym rozliczeniu małżonków). Podczas głosowania Sejm odrzucił poprawki opozycji i części koalicji zakładające podniesienie progu do 180–200 tys. zł oraz coroczną waloryzację o wskaźnik inflacji [1: PAP][2: Rzeczpospolita].'
        ]
      },
      {
        heading: 'Źródła sfinansowania zmian: wyższy CIT, ryczałt od 250 tys. euro i danina solidarnościowa',
        paragraphs: [
          'Aby zbilansować ubytek w budżecie, ustawa wprowadza trzy podwyżki podatków: (1) ośmiokrotne obniżenie limitu przychodów uprawniającego do rozliczania się ryczałtem z 2 mln euro do 250 tys. euro rocznie, co według szacunków MF dotknie co najmniej 43 tys. przedsiębiorców; (2) podniesienie stawki CIT z 19% do 22% dla spółek o przychodach powyżej 50 mln euro rocznie (ok. 4,6 tys. podmiotów); oraz (3) podwyższenie daniny solidarnościowej z 4% do 5% (płaconej przez ok. 39 tys. podatników) [2: Rzeczpospolita][3: Biznes PAP].'
        ]
      }
    ],
    perspectives: [
      {
        outlet: 'PAP / Biznes PAP [1, 3]',
        angle: 'Depesza parlamentarna',
        summary: 'Przedstawia dokładny rozkład głosów (236 za, 207 przeciw), odrzucone poprawki poselskie oraz parametry nowych progów 130 tys. i 150 tys. zł.',
        url: 'https://www.pap.pl/aktualnosci/sejm-po-raz-drugi-uchwalil-ustawe-ktora-dodaje-nowa-stawke-w-pit-i-zmienia-progi'
      },
      {
        outlet: 'Rzeczpospolita (Prawo i Podatki) [2]',
        angle: 'Analiza prawno-podatkowa',
        summary: 'Zestawia zyski 3,5 mln podatników na skali PIT ze stratami 43 tys. ryczałtowców oraz opisuje błąd legislacyjny przy pierwszej nowelizacji w Senacie.',
        url: 'https://pro.rp.pl/podatki/art45452541-zmiany-w-skali-pit-podwyzka-cit-i-ograniczenia-ryczaltu-druga-wersja-nowelizacji-idzie-jak-burza'
      },
      {
        outlet: 'Biznes PAP [3]',
        angle: 'Skutki dla przedsiębiorstw',
        summary: 'Szczegółowo wylicza wpływ podwyżki CIT z 19% do 22% oraz obniżenia limitu ryczałtu do 250 tys. euro na sektor MŚP i duże spółki.',
        url: 'https://biznes.pap.pl/wiadomosci/gospodarka/sejm-uchwalil-ustawe-ktora-min-wprowadza-nowa-24-proc-stawke-podatkowa-w-0'
      }
    ],
    sources: ['PAP', 'Rzeczpospolita', 'Biznes PAP'],
    corrections: []
  },
  {
    id: 2,
    path: '/Polska/Poznan',
    seo_url: '/Polska/Poznan/obchody-11-listopada-poznan-imieniny-ulicy-swiety-marcin-bieg-marsz',
    seo_title: '11 listopada w Poznaniu: 12 tys. uczestników Biegu Niepodległości, Imieniny Ulicy Święty Marcin z kontrolami bezpieczeństwa i Marsz z Rynku Wildeckiego',
    published_iso: '2026-11-11T16:30:00+01:00',
    display_date: '11 listopada 2026',
    status: 'AUTO_PUBLISHED',
    fact_agreement_pct: 96,
    admin_note: '',
    metrics: [
      { label: 'Bieg Niepodległości', val: '12 000 biegaczy (10 km)' },
      { label: 'Marsz z Rynku Wildeckiego', val: '~1 800 uczestników' },
      { label: 'Św. Marcin / CK Zamek', val: 'Strefa kontroli bagażu' },
      { label: 'Rekord w CH M1 Franowo', val: '316 osób (rogale)' }
    ],
    declickbait: [
      {
        outlet: 'Portal lokalny',
        original: 'Tłumy i kordony policji w samym sercu Poznania! Zobacz co działo się na ulicach!',
        fact: 'Wzmocnione patrole policji i kontrole bagażu wokół CK Zamek zabezpieczały równoległe obchody Imienin Ulicy Święty Marcin, 12-tysięczny Bieg Niepodległości oraz 1,8-tysięczny Marsz Niepodległości; nie odnotowano incydentów.'
      }
    ],
    full_sections: [
      {
        heading: 'Imieniny Ulicy Święty Marcin i zaostrzone środki bezpieczeństwa wokół CK Zamek',
        paragraphs: [
          'O godzinie 14:00 w centrum Poznania wyruszył tradycyjny korowód Świętego Marcina, który przeszedł trasą przez ul. Święty Marcin, al. Niepodległości, ul. Składową i Towarową, po czym prezydent miasta przekazał klucze patronowi ulicy [1: Radio Poznań][2: epoznan.pl].',
          'W związku z wcześniejszymi wydarzeniami w Krakowie na całym terenie imprezy masowej wokół Centrum Kultury Zamek wprowadzono zaostrzone kontrole osobiste oraz sprawdzanie bagażu. Równolegle dla mieszkańców udostępniono bezpłatnie punkt widokowy na Kopcu Wolności nad Maltą [1: Radio Poznań][3: epoznan.pl].'
        ]
      },
      {
        heading: 'Wielki Bieg Niepodległości (12 tys. uczestników) i zmiany w organizacji ruchu',
        paragraphs: [
          'Punktualnie o godzinie 11:11 wystartował poznański Bieg Niepodległości na dystansie 10 kilometrów, w którym udział wzięło ponad 12 000 zawodników. Trasa prowadziła ulicą Grunwaldzką od rejonu skrzyżowania z ul. Śniadeckich do ul. Cmentarnej i z powrotem, co wiązało się z czasowym wyłączeniem ruchu kołowego i zmianami tras linii komunikacji miejskiej [4: epoznan.pl].'
        ]
      },
      {
        heading: 'Przebieg 5. Poznańskiego Marszu Niepodległości',
        paragraphs: [
          'O godzinie 14:00 z Rynku Wildeckiego wyruszyła również piąta edycja poznańskiego Marszu Niepodległości pod hasłem „Łączy Nas Polska”. Według szacunków w zgromadzeniu uczestniczyło około 1 800 osób. Przemarsz był zabezpieczany przez policję i zakończył się bez odnotowania niebezpiecznych incydentów [2: epoznan.pl].'
        ]
      }
    ],
    perspectives: [
      {
        outlet: 'Radio Poznań [1]',
        angle: 'Obchody w całym regionie',
        summary: 'Relacjonuje korowód na ul. Święty Marcin, otwarcie Kopca Wolności oraz uroczystości 108. rocznicy niepodległości w Kaliszu, Koninie, Lesznie i Rawiczu.',
        url: 'https://radiopoznan.fm/informacje/pozostale/poznan-szykuje-sie-na-marsz-niepodleglosci-znamy-trase-i-haslo-tegorocznego-pochodu'
      },
      {
        outlet: 'epoznan.pl (Komunikacja i Bieg) [4]',
        angle: 'Utrudnienia i frekwencja',
        summary: 'Skupia się na logistyce 12-tysięcznego Biegu Niepodległości na ul. Grunwaldzkiej, kolejkach na Kopiec Wolności i zabezpieczeniu miasta.',
        url: 'https://epoznan.pl/news-news-181864-wielki_bieg_niepodleglosci_w_poznaniu_na_starcie_12_tysiecy_uczestnikow'
      },
      {
        outlet: 'epoznan.pl (Relacja z Marszu) [2]',
        angle: 'Przebieg zgromadzeń',
        summary: 'Podaje szacunkową frekwencję 1 800 osób na marszu z Rynku Wildeckiego, cytuje skandowane hasła i potwierdza brak incydentów siłowych.',
        url: 'https://epoznan.pl/news-news-181878-marsz_niepodleglosci_przeszedl_przez_poznan_raz_sierpem_raz_mlotem_czerwona_holote'
      }
    ],
    sources: ['Radio Poznań', 'epoznan.pl'],
    corrections: []
  },
  {
    id: 3,
    path: '/Polska/Polityka',
    seo_url: '/Polska/Polityka/projekt-przywracajacy-handel-w-niedziele-komisja-sejmowa',
    seo_title: 'Projekt nowelizacji zakazu handlu w niedzielę wraca do komisji sejmowej: propozycja dwóch niedziel handlowych w miesiącu',
    published_iso: '2026-11-05T12:15:00+01:00',
    display_date: '5 listopada 2026',
    status: 'AUTO_PUBLISHED',
    fact_agreement_pct: 93,
    admin_note: '',
    metrics: [
      { label: 'Proponowany model', val: '1. i 3. niedziela miesiąca' },
      { label: 'Obowiązujący zakaz', val: 'od 2018 roku (8 lat)' },
      { label: 'Status projektu', val: 'Komisja sejmowa' },
      { label: 'Ryzyko legislacyjne', val: 'Zapowiedź weta prezydenta' }
    ],
    declickbait: [
      {
        outlet: 'Portal informacyjny',
        original: 'Koniec zakazu handlu w niedzielę?! Przełom w Sejmie!',
        fact: 'Projekt po dwóch latach w komisji zakłada jedynie częściowe otwarcie sklepów (w 1. i 3. niedzielę miesiąca), a jego wejście w życie wymaga jeszcze większości w Sejmie i podpisu prezydenta.'
      }
    ],
    full_sections: [
      {
        heading: 'Założenia projektu poselskiego po dwóch latach w komisji',
        paragraphs: [
          'Sejmowa komisja wraca do prac nad projektem nowelizacji ustawy ograniczającej handel w niedziele, która obowiązuje od 2018 roku. Projekt złożony pierwotnie w 2024 roku przez Ryszarda Petru (obecnie klub Centrum) zakłada dopuszczenie handlu w pierwszą i trzecią niedzielę każdego miesiąca [1: Rzeczpospolita].',
          'Wnioskodawcy zapowiadają gotowość do korekt podczas prac komisji, wskazując na postulaty części branży handlowej oraz utrzymanie gwarancji podwójnego wynagrodzenia lub dnia wolnego dla pracowników handlu [1: Rzeczpospolita].'
        ]
      },
      {
        heading: 'Stanowisko Polskiej Organizacji Handlu i Dystrybucji oraz badania społeczne',
        paragraphs: [
          'Z przytoczonych badań Shopfully wynika, że po ośmiu latach obowiązywania przepisów grupa zwolenników pełnego otwarcia sklepów we wszystkie niedziele spadła poniżej liczby osób przyzwyczajonych do obecnych ograniczeń, natomiast najwyższe poparcie dla liberalizacji utrzymuje się w grupie wiekowej 45–64 lata [1: Rzeczpospolita].',
          'Prezes Polskiej Organizacji Handlu i Dystrybucji (POHiD) Renata Juszkiewicz wskazuje, że odmienne stanowiska prezentują sieci spożywcze oraz sklepy z ofertą przemysłową w galeriach handlowych, a kluczową barierą dla uchwalenia ustawy pozostaje zapowiadany sprzeciw prezydenta Karola Nawrockiego [1: Rzeczpospolita].'
        ]
      }
    ],
    perspectives: [
      {
        outlet: 'Rzeczpospolita (Ekonomia i Handel) [1]',
        angle: 'Analiza legislacyjna i rynkowa',
        summary: 'Omawia szczegóły projektu (1. i 3. niedziela miesiąca), wyniki badań konsumenckich Shopfully oraz stanowisko POHiD.',
        url: 'https://www.rp.pl/handel/art45448841-handel-w-niedziele-moze-wrocic-projektem-zajmie-sie-sejm'
      },
      {
        outlet: 'Wnioskodawcy (Klub Centrum)',
        angle: 'Argumentacja deregulacyjna',
        summary: 'Wskazuje na korzyści dla gospodarki, studentów oraz pracowników niepełnoetatowych przy zachowaniu dwóch wolnych niedziel w miesiącu.',
        url: 'https://www.rp.pl/handel/art45448841-handel-w-niedziele-moze-wrocic-projektem-zajmie-sie-sejm'
      },
      {
        outlet: 'Związki zawodowe i Pałac Prezydencki',
        angle: 'Argumentacja społeczna',
        summary: 'Podnosi sprzeciw pracowników handlu wobec pracy w niedziele i wskazuje na wysokie prawdopodobieństwo weta prezydenckiego.',
        url: 'https://www.rp.pl/handel/art45448841-handel-w-niedziele-moze-wrocic-projektem-zajmie-sie-sejm'
      }
    ],
    sources: ['Rzeczpospolita'],
    corrections: []
  },
  // W KOLEJCE REDAKCYJNEJ DO AKCEPTACJI (1) - PRAWDZIWY PRZYKŁAD WERYFIKACJI DEKLARACJI RZĄDOWEJ
  {
    id: 4,
    path: '/Polska/Energetyka',
    seo_url: '/Polska/Energetyka/ceny-gazu-i-pradu-tge-zapowiedz-rzadu-deficyt-6-7-proc',
    seo_title: 'Zapowiedź rządowego pakietu ws. cen gazu i deklaracja o niższym deficycie (6,7% PKB) na tle wzrostów notowań na TGE',
    published_iso: '2026-11-06T14:10:00+01:00',
    display_date: '6 listopada 2026',
    status: 'PENDING_ADMIN',
    fact_agreement_pct: 68,
    admin_note: 'Weryfikacja redakcyjna: Minister Finansów deklaruje rozwiązanie ws. cen gazu w ciągu 10 dni bez podania konkretnych kwot i źródeł finansowania, przy jednoczesnym utrzymaniu wysokiego deficytu 6,7% PKB oraz najwyższych od miesięcy notowań na TGE.',
    metrics: [
      { label: 'Deklarowany termin', val: '10 dni na projekt' },
      { label: 'Notowania na TGE', val: 'Szczyt październikowy' },
      { label: 'Deficyt sektora (MF)', val: '~6,7% PKB' },
      { label: 'Konkretny projekt ustawy', val: 'Brak opublikowanego druku' }
    ],
    declickbait: [
      {
        outlet: 'Deklaracja medialna',
        original: 'Rząd nie chce obciążać Polaków! Nowe rozwiązania dotyczące cen gazu już za chwilę!',
        fact: 'Minister finansów zapowiedział przedstawienie propozycji w ciągu 10 dni, jednak na ten moment nie opublikowano projektu ustawy ani kwot osłonowych, podczas gdy październikowe ceny na TGE osiągnęły wielomiesięczne maksima.'
      }
    ],
    full_sections: [
      {
        heading: 'Deklaracja Ministra Finansów i Gospodarki ws. cen gazu',
        paragraphs: [
          'Minister finansów i gospodarki Andrzej Domański zapowiedział, że w ciągu około 10 dni rząd przedstawi propozycję dotyczącą cen gazu dla gospodarstw domowych, wypracowywaną wspólnie z ministrem energii oraz ministrem aktywów państwowych. Szef resortu odmówił jednak podania szczegółowych parametrów finansowych przed zakończeniem prac międzyresortowych [1: Energia RP.pl].'
        ]
      },
      {
        heading: 'Dane rynkowe z Towarowej Giełdy Energii (TGE) oraz stan deficytu budżetowego',
        paragraphs: [
          'Z podsumowania październikowego handlu na Towarowej Giełdzie Energii (TGE) wynika, że hurtowe ceny energii elektrycznej i gazu w Polsce wzrosły w związku z sytuacją na Bliskim Wschodzie do najwyższych poziomów od wielu miesięcy [1: Energia RP.pl].',
          'Równocześnie minister poinformował, że tegoroczny deficyt wyniesie około 6,7% PKB (nieco mniej od pierwotnych prognoz dzięki wpływom z VAT i CIT, lecz nadal na wysokim poziomie wymagającym podwyżek podatków sektorowych) [1: Energia RP.pl].'
        ]
      }
    ],
    perspectives: [
      {
        outlet: 'Deklaracja MF (Andrzej Domański) [1]',
        angle: 'Zapowiedź rządowa',
        summary: 'Zapowiada przedstawienie w ciągu 10 dni rozwiązań osłonowych dla gospodarstw domowych oraz wskazuje na spadek deficytu do 6,7% PKB.',
        url: 'https://energia.rp.pl/gaz/art45455051-nowe-rozwiazania-dotyczace-cen-gazu-coraz-blizej-rzad-nie-chce-obciazac-polakow'
      },
      {
        outlet: 'Energia RP.pl / Dane TGE [1]',
        angle: 'Dane giełdowe i budżetowe',
        summary: 'Zestawia brak konkretnych szczegółów projektu z październikowym szczytem cen gazu i prądu na Towarowej Giełdzie Energii.',
        url: 'https://energia.rp.pl/gaz/art45455051-nowe-rozwiazania-dotyczace-cen-gazu-coraz-blizej-rzad-nie-chce-obciazac-polakow'
      }
    ],
    sources: ['Energia RP.pl', 'Dane TGE'],
    corrections: []
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
  return `
    <article ${catAttr(art)} data-id="${art.id}" onclick="openArticle(${art.id})" tabindex="0" onkeydown="if(event.key==='Enter')openArticle(${art.id})">
      <div class="story-card" style="border-top-color:var(--cat)">
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

  const leadHtml = lead ? `
    <article ${catAttr(lead)} style="display:block">
      <div class="lead-story" style="border-top-color:var(--cat)" onclick="openArticle(${lead.id})" tabindex="0" onkeydown="if(event.key==='Enter')openArticle(${lead.id})">
        <div class="lead-main">
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

  container.innerHTML = `
    <div ${catAttr(art)}>
      <button class="back-link" onclick="closeArticle()">← Wróć do ${esc(currentPath)}</button>
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
        const normalizedLive = liveData.map((a, i) => ({
          status: 'AUTO_PUBLISHED', fact_agreement_pct: 80, admin_note: '',
          metrics: [], declickbait: [], perspectives: [], sources: [], corrections: [],
          full_sections: [], display_date: '', seo_url: '', ...a,
          id: 100 + i
        }));
        articles = [...articles, ...normalizedLive];
      }
    }
  } catch (e) {
    // Używa wbudowanych artykułów
  }
  renderPortal();
});
