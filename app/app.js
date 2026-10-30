/* PrintFlow PWA shared shell: header, nav, token pop-up, 7s PWA install prompt, matrix rain, helpers. */
const PF = (() => {
  const KEY = 'shield_token', USER = 'shield_user';
  const $ = (s, r = document) => r.querySelector(s);
  const store = {
    get token() { return localStorage.getItem(KEY) || ''; },
    get user() { try { return JSON.parse(localStorage.getItem(USER) || '{}'); } catch (_) { return {}; } },
    setUser(patch) { localStorage.setItem(USER, JSON.stringify({ ...store.user, ...patch })); }
  };

  let pending = false;
  const isToken = (t) => /^SHIELD-[A-Z0-9]{4,12}$/.test(t);

  // Authenticated fetch: the token is the credential, sent as X-Shield-Token.
  async function api(path, { method = 'GET', body, form, token } = {}) {
    const headers = { 'X-Shield-Token': token || store.token };
    if (body) headers['Content-Type'] = 'application/json';
    const r = await fetch(path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
    let data = {}; try { data = await r.json(); } catch (_) {}
    return { status: r.status, ok: r.ok && data.ok !== false, ...data };
  }

  function toast(msg) {
    const t = $('#toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3200);
  }

  async function verify(token) {
    try { const r = await api('/api/verify-token', { token }); return r.status === 401 ? { invalid: true } : r; } catch (_) { return null; }
  }

  async function copyAndSave() {
    const token = $('#mTokenText').textContent.trim();
    const name = $('#mName').value.trim(), handle = $('#mHandle').value.trim().replace(/^@+/, '');
    if (!isToken(token)) return toast('Token not ready yet, try again');
    if (!name || !handle) return toast('Add your name and handle');
    const r = await api('/api/verify-token', { method: 'POST', token, body: { name, handle } });
    if (!r.ok) return toast(r.error || 'Could not save license');
    localStorage.setItem(KEY, token);
    store.setUser(r.user);
    try { await navigator.clipboard.writeText(token); } catch (_) {}
    $('#pillToken').textContent = token;
    toast('Token ' + token + ' copied & saved. Add to Home Screen as Printflow.');
    closeModal(); document.dispatchEvent(new Event('pf:ready'));
  }

  async function openModal() {
    $('#mTokenText').textContent = store.token || 'SHIELD-........';
    if (!store.token && !pending) {
      pending = true;
      try {
        const r = await fetch('/api/verify-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'issue' }) });
        const d = await r.json();
        if (d.token) $('#mTokenText').textContent = d.token; else toast('Could not issue a token');
      } catch (_) { toast('Offline: try again when connected'); }
      pending = false;
    }
    $('#mName').value = store.user.name || ''; $('#mHandle').value = store.user.handle || '';
    $('#modal').classList.add('open');
  }

  function closeModal() { $('#modal').classList.remove('open'); }

  async function pasteToken() {
    try {
      const t = (await navigator.clipboard.readText()).trim().toUpperCase();
      if (!isToken(t)) return toast('Clipboard has no SHIELD-XXXX token');
      const v = await verify(t);
      if (!v || !v.user) return toast('That token is not recognised');
      localStorage.setItem(KEY, t); store.setUser(v.user); $('#pillToken').textContent = t; $('#mTokenText').textContent = t;
      closeModal(); toast('Token ' + t + ' pasted'); document.dispatchEvent(new Event('pf:ready'));
    } catch (_) { toast('Clipboard blocked: paste manually'); }
  }

  /* Browser & Platform Detection for PWA Instructions */
  function detectBrowser() {
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(ua);
    const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
    const isChrome = /Chrome|CriOS/i.test(ua) && !/Edg/i.test(ua);
    const isEdge = /Edg/i.test(ua);
    const isMac = /Macintosh|Mac OS X/i.test(ua) && !isIOS;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

    if (isIOS) {
      if (isChrome) return { id: 'ios-chrome', name: 'Chrome on iOS', isIOS: true, isStandalone };
      return { id: 'ios-safari', name: 'Safari on iPhone/iPad', isIOS: true, isStandalone };
    }
    if (isAndroid) {
      return { id: 'android-chrome', name: 'Chrome on Android', isAndroid: true, isStandalone };
    }
    if (isMac && isSafari) {
      return { id: 'mac-safari', name: 'Safari on macOS', isMac: true, isStandalone };
    }
    if (isChrome || isEdge) {
      return { id: 'desktop-chrome', name: 'Chrome / Edge Desktop', isDesktop: true, isStandalone };
    }
    return { id: 'generic', name: 'Your Browser', isStandalone };
  }

  const PWA_STEPS = {
    'ios-safari': [
      { num: '1', text: 'Tap the <strong>Share</strong> button <span style="display:inline-block;border:1px solid var(--ice);border-radius:4px;padding:0 5px;font-size:11px;color:var(--ice)">⎋</span> in the Safari navigation bar.' },
      { num: '2', text: 'Scroll down and tap <strong>"Add to Home Screen"</strong> <span style="display:inline-block;border:1px solid var(--neon);border-radius:4px;padding:0 5px;font-size:11px;color:var(--neon)">⊞</span>.' },
      { num: '3', text: 'Tap <strong>"Add"</strong> in the top right corner. Launch from Home Screen for instant Ghost Protocol protection.' }
    ],
    'ios-chrome': [
      { num: '1', text: 'Tap the <strong>Share</strong> icon <span style="display:inline-block;border:1px solid var(--ice);border-radius:4px;padding:0 5px;font-size:11px;color:var(--ice)">⎋</span> next to the address bar.' },
      { num: '2', text: 'Select <strong>"Add to Home Screen"</strong> from the actions sheet.' },
      { num: '3', text: 'Tap <strong>"Add"</strong> to lock in your standalone Shield terminal.' }
    ],
    'android-chrome': [
      { num: '1', text: 'Tap the <strong>three dots menu (⋮)</strong> in the top-right corner of Chrome.' },
      { num: '2', text: 'Select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.' },
      { num: '3', text: 'Tap <strong>"Install"</strong> to enable full 24/7 background protocol protection.' }
    ],
    'mac-safari': [
      { num: '1', text: 'In your macOS menu bar at the top of the screen, click <strong>File</strong>.' },
      { num: '2', text: 'Click <strong>"Add to Dock..."</strong>.' },
      { num: '3', text: 'Click <strong>"Add"</strong> to launch PrintFlow directly as a native Mac app.' }
    ],
    'desktop-chrome': [
      { num: '1', text: 'Click the <strong>Install</strong> icon <span style="display:inline-block;border:1px solid var(--neon);border-radius:4px;padding:0 5px;font-size:11px;color:var(--neon)">⊕</span> in your browser address bar.' },
      { num: '2', text: 'Or click <strong>⋮ &gt; "Save and share" &gt; "Install PrintFlow"</strong>.' },
      { num: '3', text: 'Click <strong>"Install"</strong> for a dedicated standalone cyberpunk HUD.' }
    ],
    'generic': [
      { num: '1', text: 'Open your browser options or share menu.' },
      { num: '2', text: 'Choose <strong>"Add to Home screen"</strong> or <strong>"Install PrintFlow"</strong>.' },
      { num: '3', text: 'Confirm the installation to run with zero browser chrome and instant loading.' }
    ]
  };

  function openPwaModal(isManual = true) {
    const browser = detectBrowser();
    const steps = PWA_STEPS[browser.id] || PWA_STEPS['generic'];
    const bName = $('#pwaBrowserName'); if (bName) bName.textContent = 'DETECTED: ' + browser.name.toUpperCase();
    const listEl = $('#pwaStepList');
    if (listEl) {
      listEl.innerHTML = steps.map(s => `
        <div class="pwa-step-row">
          <div class="pwa-step-num">${s.num}</div>
          <div class="pwa-step-text">${s.text}</div>
        </div>
      `).join('');
    }
    const modal = $('#pwaModal');
    if (modal) modal.classList.add('open');
    if (!isManual) sessionStorage.setItem('pwa_prompt_shown', '1');
  }

  function closePwaModal() {
    const modal = $('#pwaModal');
    if (modal) modal.classList.remove('open');
    sessionStorage.setItem('pwa_prompt_shown', '1');
  }

  function rain() {
    const c = $('#rain'); if (!c) return;
    const x = c.getContext('2d', { alpha: false });
    const chars = 'アイウエオカキクケコサシスセソ0123456789ABCDEF$@#';
    let cols = [], w, h;
    const size = () => { w = c.width = innerWidth; h = c.height = innerHeight; cols = Array.from({ length: Math.ceil(w / 22) }, () => -Math.floor(Math.random() * 30)); };
    addEventListener('resize', size); size();
    setInterval(() => {
      x.fillStyle = 'rgba(0,0,0,.08)'; x.fillRect(0, 0, w, h); x.font = '13px monospace';
      cols.forEach((y, i) => {
        x.fillStyle = Math.random() < .3 ? '#a7e7ff' : '#00ff88';
        x.fillText(chars[Math.floor(Math.random() * chars.length)], i * 22, y * 20);
        cols[i] = y * 20 > h && Math.random() > .975 ? 0 : y + 1;
      });
    }, 70);
  }

  function init() {
    const page = document.body.dataset.page;
    const pages = [
      ['myip', 'My IP', 'Virtual Avenue'],
      ['myleaks', 'My Leaks', 'Takedown HUD'],
      ['printflow', 'PrintFlow', 'Print Cash'],
      ['behold', "What's Next", 'Ghost Game']
    ];
    document.body.insertAdjacentHTML('afterbegin',
      '<canvas id="rain"></canvas><div class="scan"></div>');
    
    const wrap = $('.wrap');
    if (wrap) {
      wrap.insertAdjacentHTML('afterbegin',
        '<header class="top">' +
          '<a class="logo" href="./myip.html">' +
            '<div class="logo-badge">AP</div>' +
            '<div>SHIELD <span>PRINTFLOW</span></div>' +
          '</a>' +
          '<div class="header-pills">' +
            '<button class="pill pwa-pill" id="btnInstallPwa" title="Install to Home Screen">📲 ADD TO HOME SCREEN</button>' +
            '<span class="pill" id="pillToken" title="Tap to view token">no token</span>' +
            '<button class="btn blue" id="btnLicense" style="padding:6px 12px;font-size:11.5px">Free Creator License</button>' +
          '</div>' +
        '</header>');
    }

    document.body.insertAdjacentHTML('beforeend',
      '<nav class="nav"><div>' +
        pages.map(([k, n]) => `<a href="./${k}.html" class="${k === page ? 'on' : ''}"><span>${n}</span></a>`).join('') +
      '</div></nav>' +
      
      /* License Modal */
      '<div class="modal" id="modal"><div class="box">' +
        '<div class="tetris-bar"><div class="tetris-cell"></div><div class="tetris-cell"></div><div class="tetris-cell"></div><div class="tetris-cell"></div><div class="tetris-cell"></div></div>' +
        '<h3 style="color:#fff;font-family:\'JetBrains Mono\',monospace;margin-top:10px">SHIELD AP // CREATOR LICENSE</h3>' +
        '<p class="muted" style="margin-top:6px">Zero upfront fee. Your 8-character token authenticates all PrintFlow protocols.</p>' +
        '<div class="token" id="mTokenText">SHIELD-XXXXXXXX</div>' +
        '<div style="text-align:left">' +
          '<label>Full Name / Creator Alias</label><input id="mName" placeholder="e.g. Wendy Worker">' +
          '<label style="margin-top:10px">Social Handle</label><input id="mHandle" placeholder="@handle">' +
        '</div>' +
        '<div class="row" style="margin-top:16px;justify-content:center">' +
          '<button class="btn" id="mCopy">Save &amp; Copy Token</button>' +
          '<button class="btn blue" id="mClose">Close</button>' +
        '</div>' +
        '<button class="btn" id="mPaste" style="margin-top:12px;font-size:11px;padding:6px 10px;background:none;border-color:#444;color:#888">Paste existing token from clipboard</button>' +
      '</div></div>' +
      
      /* 7-Second PWA Installation Modal */
      '<div class="modal" id="pwaModal"><div class="pwa-modal-box">' +
        '<div class="pwa-header">' +
          '<span class="pwa-badge">STANDALONE HUD MODE</span>' +
          '<button class="pwa-close-btn" id="pwaClose" aria-label="Close">&times;</button>' +
        '</div>' +
        '<h3 class="pwa-title">FOR FULL PROTECTION: ADD TO HOME SCREEN</h3>' +
        '<p class="pwa-subtitle">Run PrintFlow with instant access, offline vault sync, and zero browser chrome lag.</p>' +
        '<div class="pwa-browser-pill" id="pwaBrowserName">DETECTED: BROWSER</div>' +
        '<div class="pwa-step-list" id="pwaStepList"></div>' +
        '<div class="pwa-actions">' +
          '<button class="btn" id="pwaGotIt">Got It / Dismiss</button>' +
        '</div>' +
      '</div></div>' +

      '<div class="toast" id="toast"></div>'
    );

    $('#pillToken').textContent = store.token || 'no token';
    $('#pillToken').onclick = openModal;
    $('#btnLicense').onclick = openModal;
    $('#mCopy').onclick = copyAndSave;
    $('#mClose').onclick = closeModal;
    $('#mPaste').onclick = pasteToken;

    // PWA Modal Handlers
    $('#pwaClose').onclick = closePwaModal;
    $('#pwaGotIt').onclick = closePwaModal;
    $('#btnInstallPwa').onclick = () => openPwaModal(true);

    rain();

    // 7-Second Automatic PWA Trigger
    const browser = detectBrowser();
    if (!browser.isStandalone && !sessionStorage.getItem('pwa_prompt_shown')) {
      setTimeout(() => {
        openPwaModal(false);
      }, 7000);
    }

    // Auto-identify: saved token wins; otherwise offer clipboard paste, then the license pop-up.
    if (store.token) {
      verify(store.token).then((d) => {
        if (d && d.invalid) {
          localStorage.removeItem(KEY);
          localStorage.removeItem(USER);
          $('#pillToken').textContent = 'no token';
          return openModal();
        }
        if (d && d.user) localStorage.setItem(USER, JSON.stringify(d.user));
        document.dispatchEvent(new Event('pf:ready'));
      });
    } else {
      openModal();
    }

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
  return { $, store, toast, openModal, openPwaModal, api, detectBrowser };
})();
