#!/usr/bin/env node
/**
 * End-to-End Testy przeglądarkowe (Headless Chromium przez CDP) dla portalu VERITY.
 * Sprawdza: HTTP 200 dla stron SSR/XML, nawigację History API, brak duplikacji leadu,
 * typografię polską (\u00A0), dynamiczne JSON-LD / robots noindex, kopiowanie linku,
 * pasek postępu czytania, brak poziomego przepełnienia na desktop (1440px) i mobile (390px),
 * oraz zapisuje zrzuty ekranu do podanego katalogu (lub /tmp).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = process.argv[2] ? path.resolve(process.argv[2]) : path.join(os.tmpdir(), 'verity_e2e_shots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

function resolveChromeBinary() {
  const envBin = process.env.CHROME_BIN || process.env.CHROME_PATH || process.env.CHROMIUM_BIN;
  if (envBin && fs.existsSync(envBin)) return envBin;
  for (const name of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
    try {
      const resolved = execFileSync('which', [name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (resolved) return resolved;
    } catch {}
  }
  for (const absPath of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable']) {
    if (fs.existsSync(absPath)) return absPath;
  }
  throw new Error('Nie znaleziono binarki Chromium/Google Chrome (ustaw CHROME_BIN lub zainstaluj chromium/google-chrome).');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let reqPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (reqPath === '/verity-' || reqPath.startsWith('/verity-/')) {
        reqPath = reqPath.slice('/verity-'.length) || '/';
      }
      let fsPath = path.join(ROOT_DIR, reqPath.replace(/^\/+/, ''));
      if (!fsPath.startsWith(ROOT_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      if (fs.existsSync(fsPath) && fs.statSync(fsPath).isDirectory()) {
        fsPath = path.join(fsPath, 'index.html');
      }
      if (fs.existsSync(fsPath) && fs.statSync(fsPath).isFile()) {
        const ext = path.extname(fsPath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        fs.createReadStream(fsPath).pipe(res);
        return;
      }
      const fallback404 = path.join(ROOT_DIR, '404.html');
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      if (fs.existsSync(fallback404)) fs.createReadStream(fallback404).pipe(res);
      else res.end('Not found');
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function httpGetDirect(urlStr) {
  return new Promise((resolve, reject) => {
    http.get(urlStr, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    }).on('error', reject);
  });
}

async function launchChromium() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verity-chr-'));
  const chromeBin = resolveChromeBinary();
  const proc = spawn(chromeBin, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-proxy-server',
    '--disable-background-networking',
    `--user-data-dir=${userDataDir}`,
    '--remote-debugging-port=0',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  const wsBrowserUrl = await new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
      reject(new Error(`Chromium startup timeout after 30s (${chromeBin}): ${buf.slice(-400)}`));
    }, 30000);
    proc.stderr.on('data', d => {
      buf += d.toString();
      const m = buf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    proc.on('exit', code => {
      clearTimeout(timer);
      reject(new Error(`Chromium exited early with code ${code}: ${buf}`));
    });
  });

  const baseHttp = wsBrowserUrl.replace('ws://', 'http://').replace(/\/devtools\/browser\/.*/, '');
  const listResp = await httpGetDirect(`${baseHttp}/json/list`);
  const targets = JSON.parse(listResp.body);
  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  if (!pageTarget?.webSocketDebuggerUrl) throw new Error('No page target in Chromium');

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });

  let seq = 1;
  const pending = new Map();
  const consoleErrors = [];
  const pageExceptions = [];

  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(`${msg.error.message} (${msg.error.code})`));
      else res(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      pageExceptions.push(msg.params?.exceptionDetails?.text || 'JS exception');
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
      const txt = (msg.params.args || []).map(a => a.value || a.description || '').join(' ');
      // Ignoruj błędy zewnętrznych zasobów (czcionki/obrazki w izolowanej VM bez dostępu do sieci)
      if (!txt.includes('Failed to load resource') && !txt.includes('ERR_')) {
        consoleErrors.push(txt);
      }
    }
  });

  function cdp(method, params = {}) {
    const id = seq++;
    return new Promise((res, rej) => {
      pending.set(id, { res, rej });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  async function evalJs(expr) {
    const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      throw new Error(`Eval exception: ${r.exceptionDetails.text} | ${r.exceptionDetails.exception?.description || ''}`);
    }
    return r.result?.value;
  }

  async function goto(url) {
    await cdp('Page.navigate', { url });
    await new Promise(r => setTimeout(r, 450));
    for (let i = 0; i < 20; i++) {
      const ready = await evalJs("document.readyState === 'complete' && document.querySelectorAll('#articlesFeed').length > 0");
      if (ready) break;
      await new Promise(r => setTimeout(r, 150));
    }
    await new Promise(r => setTimeout(r, 350));
  }

  async function screenshot(filename) {
    const res = await cdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SCREENSHOT_DIR, filename), Buffer.from(res.data, 'base64'));
  }

  async function cleanup() {
    try { ws.close(); } catch {}
    try { proc.kill('SIGKILL'); } catch {}
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  }

  return { cdp, evalJs, goto, screenshot, cleanup, consoleErrors, pageExceptions };
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function run() {
  const articles = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'articles.json'), 'utf8'));
  const publishedArticles = articles.filter(a => (a.status || 'AUTO_PUBLISHED') === 'AUTO_PUBLISHED');
  const pendingArticles = articles.filter(a => a.status === 'PENDING_ADMIN');
  const sampleRichMulti = publishedArticles.find(a => (a.perspectives || []).length >= 5 && (a.full_sections || []).length >= 2)
    || publishedArticles.find(a => (a.perspectives || []).length >= 5)
    || publishedArticles.find(a => (a.sources || []).length >= 2 && (a.full_sections || []).length >= 2)
    || publishedArticles[0];
  const sampleMulti = publishedArticles.find(a => (a.sources || []).length >= 2 && (a.full_sections || []).length >= 2) || sampleRichMulti;
  const sampleSingle = publishedArticles.find(a => (a.sources || []).length === 1) || publishedArticles[1];
  const sampleDossier = publishedArticles.find(a => (a.dossier_items || []).length >= 2);
  const sampleNoThumb = publishedArticles.find(a => !a.thumbnail_url);

  const { server, port } = await startStaticServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  let browser = null;

  try {
    // 1. Testy HTTP 200 / 404 na serwerze statycznym (wszystkie 23 działy w tym 16 województw)
    const routesToCheck = [
      ['/', 200],
      ['/Polska/', 200],
      ['/Polska/Gospodarka/', 200],
      ['/Polska/Polityka/', 200],
      ['/Polska/Energetyka/', 200],
      ['/Polska/Regiony/', 200],
      ['/Polska/Regiony/Dolnoslaskie/', 200],
      ['/Polska/Regiony/Kujawsko-Pomorskie/', 200],
      ['/Polska/Regiony/Lubelskie/', 200],
      ['/Polska/Regiony/Lubuskie/', 200],
      ['/Polska/Regiony/Lodzkie/', 200],
      ['/Polska/Regiony/Malopolskie/', 200],
      ['/Polska/Regiony/Mazowieckie/', 200],
      ['/Polska/Regiony/Opolskie/', 200],
      ['/Polska/Regiony/Podkarpackie/', 200],
      ['/Polska/Regiony/Podlaskie/', 200],
      ['/Polska/Regiony/Pomorskie/', 200],
      ['/Polska/Regiony/Slaskie/', 200],
      ['/Polska/Regiony/Swietokrzyskie/', 200],
      ['/Polska/Regiony/Warminsko-Mazurskie/', 200],
      ['/Polska/Regiony/Wielkopolskie/', 200],
      ['/Polska/Regiony/Zachodniopomorskie/', 200],
      ['/Swiat/', 200],
      ['/Sport/', 200],
      ['/moderacja/', 200],
      ['/kamery/', 200],
      ['/community.js', 200],
      [`${sampleMulti.seo_url}/`, 200],
      [`${sampleSingle.seo_url}/`, 200],
      ['/sitemap.xml', 200],
      ['/news-sitemap.xml', 200],
      ['/feed.xml', 200],
      ['/Polska/feed.xml', 200],
      ['/Polska/Gospodarka/feed.xml', 200],
      ['/Swiat/feed.xml', 200],
      ['/Sport/feed.xml', 200],
      ['/articles-index.json', 200],
      ['/manifest.webmanifest', 200],
      ['/sw.js', 200],
      ['/icon.svg', 200],
      ['/icon-192.png', 200],
      ['/icon-512.png', 200],
      ['/robots.txt', 200],
      ['/nieistniejacy-adres-test-404/', 404],
    ];
    for (const [route, expected] of routesToCheck) {
      const resp = await httpGetDirect(baseUrl + route);
      assert(resp.status === expected, `Oczekiwano HTTP ${expected} dla ${route}, otrzymano ${resp.status}`);
    }
    console.log(`[PASS] Sprawdzenie HTTP statusów (${routesToCheck.length} tras OK)`);

    browser = await launchChromium();

    // 2. Desktop strona główna + stronicowanie podczas przewijania + szuflada 16 województw
    await browser.goto(`${baseUrl}/`);
    const homeInfo = await browser.evalJs(`(() => ({
      title: document.title,
      cards: document.querySelectorAll('.story-title-link').length,
      h1: document.querySelector('h1')?.textContent,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      hasNbsp: document.getElementById('articlesFeed').textContent.includes('\\u00A0'),
      robots: document.querySelector('meta[name="robots"]')?.content || '',
      canonical: document.querySelector('link[rel="canonical"]')?.href || '',
      hasManifest: Boolean(document.querySelector('link[rel="manifest"]')),
      hasSectionRss: Boolean(document.querySelector('link[rel="alternate"][href*="Polska/feed.xml"]')),
      hasLoadMoreBtn: Boolean(document.getElementById('loadMoreBtn')),
      pagerMeta: document.querySelector('.feed-load-more-meta')?.textContent || '',
      badges: Array.from(document.querySelectorAll('#articlesFeed .story-top .cat-badge')).map(b => b.textContent.trim()),
    }))()`);
    assert(homeInfo.cards === 13, `Oczekiwano startowej porcji 13 kart (1 lead + 12 kart), jest ${homeInfo.cards}`);
    assert(homeInfo.hasManifest && homeInfo.hasSectionRss, `Brak tagów PWA manifest lub RSS działu: ${JSON.stringify(homeInfo)}`);
    assert(homeInfo.hasLoadMoreBtn && homeInfo.pagerMeta.includes('Wyświetlono 13'), `Brak kontrolki stronicowania przy starcie: ${JSON.stringify(homeInfo)}`);
    assert(!homeInfo.overflow, `Poziomy scroll na desktopie (/): ${homeInfo.scrollW} > ${homeInfo.clientW}`);
    assert(homeInfo.hasNbsp, 'Brak niełamliwych spacji \\u00A0 na stronie głównej');
    assert(homeInfo.robots.includes('index'), `Zły meta robots na /: ${homeInfo.robots}`);
    assert(!homeInfo.badges.includes('Świat') && !homeInfo.badges.includes('Sport'), `Karty Świat/Sport nie powinny pojawiać się w dziale Polska (/): ${homeInfo.badges.join(', ')}`);

    // Przewinięcie w dół wywołuje automatyczne doładowanie kolejnej porcji (IntersectionObserver)
    await browser.evalJs(`document.getElementById('feedLoadMoreWrap')?.scrollIntoView({ behavior: 'instant' })`);
    await new Promise(r => setTimeout(r, 350));
    const scrolledFeedInfo = await browser.evalJs(`({
      cardsAfterScroll: document.querySelectorAll('.story-title-link').length,
      pagerMeta: document.querySelector('.feed-load-more-meta')?.textContent || '',
    })`);
    assert(scrolledFeedInfo.cardsAfterScroll >= 25, `Przewijanie powinno automatycznie doładować kolejną porcję artykułów (było ${homeInfo.cards}, jest ${scrolledFeedInfo.cardsAfterScroll})`);
    await browser.evalJs(`window.scrollTo(0, 0)`);
    await new Promise(r => setTimeout(r, 150));
    await browser.screenshot('desktop_home.png');

    // Kliknięcie przycisku "16 woj." -> otwarcie szuflady #regionsDrawer na desktopie
    await browser.evalJs(`document.getElementById('regionsToggleBtn').click()`);
    await new Promise(r => setTimeout(r, 250));
    const drawerInfo = await browser.evalJs(`(() => {
      const drawer = document.getElementById('regionsDrawer');
      const btn = document.getElementById('regionsToggleBtn');
      const box = drawer.getBoundingClientRect();
      const items = drawer.querySelectorAll('[data-region-link^="/Polska/Regiony/"]');
      return {
        isOpen: !drawer.classList.contains('hidden'),
        ariaExpanded: btn.getAttribute('aria-expanded'),
        voivCount: items.length,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        rightOk: box.right <= window.innerWidth + 1 && box.left >= -1,
        height: Math.round(box.height),
      };
    })()`);
    assert(drawerInfo.isOpen && drawerInfo.ariaExpanded === 'true', 'Szuflada #regionsDrawer nie otworzyła się');
    assert(drawerInfo.voivCount === 16, `Oczekiwano 16 linków województw w szufladzie, jest ${drawerInfo.voivCount}`);
    assert(!drawerInfo.overflow && drawerInfo.rightOk, `Szuflada województw powoduje overflow na desktopie: ${JSON.stringify(drawerInfo)}`);
    await browser.screenshot('desktop_regions_drawer.png');

    // Escape zamyka szufladę województw i przywraca fokus na przycisk #regionsToggleBtn
    await browser.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await new Promise(r => setTimeout(r, 150));
    const drawerEscInfo = await browser.evalJs(`({
      isClosed: document.getElementById('regionsDrawer')?.classList.contains('hidden') || false,
      ariaExpanded: document.getElementById('regionsToggleBtn')?.getAttribute('aria-expanded'),
      activeId: document.activeElement?.id || '',
    })`);
    assert(
      drawerEscInfo.isClosed && drawerEscInfo.ariaExpanded === 'false' && drawerEscInfo.activeId === 'regionsToggleBtn',
      `Escape nie zamknął szuflady lub nie przywrócił fokusu na #regionsToggleBtn: ${JSON.stringify(drawerEscInfo)}`
    );
    await browser.evalJs(`document.getElementById('regionsToggleBtn').click()`);
    await new Promise(r => setTimeout(r, 150));

    // Nawigacja z szuflady do /Polska/Regiony/ (Wszystkie regiony)
    await browser.evalJs(`document.querySelector('#regionsDrawer .regions-drawer-all').click()`);
    await new Promise(r => setTimeout(r, 300));
    const regionsPageInfo = await browser.evalJs(`(() => {
      const drawer = document.getElementById('regionsDrawer');
      const pills = document.querySelectorAll('.region-strip .region-pill');
      const regChip = document.querySelector('.path-chip[data-path="/Polska/Regiony"]');
      return {
        pathname: location.pathname,
        drawerClosed: drawer.classList.contains('hidden'),
        h1: document.querySelector('h1')?.textContent || '',
        pillsCount: pills.length,
        cardsCount: document.querySelectorAll('.story-title-link').length,
        regTabActive: Boolean(regChip && regChip.classList.contains('active')),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    })()`);
    assert(regionsPageInfo.pathname.endsWith('/Polska/Regiony/'), `Niepoprawny URL hubu regionów: ${regionsPageInfo.pathname}`);
    assert(regionsPageInfo.drawerClosed, 'Szuflada #regionsDrawer powinna zamknąć się po kliknięciu działu');
    assert(regionsPageInfo.pillsCount === 17, `Oczekiwano 17 pigułek w .region-strip (Wszystkie + 16 woj.), jest ${regionsPageInfo.pillsCount}`);
    assert(regionsPageInfo.regTabActive, 'Zakładka Regiony powinna być aktywna na /Polska/Regiony/');
    assert(regionsPageInfo.cardsCount >= 5, `Oczekiwano artykułów regionalnych w /Polska/Regiony/, jest ${regionsPageInfo.cardsCount}`);
    assert(!regionsPageInfo.overflow, 'Poziomy scroll na /Polska/Regiony/ desktop');
    await browser.screenshot('desktop_region_page.png');

    // Przejście do województw (Warmińsko-Mazurskie i Opolskie) oraz kontrola pokrycia 16/16 województw
    const stripSummary = await browser.evalJs(`(() => {
      const pills = Array.from(document.querySelectorAll('.region-strip a[href*="/Polska/Regiony/"]'))
        .filter(a => !a.getAttribute('href').endsWith('/Polska/Regiony/'));
      const nonEmpty = pills.filter(a => a.classList.contains('has-items')).length;
      const zeroPill = pills.find(a => !a.classList.contains('has-items'));
      return { pillTotal: pills.length, nonEmpty, zeroHref: zeroPill ? zeroPill.getAttribute('href') : '' };
    })()`);
    assert(stripSummary.pillTotal === 16, `Oczekiwano 16 pigułek województw, jest ${stripSummary.pillTotal}`);

    await browser.evalJs(`document.querySelector('.region-strip a[href*="Warminsko-Mazurskie"]')?.click()`);
    await new Promise(r => setTimeout(r, 250));
    const warmiaInfo = await browser.evalJs(`({
      pathname: location.pathname,
      h1: document.querySelector('h1')?.textContent || '',
      activeTab: document.querySelector('.path-chip[data-path="/Polska/Regiony"]')?.classList.contains('active') || false,
      activePill: document.querySelector('.region-strip .region-pill.active')?.textContent || '',
      cards: document.querySelectorAll('.story-title-link').length,
    })`);
    assert(warmiaInfo.pathname.endsWith('/Polska/Regiony/Warminsko-Mazurskie/'), `Zły pathname dla Warmii i Mazur: ${warmiaInfo.pathname}`);
    assert(warmiaInfo.activeTab && warmiaInfo.activePill.includes('Warmińsko-Mazurskie'), `Niespójne podświetlenie Warmii i Mazur: ${JSON.stringify(warmiaInfo)}`);
    assert(warmiaInfo.cards >= 1, 'Warmińsko-Mazurskie powinno wyświetlać min. 1 opracowanie');

    await browser.evalJs(`document.querySelector('.region-strip a[href*="/Opolskie/"]')?.click()`);
    await new Promise(r => setTimeout(r, 250));
    const opoleInfo = await browser.evalJs(`({
      pathname: location.pathname,
      cards: document.querySelectorAll('.story-title-link').length,
      activePill: document.querySelector('.region-strip .region-pill.active')?.textContent || '',
      emptyText: document.querySelector('.empty-state')?.textContent || '',
      backAllHref: document.querySelector('.empty-state .btn-outline')?.getAttribute('href') || '',
    })`);
    assert(opoleInfo.pathname.endsWith('/Polska/Regiony/Opolskie/'), `Zły pathname dla Opolskiego: ${opoleInfo.pathname}`);
    assert(opoleInfo.activePill.includes('Opolskie'), `Pigułka Opolskie nie jest aktywna: ${JSON.stringify(opoleInfo)}`);
    if (opoleInfo.cards === 0) {
      assert(opoleInfo.emptyText.includes('Nowa Trybuna Opolska') && opoleInfo.backAllHref.includes('/Polska/Regiony/'), `Brak listy redakcji / linku powrotu w pustym województwie: ${JSON.stringify(opoleInfo)}`);
    } else {
      assert(opoleInfo.cards >= 1 && stripSummary.nonEmpty === 16, `Oczekiwano pokrycia 16/16 województw: nonEmpty=${stripSummary.nonEmpty}, cards=${opoleInfo.cards}`);
    }

    // Test przekierowania History API dla legacy URL /Polska/Poznan/ -> /Polska/Regiony/Wielkopolskie/
    await browser.goto(`${baseUrl}/Polska/Poznan/`);
    const legacyRedirectInfo = await browser.evalJs(`({
      pathname: location.pathname,
      h1: document.querySelector('h1')?.textContent || '',
      robots: document.querySelector('meta[name="robots"]')?.content || '',
      bodyText: document.getElementById('articlesFeed')?.textContent || '',
    })`);
    assert(legacyRedirectInfo.pathname.endsWith('/Polska/Regiony/Wielkopolskie/'), `Legacy URL /Polska/Poznan/ nie przekierował: ${legacyRedirectInfo.pathname}`);
    assert(!legacyRedirectInfo.bodyText.includes('Nie znaleziono strony (404)'), 'Legacy URL pokazał stronę 404 zamiast Wielkopolski');
    assert(legacyRedirectInfo.robots.startsWith('index'), `Legacy redirect nie przywrócił robots=index: ${legacyRedirectInfo.robots}`);
    await browser.goto(`${baseUrl}/`);
    console.log(`[PASS] Desktop strona główna, szuflada 16 woj., pasek regionów i legacy redirect (${homeInfo.cards} kart, 0 overflow, \\u00A0 OK)`);

    // 3. Nawigacja SPA kliknięciem karty -> sprawdzenie History API, typografii, dropcapu, braku duplikatu leadu, JSON-LD, kopiowania linku, paska scrolla
    await browser.evalJs(`(() => {
      const targetHref = ${JSON.stringify(sampleMulti.seo_url + '/')};
      const link = Array.from(document.querySelectorAll('.story-title-link')).find(a => a.getAttribute('href')?.endsWith(targetHref))
        || document.querySelector('.story-title-link');
      link.click();
    })()`);
    await new Promise(r => setTimeout(r, 350));

    const artInfo = await browser.evalJs(`(() => {
      const ld = JSON.parse(document.getElementById('dynamicJsonLd').textContent);
      const lede = document.querySelector('.article-lede')?.textContent?.trim() || '';
      const firstPara = document.querySelector('.section-paragraph')?.textContent?.trim() || '';
      const drop = document.querySelector('.section-paragraph.has-dropcap')?.textContent?.trim() || '';
      const copyBtn = document.querySelector('.copy-link-btn');
      if (copyBtn) copyBtn.click();
      return {
        pathname: location.pathname,
        title: document.title,
        canonical: document.querySelector('link[rel="canonical"]')?.href || '',
        ldTypes: Array.isArray(ld) ? ld.map(x => x['@type']) : [ld['@type']],
        lede,
        firstPara,
        dropcapCount: document.querySelectorAll('.has-dropcap').length,
        dropStartsOk: !drop || /^[A-ZĄĆĘŁŃÓŚŹŻ]/.test(drop),
        copyText: copyBtn?.textContent || '',
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        hasNbsp: document.querySelector('.article-main')?.textContent.includes('\\u00A0') || false,
      };
    })()`);

    assert(!artInfo.pathname.includes('#/a/'), `URL nie używa prawdziwej ścieżki SEO: ${artInfo.pathname}`);
    assert(artInfo.ldTypes.includes('NewsArticle') && artInfo.ldTypes.includes('BreadcrumbList'), `Brak NewsArticle/BreadcrumbList JSON-LD: ${artInfo.ldTypes}`);
    assert(artInfo.canonical.endsWith(artInfo.pathname), `Canonical (${artInfo.canonical}) nie pasuje do pathname (${artInfo.pathname})`);
    assert(artInfo.dropcapCount <= 1 && artInfo.dropStartsOk, `Nieprawidłowy inicjał dropcap: count=${artInfo.dropcapCount}`);
    assert(!artInfo.overflow, 'Poziomy scroll w widoku artykułu na desktopie');
    assert(artInfo.hasNbsp, 'Brak niełamliwych spacji \\u00A0 w treści artykułu');
    if (artInfo.lede.length > 40 && artInfo.firstPara.length > 40) {
      assert(!artInfo.firstPara.startsWith(artInfo.lede.slice(0, 40)), 'Powtórzenie leadu w 1. akapicie treści artykułu!');
    }
    await browser.screenshot('desktop_article.png');

    // Przewinięcie w dół -> test paska postępu czytania
    await browser.evalJs('window.scrollTo(0, 350); window.dispatchEvent(new Event("scroll"));');
    await new Promise(r => setTimeout(r, 150));
    const progInfo = await browser.evalJs(`({
      isReading: document.body.classList.contains('is-reading'),
      width: document.getElementById('readingProgress')?.style.width || ''
    })`);
    assert(progInfo.isReading && parseFloat(progInfo.width) > 0, `Pasek czytania nie aktywował się: ${JSON.stringify(progInfo)}`);

    // Tryb ciemny screenshot
    await browser.evalJs('window.scrollTo(0, 0); applyTheme("dark");');
    await new Promise(r => setTimeout(r, 200));
    await browser.screenshot('dark_article.png');
    await browser.evalJs('applyTheme("light");');
    console.log(`[PASS] Desktop artykuł SPA + SEO JSON-LD + pasek czytania (${artInfo.pathname})`);

    // 3b. Test klikalnego filtra źródeł i zwijania długich list perspektyw na bogatym artykule
    await browser.goto(`${baseUrl}${sampleRichMulti.seo_url}/`);
    const richBefore = await browser.evalJs(`(() => {
      const chips = Array.from(document.querySelectorAll('.source-filter-chip[data-outlet-filter]'));
      const nonZero = chips.filter(c => {
        const val = c.getAttribute('data-outlet-filter') || '';
        const cntMatch = (c.textContent || '').match(/\\((\\d+)\\)/);
        return val && (!cntMatch || parseInt(cntMatch[1], 10) > 0);
      });
      const collapsed = Array.from(document.querySelectorAll('.perspective-col.is-collapsed-persp'));
      const expBtn = document.querySelector('.perspectives-expand-btn');
      const diffs = Array.from(document.querySelectorAll('.perspective-diff')).map(el => el.textContent.trim());
      return {
        hasBar: Boolean(document.querySelector('.source-filter-bar')),
        chipsCount: chips.length,
        targetOutlet: nonZero.length ? nonZero[nonZero.length - 1].getAttribute('data-outlet-filter') : '',
        perspTotal: document.querySelectorAll('.perspective-col').length,
        collapsedCount: collapsed.length,
        collapsedHidden: collapsed.every(el => getComputedStyle(el).display === 'none'),
        hasExpandBtn: Boolean(expBtn),
        diffCount: diffs.length,
        diffsHaveEksponuje: diffs.some(t => t.includes('Eksponuje:')),
        diffsHavePomija: diffs.some(t => t.includes('Pomija:')),
      };
    })()`);
    assert(richBefore.hasBar && richBefore.chipsCount >= 3 && richBefore.targetOutlet, `Brak paska filtrowania źródeł w ${sampleRichMulti.seo_url}: ${JSON.stringify(richBefore)}`);
    assert(richBefore.diffCount >= 2 && richBefore.diffsHaveEksponuje && richBefore.diffsHavePomija, `Brak analizy porównawczej Eksponuje/Pomija w ramce perspektyw: ${JSON.stringify(richBefore)}`);
    if (richBefore.perspTotal > 4) {
      assert(richBefore.collapsedCount === richBefore.perspTotal - 4 && richBefore.collapsedHidden && richBefore.hasExpandBtn, `Długa lista perspektyw nie została zwinięta: ${JSON.stringify(richBefore)}`);
    }

    // Kliknięcie pigułki redakcji -> wyróżnienie akapitów + przygaszenie pozostałych + baner statusu + podświetlenie karty
    await browser.evalJs(`document.querySelector('.source-filter-chip[data-outlet-filter="' + ${JSON.stringify(richBefore.targetOutlet)}.replace(/"/g, '\\\\"') + '"]')?.click()`);
    await new Promise(r => setTimeout(r, 200));
    const filteredState = await browser.evalJs(`(() => {
      const status = document.getElementById('sourceFilterStatus');
      const matches = document.querySelectorAll('.section-paragraph.is-source-match').length;
      const dimmed = document.querySelectorAll('.section-paragraph.is-source-dimmed').length;
      const activeCol = document.querySelector('.perspective-col.is-source-active');
      return {
        statusVisible: Boolean(status && !status.classList.contains('hidden')),
        statusText: status?.textContent || '',
        matches,
        dimmed,
        activeOutlet: activeCol?.getAttribute('data-outlet') || '',
        activeVisible: activeCol ? getComputedStyle(activeCol).display !== 'none' : false,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    })()`);
    assert(filteredState.statusVisible && filteredState.statusText.includes(richBefore.targetOutlet), `Baner statusu filtra nie wyświetlił ${richBefore.targetOutlet}: ${JSON.stringify(filteredState)}`);
    assert(filteredState.matches >= 1, `Brak wyróżnionych akapitów dla ${richBefore.targetOutlet}`);
    assert(filteredState.activeOutlet === richBefore.targetOutlet && filteredState.activeVisible, `Karta perspektywy nie została podświetlona/rozwinięta: ${JSON.stringify(filteredState)}`);
    assert(!filteredState.overflow, 'Poziomy scroll po przefiltrowaniu artykułu na desktopie');
    await browser.screenshot('desktop_article_filtered.png');

    // Reset filtra kliknięciem "Pokaż wszystkie" oraz test przycisku zwijania/rozwijania ujęć
    await browser.evalJs(`document.querySelector('.source-filter-reset')?.click()`);
    await new Promise(r => setTimeout(r, 150));
    const resetState = await browser.evalJs(`(() => {
      const status = document.getElementById('sourceFilterStatus');
      return {
        statusHidden: Boolean(!status || status.classList.contains('hidden')),
        matches: document.querySelectorAll('.section-paragraph.is-source-match').length,
        dimmed: document.querySelectorAll('.section-paragraph.is-source-dimmed').length,
      };
    })()`);
    assert(resetState.statusHidden && resetState.matches === 0 && resetState.dimmed === 0, `Reset filtra nie wyczyścił stanu: ${JSON.stringify(resetState)}`);

    if (richBefore.hasExpandBtn) {
      await browser.evalJs(`(() => {
        const box = document.querySelector('.perspectives-box');
        const btn = document.querySelector('.perspectives-expand-btn');
        if (box && box.classList.contains('is-expanded') && btn) btn.click(); // wróć do zwiniętych jeśli rozwinął się automatycznie
      })()`);
      await new Promise(r => setTimeout(r, 100));
      await browser.evalJs(`document.querySelector('.perspectives-expand-btn')?.click()`);
      await new Promise(r => setTimeout(r, 100));
      const expAfter = await browser.evalJs(`({
        expanded: document.querySelector('.perspectives-box')?.classList.contains('is-expanded') || false,
        allVisible: Array.from(document.querySelectorAll('.perspective-col')).every(el => getComputedStyle(el).display !== 'none'),
      })`);
      assert(expAfter.expanded && expAfter.allVisible, `Rozwijanie wszystkich perspektyw nie zadziałało: ${JSON.stringify(expAfter)}`);
    }
    console.log(`[PASS] Desktop filtr źródeł (${richBefore.targetOutlet}: ${filteredState.matches} akapitów) + zwijanie/rozwijanie perspektyw (${richBefore.perspTotal} kart) OK`);

    // 4. Test bezpośredniego wejścia na stronę artykułu SSR + kliknięcie powrotu + wyszukiwarka (noindex)
    await browser.goto(`${baseUrl}${sampleSingle.seo_url}/`);
    const ssrInfo = await browser.evalJs(`(() => {
      const ld = JSON.parse(document.getElementById('dynamicJsonLd').textContent);
      return {
        h1: document.querySelector('h1.article-title')?.textContent?.trim() || '',
        ldHeadline: ld[0]?.headline || '',
        asideStatus: document.querySelector('.aside-status')?.textContent?.trim() || '',
        backText: document.querySelector('.back-link')?.textContent?.trim() || '',
      };
    })()`);
    assert(ssrInfo.h1.length > 10 && ssrInfo.ldHeadline.length > 10, 'SSR pojedynczego artykułu nie załadowało H1/JSON-LD');
    assert(ssrInfo.asideStatus.includes('1 redakcja'), `Błędny status dla 1-źródłowego: ${ssrInfo.asideStatus}`);

    // Wpisz zapytanie w wyszukiwarkę -> robots musi się zmienić na noindex, follow
    await browser.evalJs(`(() => {
      const si = document.getElementById('searchInput');
      si.value = 'Polska';
      handleSearchInput();
    })()`);
    await new Promise(r => setTimeout(r, 200));
    const searchInfo = await browser.evalJs(`({
      robots: document.querySelector('meta[name="robots"]')?.content || '',
      h1: document.querySelector('h1')?.textContent || '',
    })`);
    assert(searchInfo.robots.startsWith('noindex'), `Strona wyników wyszukiwania musi mieć noindex: ${searchInfo.robots}`);
    assert(searchInfo.h1.includes('Wyniki dla'), `Brak nagłówka wyników wyszukiwania: ${searchInfo.h1}`);
    console.log('[PASS] Bezpośrednie wejście SSR + wyszukiwarka noindex OK');

    // 5. Test responsywności Mobile 390x844 i 360x780 (Android) + szuflada 16 woj. i pasek regionów
    await browser.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await browser.goto(`${baseUrl}/`);
    const mobHome = await browser.evalJs(`(() => {
      const si = document.getElementById('searchInput')?.getBoundingClientRect();
      const topBar = document.querySelector('.top-utility')?.getBoundingClientRect();
      const themeBox = document.querySelector('.theme-switcher')?.getBoundingClientRect();
      const brandBox = document.querySelector('.brand')?.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
        searchW: si ? Math.round(si.width) : 0,
        topH: topBar ? Math.round(topBar.height) : 0,
        brandSameRowAsTheme: Boolean(brandBox && themeBox && Math.abs(brandBox.top - themeBox.top) < 20),
        themeAboveSearch: Boolean(themeBox && si && themeBox.bottom <= si.top + 2),
        shortLabelsVisible: Boolean(
          getComputedStyle(document.querySelector('#liveChatBtn .btn-label-short')).display !== 'none'
          && getComputedStyle(document.querySelector('.top-utility-actions .btn-label-short')).display !== 'none'
        ),
      };
    })()`);
    assert(!mobHome.overflow, `Poziomy scroll na mobile (/): ${mobHome.sw} > ${mobHome.cw}`);
    assert(mobHome.searchW >= 300, `Za wąskie pole szukania na mobile 390px: ${mobHome.searchW}px`);
    assert(mobHome.topH <= 38, `Pasek top-utility na mobile powinien mieścić się w 1 linii (wysokość=${mobHome.topH}px)`);
    assert(mobHome.shortLabelsVisible, 'Krótkie etykiety (Czat / Kolejka) są ukryte na mobile 390px!');
    assert(mobHome.brandSameRowAsTheme && mobHome.themeAboveSearch, `Zły układ mobilnego nagłówka: ${JSON.stringify(mobHome)}`);
    await browser.screenshot('mobile_home.png');

    // Otwarcie szuflady 16 woj. na mobile 390px + strona /Polska/Regiony/
    await browser.evalJs(`document.getElementById('regionsToggleBtn').click()`);
    await new Promise(r => setTimeout(r, 250));
    const mobDrawer = await browser.evalJs(`(() => {
      const d = document.getElementById('regionsDrawer');
      const box = d.getBoundingClientRect();
      return {
        open: !d.classList.contains('hidden'),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        fitsWidth: box.left >= 0 && box.right <= window.innerWidth + 1,
        itemsCount: d.querySelectorAll('[data-region-link^="/Polska/Regiony/"]').length,
      };
    })()`);
    assert(mobDrawer.open && mobDrawer.itemsCount === 16 && !mobDrawer.overflow && mobDrawer.fitsWidth, `Problem szuflady na mobile: ${JSON.stringify(mobDrawer)}`);
    await browser.screenshot('mobile_regions_drawer.png');

    await browser.goto(`${baseUrl}/Polska/Regiony/`);
    const mobRegions = await browser.evalJs(`(() => {
      const strip = document.querySelector('.region-strip');
      const pills = document.querySelectorAll('.region-strip .region-pill');
      return {
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
        pillsCount: pills.length,
        hasStrip: Boolean(strip),
      };
    })()`);
    assert(!mobRegions.overflow, `Poziomy scroll na mobile (/Polska/Regiony/): ${mobRegions.sw} > ${mobRegions.cw}`);
    assert(mobRegions.hasStrip && mobRegions.pillsCount === 17, 'Brak paska 16 województw na mobile');
    await browser.screenshot('mobile_regions.png');

    // Wąski ekran Android 360x780 w trybie ciemnym
    await browser.cdp('Emulation.setDeviceMetricsOverride', { width: 360, height: 780, deviceScaleFactor: 3, mobile: true });
    await browser.goto(`${baseUrl}/`);
    await browser.evalJs('applyTheme("dark");');
    await new Promise(r => setTimeout(r, 150));
    const mob360 = await browser.evalJs(`(() => {
      const si = document.getElementById('searchInput')?.getBoundingClientRect();
      const topBar = document.querySelector('.top-utility')?.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        searchW: si ? Math.round(si.width) : 0,
        topH: topBar ? Math.round(topBar.height) : 0,
      };
    })()`);
    assert(!mob360.overflow && mob360.searchW >= 290, `Problem na 360px: ${JSON.stringify(mob360)}`);
    await browser.screenshot('mobile_360_dark.png');
    await browser.evalJs('applyTheme("light");');

    await browser.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await browser.goto(`${baseUrl}/Swiat/`);
    const mobSwiat = await browser.evalJs(`(() => {
      const nav = document.querySelector('.path-nav');
      const act = document.querySelector('.path-chip.active');
      const nBox = nav?.getBoundingClientRect();
      const aBox = act?.getBoundingClientRect();
      const badges = Array.from(document.querySelectorAll('#articlesFeed .story-top .cat-badge')).map(b => b.textContent.trim());
      const feedText = document.getElementById('articlesFeed')?.textContent || '';
      return {
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        activeLabel: act?.textContent?.trim() || '',
        activeVisible: Boolean(nBox && aBox && aBox.left >= nBox.left - 2 && aBox.right <= nBox.right + 2),
        badges,
        hasRocket: feedText.includes('ILR-33'),
      };
    })()`);
    assert(!mobSwiat.overflow, 'Poziomy scroll na mobile (/Swiat/)');
    assert(mobSwiat.activeVisible, `Aktywna zakładka ${mobSwiat.activeLabel} niewidoczna na pasku nawigacji mobile`);
    assert(mobSwiat.badges.length > 0 && mobSwiat.badges.every(b => b === 'Świat'), `Dział Świat zawiera obce etykiety: ${mobSwiat.badges.join(', ')}`);
    assert(!mobSwiat.hasRocket, 'Dział Świat nie powinien zawierać artykułu o polskiej rakiecie ILR-33');
    await browser.screenshot('mobile_swiat.png');

    await browser.goto(`${baseUrl}${sampleRichMulti.seo_url}/`);
    await browser.evalJs(`(() => {
      const chip = document.querySelectorAll('.source-filter-chip[data-outlet-filter]')[1];
      if (chip) chip.click();
    })()`);
    await new Promise(r => setTimeout(r, 200));
    const mobArt = await browser.evalJs(`({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
      hasFilterBar: Boolean(document.querySelector('.source-filter-bar')),
      hasMatch: document.querySelectorAll('.section-paragraph.is-source-match').length >= 1,
    })`);
    assert(!mobArt.overflow, `Poziomy scroll na mobile (artykuł z filtrem): ${mobArt.sw} > ${mobArt.cw}`);
    assert(mobArt.hasFilterBar, 'Brak paska filtrowania źródeł na mobile');
    await browser.screenshot('mobile_article.png');

    const sampleRegional = publishedArticles.find(a => (a.path || '').startsWith('/Polska/Regiony/'));
    if (sampleRegional) {
      await browser.goto(`${baseUrl}${sampleRegional.seo_url}/`);
      const regInfo = await browser.evalJs(`({
        backText: document.querySelector('.back-link')?.textContent?.trim() || '',
        backHref: document.querySelector('.back-link')?.getAttribute('href') || '',
        regTabActive: document.querySelector('.path-chip[data-path="/Polska/Regiony"]')?.classList.contains('active') || false,
      })`);
      assert(regInfo.backHref.includes(sampleRegional.path + '/') && regInfo.regTabActive, `Niepoprawny link powrotu dla regionalnego artykułu: ${JSON.stringify(regInfo)}`);
    }
    console.log(`[PASS] Mobile 390px i 360px (szukanie=${mobHome.searchW}px/${mob360.searchW}px, topBar=${mobHome.topH}px, tab="${mobSwiat.activeLabel}", regiony=16 woj., czyste Świat=${mobSwiat.badges.length}, 0 overflow) OK`);

    // 8b. Kolejka redakcyjna (Zero-Trust) i „Pokaż dowód!” z trwałym zapisem po odświeżeniu
    await browser.cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await browser.goto(`${baseUrl}/`);
    if (pendingArticles.length === 0 && sampleMulti) {
      await browser.evalJs(`(() => {
        const key = ${JSON.stringify((sampleMulti.seo_url || '').replace(/\/+$/, '') || String(sampleMulti.id))};
        localStorage.setItem('verity_editorial_state_v1', JSON.stringify({
          article_decisions: {
            [key]: {
              status: 'PENDING_ADMIN',
              zero_trust_reason: 'Wstrzymano (Zero-Trust): Testowa rozbieżność danych. | Sygnały: rząd/resort (Rząd) vs dane (NBP); spór (wbrew) | Wyzwalacz: „Komunikat rządu zestawiono z danymi NBP.”',
              admin_note: 'Weryfikacja redakcyjna: test E2E.'
            }
          },
          rejected_keys: [],
          reader_corrections: []
        }));
      })()`);
      await browser.goto(`${baseUrl}/`);
    }
    const badgeBefore = await browser.evalJs(`parseInt(document.getElementById('pendingBadge')?.textContent || '0', 10)`);
    assert(badgeBefore >= 1, `Oczekiwano niezerowej liczby spraw w Kolejce redakcyjnej (jest ${badgeBefore})`);
    await browser.evalJs(`document.querySelector('.queue-btn').click()`);
    await new Promise(r => setTimeout(r, 300));
    const edInfo = await browser.evalJs(`(() => {
      const qCard = document.querySelector('[data-queue-art]');
      const artId = qCard ? parseInt(qCard.getAttribute('data-queue-art'), 10) : 0;
      const corrCard = document.querySelector('[data-corr-id]');
      return {
        hasQueueCard: Boolean(qCard),
        artId,
        hasReason: Boolean(document.querySelector('.queue-reason .qr-main')),
        hasMeta: Boolean(document.querySelector('.queue-card .queue-meta')),
        hasSig: Boolean(document.querySelector('.queue-reason .qr-sig')),
        hasQuote: Boolean(document.querySelector('.queue-reason .qr-quote')),
        hasCorrCard: Boolean(corrCard),
      };
    })()`);
    assert(edInfo.hasQueueCard && edInfo.hasReason && edInfo.hasMeta, `Brak wstrzymanego artykułu Zero-Trust w kolejce redakcyjnej: ${JSON.stringify(edInfo)}`);
    if (pendingArticles.length === 0) {
      assert(edInfo.hasSig && edInfo.hasQuote, `Brak czytelnych sekcji Sygnały/Fragment w kolejce Zero-Trust: ${JSON.stringify(edInfo)}`);
    }
    assert(edInfo.hasCorrCard, 'Brak oczekującego zgłoszenia czytelnika w kolejce redakcyjnej');

    const testAdminNote = 'E2E Test: Nota redakcyjna zatwierdzona na podstawie danych URE.';
    await browser.evalJs(`(() => {
      const inp = document.getElementById('adminNoteInput_${edInfo.artId}');
      inp.value = ${JSON.stringify(testAdminNote)};
      document.querySelector('[data-queue-art="${edInfo.artId}"] .btn-primary').click();
    })()`);
    await new Promise(r => setTimeout(r, 300));

    // Otwórz stronę ponownie (pełny reload) -> sprawdź, czy zatwierdzony artykuł i nota przetrwały
    const approvedArt = pendingArticles.find(a => a.id === edInfo.artId) || articles.find(a => a.id === edInfo.artId) || pendingArticles[0] || sampleMulti;
    if (approvedArt) {
      await browser.goto(`${baseUrl}${approvedArt.seo_url}/`);
      const afterApprove = await browser.evalJs(`({
        badgeAfter: parseInt(document.getElementById('pendingBadge')?.textContent || '0', 10),
        warnText: document.querySelector('.callout-warn')?.textContent || '',
      })`);
      assert(afterApprove.badgeAfter === badgeBefore - 1, `Licznik kolejki powinien spaść po akceptacji (${badgeBefore} -> ${afterApprove.badgeAfter})`);
      assert(afterApprove.warnText.includes(testAdminNote), `Zatwierdzona nota redakcyjna nie przetrwała odświeżenia strony: ${afterApprove.warnText}`);
    }

    // Formularz „Pokaż dowód!”: odrzucenie czarnej listy i trwałe zapisanie dowodu
    await browser.goto(`${baseUrl}${sampleMulti.seo_url}/`);
    await browser.evalJs(`(() => {
      document.querySelector('button[onclick^="toggleCorr("]')?.click();
      document.getElementById('corrClaim_${sampleMulti.id}').value = 'Sprawdzam poprawność danych liczbowych w raporcie bankowym.';
      document.getElementById('corrUrl_${sampleMulti.id}').value = 'https://demagog.org.pl/wypowiedzi/test-blokady';
      submitCorr(${sampleMulti.id});
    })()`);
    await new Promise(r => setTimeout(r, 150));
    const blMsg = await browser.evalJs(`document.getElementById('corrMsg_${sampleMulti.id}')?.textContent || ''`);
    assert(blMsg.includes('czarnej liście Zero-Trust'), `Brak blokady czarnej listy w formularzu korekt: ${blMsg}`);

    const testClaim = 'Raport źródłowy potwierdza dokładną wartość wskaźnika za cały kwartał.';
    const testUrl = 'https://www.nbp.pl/statystyka-test-e2e-2026';
    await browser.evalJs(`(() => {
      document.getElementById('corrClaim_${sampleMulti.id}').value = ${JSON.stringify(testClaim)};
      document.getElementById('corrUrl_${sampleMulti.id}').value = ${JSON.stringify(testUrl)};
      submitCorr(${sampleMulti.id});
    })()`);
    await new Promise(r => setTimeout(r, 250));
    await browser.goto(`${baseUrl}${sampleMulti.seo_url}/`);
    const corrReloaded = await browser.evalJs(`({
      successText: document.querySelector('.callout-success')?.textContent || '',
      hasLink: Boolean(document.querySelector('.callout-success a[href="${testUrl}"]')),
    })`);
    assert(corrReloaded.successText.includes(testClaim) && corrReloaded.hasLink, `Zgłoszenie korekty nie przetrwało przeładowania strony: ${JSON.stringify(corrReloaded)}`);
    await browser.evalJs(`try { localStorage.removeItem('verity_editorial_state_v1'); } catch (e) {}`);
    console.log(`[PASS] Kolejka Zero-Trust (badge ${badgeBefore} -> ${badgeBefore - 1}) oraz formularz „Pokaż dowód!” przetrwały pełne przeładowanie strony OK`);

    // 8c. Rozszerzenia SEO/tematyczne: pigułki „Kogo dotyczy”, FAQPage + akordeon, Akta Sprawy oraz karta OG 1200x630
    await browser.cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await browser.goto(`${baseUrl}${sampleMulti.seo_url}/`);
    const faqImpactInfo = await browser.evalJs(`(() => {
      const ld = JSON.parse(document.getElementById('dynamicJsonLd').textContent || '[]');
      const ldTypes = Array.isArray(ld) ? ld.map(x => x['@type']) : [ld['@type']];
      const faqItems = Array.from(document.querySelectorAll('.faq-box .faq-item'));
      const secondSummary = faqItems[1]?.querySelector('.faq-q');
      const wasOpen = Boolean(faqItems[1]?.open);
      if (secondSummary) secondSummary.click();
      return {
        impactPills: document.querySelectorAll('.impact-strip .impact-pill').length,
        faqCount: faqItems.length,
        firstOpen: Boolean(faqItems[0]?.open),
        secondToggledOpen: Boolean(faqItems[1]?.open) && !wasOpen,
        hasFaqLd: ldTypes.includes('FAQPage'),
      };
    })()`);
    assert(faqImpactInfo.impactPills === 3, `Oczekiwano 3 pigułek .impact-pill, jest ${faqImpactInfo.impactPills}`);
    assert(faqImpactInfo.faqCount >= 2 && faqImpactInfo.firstOpen && faqImpactInfo.hasFaqLd, `Brak sekcji FAQ lub JSON-LD FAQPage: ${JSON.stringify(faqImpactInfo)}`);
    if (faqImpactInfo.faqCount >= 2) {
      assert(faqImpactInfo.secondToggledOpen, 'Kliknięcie 2. pytania FAQ nie otworzyło <details>');
    }

    if (sampleDossier) {
      await browser.goto(`${baseUrl}${sampleDossier.seo_url}/`);
      const dosDesk = await browser.evalJs(`({
        hasBanner: Boolean(document.querySelector('.dossier-banner')),
        jumpHref: document.querySelector('.dossier-jump')?.getAttribute('href') || '',
        timelineItems: document.querySelectorAll('#timeline.dossier-timeline .timeline-item').length,
        curItems: document.querySelectorAll('#timeline.dossier-timeline .timeline-item.is-current').length,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      })`);
      assert(
        dosDesk.hasBanner && dosDesk.jumpHref === '#timeline' && dosDesk.timelineItems >= 2 && dosDesk.curItems === 1 && !dosDesk.overflow,
        `Błąd Akta Sprawy na desktopie: ${JSON.stringify(dosDesk)}`
      );
      await browser.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
      await new Promise(r => setTimeout(r, 150));
      const dosMobOverflow = await browser.evalJs(`document.documentElement.scrollWidth > document.documentElement.clientWidth`);
      assert(!dosMobOverflow, 'Poziomy scroll na mobile w widoku artykułu z Akta Sprawy');
      await browser.cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    }

    if (sampleNoThumb) {
      await browser.goto(`${baseUrl}${sampleNoThumb.seo_url}/`);
      const ogUrl = await browser.evalJs(`document.querySelector('meta[property="og:image"]')?.getAttribute('content') || ''`);
      assert(ogUrl.endsWith(`/og/${sampleNoThumb.id}.png`), `Artykuł bez miniatury powinien wskazywać /og/${sampleNoThumb.id}.png w og:image, jest: ${ogUrl}`);
      const ogResp = await httpGetDirect(`${baseUrl}/og/${sampleNoThumb.id}.png`);
      assert(ogResp.status === 200 && ogResp.body.slice(1, 4) === 'PNG', `Brak wygenerowanego /og/${sampleNoThumb.id}.png (HTTP ${ogResp.status})`);
    }
    console.log(`[PASS] Sekcja C: Pigułki wpływu (${faqImpactInfo.impactPills}), FAQPage + akordeon (${faqImpactInfo.faqCount}), Akta Sprawy (${Boolean(sampleDossier)}), karta OG PNG (${Boolean(sampleNoThumb)}) OK`);

    // 8d. Sekcja D (tryb statyczny): /moderacja/ SSR + taryfikator §1.1–§2.3 + szuflada czatu live + widok 2-kolumnowy
    await browser.cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await browser.goto(`${baseUrl}/moderacja/`);
    const modStatic = await browser.evalJs(`({
      pathname: location.pathname,
      h1: document.querySelector('h1')?.textContent || '',
      tariffRows: document.querySelectorAll('.mod-card table tbody tr').length,
      logRows: document.querySelectorAll('#moderationLogBody tr').length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    })`);
    assert(
      modStatic.pathname.endsWith('/moderacja/') && modStatic.h1.includes('Rejestr Moderacji') && modStatic.tariffRows >= 8 && !modStatic.overflow,
      `Błąd strony statycznej /moderacja/: ${JSON.stringify(modStatic)}`
    );

    // 8e. /kamery/: fasada click-to-play, filtry Polska/Świat, brak iframe przed kliknięciem, brak overflow na mobile
    await browser.goto(`${baseUrl}/kamery/`);
    const camInit = await browser.evalJs(`({
      pathname: location.pathname,
      h1: document.querySelector('h1')?.textContent || '',
      cards: document.querySelectorAll('#camGrid .cam-card').length,
      iframesBefore: document.querySelectorAll('#camGrid iframe').length,
      navActive: document.querySelector('.path-chip[data-path="/kamery"]')?.classList.contains('active') || false,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    })`);
    assert(
      camInit.pathname.endsWith('/kamery/') && camInit.h1.includes('Kamery') && camInit.cards >= 10 && camInit.iframesBefore === 0 && camInit.navActive && !camInit.overflow,
      `Błąd strony /kamery/: ${JSON.stringify(camInit)}`
    );

    await browser.evalJs(`document.querySelector('.cam-scope-btn[data-cam-scope="swiat"]')?.click()`);
    const camWorld = await browser.evalJs(`({
      visiblePl: document.querySelectorAll('#camGrid .cam-card[data-scope="polska"]:not(.hidden)').length,
      visibleWorld: document.querySelectorAll('#camGrid .cam-card[data-scope="swiat"]:not(.hidden)').length,
      search: location.search,
    })`);
    assert(
      camWorld.visiblePl === 0 && camWorld.visibleWorld >= 6 && camWorld.search.includes('scope=swiat'),
      `Błąd filtra Świat na /kamery/: ${JSON.stringify(camWorld)}`
    );

    await browser.evalJs(`document.querySelector('#camGrid .cam-card:not(.hidden) button.cam-play[data-embed]')?.click()`);
    const camPlaying = await browser.evalJs(`({
      iframeCount: document.querySelectorAll('#camGrid iframe').length,
      iframeSrc: document.querySelector('#camGrid iframe')?.getAttribute('src') || '',
    })`);
    assert(
      camPlaying.iframeCount === 1 && camPlaying.iframeSrc.includes('youtube-nocookie.com/embed/'),
      `Błąd fasady click-to-play na /kamery/: ${JSON.stringify(camPlaying)}`
    );

    await browser.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    const camMobileOverflow = await browser.evalJs(`document.documentElement.scrollWidth > document.documentElement.clientWidth`);
    assert(!camMobileOverflow, 'Poziomy overflow na /kamery/ przy szerokości 390px');
    await browser.cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    console.log(`[PASS] Sekcja E (/kamery/): ${camInit.cards} kamer, fasada click-to-play, filtry i mobile OK`);

    await browser.goto(`${baseUrl}/`);
    await browser.evalJs(`document.getElementById('liveChatBtn')?.click()`);
    await new Promise(r => setTimeout(r, 200));
    const chatStatic = await browser.evalJs(`({
      open: !document.getElementById('verityChatDrawer')?.classList.contains('hidden'),
      bannerText: document.getElementById('chatStatusBanner')?.textContent || '',
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    })`);
    assert(chatStatic.open && chatStatic.bannerText.includes('Tryb statyczny') && !chatStatic.overflow, `Błąd szuflady czatu w trybie statycznym: ${JSON.stringify(chatStatic)}`);
    await browser.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await new Promise(r => setTimeout(r, 120));
    const chatEscClosed = await browser.evalJs(`document.getElementById('verityChatDrawer')?.classList.contains('hidden') || false`);
    assert(chatEscClosed, 'Escape nie zamknął szuflady czatu live');

    await browser.evalJs(`document.getElementById('toggleSplitCommunityBtn')?.click()`);
    await new Promise(r => setTimeout(r, 200));
    const splitStatic = await browser.evalJs(`({
      isSplit: document.getElementById('viewPublic')?.classList.contains('is-split-community') || false,
      hasSideCol: Boolean(document.getElementById('communitySideColumn')),
      sideTitle: document.querySelector('#communitySideColumn h2')?.textContent || '',
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    })`);
    assert(splitStatic.isSplit && splitStatic.hasSideCol && splitStatic.sideTitle.includes('Swobodna Aktywność Ludzi') && !splitStatic.overflow, `Błąd widoku 2-kolumnowego (statyczny): ${JSON.stringify(splitStatic)}`);
    await browser.screenshot('desktop_split_community.png');
    await browser.evalJs(`try { localStorage.removeItem('verity_feed_layout_mode'); } catch (e) {}`);
    console.log(`[PASS] Sekcja D (tryb statyczny): /moderacja/ (log=${modStatic.logRows}), czat live, widok 2-kolumnowy OK`);

    // 9. Offline SSR (file://): zachowanie pre-renderowanej treści przy braku fetch('articles.json')
    await browser.cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    const fileHomeUrl = `file://${path.join(ROOT_DIR, 'index.html')}`;
    await browser.goto(fileHomeUrl);
    await new Promise(r => setTimeout(r, 250));
    const fileHome = await browser.evalJs(`({
      cardsCount: document.querySelectorAll('#articlesFeed .story-title-link').length,
      activePolska: Boolean(document.querySelector('.path-chip[data-path="/Polska"]')?.classList.contains('active')),
      feedLen: (document.getElementById('articlesFeed')?.innerHTML || '').length,
    })`);
    assert(fileHome.cardsCount >= 10, `SSR file:// index.html powinien zachować artykuły, jest ${fileHome.cardsCount}`);
    assert(fileHome.activePolska, 'SSR file:// index.html powinien mieć aktywny dział /Polska');

    await browser.evalJs(`document.getElementById('themeBtn_dark')?.click()`);
    await new Promise(r => setTimeout(r, 120));
    const fileThemeAfter = await browser.evalJs(`document.documentElement.getAttribute('data-theme')`);
    assert(fileThemeAfter === 'dark', `Przełącznik motywu nie działa na file:// (jest ${fileThemeAfter})`);
    await browser.evalJs(`document.getElementById('themeBtn_auto')?.click()`);

    // Kliknięcie aktywnego działu .path-chip[data-path="/Polska"] na file:// nie może wyczyścić pre-renderowanego feedu
    await browser.evalJs(`document.querySelector('.path-chip[data-path="/Polska"]').click()`);
    await new Promise(r => setTimeout(r, 300));
    const fileAfterNav = await browser.evalJs(`({
      href: location.href,
      cardsCount: document.querySelectorAll('#articlesFeed .story-title-link').length,
    })`);
    assert(fileAfterNav.href.startsWith('file://') && fileAfterNav.cardsCount >= 10, `Kliknięcie .path-chip na file:// zepsuło SSR: ${JSON.stringify(fileAfterNav)}`);

    const fileSingleUrl = `file://${path.join(ROOT_DIR, sampleSingle.seo_url.replace(/^\/+/, ''), 'index.html')}`;
    await browser.goto(fileSingleUrl);
    await new Promise(r => setTimeout(r, 250));
    const fileSingle = await browser.evalJs(`({
      h1: document.querySelector('h1.article-title')?.textContent?.trim() || '',
      parasCount: document.querySelectorAll('.section-paragraph').length,
    })`);
    assert(fileSingle.h1.length >= 10, `SSR file:// artykułu nie zachował tytułu H1`);
    assert(fileSingle.parasCount >= 1, `SSR file:// artykułu nie zachował akapitów (jest ${fileSingle.parasCount})`);
    console.log(`[PASS] Offline file:// SSR (homeCards=${fileHome.cardsCount}, singleParas=${fileSingle.parasCount}, navCards=${fileAfterNav.cardsCount}) OK`);

    // 10. Full-stack test (python3 server.py + tymczasowa baza SQLite): Czat live SSE, logowanie 1-klik, 2. kolumna, ▲ głos, komentarze, /moderacja/
    const tmpDbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verity-e2e-db-'));
    const tmpDbPath = path.join(tmpDbDir, 'community_e2e.db');
    const apiPort = await new Promise((res, rej) => {
      const s = http.createServer();
      s.listen(0, '127.0.0.1', () => {
        const p = s.address().port;
        s.close(() => res(p));
      });
      s.on('error', rej);
    });
    const srvProc = spawn('python3', [
      'server.py', '--host', '127.0.0.1', '--port', String(apiPort), '--no-seo-rebuild', '--db', tmpDbPath,
    ], {
      cwd: ROOT_DIR,
      env: { ...process.env, VERITY_QUIET_SERVER: '1', PYTHONDONTWRITEBYTECODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const apiBaseUrl = `http://127.0.0.1:${apiPort}`;

    try {
      let srvReady = false;
      for (let i = 0; i < 30; i++) {
        try {
          const r = await httpGetDirect(`${apiBaseUrl}/api/community/bootstrap?path=/Polska`);
          if (r.status === 200) { srvReady = true; break; }
        } catch {}
        await new Promise(r => setTimeout(r, 150));
      }
      assert(srvReady, `Serwer server.py nie uruchomił się na porcie ${apiPort}`);

      await browser.goto(`${apiBaseUrl}/`);
      await browser.evalJs(`try { localStorage.removeItem('verity_session_token'); localStorage.removeItem('verity_feed_layout_mode'); } catch (e) {}`);
      await browser.goto(`${apiBaseUrl}/`);

      // Gość: otwiera czat live, próba linku zablokowana, zwykła wiadomość przechodzi i uruchamia slow-mode
      await browser.evalJs(`document.getElementById('liveChatBtn').click()`);
      await new Promise(r => setTimeout(r, 300));
      await browser.evalJs(`(() => {
        document.getElementById('chatTextInput').value = 'Sprawdź https://example.com';
        document.getElementById('chatSendForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      })()`);
      await new Promise(r => setTimeout(r, 200));
      const guestUrlBlock = await browser.evalJs(`document.getElementById('chatFormHint')?.textContent || ''`);
      assert(guestUrlBlock.includes('nie mogą wysyłać linków URL'), `Brak blokady linków dla gościa: ${guestUrlBlock}`);

      const guestMsg = 'Pozdrowienia od gościa E2E!';
      await browser.evalJs(`(() => {
        document.getElementById('chatTextInput').value = ${JSON.stringify(guestMsg)};
        document.getElementById('chatSendForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      })()`);
      await new Promise(r => setTimeout(r, 350));
      const guestSent = await browser.evalJs(`({
        msgsText: document.getElementById('chatMessagesList')?.textContent || '',
        sendDisabled: Boolean(document.getElementById('chatSendBtn')?.disabled),
        btnLabel: document.getElementById('chatSendBtn')?.textContent || '',
      })`);
      assert(guestSent.msgsText.includes(guestMsg) && guestSent.sendDisabled && guestSent.btnLabel.endsWith('s'), `Gość slow-mode nie zadziałał: ${JSON.stringify(guestSent)}`);

      // Logowanie 1-klik -> odblokowuje czat z linkami, 2. kolumnę, głosowanie i komentarze
      await browser.evalJs(`document.getElementById('authAccountBtn').click()`);
      await new Promise(r => setTimeout(r, 200));
      await browser.evalJs(`(() => {
        document.getElementById('authHandleInput').value = '@E2E_Tester';
        document.getElementById('authDemoAgeSelect').value = '60';
        document.getElementById('verityLoginForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      })()`);
      await new Promise(r => setTimeout(r, 400));
      const authDone = await browser.evalJs(`({
        pillText: document.getElementById('authAccountBtn')?.textContent?.trim() || '',
        loggedClass: document.getElementById('authAccountBtn')?.classList.contains('is-logged') || false,
      })`);
      assert(authDone.pillText === '@E2E_Tester' && authDone.loggedClass, `Logowanie 1-klik nie zaktualizowało pigułki konta: ${JSON.stringify(authDone)}`);

      const userChatUrlMsg = 'Link zalogowanego: https://stat.gov.pl';
      await browser.evalJs(`(() => {
        document.getElementById('chatTextInput').value = ${JSON.stringify(userChatUrlMsg)};
        document.getElementById('chatSendForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      })()`);
      await new Promise(r => setTimeout(r, 350));
      const userChatDone = await browser.evalJs(`document.getElementById('chatMessagesList')?.textContent || ''`);
      assert(userChatDone.includes(userChatUrlMsg), 'Zalogowany użytkownik powinien móc wysłać wiadomość z linkiem na czacie');

      // 2. kolumna: Swobodna Aktywność Ludzi -> dodanie wpisu i trwałość po przeładowaniu
      await browser.evalJs(`document.getElementById('toggleSplitCommunityBtn').click()`);
      await new Promise(r => setTimeout(r, 250));
      const commPostTxt = 'Analiza społecznościowa E2E w dziale Polska — budżet i inwestycje.';
      await browser.evalJs(`(() => {
        document.getElementById('commPostText').value = ${JSON.stringify(commPostTxt)};
        document.querySelector('.comm-composer').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      })()`);
      await new Promise(r => setTimeout(r, 350));
      await browser.goto(`${apiBaseUrl}/`);
      const sidePersisted = await browser.evalJs(`document.getElementById('communitySideColumn')?.textContent || ''`);
      assert(sidePersisted.includes(commPostTxt) && sidePersisted.includes('@E2E_Tester'), 'Wpis w 2. kolumnie nie przetrwał pełnego reloadu strony');

      // Artykuł: głos ▲ Podbij (bez ujawniania surowych wag!) + komentarze chronologiczne #1 i cytat #2 (bez +/-)
      await browser.goto(`${apiBaseUrl}${sampleMulti.seo_url}/`);
      await browser.evalJs(`document.getElementById('upvoteTopicBtn').click()`);
      await new Promise(r => setTimeout(r, 300));
      const c1Txt = 'Pierwszy argument chronologiczny oparty na raporcie GUS.';
      const c2Txt = 'Drugi argument cytujący poprzednią wypowiedź.';
      await browser.evalJs(`(() => {
        document.getElementById('commentTextarea').value = ${JSON.stringify(c1Txt)};
        document.querySelector('.comm-comment-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      })()`);
      await new Promise(r => setTimeout(r, 350));
      await browser.evalJs(`document.querySelector('.comm-comment-actions button')?.click()`);
      await new Promise(r => setTimeout(r, 150));
      await browser.evalJs(`(() => {
        document.getElementById('commentTextarea').value = ${JSON.stringify(c2Txt)};
        document.querySelector('.comm-comment-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      })()`);
      await new Promise(r => setTimeout(r, 350));

      await browser.goto(`${apiBaseUrl}${sampleMulti.seo_url}/`);
      const artCommReloaded = await browser.evalJs(`(() => {
        const wrap = document.getElementById('verityArticleCommunity');
        const txt = wrap?.textContent || '';
        return {
          voteCount: parseInt(document.getElementById('upvoteTopicCount')?.textContent || '0', 10),
          votedCls: document.getElementById('upvoteTopicBtn')?.classList.contains('is-voted') || false,
          commentCards: document.querySelectorAll('.comm-comment-card').length,
          quotesCount: document.querySelectorAll('.comm-quote-box').length,
          txt,
          exposesRawWeight: /raw_weight|0\.2x|1\.5x/i.test(txt),
        };
      })()`);
      assert(artCommReloaded.voteCount >= 1 && artCommReloaded.votedCls, `Głos ▲ Podbij nie przetrwał reloadu: ${JSON.stringify(artCommReloaded)}`);
      assert(!artCommReloaded.exposesRawWeight, 'UI nie może ujawniać wewnętrznych mnożników wagi głosu!');
      assert(artCommReloaded.commentCards >= 2 && artCommReloaded.quotesCount >= 1 && artCommReloaded.txt.includes('#1') && artCommReloaded.txt.includes('#2'), `Komentarze chronologiczne / cytat nie przetrwały reloadu: ${JSON.stringify(artCommReloaded)}`);

      // /moderacja/: sprawdzenie wpisu po ukaraniu przez API
      await browser.evalJs(`fetch('/api/admin/moderation/punish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_handle: '@E2E_ModeracjaTest', content_excerpt: 'Spam komercyjny z testu E2E', tariff_code: '§1.1', outcome: 'PUNISHED' })
      })`);
      await new Promise(r => setTimeout(r, 250));
      await browser.goto(`${apiBaseUrl}/moderacja/`);
      const modLiveText = await browser.evalJs(`document.getElementById('moderationLogBody')?.textContent || ''`);
      assert(modLiveText.includes('@E2E_ModeracjaTest') && modLiveText.includes('§1.1'), `Publiczny Rejestr /moderacja/ nie załadował żywego wpisu z SQLite: ${modLiveText}`);

      await browser.evalJs(`try { localStorage.removeItem('verity_session_token'); localStorage.removeItem('verity_feed_layout_mode'); } catch (e) {}`);
      console.log(`[PASS] Full-stack Section D (server.py + SQLite + SSE chat + 1-klik @E2E_Tester + 2-col + ▲ głos + #1/#2 komentarze + /moderacja/) OK`);
    } finally {
      try { srvProc.kill('SIGTERM'); } catch {}
      try { fs.rmSync(tmpDbDir, { recursive: true, force: true }); } catch {}
    }

    assert(browser.pageExceptions.length === 0, `Nieobsłużone wyjątki JS: ${browser.pageExceptions.join('; ')}`);
    assert(browser.consoleErrors.length === 0, `Błędy console.error: ${browser.consoleErrors.join('; ')}`);
    console.log(`[PASS] Wszystkie testy E2E zaliczone! Zrzuty ekranu zapisano w ${SCREENSHOT_DIR}`);
  } finally {
    if (browser) await browser.cleanup();
    server.close();
  }
}

run().catch(err => {
  console.error('[FAIL]', err);
  process.exit(1);
});

