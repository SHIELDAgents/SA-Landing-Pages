/* PrintFlow PWA shared shell: header, nav, token pop-up, matrix rain, helpers. */
const PF = (() => {
  const KEY = 'shield_token', USER = 'shield_user';
  const $ = (s, r = document) => r.querySelector(s);
  const store = {
    get token() { return localStorage.getItem(KEY) || ''; },
    get user() { try { return JSON.parse(localStorage.getItem(USER) || '{}'); } catch (_) { return {}; } },
    setUser(patch) { localStorage.setItem(USER, JSON.stringify({ ...store.user, ...patch })); }
  };

  const genToken = () => {
    const c = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ', a = new Uint8Array(4);
    crypto.getRandomValues(a);
    return 'SHIELD-' + Array.from(a, (n) => c[n % c.length]).join('');
  };
  const isToken = (t) => /^SHIELD-[A-Z0-9]{4}$/.test(t);

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3000);
  }

  // Server check is best-effort; the app works from localStorage if the endpoint is unavailable.
  async function verify(token) {
    try {
      const r = await fetch('/api/verify-token?token=' + encodeURIComponent(token));
      if (r.ok) return await r.json();
    } catch (_) {}
    return null;
  }

  async function copyAndSave() {
    const token = $('#mTokenText').textContent.trim();
    const name = $('#mName').value.trim(), handle = $('#mHandle').value.trim().replace(/^@+/, '');
    localStorage.setItem(KEY, token);
    store.setUser({ name, handle, token, tier: store.user.tier || 'free', user_type: 'creator' });
    try { await navigator.clipboard.writeText(token); } catch (_) {}
    $('#pillToken').textContent = token;
    toast('Token ' + token + ' copied + saved. Add to Home Screen as Printflow.');
    closeModal(); document.dispatchEvent(new Event('pf:ready'));
  }

  function openModal() {
    $('#mTokenText').textContent = store.token || genToken();
    $('#mName').value = store.user.name || ''; $('#mHandle').value = store.user.handle || '';
    $('#modal').classList.add('open');
  }
  function closeModal() { $('#modal').classList.remove('open'); }

  async function pasteToken() {
    try {
      const t = (await navigator.clipboard.readText()).trim().toUpperCase();
      if (!isToken(t)) return toast('Clipboard has no SHIELD-XXXX token');
      localStorage.setItem(KEY, t); $('#pillToken').textContent = t; $('#mTokenText').textContent = t;
      toast('Token ' + t + ' pasted'); document.dispatchEvent(new Event('pf:ready'));
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
    if (store.token) verify(store.token).then((d) => { if (d && d.user) store.setUser(d.user); document.dispatchEvent(new Event('pf:ready')); });
    else { openModal(); }
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/app/sw.js', { scope: '/app' }).catch(() => {});
    document.dispatchEvent(new Event('pf:ready'));
  }

  document.addEventListener('DOMContentLoaded', init);
  return { $, store, toast, openModal };
})();
