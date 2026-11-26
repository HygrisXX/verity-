/* VERITY — Dymek pogodowy z lokalizacją użytkownika + interaktywna mapa /pogoda/ (Vanilla JS) */
(function () {
  const CACHE_KEY = 'verity_user_weather_v1';
  const CACHE_TTL_MS = 30 * 60 * 1000;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function tempTone(t) {
    if (t <= -1) return 'tone-cold';
    if (t <= 6) return 'tone-cool';
    if (t <= 16) return 'tone-mild';
    if (t <= 24) return 'tone-warm';
    return 'tone-hot';
  }

  function mapWmoWeather(code, isDay) {
    const c = Number(code);
    const day = isDay !== 0 && isDay !== false;
    if (c === 0) return { icon: day ? '☀️' : '🌙', condition: day ? 'Bezchmurnie' : 'Bezchmurna noc' };
    if (c === 1) return { icon: day ? '🌤️' : '🌙', condition: 'Przeważnie bezchmurnie' };
    if (c === 2) return { icon: '⛅', condition: 'Częściowe zachmurzenie' };
    if (c === 3) return { icon: '☁️', condition: 'Pochmurno' };
    if (c === 45 || c === 48) return { icon: '🌫️', condition: 'Mgła' };
    if (c >= 51 && c <= 57) return { icon: '🌦️', condition: 'Mżawka' };
    if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return { icon: '🌧️', condition: 'Opady deszczu' };
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return { icon: '❄️', condition: 'Opady śniegu' };
    if (c >= 95 && c <= 99) return { icon: '⛈️', condition: 'Burza' };
    return { icon: '⛅', condition: 'Zmienna pogoda' };
  }

  function formatTempShort(t) {
    const n = Number(t);
    if (!Number.isFinite(n)) return '—';
    const r = Math.round(n);
    return (Object.is(r, -0) ? 0 : r) + '°C';
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object' || !obj.city || typeof obj.temp_c !== 'number') return null;
      return obj;
    } catch (_) {
      return null;
    }
  }

  function writeCache(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (_) {}
  }

  function renderWeatherBubble(data) {
    const el = document.getElementById('weatherBubble');
    if (!el || !data || !data.city) return;
    const icoEl = el.querySelector('.wb-ico');
    const cityEl = el.querySelector('.wb-city');
    const tempEl = el.querySelector('.wb-temp');
    const shortTemp = formatTempShort(data.temp_c);
    if (icoEl) icoEl.textContent = data.icon || '⛅';
    if (cityEl) cityEl.textContent = data.city;
    if (tempEl) tempEl.textContent = shortTemp;
    const cond = data.condition || 'Pogoda bieżąca';
    el.setAttribute('title', `${data.city}: ${cond}, ${Number(data.temp_c).toFixed(1)}°C — kliknij, aby otworzyć mapę pogody`);
    el.setAttribute('aria-label', `Pogoda: ${data.city}, ${shortTemp}, ${cond}. Otwórz mapę pogody.`);
  }

  function renderUserWeatherCard(data, statusNote) {
    const card = document.getElementById('userWeatherCard');
    if (!card || !data || !data.city) return;
    const body = card.querySelector('.uwx-body');
    if (!body) return;
    const t = Number(data.temp_c);
    const tone = tempTone(t);
    const srcTag = data.source === 'gps' ? 'Lokalizacja GPS' : (data.source === 'ip' ? 'Wykryto automatycznie' : 'Stacja domyślna');
    const placeSub = [data.region || data.country || '', srcTag].filter(Boolean).join(' · ');
    const feels = data.feels_like_c != null ? `${Number(data.feels_like_c).toFixed(1)}°C` : '—';
    const wind = data.wind_kmh != null ? `${Math.round(Number(data.wind_kmh))} km/h` : '—';
    const press = data.pressure_hpa ? `${Math.round(Number(data.pressure_hpa))} hPa` : '—';
    const hum = data.humidity_pct != null ? `${Math.round(Number(data.humidity_pct))}%` : '—';
    body.innerHTML =
      `<div class="uwx-main">` +
        `<span class="uwx-icon" aria-hidden="true">${esc(data.icon || '⛅')}</span>` +
        `<div class="uwx-place">` +
          `<div class="uwx-city">${esc(data.city)}</div>` +
          `<div class="uwx-sub">${esc(placeSub)}</div>` +
        `</div>` +
        `<div class="uwx-reading">` +
          `<span class="wd-temp ${tone}">${t.toFixed(1)}°C</span>` +
          `<span class="uwx-cond">${esc(data.condition || '')}</span>` +
        `</div>` +
      `</div>` +
      `<div class="uwx-stats">` +
        `<div class="uwx-stat"><span>Odczuwalna</span><strong>${esc(feels)}</strong></div>` +
        `<div class="uwx-stat"><span>Wiatr</span><strong>${esc(wind)}</strong></div>` +
        `<div class="uwx-stat"><span>Ciśnienie</span><strong>${esc(press)}</strong></div>` +
        `<div class="uwx-stat"><span>Wilgotność</span><strong>${esc(hum)}</strong></div>` +
      `</div>` +
      (statusNote ? `<div class="uwx-note">${esc(statusNote)}</div>` : '');
  }

  async function fetchJson(url, timeoutMs) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs || 3500) : null;
    try {
      const res = await fetch(url, { signal: ctrl ? ctrl.signal : undefined, cache: 'no-store' });
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function fetchOpenMeteo(lat, lon) {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,surface_pressure,weather_code,is_day&timezone=auto`;
    const data = await fetchJson(url, 4000);
    if (!data || !data.current || typeof data.current.temperature_2m !== 'number') return null;
    const cur = data.current;
    const mapped = mapWmoWeather(cur.weather_code, cur.is_day);
    return {
      temp_c: Number(cur.temperature_2m),
      feels_like_c: typeof cur.apparent_temperature === 'number' ? Number(cur.apparent_temperature) : null,
      humidity_pct: typeof cur.relative_humidity_2m === 'number' ? Number(cur.relative_humidity_2m) : null,
      wind_kmh: typeof cur.wind_speed_10m === 'number' ? Number(cur.wind_speed_10m) : null,
      pressure_hpa: typeof cur.surface_pressure === 'number' ? Number(cur.surface_pressure) : null,
      icon: mapped.icon,
      condition: mapped.condition,
    };
  }

  async function detectGeoByIp() {
    const g1 = await fetchJson('https://get.geojs.io/v1/ip/geo.json', 3500);
    if (g1 && g1.city && g1.latitude && g1.longitude) {
      return {
        city: String(g1.city),
        country: String(g1.country || ''),
        lat: Number(g1.latitude),
        lon: Number(g1.longitude),
      };
    }
    const g2 = await fetchJson('https://ipwho.is/', 3500);
    if (g2 && g2.success !== false && g2.city && g2.latitude != null && g2.longitude != null) {
      return {
        city: String(g2.city),
        country: String(g2.country || ''),
        lat: Number(g2.latitude),
        lon: Number(g2.longitude),
      };
    }
    return null;
  }

  function isLocalOrTestHost() {
    if (typeof location === 'undefined') return true;
    if (location.protocol === 'file:') return true;
    const h = (location.hostname || '').toLowerCase();
    return h === '127.0.0.1' || h === 'localhost' || h === '::1';
  }

  async function refreshUserWeather() {
    const cached = readCache();
    if (cached) {
      renderWeatherBubble(cached);
      renderUserWeatherCard(cached);
      if (cached.updated_at && (Date.now() - cached.updated_at) < CACHE_TTL_MS) {
        return;
      }
    }

    if (isLocalOrTestHost()) return;

    let geo = null;
    if (cached && cached.source === 'gps' && cached.lat != null && cached.lon != null) {
      geo = { city: cached.city, country: cached.country || '', lat: cached.lat, lon: cached.lon, source: 'gps' };
    } else {
      const ipGeo = await detectGeoByIp();
      if (ipGeo && Number.isFinite(ipGeo.lat) && Number.isFinite(ipGeo.lon)) {
        geo = { ...ipGeo, source: 'ip' };
      }
    }
    if (!geo) return;

    const wx = await fetchOpenMeteo(geo.lat, geo.lon);
    if (!wx) return;

    const payload = {
      city: geo.city,
      country: geo.country || '',
      lat: geo.lat,
      lon: geo.lon,
      source: geo.source,
      updated_at: Date.now(),
      ...wx,
    };
    writeCache(payload);
    renderWeatherBubble(payload);
    renderUserWeatherCard(payload);
  }

  function initPreciseLocateButton() {
    const btn = document.getElementById('locateWeatherBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (!navigator.geolocation) {
        btn.textContent = 'Przeglądarka nie obsługuje GPS';
        return;
      }
      const origLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Pobieranie lokalizacji…';
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const lat = Number(pos.coords.latitude.toFixed(4));
            const lon = Number(pos.coords.longitude.toFixed(4));
            const [rev, wx] = await Promise.all([
              fetchJson(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=pl`, 4000),
              fetchOpenMeteo(lat, lon),
            ]);
            if (wx) {
              const city = (rev && (rev.city || rev.locality || rev.principalSubdivision)) || 'Twoja lokalizacja';
              const country = (rev && rev.countryName) || '';
              const payload = {
                city: String(city),
                country: String(country),
                lat,
                lon,
                source: 'gps',
                updated_at: Date.now(),
                ...wx,
              };
              writeCache(payload);
              renderWeatherBubble(payload);
              renderUserWeatherCard(payload, 'Zaktualizowano na podstawie lokalizacji urządzenia.');
            }
          } finally {
            btn.disabled = false;
            btn.textContent = origLabel;
          }
        },
        () => {
          btn.disabled = false;
          btn.textContent = origLabel;
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
      );
    });
  }

  function initPolandWeatherMap() {
    const mapWrap = document.getElementById('plWeatherMap');
    const detail = document.getElementById('weatherCityDetail');
    const citiesEl = document.getElementById('weatherCitiesData');
    if (!mapWrap || !detail || !citiesEl) return;

    let cities = [];
    try {
      cities = JSON.parse(citiesEl.textContent || '[]');
    } catch (_) {
      return;
    }
    const byCity = {};
    cities.forEach(c => { byCity[c.city] = c; });

    function selectCity(name) {
      const c = byCity[name];
      if (!c) return;
      mapWrap.querySelectorAll('.map-pin').forEach(el => {
        const active = el.getAttribute('data-city') === name;
        el.classList.toggle('is-active', active);
        el.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      document.querySelectorAll('.weather-card[data-city]').forEach(el => {
        el.classList.toggle('is-active', el.getAttribute('data-city') === name);
      });

      const regionLink = c.region_href
        ? `<a class="wd-region-link" href="${esc(c.region_href)}" onclick="return fixFileHref(event)">Wiadomości: ${esc(c.voivodeship)} →</a>`
        : '';

      detail.innerHTML =
        `<div class="wd-head">` +
          `<div><div class="wd-city">${esc(c.city)}</div><div class="wd-voiv">${esc(c.voivodeship)}</div></div>` +
          `<span class="wd-icon" aria-hidden="true">${esc(c.icon || '')}</span>` +
        `</div>` +
        `<div class="wd-temp-row">` +
          `<span class="wd-temp ${tempTone(Number(c.temp_c))}">${Number(c.temp_c).toFixed(1)}°C</span>` +
          `<span class="wd-cond">${esc(c.condition || '')}</span>` +
        `</div>` +
        `<div class="wd-metrics">` +
          `<div class="wd-metric"><span>Wiatr</span><strong>${Math.round(Number(c.wind_kmh || 0))} km/h</strong></div>` +
          `<div class="wd-metric"><span>Ciśnienie</span><strong>${c.pressure_hpa ? Math.round(Number(c.pressure_hpa)) + ' hPa' : '—'}</strong></div>` +
          `<div class="wd-metric"><span>Wilgotność</span><strong>${c.humidity_pct != null ? Math.round(Number(c.humidity_pct)) + '%' : '—'}</strong></div>` +
          `<div class="wd-metric"><span>Opady</span><strong>${Number(c.precip_mm || 0).toFixed(1)} mm</strong></div>` +
        `</div>` +
        `<div class="wd-foot">` +
          `<span class="wd-src">${esc(c.source || 'IMGW-PIB')}${c.measured_at ? ' · ' + esc(c.measured_at) : ''}</span>` +
          `${regionLink}` +
        `</div>`;
    }

    mapWrap.querySelectorAll('.map-pin').forEach(pin => {
      const name = pin.getAttribute('data-city');
      pin.addEventListener('click', () => selectCity(name));
      pin.addEventListener('mouseenter', () => selectCity(name));
      pin.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectCity(name);
        }
      });
    });

    document.querySelectorAll('.weather-card[data-city]').forEach(card => {
      card.addEventListener('click', () => selectCity(card.getAttribute('data-city')));
    });
  }

  function boot() {
    refreshUserWeather();
    initPreciseLocateButton();
    initPolandWeatherMap();
  }

  window.VERITY_WEATHER = {
    renderWeatherBubble,
    renderUserWeatherCard,
    mapWmoWeather,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
