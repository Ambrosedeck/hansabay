/* Small shared helpers for the public site and the admin panel. */
(function () {
  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function api(url, options = {}) {
    const opts = { credentials: 'same-origin', ...options };
    if (opts.body && !(opts.body instanceof FormData) && typeof opts.body !== 'string') {
      opts.headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
      opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(url, opts);
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function formatPrice(price, currency) {
    const n = Number(price) || 0;
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(n);
    } catch {
      return `$${n.toFixed(2)}`;
    }
  }

  let toastTimer;
  function toast(message, kind = '') {
    const root = document.getElementById('toast-root');
    if (!root) return;
    root.innerHTML = `<div class="toast ${kind}">${escapeHtml(message)}</div>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (root.innerHTML = ''), 3000);
  }

  /**
   * Open a modal. `html` is the inner HTML; returns { el, close }.
   * Clicking the backdrop or pressing Esc closes it.
   */
  function openModal(html, { wide = false } = {}) {
    const root = document.getElementById('modal-root');
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
    root.appendChild(backdrop);

    function close() {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    document.addEventListener('keydown', onKey);
    backdrop.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));

    const first = backdrop.querySelector('input, select, textarea, button');
    if (first) setTimeout(() => first.focus(), 30);
    return { el: backdrop.firstElementChild, close };
  }

  function confirmDialog(message, { okLabel = 'Delete', danger = true } = {}) {
    return new Promise((resolve) => {
      const { el, close } = openModal(`
        <h3>Are you sure?</h3>
        <p class="modal-sub">${escapeHtml(message)}</p>
        <div class="form-actions">
          <button class="btn" data-close>Cancel</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${escapeHtml(okLabel)}</button>
        </div>`);
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      el.querySelector('[data-ok]').addEventListener('click', () => { close(); done(true); });
      // Resolve false when the modal disappears for any other reason (cancel, Esc, backdrop click)
      const observer = new MutationObserver(() => {
        if (!document.body.contains(el)) { observer.disconnect(); done(false); }
      });
      observer.observe(document.getElementById('modal-root'), { childList: true });
    });
  }

  /** Detect YouTube / Vimeo URLs and return an embeddable iframe URL, or null. */
  function embedUrlFor(url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, '');
      if (host === 'youtu.be') return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
      if (host === 'youtube.com' || host === 'm.youtube.com') {
        if (u.pathname === '/watch' && u.searchParams.get('v')) return `https://www.youtube.com/embed/${u.searchParams.get('v')}`;
        if (u.pathname.startsWith('/embed/')) return url;
        if (u.pathname.startsWith('/shorts/')) return `https://www.youtube.com/embed/${u.pathname.split('/')[2]}`;
      }
      if (host === 'vimeo.com') {
        const id = u.pathname.split('/').filter(Boolean)[0];
        if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
      }
      if (host === 'player.vimeo.com') return url;
    } catch { /* ignore */ }
    return null;
  }

  window.PS = { escapeHtml, api, formatPrice, toast, openModal, confirmDialog, embedUrlFor };
})();
