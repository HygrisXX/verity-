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
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = process.argv[2] ? path.resolve(process.argv[2]) : path.join(os.tmpdir(), 'verity_e2e_shots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

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
      const reqPath = decodeURIComponent((req.url || '/').split('?')[0]);
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
  const proc = spawn('chromium', [
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
  const sampleMulti = articles.find(a => (a.sources || []).length >= 2 && (a.full_sections || []).length >= 2) || articles[0];
  const sampleSingle = articles.find(a => (a.sources || []).length === 1) || articles[1];

  const { server, port } = await startStaticServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  let browser = null;

  try {
    // 1. Testy HTTP 200 / 404 na serwerze statycznym
    const routesToCheck = [
      ['/', 200],
      ['/Polska/', 200],
      ['/Polska/Gospodarka/', 200],
      ['/Polska/Polityka/', 200],
      ['/Polska/Energetyka/', 200],
      ['/Polska/Poznan/', 200],
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

    // 2. Desktop strona główna
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
    }))()`);
    assert(homeInfo.cards >= 10, `Za mało kart na stronie głównej: ${homeInfo.cards}`);
    assert(!homeInfo.overflow, `Poziomy scroll na desktopie (/): ${homeInfo.scrollW} > ${homeInfo.clientW}`);
    assert(homeInfo.hasNbsp, 'Brak niełamliwych spacji \\u00A0 na stronie głównej');
    assert(homeInfo.robots.includes('index'), `Zły meta robots na /: ${homeInfo.robots}`);
    await browser.screenshot('desktop_home.png');
    console.log(`[PASS] Desktop strona główna (${homeInfo.cards} linków artykułów, 0 overflow, \\u00A0 OK)`);

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

    // 5. Test responsywności Mobile 390x844
    await browser.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await browser.goto(`${baseUrl}/`);
    const mobHome = await browser.evalJs('({ overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })');
    assert(!mobHome.overflow, `Poziomy scroll na mobile (/): ${mobHome.sw} > ${mobHome.cw}`);
    await browser.screenshot('mobile_home.png');

    await browser.goto(`${baseUrl}${sampleMulti.seo_url}/`);
    const mobArt = await browser.evalJs('({ overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })');
    assert(!mobArt.overflow, `Poziomy scroll na mobile (artykuł): ${mobArt.sw} > ${mobArt.cw}`);
    await browser.screenshot('mobile_article.png');
    console.log('[PASS] Mobile 390px strona główna i artykuł (0 overflow) OK');

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
