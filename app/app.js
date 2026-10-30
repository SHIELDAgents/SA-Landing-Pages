/* PrintFlow PWA shared shell: header, nav, token pop-up, matrix rain, helpers. */
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
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3000);
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
    toast('Token ' + token + ' copied + saved. Add to Home Screen as Printflow.');
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

  function rain() {
    const c = $('#rain'), x = c.getContext('2d', { alpha: false });
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
    const pages = [['myip', 'My IP'], ['myleaks', 'My Leaks'], ['printflow', 'PrintFlow'], ['behold', "What's Next"]];
    document.body.insertAdjacentHTML('afterbegin',
      '<canvas id="rain"></canvas><div class="scan"></div>');
    const wrap = $('.wrap');
    wrap.insertAdjacentHTML('afterbegin',
      '<header class="top"><a class="logo" href="/app" style="text-decoration:none"><b>PF</b><div>Print<span>Flow</span></div></a>' +
      '<div class="row" style="flex:0 0 auto"><span class="pill" id="pillToken" title="Tap to view token">no token</span>' +
      '<button class="btn blue" id="btnLicense" style="padding:6px 10px;font-size:11px">Get Creator License FREE</button></div></header>');
    document.body.insertAdjacentHTML('beforeend',
      '<nav class="nav"><div>' + pages.map(([k, n]) => `<a href="/app/${k}.html" class="${k === page ? 'on' : ''}">${n}</a>`).join('') + '</div></nav>' +
      '<div class="modal" id="modal"><div class="box"><h3 style="color:#fff">CREATOR LICENSE</h3>' +
      '<p class="muted" style="margin-top:6px">Free. Your token identifies you in PrintFlow.</p><div class="token" id="mTokenText">SHIELD-XXXX</div>' +
      '<div style="text-align:left"><label>Name</label><input id="mName" placeholder="Name"><label style="margin-top:8px">Handle</label><input id="mHandle" placeholder="@handle"></div>' +
      '<div class="row" style="margin-top:14px;justify-content:center"><button class="btn" id="mCopy">Copy and Save</button><button class="btn blue" id="mClose">Close</button></div>' +
      '<button class="btn" id="mPaste" style="margin-top:10px;font-size:11px;padding:6px 10px;background:none;border-color:#555;color:#999">Paste from clipboard</button></div></div>' +
      '<div class="toast" id="toast"></div>');

    $('#pillToken').textContent = store.token || 'no token';
    $('#pillToken').onclick = openModal; $('#btnLicense').onclick = openModal;
    $('#mCopy').onclick = copyAndSave; $('#mClose').onclick = closeModal; $('#mPaste').onclick = pasteToken;
    rain();

    // Auto-identify: saved token wins; otherwise offer clipboard paste, then the license pop-up.
    if (store.token) verify(store.token).then((d) => {
      if (d && d.invalid) { localStorage.removeItem(KEY); localStorage.removeItem(USER); $('#pillToken').textContent = 'no token'; return openModal(); }
      if (d && d.user) localStorage.setItem(USER, JSON.stringify(d.user));
      document.dispatchEvent(new Event('pf:ready'));
    });
    else { openModal(); }
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/app/sw.js', { scope: '/app' }).catch(() => {});
  }

  document.addEventListener('DOMContentLoaded', init);
  return { $, store, toast, openModal, api };
})();
