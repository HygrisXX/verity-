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
// ARTYKUŁY ŁADOWANE DYNAMICZNIE Z articles.json (Z FALLBACKIEM SSR)
// =========================================================================
let articles = [];

const CANONICAL_ORIGIN = (
  typeof window !== 'undefined' && typeof window.VERITY_CANONICAL_ORIGIN === 'string' && window.VERITY_CANONICAL_ORIGIN
) ? window.VERITY_CANONICAL_ORIGIN.replace(/\/+$/, '') : 'https://hygrisxx.github.io/verity-';

const VOIVODESHIPS = [
  { path: '/Polska/Regiony/Dolnoslaskie', label: 'Dolnośląskie', title: 'Dolny Śląsk (dolnośląskie)', desc: 'Wiadomości z całego Dolnego Śląska: Wrocław, Wałbrzych, Legnica, Jelenia Góra, Lubin, Głogów, Zgorzelec i powiaty regionu.', outlets: ['Gazeta Wrocławska', 'Radio Wrocław', 'TVP3 Wrocław', 'Wroclaw.pl', 'Świdnica24.pl'] },
  { path: '/Polska/Regiony/Kujawsko-Pomorskie', label: 'Kujawsko-Pomorskie', title: 'Kujawsko-pomorskie', desc: 'Informacje z województwa kujawsko-pomorskiego: Bydgoszcz, Toruń, Włocławek, Grudziądz, Inowrocław i okolice.', outlets: ['Radio PiK', 'Gazeta Pomorska', 'TVP3 Bydgoszcz', 'TylkoTorun.pl'] },
  { path: '/Polska/Regiony/Lubelskie', label: 'Lubelskie', title: 'Lubelskie', desc: 'Wydarzenia z całej Lubelszczyzny: Lublin, Zamość, Chełm, Biała Podlaska, Puławy, Tomaszów Lubelski i powiaty regionu.', outlets: ['Radio Lublin', 'Kurier Lubelski', 'Lublin112.pl', 'TVP3 Lublin', 'Radio Impuls'] },
  { path: '/Polska/Regiony/Lubuskie', label: 'Lubuskie', title: 'Lubuskie', desc: 'Wiadomości z województwa lubuskiego: Zielona Góra, Gorzów Wielkopolski, Nowa Sól, Żary, Świebodzin i cały region.', outlets: ['Radio Zachód', 'Gazeta Lubuska', 'TVP3 Gorzów', 'Gorzowianin.com', 'NewsLubuski.pl', 'Radio Index', 'Pościgi.pl'] },
  { path: '/Polska/Regiony/Lodzkie', label: 'Łódzkie', title: 'Łódzkie', desc: 'Informacje z całego województwa łódzkiego: Łódź, Piotrków Trybunalski, Tomaszów Mazowiecki, Bełchatów, Pabianice, Zgierz.', outlets: ['Radio Łódź', 'Dziennik Łódzki', 'TVP3 Łódź', 'Radio ZW'] },
  { path: '/Polska/Regiony/Malopolskie', label: 'Małopolskie', title: 'Małopolska (małopolskie)', desc: 'Wydarzenia z całej Małopolski: Kraków, Tarnów, Nowy Sącz, Zakopane, Podhale, Oświęcim i powiaty województwa.', outlets: ['Radio Kraków', 'Gazeta Krakowska', 'TVP3 Kraków', 'Podhale24.pl', 'Bochnianin.pl'] },
  { path: '/Polska/Regiony/Mazowieckie', label: 'Mazowieckie', title: 'Mazowsze (mazowieckie)', desc: 'Informacje z Warszawy i całego Mazowsza: Radom, Płock, Siedlce, Ostrołęka, Ciechanów, Pruszków i powiaty regionu.', outlets: ['Warszawa w Pigułce', 'TVP3 Warszawa', 'Radio Kolor', 'PetroNews.pl', 'CoZaDzień.pl'] },
  { path: '/Polska/Regiony/Opolskie', label: 'Opolskie', title: 'Opolskie', desc: 'Wiadomości z całej Opolszczyzny: Opole, Kędzierzyn-Koźle, Nysa, Brzeg, Kluczbork i powiaty województwa.', outlets: ['Nowa Trybuna Opolska', 'TVP3 Opole', 'Opolska360.pl', 'CzasNaOpole.pl'] },
  { path: '/Polska/Regiony/Podkarpackie', label: 'Podkarpackie', title: 'Podkarpacie (podkarpackie)', desc: 'Informacje z całego Podkarpacia: Rzeszów, Przemyśl, Stalowa Wola, Mielec, Krosno, Bieszczady i powiaty regionu.', outlets: ['Radio Rzeszów', 'Nowiny24', 'TVP3 Rzeszów', 'Rzeszow-News.pl'] },
  { path: '/Polska/Regiony/Podlaskie', label: 'Podlaskie', title: 'Podlasie (podlaskie)', desc: 'Wydarzenia z całego Podlasia: Białystok, Łomża, Suwałki, Augustów, Bielsk Podlaski i powiaty regionu.', outlets: ['Kurier Poranny', 'Radio Białystok', 'TVP3 Białystok', 'Suwałki24.pl', '4Lomza.pl'] },
  { path: '/Polska/Regiony/Pomorskie', label: 'Pomorskie', title: 'Pomorze (pomorskie)', desc: 'Wiadomości z całego Pomorza: Gdańsk, Gdynia, Sopot, Trójmiasto, Słupsk, Tczew, Kaszuby i powiaty województwa.', outlets: ['Radio Gdańsk', 'Dziennik Bałtycki', 'TVP3 Gdańsk', 'GP24.pl', 'Kaszuby24.pl'] },
  { path: '/Polska/Regiony/Slaskie', label: 'Śląskie', title: 'Śląsk (śląskie)', desc: 'Informacje z całego województwa śląskiego: Katowice, Częstochowa, Sosnowiec, Gliwice, Bielsko-Biała, Rybnik, Tychy.', outlets: ['TVS Śląsk', 'Dziennik Zachodni', 'TVP3 Katowice', 'Radio 90', 'Radio Piekary', 'Bielsko.biala.pl', 'Beskidzka24.pl'] },
  { path: '/Polska/Regiony/Swietokrzyskie', label: 'Świętokrzyskie', title: 'Świętokrzyskie', desc: 'Wiadomości z całego województwa świętokrzyskiego: Kielce, Ostrowiec Świętokrzyski, Starachowice, Sandomierz i powiaty regionu.', outlets: ['Radio Kielce', 'Echo Dnia Kielce', 'TVP3 Kielce', 'Radio Ostrowiec'] },
  { path: '/Polska/Regiony/Warminsko-Mazurskie', label: 'Warmińsko-Mazurskie', title: 'Warmia i Mazury', desc: 'Informacje z Warmii i Mazur: Olsztyn, Elbląg, Ełk, Mrągowo, Iława, Ostróda, Giżycko i całe województwo.', outlets: ['Radio Olsztyn', 'TVP3 Olsztyn', 'TKO Olsztyn', 'PortEl.pl', 'info.elblag.pl'] },
  { path: '/Polska/Regiony/Wielkopolskie', label: 'Wielkopolskie', title: 'Wielkopolska (wielkopolskie)', desc: 'Wiadomości z całej Wielkopolski: Poznań, Kalisz, Konin, Piła, Leszno, Gniezno, Ostrów Wielkopolski i powiaty regionu.', outlets: ['ePoznan.pl', 'Głos Wielkopolski', 'Radio Poznań', 'TVP3 Poznań', 'Asta24.pl', 'rc.fm'] },
  { path: '/Polska/Regiony/Zachodniopomorskie', label: 'Zachodniopomorskie', title: 'Pomorze Zachodnie', desc: 'Informacje z Pomorza Zachodniego: Szczecin, Koszalin, Stargard, Kołobrzeg, Świnoujście i całe województwo.', outlets: ['Głos Szczeciński', 'Radio Szczecin', 'TVP3 Szczecin', 'GK24.pl'] }
];

const VOIVODESHIP_BY_PATH = Object.fromEntries(VOIVODESHIPS.map(v => [v.path, v]));
const VOIVODESHIP_LABELS = Object.fromEntries(VOIVODESHIPS.map(v => [v.path, v.label]));
const LEGACY_PATH_MAP = {
  '/Polska/Wroclaw': '/Polska/Regiony/Dolnoslaskie',
  '/Polska/Bydgoszcz': '/Polska/Regiony/Kujawsko-Pomorskie',
  '/Polska/Lublin': '/Polska/Regiony/Lubelskie',
  '/Polska/Lubuskie': '/Polska/Regiony/Lubuskie',
  '/Polska/Lodz': '/Polska/Regiony/Lodzkie',
  '/Polska/Krakow': '/Polska/Regiony/Malopolskie',
  '/Polska/Warszawa': '/Polska/Regiony/Mazowieckie',
  '/Polska/Opole': '/Polska/Regiony/Opolskie',
  '/Polska/Rzeszow': '/Polska/Regiony/Podkarpackie',
  '/Polska/Bialystok': '/Polska/Regiony/Podlaskie',
  '/Polska/Gdansk': '/Polska/Regiony/Pomorskie',
  '/Polska/Katowice': '/Polska/Regiony/Slaskie',
  '/Polska/Kielce': '/Polska/Regiony/Swietokrzyskie',
  '/Polska/Olsztyn': '/Polska/Regiony/Warminsko-Mazurskie',
  '/Polska/Poznan': '/Polska/Regiony/Wielkopolskie',
  '/Polska/Szczecin': '/Polska/Regiony/Zachodniopomorskie'
};

const PATH_TITLES = {
  '/Polska': 'Polska — wszystkie działy',
  '/Polska/Gospodarka': 'Gospodarka i rynek',
  '/Polska/Polityka': 'Polityka i prawo',
  '/Polska/Energetyka': 'Energetyka i klimat',
  '/Polska/Regiony': 'Regiony Polski (16 województw)',
  ...Object.fromEntries(VOIVODESHIPS.map(v => [v.path, v.title])),
  '/Swiat': 'Świat i geopolityka',
  '/Sport': 'Sport'
};

const PATH_DESCRIPTIONS = {
  '/Polska': 'Najważniejsze potwierdzone informacje z Polski — weryfikacja krzyżowa z 151 redakcji.',
  '/Polska/Gospodarka': 'Zweryfikowane informacje o gospodarce, finansach, podatkach, giełdzie i biznesie w Polsce.',
  '/Polska/Polityka': 'Fakty i decyzje legislacyjne z wielu źródeł, bez komentarzy publicystycznych.',
  '/Polska/Energetyka': 'Ceny energii, transformacja energetyczna, OZE, gaz i rynek paliw w Polsce.',
  '/Polska/Regiony': 'Najważniejsze wiadomości lokalne i regionalne ze wszystkich 16 województw Polski — nie tylko ze stolic regionów.',
  ...Object.fromEntries(VOIVODESHIPS.map(v => [v.path, v.desc])),
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
let activeOutletFilter = null;
let isNotFoundState = Boolean(typeof window !== 'undefined' && window.VERITY_IS_404);
let lastFeedHref = null;

// ===========================================================================
// NARZĘDZIA, TYPOGRAFIA POLSKA I ROUTING SEO
// ===========================================================================
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
  const isFile = typeof location !== 'undefined' && location.protocol === 'file:';
  if (!clean) return isFile ? (ROOT_URL + 'index.html') : ROOT_URL;
  return ROOT_URL + clean + (isFile ? '/index.html' : '/');
}

function articleHref(seoUrl) {
  const clean = String(seoUrl || '').replace(/^\/+|\/+$/g, '');
  const isFile = typeof location !== 'undefined' && location.protocol === 'file:';
  if (!clean) return isFile ? (ROOT_URL + 'index.html') : ROOT_URL;
  return ROOT_URL + clean + (isFile ? '/index.html' : '/');
}

const KNOWN_HUES = {
  gospodarka: 150,
  polityka: 215,
  energetyka: 38,
  regiony: 175,
  dolnoslaskie: 330,
  'kujawsko-pomorskie': 195,
  lubelskie: 105,
  lubuskie: 132,
  lodzkie: 25,
  malopolskie: 12,
  mazowieckie: 225,
  opolskie: 48,
  podkarpackie: 162,
  podlaskie: 145,
  pomorskie: 200,
  slaskie: 245,
  swietokrzyskie: 310,
  'warminsko-mazurskie': 140,
  wielkopolskie: 350,
  zachodniopomorskie: 188,
  poznan: 350,
  swiat: 265,
  sport: 15,
  prawo: 190
};
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

function toggleRegionsDrawer(forceState) {
  const drawer = document.getElementById('regionsDrawer');
  const btn = document.getElementById('regionsToggleBtn');
  if (!drawer) return;
  const open = typeof forceState === 'boolean' ? forceState : drawer.classList.contains('hidden');
  drawer.classList.toggle('hidden', !open);
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function syncNavActive() {
  let activeBtn = null;
  document.querySelectorAll('.path-chip').forEach(btn => {
    const dp = btn.getAttribute('data-path');
    const isAct = dp === currentPath || (dp === '/Polska/Regiony' && currentPath.startsWith('/Polska/Regiony/'));
    btn.classList.toggle('active', isAct);
    if (isAct) activeBtn = btn;
  });
  document.querySelectorAll('#regionsDrawer [data-region-link]').forEach(a => {
    a.classList.toggle('active', a.getAttribute('data-region-link') === currentPath);
  });
  if (activeBtn) {
    const nav = activeBtn.closest('.path-nav');
    const chipGroup = activeBtn.closest('.path-region-group') || activeBtn;
    if (nav) {
      const left = chipGroup.offsetLeft - 12;
      const right = chipGroup.offsetLeft + chipGroup.offsetWidth + 12;
      if (left < nav.scrollLeft) {
        nav.scrollLeft = Math.max(0, left);
      } else if (right > nav.scrollLeft + nav.clientWidth) {
        nav.scrollLeft = Math.max(0, right - nav.clientWidth);
      }
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
  document.querySelectorAll('#regionsDrawer [data-region-link]').forEach(a => {
    const p = a.getAttribute('data-region-link');
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

  const validCat = p => {
    const mapped = LEGACY_PATH_MAP[p] || p;
    return (mapped && PATH_TITLES[mapped]) ? mapped : '/Polska';
  };

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
  if (LEGACY_PATH_MAP[slashRel]) {
    const mapped = LEGACY_PATH_MAP[slashRel];
    return { path: mapped, articleId: null, notFound: false, recoveredUrl: pathHref(mapped) };
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
  if (articles.length === 0) {
    if (typeof location !== 'undefined' && location.protocol === 'file:' && event?.currentTarget?.tagName === 'A') {
      const rawHref = event.currentTarget.getAttribute('href') || '';
      if (rawHref && rawHref.endsWith('/')) {
        event.currentTarget.setAttribute('href', rawHref + 'index.html');
      }
    }
    return true;
  }
  if (event && event.preventDefault) event.preventDefault();
  openArticle(id, seoUrl);
  return false;
}

function openArticle(id, seoUrlOverride) {
  if (articles.length === 0) return;
  const published = articles.filter(a => a.status === 'AUTO_PUBLISHED');
  const art = published.find(a => a.id === id) || articles.find(a => a.id === id);
  if (!art) return;
  toggleRegionsDrawer(false);
  if (activeArticleId === null && !isNotFoundState) {
    lastFeedHref = location.pathname;
  }
  activeArticleId = art.id;
  activeOutletFilter = null;
  const artPath = LEGACY_PATH_MAP[art.path] || art.path;
  currentPath = PATH_TITLES[artPath] ? artPath : currentPath;
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
  if (articles.length === 0) {
    if (typeof location !== 'undefined' && location.protocol === 'file:' && event?.currentTarget?.tagName === 'A') {
      const rawHref = event.currentTarget.getAttribute('href') || '';
      if (rawHref && rawHref.endsWith('/')) {
        event.currentTarget.setAttribute('href', rawHref + 'index.html');
      }
    }
    return true;
  }
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
  if (articles.length === 0) return;
  toggleRegionsDrawer(false);
  const resolvedP = LEGACY_PATH_MAP[p] || p;
  currentPath = PATH_TITLES[resolvedP] ? resolvedP : '/Polska';
  activeArticleId = null;
  activeOutletFilter = null;
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
  if (articles.length === 0) {
    if (typeof location !== 'undefined' && location.protocol === 'file:' && event?.currentTarget?.tagName === 'A') {
      const rawHref = event.currentTarget.getAttribute('href') || '';
      if (rawHref && rawHref.endsWith('/')) {
        event.currentTarget.setAttribute('href', rawHref + 'index.html');
      }
    }
    return true;
  }
  if (event && event.preventDefault) event.preventDefault();
  toggleRegionsDrawer(false);
  activeArticleId = null;
  activeOutletFilter = null;
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
  toggleRegionsDrawer(false);
  currentView = view;
  document.getElementById('viewPublic')?.classList.toggle('hidden', view !== 'public');
  document.getElementById('viewEditorial')?.classList.toggle('hidden', view !== 'editorial');
  window.scrollTo({ top: 0 });
  renderPortal();
}

function handleSearchInput() {
  if (activeArticleId !== null) {
    activeArticleId = null;
    activeOutletFilter = null;
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
    const normArtPath = LEGACY_PATH_MAP[openArt.path] || openArt.path || '/Polska';
    const parts = normArtPath.split('/').filter(Boolean);
    const prettyCrumb = {
      Polska: 'Polska',
      Swiat: 'Świat',
      Sport: 'Sport',
      Gospodarka: 'Gospodarka',
      Polityka: 'Polityka',
      Energetyka: 'Energetyka',
      Regiony: 'Regiony',
      ...Object.fromEntries(VOIVODESHIPS.map(v => [v.path.split('/').pop(), v.label]))
    };
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
      articleSection: shortCatLabel(normArtPath),
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
      ? 'Wieloźródłowa weryfikacja i synteza informacji z 151 redakcji ogólnopolskich, regionalnych (16 województw) i branżowych. Pełna treść faktograficzna, zero clickbaitu, bezpośrednie linki do źródeł.'
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
      renderFeed(list, q, published);
    }
  }
  renderEditorialPanel(pendingArts);
  syncSeoHead(openArt, published, q);
  updateReadingProgress();
}

function shortCatLabel(path) {
  const normP = LEGACY_PATH_MAP[path] || path;
  if (VOIVODESHIP_LABELS[normP]) return VOIVODESHIP_LABELS[normP];
  const pretty = {
    Swiat: 'Świat',
    Regiony: 'Regiony',
    Poznan: 'Wielkopolskie',
    Krakow: 'Małopolskie',
    Wroclaw: 'Dolnośląskie',
    Gdansk: 'Pomorskie',
    Lodz: 'Łódzkie',
    Bialystok: 'Podlaskie',
    Rzeszow: 'Podkarpackie',
    Slaskie: 'Śląskie',
    Swietokrzyskie: 'Świętokrzyskie',
    'Warminsko-Mazurskie': 'Warmińsko-Mazurskie'
  };
  const parts = (normP || '/Polska').split('/').filter(Boolean).map(p => pretty[p] || p);
  if (parts.length <= 1) return parts[0] || 'Polska';
  if (parts[0] === 'Polska' && parts[1] === 'Regiony' && parts.length > 2) {
    return parts.slice(2).join(' · ');
  }
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

function regionStripHtml(allPublished) {
  if (currentPath !== '/Polska/Regiony' && !VOIVODESHIP_BY_PATH[currentPath]) return '';
  const counts = {};
  let totalReg = 0;
  (allPublished || []).forEach(a => {
    const ap = a.path || '';
    if (ap.startsWith('/Polska/Regiony/')) {
      counts[ap] = (counts[ap] || 0) + 1;
      totalReg += 1;
    }
  });
  const allHref = esc(pathHref('/Polska/Regiony'));
  const allCls = currentPath === '/Polska/Regiony' ? 'region-pill active' : 'region-pill';
  const pills = [
    `<a class="${allCls}" href="${allHref}" onclick="return selectPathLink(event, '/Polska/Regiony')">Wszystkie <span class="region-pill-count">${totalReg}</span></a>`
  ];
  VOIVODESHIPS.forEach(v => {
    const c = counts[v.path] || 0;
    let cls = 'region-pill';
    if (currentPath === v.path) cls += ' active';
    if (c > 0) cls += ' has-items';
    pills.push(
      `<a class="${cls}" style="--h:${pathHue(v.path)}" href="${esc(pathHref(v.path))}" onclick="return selectPathLink(event, '${esc(v.path)}')">` +
      `${esc(v.label)}<span class="region-pill-count">${c}</span></a>`
    );
  });
  return `<nav class="region-strip" aria-label="Wybierz województwo">${pills.join('')}</nav>`;
}

function renderFeed(list, q, allPublished = null) {
  const container = document.getElementById('articlesFeed');
  if (!container) return;

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
  const stripHtml = q ? '' : regionStripHtml(allPublished || articles.filter(a => a.status === 'AUTO_PUBLISHED'));

  const syncStripScroll = () => {
    const activePill = container.querySelector('.region-strip .region-pill.active');
    if (activePill && activePill.parentElement) {
      const strip = activePill.parentElement;
      const pLeft = activePill.offsetLeft - 12;
      const pRight = activePill.offsetLeft + activePill.offsetWidth + 12;
      if (pLeft < strip.scrollLeft) strip.scrollLeft = Math.max(0, pLeft);
      else if (pRight > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = Math.max(0, pRight - strip.clientWidth);
    }
  };

  if (!list.length) {
    if (q) {
      container.innerHTML = `<div class="empty-state">Brak opracowań dla zapytania „${esc(q)}”.</div>`;
      return;
    }
    const vInfo = VOIVODESHIP_BY_PATH[currentPath];
    if (vInfo) {
      const outletsTxt = esc(vInfo.outlets.join(', '));
      const allRegHref = esc(pathHref('/Polska/Regiony'));
      container.innerHTML = heading + stripHtml +
        `<div class="empty-state">` +
        `<p>Brak bieżących opracowań w dziale <strong>${esc(vInfo.title)}</strong>.</p>` +
        `<p class="empty-sub">Monitorowane redakcje w tym województwie: ${outletsTxt}. Kolejne depesze ze stolicy i powiatów regionu pojawiają się w aktualizacjach cyklicznych.</p>` +
        `<p style="margin-top:0.9rem"><a class="btn-outline" style="text-decoration:none;display:inline-block" href="${allRegHref}" onclick="return selectPathLink(event, '/Polska/Regiony')">← Zobacz wiadomości ze wszystkich 16 województw</a></p>` +
        `</div>`;
      syncStripScroll();
      return;
    }
    container.innerHTML = heading + stripHtml + `<div class="empty-state">Brak opracowań w dziale <strong>${esc(currentPath)}</strong>.</div>`;
    syncStripScroll();
    return;
  }

  const useLead = !q && list.length >= 3;
  const lead = useLead ? list[0] : null;
  const rest = useLead ? list.slice(1) : list;

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

  container.innerHTML = heading + stripHtml + leadHtml +
    (rest.length ? `<div class="cards-grid${lead ? ' after-lead' : ''}">${rest.map(storyCardHtml).join('')}</div>` : '');
  syncStripScroll();
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

function extractParagraphOutlets(rawText, heading = '', fallbackSources = []) {
  const outlets = [];
  const seen = new Set();
  const re = /\[Źródło:\s*([^\]]+)\]/g;
  let m;
  while ((m = re.exec(rawText || '')) !== null) {
    m[1].split(',').forEach(part => {
      const name = part.trim();
      if (name && !seen.has(name)) {
        seen.add(name);
        outlets.push(name);
      }
    });
  }
  if (!outlets.length && heading) {
    const hTrim = heading.trim();
    const mRel = hTrim.match(/^Relacja źródłowa\s*\(([^)]+)\)/);
    if (mRel && mRel[1].trim()) {
      outlets.push(mRel[1].trim());
    } else if (hTrim.startsWith('Relacja źródłowa:')) {
      const name = hTrim.slice('Relacja źródłowa:'.length).trim();
      if (name) outlets.push(name);
    }
  }
  if (!outlets.length && Array.isArray(fallbackSources) && fallbackSources.length === 1) {
    outlets.push(fallbackSources[0]);
  }
  return outlets;
}

function toggleAllPerspectives(targetEl, forceExpand) {
  const box = (targetEl && targetEl.closest) ? targetEl.closest('.perspectives-box') : document.querySelector('.perspectives-box');
  if (!box) return;
  const expand = typeof forceExpand === 'boolean' ? forceExpand : !box.classList.contains('is-expanded');
  box.classList.toggle('is-expanded', expand);
  const btn = box.querySelector('.perspectives-expand-btn');
  if (btn) {
    const total = parseInt(btn.getAttribute('data-total') || '0', 10) || box.querySelectorAll('.perspective-col').length;
    btn.setAttribute('aria-expanded', expand ? 'true' : 'false');
    btn.textContent = expand ? 'Zwiń do 4 głównych ujęć' : `Pokaż wszystkie ujęcia (${total})`;
  }
}

function setArticleOutletFilter(outlet) {
  const cleanTarget = (outlet || '').trim();
  const nextOutlet = (cleanTarget && activeOutletFilter === cleanTarget) ? null : (cleanTarget || null);
  activeOutletFilter = nextOutlet;

  const root = document.getElementById('articlesFeed') || document;
  root.querySelectorAll('.source-filter-chip[data-outlet-filter]').forEach(btn => {
    const val = (btn.getAttribute('data-outlet-filter') || '').trim();
    const isAct = nextOutlet ? (val === nextOutlet) : (val === '');
    btn.classList.toggle('active', isAct);
    btn.setAttribute('aria-pressed', isAct ? 'true' : 'false');
  });

  const allParas = Array.from(root.querySelectorAll('.article-sections .section-paragraph'));
  let matchCount = 0;
  let firstMatchEl = null;

  allParas.forEach(p => {
    if (!nextOutlet) {
      p.classList.remove('is-source-match', 'is-source-dimmed');
      return;
    }
    const outlets = (p.getAttribute('data-outlets') || '')
      .split('|')
      .map(s => s.trim())
      .filter(Boolean);
    const isMatch = outlets.includes(nextOutlet);
    p.classList.toggle('is-source-match', isMatch);
    p.classList.toggle('is-source-dimmed', !isMatch);
    if (isMatch) {
      matchCount += 1;
      if (!firstMatchEl) firstMatchEl = p;
    }
  });

  root.querySelectorAll('.article-sections section').forEach(sec => {
    if (!nextOutlet) {
      sec.classList.remove('is-sec-dimmed');
      return;
    }
    const hasMatch = Boolean(sec.querySelector('.section-paragraph.is-source-match'));
    sec.classList.toggle('is-sec-dimmed', !hasMatch);
  });

  let activePerspCol = null;
  root.querySelectorAll('.perspectives-grid .perspective-col[data-outlet]').forEach(col => {
    const colOutlet = (col.getAttribute('data-outlet') || '').trim();
    const isAct = Boolean(nextOutlet && colOutlet === nextOutlet);
    col.classList.toggle('is-source-active', isAct);
    if (isAct) activePerspCol = col;
  });

  if (activePerspCol && activePerspCol.classList.contains('is-collapsed-persp')) {
    const box = activePerspCol.closest('.perspectives-box');
    const expBtn = box && box.querySelector('.perspectives-expand-btn');
    if (box && !box.classList.contains('is-expanded')) {
      toggleAllPerspectives(expBtn || box, true);
    }
  }

  root.querySelectorAll('.perspective-filter-btn[data-outlet-btn]').forEach(btn => {
    const val = (btn.getAttribute('data-outlet-btn') || '').trim();
    const isAct = Boolean(nextOutlet && val === nextOutlet);
    btn.classList.toggle('active', isAct);
    btn.setAttribute('aria-pressed', isAct ? 'true' : 'false');
    btn.textContent = isAct ? '✓ Wyróżniono w tekście' : 'Wyróżnij w tekście';
  });

  const statusEl = document.getElementById('sourceFilterStatus');
  if (statusEl) {
    if (!nextOutlet) {
      statusEl.classList.add('hidden');
      statusEl.innerHTML = '';
    } else {
      statusEl.classList.remove('hidden');
      const total = allParas.length;
      const msg = matchCount > 0
        ? `Filtr: <strong>${esc(nextOutlet)}</strong> · Wyróżniono ${matchCount} z ${total} akapitów`
        : `Redakcja <strong>${esc(nextOutlet)}</strong> występuje w leadzie lub ujęciach poniżej (0 odrębnych akapitów w sekcjach)`;
      statusEl.innerHTML = `<span class="source-filter-status-text">${msg}</span><button type="button" class="source-filter-reset" onclick="setArticleOutletFilter('')">Pokaż wszystkie</button>`;
    }
  }

  if (nextOutlet) {
    const anchor = firstMatchEl || root.querySelector('.source-filter-bar');
    if (anchor && typeof anchor.getBoundingClientRect === 'function') {
      const rect = anchor.getBoundingClientRect();
      if (rect.top < 80 || rect.top > window.innerHeight - 90) {
        anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }
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

  const srcs = art.sources || [];
  const persps = art.perspectives || [];
  const linked = persps.filter(p => p.url);
  const uniqueLinks = [];
  linked.forEach(p => { if (!uniqueLinks.some(u => u.url === p.url)) uniqueLinks.push(p); });

  const mins = readingMinutes(art);
  const secs = art.full_sections || [];
  const { showLede, summaryLead, skipFirstPara, firstParaOverride } = reconcileLeadAndFirstPara(art);

  const ledeHtml = showLede
    ? `<p class="article-lede">${esc(plTypography(summaryLead))}</p>`
    : `<p class="article-context-line">Synteza faktograficzna na podstawie ${sourcesLabel(srcs.length)} · Bezpośrednie odnośniki do publikacji źródłowych poniżej.</p>`;

  let dropcapApplied = false;
  let totalRenderedParas = 0;
  const outletParaCounts = {};
  const sectionsHtml = secs.map((sec, si) => {
    const secHeading = sec.heading || '';
    const pHtmls = [];
    (sec.paragraphs || []).forEach((rawP, pi) => {
      if (si === 0 && pi === 0) {
        if (skipFirstPara) return;
        if (firstParaOverride) rawP = firstParaOverride;
      }
      const pOutlets = extractParagraphOutlets(rawP, secHeading, srcs);
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
      totalRenderedParas += 1;
      pOutlets.forEach(o => { outletParaCounts[o] = (outletParaCounts[o] || 0) + 1; });
      const outletsAttr = pOutlets.length ? ` data-outlets="${esc(pOutlets.join('|'))}"` : '';
      pHtmls.push(`<p class="${pClasses.join(' ')}"${outletsAttr}>${formatCitations(esc(plTypography(pText)), persps)}</p>`);
    });
    if (!pHtmls.length) return '';
    return `
      <section data-sec-idx="${si}">
        <h2 class="section-heading" id="sec_${art.id}_${si}">${esc(secHeading)}</h2>
        ${pHtmls.join('')}
      </section>`;
  }).join('');

  const orderedOutlets = [];
  const seenOrdered = new Set();
  persps.forEach(p => {
    const oName = (p.outlet || '').trim();
    if (oName && !seenOrdered.has(oName)) {
      seenOrdered.add(oName);
      orderedOutlets.push(oName);
    }
  });
  srcs.forEach(oName => {
    const cleanO = (oName || '').trim();
    if (cleanO && !seenOrdered.has(cleanO)) {
      seenOrdered.add(cleanO);
      orderedOutlets.push(cleanO);
    }
  });

  const sourceFilterBarHtml = (srcs.length >= 2 && totalRenderedParas > 0 && orderedOutlets.length) ? `
    <div class="source-filter-bar" role="region" aria-label="Filtruj relacje według redakcji">
      <div class="source-filter-head">
        <span class="source-filter-label">Filtruj wg redakcji</span>
        <span class="source-filter-hint">Kliknij źródło, aby wyróżnić jego ustalenia w tekście</span>
      </div>
      <div class="source-filter-pills">
        <button type="button" class="source-filter-chip active" data-outlet-filter="" aria-pressed="true" onclick="setArticleOutletFilter(this.getAttribute('data-outlet-filter'))">Wszystkie <span class="source-chip-count">(${totalRenderedParas})</span></button>
        ${orderedOutlets.map(oName => {
          const cnt = outletParaCounts[oName] || 0;
          const cls = cnt === 0 ? 'source-filter-chip is-zero-paras' : 'source-filter-chip';
          return `<button type="button" class="${cls}" data-outlet-filter="${esc(oName)}" aria-pressed="false" onclick="setArticleOutletFilter(this.getAttribute('data-outlet-filter'))">${esc(oName)} <span class="source-chip-count">(${cnt})</span></button>`;
        }).join('')}
      </div>
      <div id="sourceFilterStatus" class="source-filter-status hidden" aria-live="polite"></div>
    </div>` : '';

  const heroThumb = art.thumbnail_url ? `
    <div class="article-hero-wrap">
      <div class="thumb-fallback" aria-hidden="true"><span class="thumb-fallback-label">${esc(shortCatLabel(art.path))}</span><span class="thumb-fallback-mark">V</span></div>
      <img src="${esc(art.thumbnail_url)}" alt="${esc(art.seo_title)}" class="article-hero-img" loading="eager" referrerpolicy="no-referrer" onerror="this.parentElement.remove()" />
    </div>` : '';

  const asideVerifHtml = (srcs.length >= 2 && art.fact_agreement_pct != null)
    ? `
      <div class="aside-card">
        <div class="aside-title">Zgodność danych</div>
        <div class="big-meter meter ${meterClass(art.fact_agreement_pct)}">${art.fact_agreement_pct}%<small>${sourcesLabel(srcs.length)}</small></div>
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
  const perspSubtitle = srcs.length >= 2
    ? `${sourcesLabel(srcs.length)} · kliknij wybraną, by wyróżnić jej ustalenia`
    : `Źródło: ${srcs.map(esc).join(', ')}`;

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

          ${sourceFilterBarHtml}

          <div class="article-sections">
            ${sectionsHtml}
          </div>

          ${persps.length ? `
          <div class="perspectives-box">
            <div class="perspectives-header">
              <span class="perspectives-title">Kto jak to przedstawia?</span>
              <span class="perspectives-sources">${perspSubtitle}</span>
            </div>
            <div class="perspectives-grid">
              ${persps.map((p, pIdx) => {
                const oRaw = (p.outlet || '').trim();
                const link = p.url ? `<a class="perspective-link" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Otwórz artykuł źródłowy ↗</a>` : '';
                const filterBtn = (srcs.length >= 2 && oRaw)
                  ? `<button type="button" class="perspective-filter-btn" data-outlet-btn="${esc(oRaw)}" onclick="setArticleOutletFilter(this.getAttribute('data-outlet-btn'))">Wyróżnij w tekście</button>`
                  : '';
                const actionsHtml = (link || filterBtn) ? `<div class="perspective-actions">${link}${filterBtn}</div>` : '';
                const colCls = pIdx >= 4 ? 'perspective-col is-collapsed-persp' : 'perspective-col';
                return `
                <div class="${colCls}" data-outlet="${esc(oRaw)}">
                  <div class="perspective-head">
                    <span class="outlet-mono" aria-hidden="true">${esc(outletMonogram(oRaw))}</span>
                    <div>
                      <div class="perspective-outlet">${esc(oRaw)}</div>
                      <div class="perspective-angle">${esc(p.angle || 'Depesza źródłowa')}</div>
                    </div>
                  </div>
                  <p class="perspective-summary">${esc(plTypography(p.summary))}</p>
                  ${actionsHtml}
                </div>`;
              }).join('')}
            </div>
            ${persps.length > 4 ? `
              <div class="perspectives-more-wrap">
                <button type="button" class="perspectives-expand-btn" aria-expanded="false" data-total="${persps.length}" onclick="toggleAllPerspectives(this)">Pokaż wszystkie ujęcia (${persps.length})</button>
              </div>` : ''}
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
  toggleRegionsDrawer(false);
  activeOutletFilter = null;
  if (e.state && (e.state.path !== undefined || e.state.articleId !== undefined)) {
    const stP = LEGACY_PATH_MAP[e.state.path] || e.state.path;
    currentPath = PATH_TITLES[stP] ? stP : '/Polska';
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
    activeOutletFilter = null;
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
  } else if (e.key === 'Escape') {
    const drawer = document.getElementById('regionsDrawer');
    if (drawer && !drawer.classList.contains('hidden')) {
      e.preventDefault();
      toggleRegionsDrawer(false);
      document.getElementById('regionsToggleBtn')?.focus();
      return;
    }
    if (document.activeElement && document.activeElement.id === 'searchInput') {
      const si = document.getElementById('searchInput');
      if (si && si.value) {
        e.preventDefault();
        clearSearch();
        return;
      }
    }
    if (activeOutletFilter) {
      e.preventDefault();
      setArticleOutletFilter('');
    }
  }
});

document.addEventListener('click', e => {
  const drawer = document.getElementById('regionsDrawer');
  const toggleBtn = document.getElementById('regionsToggleBtn');
  if (!drawer || drawer.classList.contains('hidden')) return;
  if (!drawer.contains(e.target) && (!toggleBtn || !toggleBtn.contains(e.target))) {
    toggleRegionsDrawer(false);
  }
});

window.addEventListener('DOMContentLoaded', async () => {
  applyTheme(currentThemeMode);
  syncStaticNavHrefs();
  articles = articles.map(a => ({ ...a, path: LEGACY_PATH_MAP[a.path] || a.path }));
  const dateEl = document.getElementById('todayDateLabel');
  if (dateEl) {
    try {
      dateEl.textContent = new Intl.DateTimeFormat('pl-PL', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      }).format(new Date());
    } catch (e) {}
  }
  let loadedFromRemote = false;
  try {
    const resp = await fetch(resolveAsset('articles.json'), { cache: 'no-store' });
    if (resp.ok) {
      const liveData = await resp.json();
      if (Array.isArray(liveData) && liveData.length > 0) {
        const fresh = liveData.filter(a => (a.published_iso || '').slice(0, 10) >= '2026-11-13');
        if (fresh.length > 0) {
          loadedFromRemote = true;
          articles = fresh.map((a, i) => {
            const srcs = a.sources || [];
            const normP = LEGACY_PATH_MAP[a.path] || a.path;
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
              path: normP,
              fact_agreement_pct: srcs.length >= 2 ? (a.fact_agreement_pct || 85) : null
            };
          });
        }
      }
    }
  } catch (e) {
    // Używa danych SSR przy braku dostępu do articles.json (np. file://)
  }
  if (!loadedFromRemote && articles.length === 0) {
    const feedEl = document.getElementById('articlesFeed');
    if (feedEl && feedEl.children.length > 0) {
      let ssrPath = window.VERITY_INITIAL_PATH || '/Polska';
      if (window.VERITY_INITIAL_ARTICLE_URL) {
        const parts = window.VERITY_INITIAL_ARTICLE_URL.replace(/^\/+|\/+$/g, '').split('/');
        if (parts.length > 1) {
          ssrPath = '/' + parts.slice(0, -1).join('/');
        }
      }
      ssrPath = LEGACY_PATH_MAP[ssrPath] || ssrPath;
      currentPath = PATH_TITLES[ssrPath] ? ssrPath : '/Polska';
      const secMatch = document.querySelector('[id^="sec_"]')?.id?.match(/^sec_(\d+)_/);
      const corrMatch = document.querySelector('button[onclick^="toggleCorr("]')?.getAttribute('onclick')?.match(/\d+/);
      activeArticleId = secMatch ? parseInt(secMatch[1], 10) : (corrMatch ? parseInt(corrMatch[0], 10) : null);
      isNotFoundState = Boolean(window.VERITY_IS_404);
      syncNavActive();
      updateReadingProgress();
      return;
    }
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


