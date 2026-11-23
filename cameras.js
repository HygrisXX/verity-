(function () {
  function initCamerasPage() {
    if (!window.VERITY_IS_CAMERAS) return;
    const grid = document.getElementById('camGrid');
    if (!grid || grid.dataset.camBound === '1') return;
    grid.dataset.camBound = '1';

    const activePlayers = [];
    const MAX_ACTIVE_PLAYERS = 2;

    function plCamPlural(n) {
      const m10 = n % 10;
      const m100 = n % 100;
      if (n === 1) return 'kamera';
      if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'kamery';
      return 'kamer';
    }

    function restoreFacade(mediaEl) {
      if (!mediaEl || !mediaEl.dataset.facadeHtml) return;
      mediaEl.innerHTML = mediaEl.dataset.facadeHtml;
      delete mediaEl.dataset.facadeHtml;
      mediaEl.classList.remove('is-playing');
    }

    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('button.cam-play[data-embed]');
      if (!btn) return;
      const mediaEl = btn.closest('.cam-media');
      if (!mediaEl) return;
      const embedUrl = btn.getAttribute('data-embed');
      if (!embedUrl) return;
      const title = btn.getAttribute('data-title') || 'Kamera na żywo';

      while (activePlayers.length >= MAX_ACTIVE_PLAYERS) {
        const oldest = activePlayers.shift();
        if (oldest && oldest !== mediaEl) restoreFacade(oldest);
      }

      if (!mediaEl.dataset.facadeHtml) {
        mediaEl.dataset.facadeHtml = mediaEl.innerHTML;
      }
      const sep = embedUrl.includes('?') ? '&' : '?';
      const iframe = document.createElement('iframe');
      iframe.className = 'cam-iframe';
      iframe.src = `${embedUrl}${sep}autoplay=1&mute=1`;
      iframe.title = title;
      iframe.loading = 'lazy';
      iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
      iframe.setAttribute('allowfullscreen', '');
      iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');

      mediaEl.innerHTML = '';
      mediaEl.appendChild(iframe);
      mediaEl.classList.add('is-playing');
      activePlayers.push(mediaEl);
    });

    const scopeBtns = Array.from(document.querySelectorAll('.cam-scope-btn[data-cam-scope]'));
    const catBtns = Array.from(document.querySelectorAll('.cam-cat-chip[data-cam-cat]'));
    const regionSelect = document.getElementById('camRegionSelect');
    const countLabel = document.getElementById('camCountLabel');
    const cards = Array.from(grid.querySelectorAll('.cam-card'));

    const state = { scope: 'all', region: '', cat: 'all' };

    function readQuery() {
      if (typeof location === 'undefined' || !location.search) return;
      const sp = new URLSearchParams(location.search);
      const sc = sp.get('scope');
      if (sc === 'polska' || sc === 'swiat' || sc === 'all') state.scope = sc;
      const reg = sp.get('region');
      if (reg && regionSelect && Array.from(regionSelect.options).some(o => o.value === reg)) {
        state.region = reg;
        if (state.scope === 'swiat') state.scope = 'polska';
      }
      const cat = sp.get('cat');
      if (cat && catBtns.some(b => b.getAttribute('data-cam-cat') === cat)) {
        state.cat = cat;
      }
    }

    function writeQuery() {
      if (typeof location === 'undefined' || location.protocol === 'file:' || typeof history === 'undefined') return;
      const sp = new URLSearchParams();
      if (state.scope !== 'all') sp.set('scope', state.scope);
      if (state.region) sp.set('region', state.region);
      if (state.cat !== 'all') sp.set('cat', state.cat);
      const qs = sp.toString();
      const target = location.pathname + (qs ? '?' + qs : '') + location.hash;
      try { history.replaceState(history.state, '', target); } catch (e) {}
    }

    function applyFilters(syncUrl = true) {
      if (state.scope === 'swiat') state.region = '';
      if (regionSelect) {
        regionSelect.value = state.region;
        regionSelect.disabled = state.scope === 'swiat';
      }
      scopeBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-cam-scope') === state.scope));
      catBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-cam-cat') === state.cat));

      let visibleCount = 0;
      cards.forEach(card => {
        const cScope = card.getAttribute('data-scope') || '';
        const cReg = card.getAttribute('data-region') || '';
        const cCat = card.getAttribute('data-category') || '';
        const matchScope = state.scope === 'all' || cScope === state.scope;
        const matchReg = !state.region || cReg === state.region;
        const matchCat = state.cat === 'all' || cCat === state.cat;
        const show = matchScope && matchReg && matchCat;
        card.classList.toggle('hidden', !show);
        if (show) visibleCount += 1;
      });

      if (countLabel) {
        countLabel.textContent = `${visibleCount} ${plCamPlural(visibleCount)}`;
      }
      if (syncUrl) writeQuery();
    }

    scopeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        state.scope = btn.getAttribute('data-cam-scope') || 'all';
        if (state.scope === 'swiat') state.region = '';
        applyFilters(true);
      });
    });

    catBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        state.cat = btn.getAttribute('data-cam-cat') || 'all';
        applyFilters(true);
      });
    });

    if (regionSelect) {
      regionSelect.addEventListener('change', () => {
        state.region = regionSelect.value || '';
        if (state.region && state.scope === 'swiat') state.scope = 'polska';
        applyFilters(true);
      });
    }

    readQuery();
    applyFilters(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCamerasPage);
  } else {
    initCamerasPage();
  }
})();
