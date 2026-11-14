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
    const timer = setTimeout(() => reject(new Error('Chromium startup timeout')), 12000);
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
  const sampleRichMulti = articles.find(a => (a.perspectives || []).length >= 5 && (a.full_sections || []).length >= 2)
    || articles.find(a => (a.perspectives || []).length >= 5)
    || articles.find(a => (a.sources || []).length >= 2 && (a.full_sections || []).length >= 2)
    || articles[0];
  const sampleMulti = articles.find(a => (a.sources || []).length >= 2 && (a.full_sections || []).length >= 2) || sampleRichMulti;
  const sampleSingle = articles.find(a => (a.sources || []).length === 1) || articles[1];

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
      [`${sampleMulti.seo_url}/`, 200],
      [`${sampleSingle.seo_url}/`, 200],
      ['/sitemap.xml', 200],
      ['/news-sitemap.xml', 200],
      ['/feed.xml', 200],
      ['/robots.txt', 200],
      ['/nieistniejacy-adres-test-404/', 404],
    ];
    for (const [route, expected] of routesToCheck) {
      const resp = await httpGetDirect(baseUrl + route);
      assert(resp.status === expected, `Oczekiwano HTTP ${expected} dla ${route}, otrzymano ${resp.status}`);
    }
    console.log(`[PASS] Sprawdzenie HTTP statusów (${routesToCheck.length} tras OK)`);

    browser = await launchChromium();

    // 2. Desktop strona główna + szuflada 16 województw
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
      badges: Array.from(document.querySelectorAll('#articlesFeed .story-top .cat-badge')).map(b => b.textContent.trim()),
    }))()`);
    assert(homeInfo.cards >= 10, `Za mało kart na stronie głównej: ${homeInfo.cards}`);
    assert(!homeInfo.overflow, `Poziomy scroll na desktopie (/): ${homeInfo.scrollW} > ${homeInfo.clientW}`);
    assert(homeInfo.hasNbsp, 'Brak niełamliwych spacji \\u00A0 na stronie głównej');
    assert(homeInfo.robots.includes('index'), `Zły meta robots na /: ${homeInfo.robots}`);
    assert(!homeInfo.badges.includes('Świat') && !homeInfo.badges.includes('Sport'), `Karty Świat/Sport nie powinny pojawiać się w dziale Polska (/): ${homeInfo.badges.join(', ')}`);
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
      return {
        hasBar: Boolean(document.querySelector('.source-filter-bar')),
        chipsCount: chips.length,
        targetOutlet: nonZero.length ? nonZero[nonZero.length - 1].getAttribute('data-outlet-filter') : '',
        perspTotal: document.querySelectorAll('.perspective-col').length,
        collapsedCount: collapsed.length,
        collapsedHidden: collapsed.every(el => getComputedStyle(el).display === 'none'),
        hasExpandBtn: Boolean(expBtn),
      };
    })()`);
    assert(richBefore.hasBar && richBefore.chipsCount >= 3 && richBefore.targetOutlet, `Brak paska filtrowania źródeł w ${sampleRichMulti.seo_url}: ${JSON.stringify(richBefore)}`);
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
      };
    })()`);
    assert(!mobHome.overflow, `Poziomy scroll na mobile (/): ${mobHome.sw} > ${mobHome.cw}`);
    assert(mobHome.searchW >= 300, `Za wąskie pole szukania na mobile 390px: ${mobHome.searchW}px`);
    assert(mobHome.topH <= 38, `Pasek top-utility na mobile powinien mieścić się w 1 linii (wysokość=${mobHome.topH}px)`);
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

    const sampleRegional = articles.find(a => (a.path || '').startsWith('/Polska/Regiony/'));
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

