/* VERITY — Interaktywne sortowanie i wyszukiwanie w Rankingu Redakcji (/ranking/) */
(function () {
  function initRanking() {
    const tbody = document.getElementById('rankingTableBody');
    const searchEl = document.getElementById('rankingSearch');
    const sortBtns = document.querySelectorAll('[data-rank-sort]');
    if (!tbody) return;

    let currentSort = 'score';
    const rows = Array.from(tbody.querySelectorAll('tr[data-outlet]'));

    function apply() {
      const q = (searchEl ? searchEl.value : '').trim().toLowerCase();
      const visible = rows.filter(r => !q || (r.getAttribute('data-outlet') || '').toLowerCase().includes(q));
      visible.sort((a, b) => {
        const sa = parseFloat(a.getAttribute('data-score') || '0');
        const sb = parseFloat(b.getAttribute('data-score') || '0');
        const ca = parseFloat(a.getAttribute('data-cb') || '0');
        const cb = parseFloat(b.getAttribute('data-cb') || '0');
        const na = parseInt(a.getAttribute('data-count') || '0', 10);
        const nb = parseInt(b.getAttribute('data-count') || '0', 10);
        if (currentSort === 'cb_asc') return ca - cb || sb - sa || nb - na;
        if (currentSort === 'cb_desc') return cb - ca || nb - na;
        if (currentSort === 'count') return nb - na || sb - sa;
        return sb - sa || ca - cb || nb - na;
      });
      rows.forEach(r => { r.style.display = 'none'; });
      visible.forEach((r, idx) => {
        r.style.display = '';
        const posCell = r.querySelector('.rank-pos');
        if (posCell) posCell.textContent = String(idx + 1);
        tbody.appendChild(r);
      });
    }

    if (searchEl) searchEl.addEventListener('input', apply);
    sortBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        currentSort = btn.getAttribute('data-rank-sort') || 'score';
        sortBtns.forEach(b => b.classList.toggle('active', b === btn));
        apply();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRanking);
  } else {
    initRanking();
  }
})();
