/* VERITY Community Layer: Hybrid Auth, Live Chat (SSE), 2-Column Activity, Chronological Comments, Silent Anti-Brigade Voting, /moderacja/ */
(() => {
  'use strict';

  const SESSION_KEY = 'verity_session_token';
  const GUEST_KEY = 'verity_guest_id';
  const LAYOUT_KEY = 'verity_feed_layout_mode';

  const state = {
    backendAvailable: false,
    probed: false,
    user: null,
    token: '',
    guestId: '',
    guestCooldownSec: 90,
    cooldownUntilMs: 0,
    cooldownTimer: null,
    layoutMode: 'classic',
    chatOpen: false,
    chatRoom: 'Globalny',
    chatMessages: [],
    lastChatId: 0,
    sse: null,
    pollTimer: null,
    currentPath: '/Polska',
    currentArticleId: null,
    currentView: 'public',
    articleOpenedAt: Date.now(),
    fromExternal: false,
    replyTo: null,
    posts: [],
    comments: [],
    voteSummary: null,
    tariff: [],
  };

  function rootBase() {
    if (typeof window !== 'undefined' && typeof window.VERITY_BASE === 'string') {
      return window.VERITY_BASE;
    }
    return '';
  }

  function apiUrl(rel) {
    return rootBase() + String(rel || '').replace(/^\/+/, '');
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatTime(iso) {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
    } catch {
      return iso.slice(11, 16) || '';
    }
  }

  function hasGuestBlockedUrl(text) {
    return /(?:https?:\/\/|ftp:\/\/|www\.|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:pl|com|org|net|eu|info|biz|io|gg|me|tv|xyz|de|uk|co)\b)/i.test(text || '');
  }

  function initClientIds() {
    try {
      state.token = localStorage.getItem(SESSION_KEY) || '';
      let gid = localStorage.getItem(GUEST_KEY) || '';
      if (!gid) {
        gid = 'g_' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(GUEST_KEY, gid);
      }
      state.guestId = gid;
      const savedLayout = localStorage.getItem(LAYOUT_KEY);
      if (savedLayout === 'split' || savedLayout === 'classic') {
        state.layoutMode = savedLayout;
      }
    } catch {
      state.guestId = 'g_anon';
    }
    try {
      if (document.referrer && !document.referrer.includes(location.host)) {
        state.fromExternal = true;
      }
    } catch {}
  }

  function reqHeaders(json = false) {
    const h = {};
    if (json) h['Content-Type'] = 'application/json';
    if (state.token) h['X-Session-Token'] = state.token;
    if (state.guestId) h['X-Guest-Id'] = state.guestId;
    return h;
  }

  async function apiGet(ep) {
    if (location.protocol === 'file:') return null;
    try {
      const r = await fetch(apiUrl(ep), { cache: 'no-store', headers: reqHeaders(false) });
      if (!r.ok) return null;
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      if (!ct.includes('application/json')) return null;
      return await r.json();
    } catch {
      return null;
    }
  }

  async function apiPost(ep, body) {
    if (location.protocol === 'file:') {
      return { ok: false, status: 0, error: 'Tryb offline file:// — zapisy społeczności wymagają backendu VERITY.' };
    }
    try {
      const r = await fetch(apiUrl(ep), {
        method: 'POST',
        headers: reqHeaders(true),
        body: JSON.stringify(body || {}),
      });
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      const data = ct.includes('application/json') ? await r.json().catch(() => null) : null;
      if (!data) {
        return { ok: false, status: r.status, error: 'Backend społeczności jest nieaktywny w trybie statycznym.' };
      }
      return { ...data, status: r.status };
    } catch {
      return { ok: false, status: 0, error: 'Brak połączenia z backendem społeczności.' };
    }
  }

  function updateAuthPill() {
    const btn = document.getElementById('authAccountBtn');
    if (!btn) return;
    if (state.user) {
      btn.textContent = state.user.handle;
      btn.classList.add('is-logged');
      btn.title = `Zalogowano jako ${state.user.handle} (staż: ${state.user.age_days} dni, pkt karne: ${state.user.penalty_points}/10)`;
    } else {
      btn.textContent = 'Konto';
      btn.classList.remove('is-logged');
      btn.title = 'Zaloguj się w 1 klik lub utwórz konto VERITY';
    }
  }

  function ensureShellOverlays() {
    if (document.getElementById('verityChatDrawer')) return;

    const drawer = document.createElement('aside');
    drawer.id = 'verityChatDrawer';
    drawer.className = 'chat-drawer hidden';
    drawer.setAttribute('aria-label', 'Czat live społeczności VERITY');
    drawer.innerHTML = `
      <div class="chat-drawer-head">
        <div>
          <div class="chat-drawer-title"><span class="chat-live-dot" aria-hidden="true"></span>Czat live VERITY</div>
          <div id="chatRoomSubtitle" class="chat-drawer-sub">Pokój: Globalny</div>
        </div>
        <button type="button" class="regions-drawer-close" onclick="window.VERITY_COMMUNITY.toggleChat(false)" aria-label="Zamknij czat">✕</button>
      </div>
      <div class="chat-room-tabs">
        <button type="button" id="chatTabGlobal" class="chat-room-tab active" onclick="window.VERITY_COMMUNITY.switchChatRoom('Globalny')">Globalny</button>
        <button type="button" id="chatTabSection" class="chat-room-tab" onclick="window.VERITY_COMMUNITY.switchChatRoom('section')">Dział: /Polska</button>
      </div>
      <div id="chatStatusBanner" class="chat-status-banner"></div>
      <div id="chatMessagesList" class="chat-messages-list" aria-live="polite"></div>
      <form id="chatSendForm" class="chat-send-form" onsubmit="return window.VERITY_COMMUNITY.submitChat(event)">
        <input id="chatTextInput" type="text" class="text-input chat-text-input" maxlength="600" placeholder="Napisz na czacie live..." autocomplete="off" />
        <button id="chatSendBtn" type="submit" class="btn-primary chat-send-btn">Wyślij</button>
      </form>
      <div id="chatFormHint" class="chat-form-hint"></div>
    `;
    document.body.appendChild(drawer);

    const modal = document.createElement('div');
    modal.id = 'verityAuthModal';
    modal.className = 'verity-modal-backdrop hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Konto czytelnika VERITY');
    modal.innerHTML = `
      <div class="verity-modal-card">
        <div class="verity-modal-head">
          <h2>Konto VERITY (1-klik rejestracja)</h2>
          <button type="button" class="regions-drawer-close" onclick="window.VERITY_COMMUNITY.closeAuthModal()" aria-label="Zamknij okno konta">✕</button>
        </div>
        <div id="verityAuthBody"></div>
      </div>
    `;
    modal.addEventListener('click', e => {
      if (e.target === modal) closeAuthModal();
    });
    document.body.appendChild(modal);
  }

  function renderAuthModalBody() {
    const body = document.getElementById('verityAuthBody');
    if (!body) return;
    if (!state.backendAvailable) {
      body.innerHTML = `
        <p class="mod-desc">Jesteś w trybie statycznym (tylko do odczytu). Konta użytkowników, czat live oraz głosy działają przy aktywnym serwerze VERITY.</p>
        <div style="margin-top:0.9rem;display:flex;justify-content:flex-end">
          <button type="button" class="btn-outline" onclick="window.VERITY_COMMUNITY.closeAuthModal()">Zamknij</button>
        </div>
      `;
      return;
    }
    if (state.user) {
      body.innerHTML = `
        <div class="auth-profile-box">
          <div class="auth-profile-row"><span>Nick:</span><strong>${esc(state.user.handle)}</strong></div>
          <div class="auth-profile-row"><span>Staż konta:</span><strong>${Number(state.user.age_days || 0)} dni</strong></div>
          <div class="auth-profile-row"><span>Status:</span><strong>${esc(state.user.status || 'ACTIVE')}</strong></div>
          <div class="auth-profile-row"><span>Punkty taryfikatora (§1.1–§2.3):</span><strong>${Number(state.user.penalty_points || 0)} / 10 pkt</strong></div>
        </div>
        <p class="mod-desc" style="margin-top:0.75rem">Masz pełny dostęp do czatu live (z linkami), 2. kolumny <em>Swobodna Aktywność Ludzi</em>, komentarzy chronologicznych bez +/- oraz głosowania <code>▲ Podbij temat</code>.</p>
        <div style="margin-top:1rem;display:flex;justify-content:space-between;gap:0.5rem">
          <a class="btn-outline" style="text-decoration:none" href="${esc(rootBase())}moderacja/">Zobacz /moderacja</a>
          <button type="button" id="authLogoutBtn" class="btn-outline" onclick="window.VERITY_COMMUNITY.logout()">Wyloguj się</button>
        </div>
      `;
      return;
    }

    body.innerHTML = `
      <p class="mod-desc" style="margin-bottom:0.85rem">
        <strong>Model hybrydowy VERITY:</strong> jako gość czytasz wszystko i piszesz na czacie live w trybie slow-mode (bez linków). Utworzenie konta jednym kliknięciem odblokowuje pełny czat, wpisy w 2. kolumnie, komentarze chronologiczne oraz głosowanie <code>▲ Podbij temat</code>.
      </p>
      <form id="verityLoginForm" onsubmit="return window.VERITY_COMMUNITY.submitLogin(event)" class="auth-form-stack">
        <label class="queue-label" for="authHandleInput">Wybierz swój @Nick (3–24 znaki):</label>
        <input id="authHandleInput" type="text" class="text-input" placeholder="np. @Czytelnik_PL" required minlength="3" maxlength="24" />
        <label class="queue-label" for="authDemoAgeSelect">Symulacja stażu konta (tryb testowy):</label>
        <select id="authDemoAgeSelect" class="text-input">
          <option value="0">Świeże konto (0 dni stażu)</option>
          <option value="60">Stały czytelnik (60 dni stażu)</option>
          <option value="420">Weteran (420 dni stażu)</option>
        </select>
        <div id="authFormError" class="corr-msg"></div>
        <div style="display:flex;justify-content:flex-end;gap:0.5rem;margin-top:0.35rem">
          <button type="button" class="btn-outline" onclick="window.VERITY_COMMUNITY.closeAuthModal()">Anuluj</button>
          <button type="submit" id="authSubmitBtn" class="btn-primary">Wejdź w 1 klik</button>
        </div>
      </form>
    `;
  }

  function openAuthModal() {
    ensureShellOverlays();
    renderAuthModalBody();
    document.getElementById('verityAuthModal')?.classList.remove('hidden');
    setTimeout(() => document.getElementById('authHandleInput')?.focus(), 50);
  }

  function closeAuthModal() {
    document.getElementById('verityAuthModal')?.classList.add('hidden');
  }

  async function submitLogin(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    const handle = (document.getElementById('authHandleInput')?.value || '').trim();
    const demoAge = parseInt(document.getElementById('authDemoAgeSelect')?.value || '0', 10) || 0;
    const errEl = document.getElementById('authFormError');
    const res = await apiPost('api/auth/login', { handle, demo_age_days: demoAge });
    if (!res.ok) {
      if (errEl) {
        errEl.textContent = res.error || 'Nie udało się utworzyć sesji.';
        errEl.style.color = 'var(--danger)';
      }
      return false;
    }
    state.user = res.user;
    state.token = res.token || '';
    try { localStorage.setItem(SESSION_KEY, state.token); } catch {}
    updateAuthPill();
    closeAuthModal();
    await refreshForCurrentContext();
    return false;
  }

  async function logout() {
    await apiPost('api/auth/logout', {});
    state.user = null;
    state.token = '';
    try { localStorage.removeItem(SESSION_KEY); } catch {}
    updateAuthPill();
    closeAuthModal();
    await refreshForCurrentContext();
  }

  function activeSectionRoom() {
    if (state.currentPath && state.currentPath !== '/moderacja') return state.currentPath;
    return '/Polska';
  }

  function closeChatStream() {
    if (state.sse) {
      try { state.sse.close(); } catch {}
      state.sse = null;
    }
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function renderChatMessages() {
    const list = document.getElementById('chatMessagesList');
    const statusBanner = document.getElementById('chatStatusBanner');
    const hint = document.getElementById('chatFormHint');
    const sub = document.getElementById('chatRoomSubtitle');
    const tabGlobal = document.getElementById('chatTabGlobal');
    const tabSection = document.getElementById('chatTabSection');
    const secRoom = activeSectionRoom();

    if (sub) sub.textContent = `Pokój: ${state.chatRoom}`;
    if (tabGlobal) tabGlobal.classList.toggle('active', state.chatRoom === 'Globalny');
    if (tabSection) {
      tabSection.classList.toggle('active', state.chatRoom !== 'Globalny');
      tabSection.textContent = `Dział: ${secRoom}`;
    }

    if (statusBanner) {
      if (!state.backendAvailable) {
        statusBanner.className = 'chat-status-banner is-offline';
        statusBanner.innerHTML = 'Tryb statyczny (tylko do odczytu): czat live działa przy aktywnym serwerze VERITY.';
      } else if (state.user) {
        statusBanner.className = 'chat-status-banner is-user';
        statusBanner.innerHTML = `Zalogowany jako <strong>${esc(state.user.handle)}</strong> · pełny czat aktywny`;
      } else {
        statusBanner.className = 'chat-status-banner is-guest';
        statusBanner.innerHTML = `Tryb gościa: <strong>slow-mode (${state.guestCooldownSec}s)</strong>, linki zablokowane. <button type="button" class="link-inline-btn" onclick="window.VERITY_COMMUNITY.openAuthModal()">Konto w 1 klik</button>`;
      }
    }

    const input = document.getElementById('chatTextInput');
    const sendBtn = document.getElementById('chatSendBtn');
    if (input) input.disabled = !state.backendAvailable;
    if (sendBtn && !state.backendAvailable) sendBtn.disabled = true;
    else if (sendBtn && state.cooldownUntilMs <= Date.now()) {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Wyślij';
    }

    if (hint && !hint.dataset.lockedError) {
      hint.textContent = state.user
        ? 'Obowiązuje taryfikator §1.1–§2.3 (/moderacja).'
        : 'Goście: brak linków URL + limit czasu między wiadomościami.';
      hint.style.color = '';
    }

    if (!list) return;
    if (!state.backendAvailable) {
      list.innerHTML = '<div class="chat-empty">Czat na żywo jest dostępny w trybie aktywnego serwera VERITY.</div>';
      return;
    }
    if (!state.chatMessages.length) {
      list.innerHTML = `<div class="chat-empty">Brak wiadomości w pokoju <strong>${esc(state.chatRoom)}</strong>. Napisz pierwszy!</div>`;
      return;
    }
    list.innerHTML = state.chatMessages.map(m => `
      <div class="chat-msg ${m.author_kind === 'guest' ? 'is-guest' : 'is-user'}" data-chat-id="${m.id}">
        <div class="chat-msg-meta">
          <span class="chat-msg-author">${esc(m.author_handle)}</span>
          <span class="chat-msg-badge">${m.author_kind === 'guest' ? 'Gość · slow' : 'Konto'}</span>
          <span class="chat-msg-time">${esc(formatTime(m.created_at))}</span>
        </div>
        <div class="chat-msg-text">${esc(m.text)}</div>
      </div>
    `).join('');
    list.scrollTop = list.scrollHeight;
  }

  function appendChatMessage(msg) {
    if (!msg || !msg.id) return;
    if (state.chatMessages.some(x => x.id === msg.id)) return;
    state.chatMessages.push(msg);
    if (state.chatMessages.length > 80) state.chatMessages = state.chatMessages.slice(-80);
    state.lastChatId = Math.max(state.lastChatId, Number(msg.id));
    renderChatMessages();
  }

  function startChatStream() {
    closeChatStream();
    if (!state.chatOpen || !state.backendAvailable || location.protocol === 'file:') return;

    const roomParam = encodeURIComponent(state.chatRoom);
    const afterParam = encodeURIComponent(String(state.lastChatId || 0));
    if (typeof EventSource !== 'undefined') {
      try {
        const es = new EventSource(apiUrl(`api/chat/stream?room=${roomParam}&after_id=${afterParam}`));
        state.sse = es;
        es.addEventListener('message', ev => {
          try {
            const parsed = JSON.parse(ev.data);
            appendChatMessage(parsed);
          } catch {}
        });
        es.onerror = () => {
          // Przełącz awaryjnie na lekkie odpytywanie, jeśli strumień SSE został przerwany
          if (!state.pollTimer && state.chatOpen && state.backendAvailable) {
            state.pollTimer = setInterval(async () => {
              if (!state.chatOpen) return;
              const d = await apiGet(`api/chat/messages?room=${encodeURIComponent(state.chatRoom)}&after_id=${state.lastChatId}`);
              if (d && Array.isArray(d.messages)) d.messages.forEach(appendChatMessage);
            }, 4000);
          }
        };
        return;
      } catch {}
    }
    state.pollTimer = setInterval(async () => {
      if (!state.chatOpen) return;
      const d = await apiGet(`api/chat/messages?room=${encodeURIComponent(state.chatRoom)}&after_id=${state.lastChatId}`);
      if (d && Array.isArray(d.messages)) d.messages.forEach(appendChatMessage);
    }, 3000);
  }

  async function loadChatRoom(roomName) {
    state.chatRoom = roomName === 'section' ? activeSectionRoom() : (roomName || 'Globalny');
    state.lastChatId = 0;
    state.chatMessages = [];
    if (state.backendAvailable) {
      const data = await apiGet(`api/chat/messages?room=${encodeURIComponent(state.chatRoom)}`);
      if (data && Array.isArray(data.messages)) {
        state.chatRoom = data.room || state.chatRoom;
        state.chatMessages = data.messages;
        if (data.messages.length) {
          state.lastChatId = Math.max(...data.messages.map(m => Number(m.id || 0)));
        }
      }
    }
    renderChatMessages();
    if (state.chatOpen) startChatStream();
  }

  async function toggleChat(forceOpen) {
    ensureShellOverlays();
    const drawer = document.getElementById('verityChatDrawer');
    if (!drawer) return;
    const next = typeof forceOpen === 'boolean' ? forceOpen : drawer.classList.contains('hidden');
    state.chatOpen = next;
    drawer.classList.toggle('hidden', !next);
    document.getElementById('liveChatBtn')?.classList.toggle('is-open', next);
    if (next) {
      await loadChatRoom(state.chatRoom);
      setTimeout(() => document.getElementById('chatTextInput')?.focus(), 60);
    } else {
      closeChatStream();
    }
  }

  function startCooldownCountdown(seconds) {
    if (state.cooldownTimer) clearInterval(state.cooldownTimer);
    state.cooldownUntilMs = Date.now() + seconds * 1000;
    const tick = () => {
      const btn = document.getElementById('chatSendBtn');
      const rem = Math.ceil((state.cooldownUntilMs - Date.now()) / 1000);
      if (rem <= 0) {
        clearInterval(state.cooldownTimer);
        state.cooldownTimer = null;
        if (btn && state.backendAvailable) {
          btn.disabled = false;
          btn.textContent = 'Wyślij';
        }
      } else if (btn) {
        btn.disabled = true;
        btn.textContent = `${rem}s`;
      }
    };
    tick();
    state.cooldownTimer = setInterval(tick, 500);
  }

  async function submitChat(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    const input = document.getElementById('chatTextInput');
    const hint = document.getElementById('chatFormHint');
    if (!input) return false;
    const txt = input.value.trim();
    if (!txt) return false;

    if (!state.user && hasGuestBlockedUrl(txt)) {
      if (hint) {
        hint.dataset.lockedError = '1';
        hint.textContent = 'Goście w slow-mode nie mogą wysyłać linków URL. Zaloguj się w 1 klik.';
        hint.style.color = 'var(--danger)';
      }
      return false;
    }

    const res = await apiPost('api/chat/send', { room: state.chatRoom, text: txt });
    if (!res.ok) {
      if (hint) {
        hint.dataset.lockedError = '1';
        hint.textContent = res.error || 'Nie udało się wysłać wiadomości.';
        hint.style.color = 'var(--danger)';
      }
      return false;
    }
    if (hint) {
      delete hint.dataset.lockedError;
      hint.style.color = '';
    }
    input.value = '';
    if (res.message) appendChatMessage(res.message);
    if (!state.user && state.guestCooldownSec > 0) {
      startCooldownCountdown(state.guestCooldownSec);
    }
    renderChatMessages();
    return false;
  }

  // ==================== 2. KOLUMNA: SWOBODNA AKTYWNOŚĆ LUDZI ====================
  function setLayoutMode(mode) {
    state.layoutMode = mode === 'split' ? 'split' : 'classic';
    try { localStorage.setItem(LAYOUT_KEY, state.layoutMode); } catch {}
    mountFeedCommunity();
  }

  async function submitCommunityPost(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    const typeEl = document.getElementById('commPostType');
    const textEl = document.getElementById('commPostText');
    const linkEl = document.getElementById('commPostLink');
    const msgEl = document.getElementById('commPostMsg');
    if (!textEl) return false;

    const res = await apiPost('api/community/posts', {
      path: state.currentPath || '/Polska',
      post_type: typeEl ? typeEl.value : 'Własna analiza',
      text: textEl.value.trim(),
      link_url: linkEl ? linkEl.value.trim() : '',
    });
    if (!res.ok) {
      if (msgEl) {
        msgEl.textContent = res.error || 'Błąd zapisu wpisu.';
        msgEl.style.color = 'var(--danger)';
      }
      if (res.status === 403) openAuthModal();
      return false;
    }
    textEl.value = '';
    if (linkEl) linkEl.value = '';
    if (res.post) state.posts.unshift(res.post);
    mountFeedCommunity();
    const m2 = document.getElementById('commPostMsg');
    if (m2) {
      m2.textContent = 'Dodano wpis w ścieżce ' + (state.currentPath || '/Polska');
      m2.style.color = 'var(--success)';
    }
    return false;
  }

  function renderCommunityColumnHtml() {
    const curPath = state.currentPath || '/Polska';
    const postsHtml = state.posts.length
      ? state.posts.map(p => `
        <article class="comm-post-card" data-post-id="${p.id}">
          <div class="comm-post-head">
            <span class="comm-post-path">${esc(p.path)} · <strong>${esc(p.author_handle)}</strong></span>
            <span class="comm-post-type">${esc(p.post_type)}</span>
          </div>
          <p class="comm-post-text">${esc(p.text)}</p>
          ${p.link_url ? `<a class="comm-post-link" href="${esc(p.link_url)}" target="_blank" rel="noopener noreferrer">${esc(p.link_url)} ↗</a>` : ''}
          <div class="comm-post-foot">
            <span>${esc(formatTime(p.created_at))}</span>
            ${state.backendAvailable ? `<button type="button" class="comm-report-btn" onclick="window.VERITY_COMMUNITY.reportItem('post', ${p.id})">Zgłoś (§)</button>` : ''}
          </div>
        </article>
      `).join('')
      : `<div class="chat-empty">Brak wpisów użytkowników w ścieżce <strong>${esc(curPath)}</strong>.</div>`;

    const composerHtml = !state.backendAvailable
      ? `<div class="comm-readonly-note">Tryb statyczny: dodawanie wpisów społeczności wymaga aktywnego serwera VERITY.</div>`
      : (state.user
        ? `<form class="comm-composer" onsubmit="return window.VERITY_COMMUNITY.submitCommunityPost(event)">
            <div class="comm-composer-row">
              <select id="commPostType" class="text-input">
                <option value="Własna analiza">Własna analiza</option>
                <option value="Relacja na żywo">Relacja na żywo</option>
                <option value="Pytanie do społeczności">Pytanie do społeczności</option>
                <option value="Wrzutka linku">Wrzutka linku</option>
              </select>
              <input id="commPostLink" type="url" class="text-input" placeholder="Opcjonalny link https://..." />
            </div>
            <textarea id="commPostText" class="text-input" rows="2" placeholder="Twój wpis w ścieżce ${esc(curPath)} (bez cenzury działowej, obowiązuje §1.1–§2.3)..."></textarea>
            <div class="comm-composer-actions">
              <span id="commPostMsg" class="corr-msg"></span>
              <button type="submit" class="btn-primary">+ Dodaj wpis w ${esc(curPath)}</button>
            </div>
          </form>`
        : `<div class="comm-login-prompt">
            <span>Chcesz dodać relację lub analizę w <strong>${esc(curPath)}</strong>?</span>
            <button type="button" class="btn-outline" onclick="window.VERITY_COMMUNITY.openAuthModal()">Utwórz konto w 1 klik</button>
          </div>`);

    return `
      <div class="comm-col-head">
        <div>
          <h2>Swobodna Aktywność Ludzi</h2>
          <p>Ścieżka <code>${esc(curPath)}</code> · Brak właścicieli działów — obowiązuje wyłącznie taryfikator §1.1–§2.3</p>
        </div>
      </div>
      ${composerHtml}
      <div class="comm-posts-list">${postsHtml}</div>
    `;
  }

  function mountFeedCommunity() {
    const viewPub = document.getElementById('viewPublic');
    const feed = document.getElementById('articlesFeed');
    if (!viewPub || !feed) return;

    const existingBar = document.getElementById('communityFeedToolbar');
    const existingPanel = document.getElementById('communitySideColumn');

    const isFeedMode = state.currentView === 'public' && !state.currentArticleId && !window.VERITY_IS_MODERATION && !window.VERITY_IS_404;
    if (!isFeedMode) {
      viewPub.classList.remove('is-split-community');
      if (existingBar) existingBar.remove();
      if (existingPanel) existingPanel.remove();
      return;
    }

    let toolbar = existingBar;
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.id = 'communityFeedToolbar';
      toolbar.className = 'comm-feed-toolbar';
      viewPub.insertBefore(toolbar, feed);
    }

    const postCnt = state.posts.length;
    toolbar.innerHTML = `
      <div class="comm-feed-meta">
        <span class="comm-slash-pill">${esc(state.currentPath || '/Polska')}</span>
        <span class="comm-feed-desc">Porównuj <strong>Syntezę Automatu</strong> z <strong>Aktywnością Ludzi</strong> (${postCnt})</span>
      </div>
      <div class="comm-layout-switch" role="group" aria-label="Tryb kolumn">
        <button type="button" class="comm-mode-btn${state.layoutMode === 'classic' ? ' active' : ''}" onclick="window.VERITY_COMMUNITY.setLayoutMode('classic')">Widok klasyczny</button>
        <button type="button" id="toggleSplitCommunityBtn" class="comm-mode-btn${state.layoutMode === 'split' ? ' active' : ''}" onclick="window.VERITY_COMMUNITY.setLayoutMode('split')">Widok 2-kolumnowy (${postCnt})</button>
      </div>
    `;

    viewPub.classList.toggle('is-split-community', state.layoutMode === 'split');

    if (state.layoutMode === 'split') {
      let side = existingPanel;
      if (!side) {
        side = document.createElement('aside');
        side.id = 'communitySideColumn';
        side.className = 'comm-side-column';
        viewPub.appendChild(side);
      }
      side.innerHTML = renderCommunityColumnHtml();
    } else if (existingPanel) {
      existingPanel.remove();
    }
  }

  // ==================== ARTYKUŁ: WAŻONY GŁOS ▲ + KOMENTARZE CHRONOLOGICZNE ====================
  async function toggleVote(articleId) {
    if (!state.user) {
      openAuthModal();
      return;
    }
    const readSec = Math.max(0, Math.round((Date.now() - state.articleOpenedAt) / 1000));
    const res = await apiPost('api/votes', {
      article_id: articleId,
      read_seconds: readSec,
      from_external: state.fromExternal,
    });
    if (!res.ok) {
      if (res.status === 403) openAuthModal();
      return;
    }
    if (res.vote_summary) {
      state.voteSummary = res.vote_summary;
      mountArticleCommunity();
    }
  }

  function setReplyTarget(commentId, seqNum, authorHandle, text) {
    const excerpt = (text || '').length > 100 ? text.slice(0, 100) + '…' : (text || '');
    state.replyTo = { id: commentId, seq_num: seqNum, author: authorHandle, excerpt };
    mountArticleCommunity();
    document.getElementById('commentTextarea')?.focus();
  }

  function clearReplyTarget() {
    state.replyTo = null;
    mountArticleCommunity();
  }

  async function submitComment(ev, articleId) {
    if (ev && ev.preventDefault) ev.preventDefault();
    const ta = document.getElementById('commentTextarea');
    const msgEl = document.getElementById('commentFormMsg');
    if (!ta) return false;
    const text = ta.value.trim();
    if (!text) return false;

    const res = await apiPost('api/comments', {
      article_id: articleId,
      text,
      reply_to_id: state.replyTo ? state.replyTo.id : null,
    });
    if (!res.ok) {
      if (msgEl) {
        msgEl.textContent = res.error || 'Nie udało się dodać komentarza.';
        msgEl.style.color = 'var(--danger)';
      }
      if (res.status === 403) openAuthModal();
      return false;
    }
    ta.value = '';
    state.replyTo = null;
    if (res.comment) state.comments.push(res.comment);
    mountArticleCommunity();
    return false;
  }

  async function reportItem(targetType, targetId) {
    if (!state.backendAvailable) return;
    const code = window.prompt('Podaj paragraf taryfikatora (§1.1 spam, §1.2 rajd, §2.1 obelga, §2.2 nienawiść, §2.3 groźby):', '§2.1');
    if (code === null) return;
    const res = await apiPost('api/reports', {
      target_type: targetType,
      target_id: targetId,
      tariff_code: code.trim() || '§2.1',
      reason: 'Zgłoszenie czytelnika z portalu',
    });
    if (res.ok) {
      const box = document.getElementById('communityFeedbackToast') || document.getElementById('commentFormMsg');
      if (box) {
        box.textContent = `Zgłoszono do Kolejki Moderacji (${res.report?.tariff_code || code}).`;
        box.style.color = 'var(--success)';
      }
    }
  }

  function mountArticleCommunity() {
    const artMain = document.querySelector('#articlesFeed .article-main');
    if (!artMain || !state.currentArticleId) return;

    let mount = document.getElementById('verityArticleCommunity');
    if (!mount) {
      mount = document.createElement('section');
      mount.id = 'verityArticleCommunity';
      mount.className = 'article-community-wrap';
      artMain.appendChild(mount);
    }

    const vs = state.voteSummary || { display_score: 0, total_voters: 0, user_voted: false };
    const votedCls = vs.user_voted ? ' is-voted' : '';
    const disabledNote = !state.backendAvailable
      ? '<span class="comm-vote-note">Tryb statyczny — głosowanie i komentarze działają przy aktywnym backendzie VERITY.</span>'
      : '<span class="comm-vote-note">Każdy zalogowany użytkownik = 1 głos (cichy filtr Anty-Discord w tle)</span>';

    const commentsListHtml = !state.backendAvailable
      ? '<div class="chat-empty">Dyskusja i komentarze chronologiczne (bez ocen +/-) są dostępne przy aktywnym serwerze VERITY.</div>'
      : (state.comments.length
        ? state.comments.map(c => `
          <div class="comm-comment-card" data-comment-id="${c.id}">
            <div class="comm-comment-head">
              <div>
                <strong>${esc(c.author_handle)}</strong>
                <span class="comm-comment-meta">• #${Number(c.seq_num)} • ${esc(formatTime(c.created_at))}</span>
              </div>
              <div class="comm-comment-actions">
                <button type="button" onclick="window.VERITY_COMMUNITY.setReplyTarget(${c.id}, ${Number(c.seq_num)}, ${JSON.stringify(c.author_handle).replace(/"/g, '&quot;')}, ${JSON.stringify(c.text).replace(/"/g, '&quot;')})">Odpowiedz / Cytuj</button>
                <button type="button" class="is-danger" onclick="window.VERITY_COMMUNITY.reportItem('comment', ${c.id})">Zgłoś (§)</button>
              </div>
            </div>
            ${c.quote_author ? `<div class="comm-quote-box"><strong>${esc(c.quote_author)} (#${Number(c.reply_to_seq || 0)}):</strong> „${esc(c.quote_excerpt)}”</div>` : ''}
            <p class="comm-comment-body">${esc(c.text)}</p>
          </div>
        `).join('')
        : '<div class="chat-empty">Brak komentarzy — rozpocznij rzeczową dyskusję chronologiczną poniżej.</div>');

    let composerHtml = '';
    if (state.backendAvailable) {
      if (state.user) {
        const replyBanner = state.replyTo
          ? `<div class="comm-reply-banner"><span>Cytujesz <strong>${esc(state.replyTo.author)} (#${state.replyTo.seq_num})</strong>: „${esc(state.replyTo.excerpt)}”</span><button type="button" onclick="window.VERITY_COMMUNITY.clearReplyTarget()">✕</button></div>`
          : '';
        composerHtml = `
          <form class="comm-comment-form" onsubmit="return window.VERITY_COMMUNITY.submitComment(event, ${state.currentArticleId})">
            ${replyBanner}
            <textarea id="commentTextarea" class="text-input" rows="3" placeholder="Dodaj argument do dyskusji (układ chronologiczny, brak minusowania poglądów)..."></textarea>
            <div class="comm-composer-actions">
              <span id="commentFormMsg" class="corr-msg"></span>
              <button type="submit" class="btn-primary">Dodaj komentarz</button>
            </div>
          </form>
        `;
      } else {
        composerHtml = `
          <div class="comm-login-prompt">
            <span>Aby dodać komentarz lub podbić temat, utwórz konto w 1 kliknięcie.</span>
            <button type="button" class="btn-primary" onclick="window.VERITY_COMMUNITY.openAuthModal()">Zaloguj / Utwórz konto</button>
          </div>
        `;
      }
    }

    mount.innerHTML = `
      <div class="comm-vote-bar">
        <button type="button" id="upvoteTopicBtn" class="comm-vote-btn${votedCls}" onclick="window.VERITY_COMMUNITY.toggleVote(${state.currentArticleId})" ${state.backendAvailable ? '' : 'disabled'}>
          <span>▲ Podbij ważny temat</span>
          <span id="upvoteTopicCount" class="comm-vote-count">${Number(vs.display_score || 0)}</span>
        </button>
        ${disabledNote}
      </div>
      <div class="comm-comments-box">
        <div class="comm-comments-head">
          <div>
            <h2>Dyskusja (${state.comments.length} komentarzy)</h2>
            <p>Brak ocen +/- przy komentarzach — żaden pogląd nie jest minusowany ani ukrywany.</p>
          </div>
          <span class="comm-chrono-pill">Widok: Chronologiczny</span>
        </div>
        ${composerHtml}
        <div id="communityFeedbackToast" class="corr-msg" style="margin-bottom:0.5rem"></div>
        <div class="comm-comments-list">${commentsListHtml}</div>
      </div>
    `;
  }

  // ==================== /moderacja/ & KOLEJKA ZGŁOSZEŃ ADMINA ====================
  async function mountModerationLog() {
    const tbody = document.getElementById('moderationLogBody');
    if (!tbody || !state.backendAvailable) return;
    const d = await apiGet('api/moderation/log');
    if (!d || !d.ok || !Array.isArray(d.log)) return;
    tbody.innerHTML = d.log.map(row => `
      <tr>
        <td><strong>${esc(row.account_handle)}</strong></td>
        <td><code>${esc(row.tariff_code)}</code> ${esc(row.tariff_label.replace(row.tariff_code, '').trim())}</td>
        <td>${esc(row.content_excerpt)}</td>
        <td class="mod-decision ${row.outcome === 'REJECTED' ? 'ok' : 'warn'}">${esc(row.decision)}</td>
      </tr>
    `).join('');
  }

  async function resolveReport(repId, accountHandle, excerpt, tariffCode, targetType, targetId, outcome) {
    const res = await apiPost('api/admin/moderation/punish', {
      report_id: repId,
      account_handle: accountHandle,
      content_excerpt: excerpt,
      tariff_code: tariffCode,
      target_type: targetType,
      target_id: targetId,
      outcome,
      hide_content: outcome === 'PUNISHED',
    });
    if (res.ok) mountAdminReports();
  }

  async function mountAdminReports() {
    if (state.currentView !== 'editorial' || !state.backendAvailable) return;
    const queue = document.getElementById('editorialQueue');
    if (!queue) return;
    let sec = document.getElementById('adminModerationReports');
    if (!sec) {
      sec = document.createElement('div');
      sec.id = 'adminModerationReports';
      queue.appendChild(sec);
    }
    const d = await apiGet('api/admin/reports?status=PENDING');
    if (!d || !d.ok) return;
    const reps = d.reports || [];
    sec.innerHTML = `
      <div class="editorial-subhead"><h2>Zgłoszenia społeczności i Taryfikator §1.1–§2.3 (${reps.length} oczekujących)</h2></div>
      ${reps.length ? reps.map(r => `
        <div class="article-card queue-card" data-report-id="${r.id}">
          <div class="queue-card-top">
            <span class="queue-status">${esc(r.tariff_code)} (${esc(r.target_type)})</span>
            <span class="queue-path">${esc(r.target_author)}</span>
          </div>
          <p class="section-paragraph">„${esc(r.target_excerpt)}”</p>
          <div class="queue-actions">
            <button type="button" class="btn-primary" onclick="window.VERITY_COMMUNITY.resolveReport(${r.id}, ${JSON.stringify(r.target_author).replace(/"/g, '&quot;')}, ${JSON.stringify(r.target_excerpt).replace(/"/g, '&quot;')}, ${JSON.stringify(r.tariff_code).replace(/"/g, '&quot;')}, ${JSON.stringify(r.target_type).replace(/"/g, '&quot;')}, ${Number(r.target_id)}, 'PUNISHED')">Nalicz ${esc(r.tariff_code)} i ukryj</button>
            <button type="button" class="btn-outline" onclick="window.VERITY_COMMUNITY.resolveReport(${r.id}, ${JSON.stringify(r.target_author).replace(/"/g, '&quot;')}, ${JSON.stringify(r.target_excerpt).replace(/"/g, '&quot;')}, ${JSON.stringify(r.tariff_code).replace(/"/g, '&quot;')}, ${JSON.stringify(r.target_type).replace(/"/g, '&quot;')}, ${Number(r.target_id)}, 'REJECTED')">Odrzuć zgłoszenie (0 pkt — zostaje)</button>
          </div>
        </div>
      `).join('') : '<div class="empty-state success">Brak oczekujących zgłoszeń naruszeń taryfikatora.</div>'}
    `;
  }

  let _refreshSeq = 0;

  // ==================== SYNCHRONIZACJA Z PORTALEM ====================
  async function refreshForCurrentContext(detail) {
    const seq = ++_refreshSeq;
    if (detail) {
      if (detail.path && detail.path !== state.currentPath) {
        state.posts = [];
      }
      if (detail.articleId !== state.currentArticleId) {
        state.articleOpenedAt = Date.now();
        state.replyTo = null;
        state.comments = [];
        state.voteSummary = null;
      }
      state.currentPath = detail.path || '/Polska';
      state.currentArticleId = detail.articleId || null;
      state.currentView = detail.view || 'public';
    }

    const q = new URLSearchParams({ path: state.currentPath || '/Polska', room: state.chatRoom });
    if (state.currentArticleId) q.set('article_id', String(state.currentArticleId));

    const boot = await apiGet(`api/community/bootstrap?${q.toString()}`);
    if (seq !== _refreshSeq) return;
    state.probed = true;
    if (boot && boot.ok) {
      state.backendAvailable = true;
      state.user = boot.user || null;
      state.guestCooldownSec = Number(boot.guest_cooldown_sec || 90);
      state.posts = Array.isArray(boot.posts) ? boot.posts : [];
      state.comments = Array.isArray(boot.comments) ? boot.comments : [];
      state.voteSummary = boot.vote_summary || null;
      if (Array.isArray(boot.tariff)) state.tariff = boot.tariff;
      if (Array.isArray(boot.chat_messages) && !state.chatMessages.length) {
        state.chatMessages = boot.chat_messages;
        if (boot.chat_messages.length) {
          state.lastChatId = Math.max(...boot.chat_messages.map(m => Number(m.id || 0)));
        }
      }
    } else {
      state.backendAvailable = false;
    }

    updateAuthPill();
    mountFeedCommunity();
    mountArticleCommunity();
    if (window.VERITY_IS_MODERATION) await mountModerationLog();
    if (state.currentView === 'editorial') await mountAdminReports();
    if (state.chatOpen) renderChatMessages();
  }

  function detectInitialArticleId() {
    const secMatch = document.querySelector('[id^="sec_"]')?.id?.match(/^sec_(\d+)_/);
    const corrMatch = document.querySelector('button[onclick^="toggleCorr("]')?.getAttribute('onclick')?.match(/\d+/);
    return secMatch ? parseInt(secMatch[1], 10) : (corrMatch ? parseInt(corrMatch[0], 10) : null);
  }

  window.VERITY_COMMUNITY = {
    toggleChat,
    switchChatRoom: loadChatRoom,
    submitChat,
    openAuthModal,
    closeAuthModal,
    submitLogin,
    logout,
    setLayoutMode,
    submitCommunityPost,
    toggleVote,
    setReplyTarget,
    clearReplyTarget,
    submitComment,
    reportItem,
    resolveReport,
    getState: () => state,
  };

  window.addEventListener('verity:rendered', e => {
    refreshForCurrentContext(e.detail || {});
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('verityAuthModal');
      if (modal && !modal.classList.contains('hidden')) {
        closeAuthModal();
        return;
      }
      if (state.chatOpen) toggleChat(false);
    }
  });

  window.addEventListener('DOMContentLoaded', () => {
    initClientIds();
    ensureShellOverlays();
    updateAuthPill();
    const initPath = window.VERITY_IS_MODERATION ? '/moderacja' : (window.VERITY_INITIAL_PATH || '/Polska');
    const initArt = detectInitialArticleId();
    refreshForCurrentContext({ path: initPath, articleId: initArt, view: 'public' });
  });
})();
