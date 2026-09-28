/* Public site: homepage with packs -> categories -> videos/links */
(function () {
  const { escapeHtml: esc, api, formatPrice, toast, openModal, embedUrlFor, setUnlockToken } = window.PS;
  const app = document.getElementById('app');

  // Simple hash router:  #/            -> packs
  //                      #/pack/3      -> categories inside pack 3
  //                      #/pack/3/cat/7-> items in category 7 (optionally &play=ITEMID)
  function route() {
    const hash = location.hash.replace(/^#/, '') || '/';
    const [path, query] = hash.split('?');
    const params = new URLSearchParams(query || '');
    const parts = path.split('/').filter(Boolean);
    if (parts[0] === 'pack' && parts[1]) {
      const packId = Number(parts[1]);
      if (parts[2] === 'cat' && parts[3]) return renderCategory(packId, Number(parts[3]), params.get('play'));
      return renderPack(packId);
    }
    return renderHome();
  }
  window.addEventListener('hashchange', route);

  // ---------------- Home ----------------
  async function renderHome() {
    app.innerHTML = `
      <section class="hero">
        <h1>Welcome to HansaBay. Pick your pack.</h1>
        <p>Each pack is protected with its own password. Enter it once and browse every category, video and resource inside.</p>
      </section>
      <div class="packs" id="packs"><div class="empty">Loading packs…</div></div>`;
    try {
      const { packs } = await api('/api/packs');
      const el = document.getElementById('packs');
      if (!packs.length) { el.innerHTML = '<div class="empty">No packs yet.</div>'; return; }
      el.innerHTML = packs.map(packCard).join('');
      el.querySelectorAll('[data-open]').forEach((btn) =>
        btn.addEventListener('click', () => {
          const packId = Number(btn.dataset.open);
          const pack = packs.find((p) => p.id === packId);
          if (pack && pack.unlocked) {
            location.hash = `#/pack/${pack.id}`;
          } else {
            promptUnlock(pack || { id: packId, name: 'this pack' });
          }
        })
      );
    } catch (err) {
      document.getElementById('packs').innerHTML = `<div class="empty">${esc(err.message)}</div>`;
    }
  }

  function packCard(p) {
    const icon = p.icon ? `${p.icon} ` : '';
    return `
      <article class="pack-card">
        <div class="pack-head">
          <div>
            <h3>${esc(icon)}${esc(p.name)}</h3>
            <span class="badge ${p.unlocked ? 'unlocked' : 'locked'}">${p.unlocked ? '● Unlocked' : '🔒 Locked'}</span>
          </div>
          <div class="price">${esc(formatPrice(p.price, p.currency))}</div>
        </div>
        <p>${esc(p.description)}</p>
        <div class="muted small">${p.category_count} ${p.category_count === 1 ? 'category' : 'categories'}</div>
        <button class="btn ${p.unlocked ? '' : 'btn-primary'} btn-block" data-open="${p.id}">
          ${p.unlocked ? 'Open pack →' : 'Enter password'}
        </button>
      </article>`;
  }

  async function promptUnlock(pack, onSuccess) {
    // If pack is already unlocked on the server / token, open directly without modal
    try {
      const check = await api(`/api/packs/${pack.id}`);
      if (check && check.id) {
        pack.unlocked = true;
        if (onSuccess) onSuccess(); else location.hash = `#/pack/${pack.id}`;
        return;
      }
    } catch {
      // 403: locked, proceed to modal
    }

    const { el, close } = openModal(`
      <h3>Unlock ${esc(pack.name)}</h3>
      <p class="modal-sub">Enter the password for this pack to see its content.</p>
      <form id="unlock-form">
        <div class="field">
          <label for="unlock-pw">Password</label>
          <input class="input" id="unlock-pw" type="password" autocomplete="off" required />
        </div>
        <div class="error" id="unlock-err"></div>
        <div class="form-actions">
          <button type="button" class="btn" data-close>Cancel</button>
          <button type="submit" class="btn btn-primary">Unlock</button>
        </div>
      </form>`);
    el.querySelector('#unlock-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = el.querySelector('#unlock-err');
      errEl.textContent = '';
      try {
        const res = await api(`/api/packs/${pack.id}/unlock`, {
          method: 'POST',
          body: { password: el.querySelector('#unlock-pw').value },
        });
        if (res && res.token) {
          setUnlockToken(res.token);
        }
        pack.unlocked = true;
        close();
        toast(`${pack.name} unlocked`, 'success');
        if (onSuccess) onSuccess(); else location.hash = `#/pack/${pack.id}`;
      } catch (err) {
        errEl.textContent = err.message;
      }
    });
  }

  // ---------------- Pack (categories) ----------------
  async function loadPack(packId) {
    try {
      return await api(`/api/packs/${packId}`);
    } catch (err) {
      if (err.status === 403) {
        // Locked: show the password prompt, then retry
        let pack = null;
        try {
          const { packs } = await api('/api/packs');
          pack = packs.find((p) => p.id === packId);
        } catch { /* ignore */ }
        pack = pack || { id: packId, name: 'this pack' };

        app.innerHTML = `
          <div class="breadcrumb"><a href="#/">Packs</a><span class="sep">/</span><span>${esc(pack.name)}</span></div>
          <div class="empty">🔒 This pack is locked.<br /><br /><button class="btn btn-primary" id="unlock-btn">Enter password</button></div>`;
        document.getElementById('unlock-btn').addEventListener('click', () => promptUnlock(pack, route));
        return null;
      }
      app.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
      return null;
    }
  }

  async function renderPack(packId) {
    app.innerHTML = '<div class="empty">Loading…</div>';
    const pack = await loadPack(packId);
    if (!pack) return;

    app.innerHTML = `
      <div class="breadcrumb"><a href="#/">Packs</a><span class="sep">/</span><span>${esc(pack.name)}</span></div>
      <div class="pack-header">
        <div>
          <h2>${esc(pack.icon ? pack.icon + ' ' : '')}${esc(pack.name)}</h2>
          <p class="muted" style="margin:0.25rem 0 0">${esc(pack.description)}</p>
        </div>
        <button class="btn btn-sm" id="lock-btn">Lock pack</button>
      </div>
      ${pack.categories.length
        ? `<div class="folders">${pack.categories.map((c) => folderCard(pack.id, c)).join('')}</div>`
        : '<div class="empty">No categories in this pack yet.</div>'}`;

    document.getElementById('lock-btn').addEventListener('click', async () => {
      const res = await api(`/api/packs/${pack.id}/lock`, { method: 'POST' });
      if (res && res.token !== undefined) {
        setUnlockToken(res.token);
      }
      pack.unlocked = false;
      toast(`${pack.name} locked`, 'info');
      location.hash = '#/';
    });
  }

  function folderCard(packId, c) {
    const videos = c.items.filter((i) => i.type === 'video').length;
    const links = c.items.length - videos;
    return `
      <a class="folder" href="#/pack/${packId}/cat/${c.id}">
        <div class="icon">📁</div>
        <h4>${esc(c.name)}</h4>
        <div class="meta">${videos} video${videos === 1 ? '' : 's'} · ${links} link${links === 1 ? '' : 's'}</div>
      </a>`;
  }

  // ---------------- Category (items) ----------------
  async function renderCategory(packId, catId, playId) {
    app.innerHTML = '<div class="empty">Loading…</div>';
    const pack = await loadPack(packId);
    if (!pack) return;
    const cat = pack.categories.find((c) => c.id === catId);
    if (!cat) { location.hash = `#/pack/${packId}`; return; }

    const playing = playId ? cat.items.find((i) => i.id === Number(playId) && i.type === 'video') : null;

    app.innerHTML = `
      <div class="breadcrumb">
        <a href="#/">Packs</a><span class="sep">/</span>
        <a href="#/pack/${pack.id}">${esc(pack.name)}</a><span class="sep">/</span>
        <span>${esc(cat.name)}</span>
      </div>
      <div class="pack-header"><h2>📁 ${esc(cat.name)}</h2></div>
      <div id="player"></div>
      ${cat.items.length
        ? `<div class="items">${cat.items.map((i) => itemRow(pack.id, cat.id, i, playing && playing.id === i.id)).join('')}</div>`
        : '<div class="empty">Nothing in this category yet.</div>'}`;

    if (playing) renderPlayer(playing);
  }

  function itemRow(packId, catId, i, active) {
    const isVideo = i.type === 'video';
    const sub = isVideo ? (i.source === 'upload' ? 'Video' : 'Video · external') : safeHost(i.url);
    const action = isVideo
      ? `<a class="btn btn-sm ${active ? 'btn-primary' : ''}" href="#/pack/${packId}/cat/${catId}?play=${i.id}">▶ <span>${active ? 'Playing' : 'Play'}</span></a>`
      : `<a class="btn btn-sm" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">↗ <span>Open</span></a>`;
    return `
      <div class="item">
        <div class="thumb ${isVideo ? 'video' : ''}">${isVideo ? '🎬' : '🔗'}</div>
        <div class="info">
          <div class="title">${esc(i.title)}</div>
          <div class="sub"><span class="badge ${i.type}">${i.type}</span> &nbsp;${esc(sub)}</div>
        </div>
        <div class="actions">${action}</div>
      </div>`;
  }

  function safeHost(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
  }

  function renderPlayer(item) {
    const el = document.getElementById('player');
    const embed = item.source === 'external' ? embedUrlFor(item.url) : null;
    const media = embed
      ? `<iframe src="${esc(embed)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
      : `<video controls autoplay playsinline preload="metadata" controlsList="nodownload" oncontextmenu="return false;" ondragstart="return false;" src="${esc(item.url)}"></video>`;
    el.innerHTML = `
      <div class="player-wrap">${media}</div>
      <div class="now-playing">
        <h3>${esc(item.title)}</h3>
        <a class="btn btn-sm" href="${location.hash.split('?')[0]}">Close player</a>
      </div>`;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const videoEl = el.querySelector('video');
    if (videoEl) {
      // Prevent context menu (desktop right-click and mobile long-press)
      videoEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
      });
      videoEl.addEventListener('dragstart', (e) => {
        e.preventDefault();
        return false;
      });
    }
  }

  // Prevent right-click and mobile long-press context menu specifically on video elements,
  // without disabling right-click or normal interactions elsewhere on the website.
  document.addEventListener('contextmenu', (e) => {
    if (e.target && (e.target.nodeName === 'VIDEO' || (e.target.closest && e.target.closest('video, .player-wrap')))) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, true);

  route();
})();
