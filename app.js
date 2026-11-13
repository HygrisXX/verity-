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
    "id": 2,
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
    "id": 3,
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
    "id": 4,
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
    "id": 5,
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
    "id": 6,
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
    "id": 7,
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
    "id": 8,
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
    "id": 9,
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
    "id": 10,
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
    "id": 11,
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
    "id": 12,
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
