/* VERITY — Interaktywna mapa pogody Polski na stronie /rynki/ (Vanilla JS, bez zależności) */
(function () {
  function initWeatherMap() {
    const mapWrap = document.getElementById('plWeatherMap');
    const detail = document.getElementById('weatherCityDetail');
    if (!mapWrap || !detail) return;

    const citiesEl = document.getElementById('weatherCitiesData');
    if (!citiesEl) return;
    let cities = [];
    try {
      cities = JSON.parse(citiesEl.textContent || '[]');
    } catch (_) {
      return;
    }
    const byCity = {};
    cities.forEach(c => { byCity[c.city] = c; });

    function esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function tempTone(t) {
      if (t <= -1) return 'tone-cold';
      if (t <= 6) return 'tone-cool';
      if (t <= 16) return 'tone-mild';
      if (t <= 24) return 'tone-warm';
      return 'tone-hot';
    }

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
      card.addEventListener('click', () => {
        const name = card.getAttribute('data-city');
        selectCity(name);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWeatherMap);
  } else {
    initWeatherMap();
  }
})();
