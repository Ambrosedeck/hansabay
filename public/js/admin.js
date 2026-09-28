/* Admin panel: Pack -> Category -> Video/Link management */
(function () {
  const { escapeHtml: esc, api, formatPrice, toast, openModal, confirmDialog } = window.PS;
  const root = document.getElementById('admin');
  const logoutBtn = document.getElementById('logout-btn');

  const state = {
    packs: [],
    storageDriver: 'local',
    maxUploadMb: 2048,
    view: 'dashboard', // 'dashboard' | 'settings' | 'pack:<id>'
    openCats: new Set(), // expanded category ids
  };

  // ---------------- Bootstrap ----------------
  async function init() {
    const { admin } = await api('/api/admin/me');
    if (!admin) return renderLogin();
    await refresh();
    logoutBtn.classList.remove('hidden');
    render();
  }

  async function refresh() {
    const data = await api('/api/admin/overview');
    state.packs = data.packs;
    state.storageDriver = data.storageDriver;
    state.maxUploadMb = data.maxUploadMb;
    // Expand all categories by default the first time
    if (state.openCats.size === 0) state.packs.forEach((p) => p.categories.forEach((c) => state.openCats.add(c.id)));
  }

  logoutBtn.addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' });
    location.reload();
  });

  // ---------------- Login ----------------
  function renderLogin() {
    root.innerHTML = `
      <div class="card login-box">
        <h3 style="margin-top:0">HansaBay admin</h3>
        <p class="muted small">Enter the admin password to manage packs, categories and content.</p>
        <form id="login-form">
          <div class="field">
            <label for="pw">Password</label>
            <input class="input" id="pw" type="password" autocomplete="current-password" required autofocus />
          </div>
          <div class="error" id="login-err"></div>
          <button class="btn btn-primary btn-block" type="submit">Log in</button>
        </form>
      </div>`;
    root.querySelector('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = root.querySelector('#login-err');
      err.textContent = '';
      try {
        await api('/api/admin/login', { method: 'POST', body: { password: root.querySelector('#pw').value } });
        await init();
      } catch (ex) {
        err.textContent = ex.message;
      }
    });
  }

  // ---------------- Layout ----------------
  function render() {
    root.innerHTML = `
      <div class="admin-layout">
        <aside class="sidebar">
          <div class="side-link ${state.view === 'dashboard' ? 'active' : ''}" data-view="dashboard">📊 Dashboard</div>
          <div class="side-label">Packs</div>
          ${state.packs.map((p) => `<div class="side-link ${state.view === `pack:${p.id}` ? 'active' : ''}" data-view="pack:${p.id}">📦 ${esc(p.name)}</div>`).join('')}
          <div class="side-label">System</div>
          <div class="side-link ${state.view === 'settings' ? 'active' : ''}" data-view="settings">⚙️ Settings</div>
        </aside>
        <section id="content"></section>
      </div>`;
    root.querySelectorAll('[data-view]').forEach((el) =>
      el.addEventListener('click', () => { state.view = el.dataset.view; render(); })
    );

    const content = root.querySelector('#content');
    if (state.view === 'dashboard') renderDashboard(content);
    else if (state.view === 'settings') renderSettings(content);
    else {
      const pack = state.packs.find((p) => `pack:${p.id}` === state.view);
      if (pack) renderPack(content, pack);
      else { state.view = 'dashboard'; renderDashboard(content); }
    }
  }

  // ---------------- Dashboard ----------------
  function renderDashboard(el) {
    const cats = state.packs.reduce((n, p) => n + p.categories.length, 0);
    const items = state.packs.flatMap((p) => p.categories.flatMap((c) => c.items));
    const videos = items.filter((i) => i.type === 'video').length;
    el.innerHTML = `
      <div class="stats">
        <div class="stat"><div class="num">${state.packs.length}</div><div class="lbl">Packs</div></div>
        <div class="stat"><div class="num">${cats}</div><div class="lbl">Categories</div></div>
        <div class="stat"><div class="num">${videos}</div><div class="lbl">Videos</div></div>
        <div class="stat"><div class="num">${items.length - videos}</div><div class="lbl">Links</div></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Packs</h3><span class="muted small">Storage driver: <strong>${esc(state.storageDriver)}</strong></span></div>
        <div class="items">
          ${state.packs.map((p) => `
            <div class="item">
              <div class="thumb">📦</div>
              <div class="info">
                <div class="title">${esc(p.name)} <span class="muted small">· ${esc(formatPrice(p.price, p.currency))}</span></div>
                <div class="sub">${p.categories.length} categories · ${p.categories.reduce((n, c) => n + c.items.length, 0)} items</div>
              </div>
              <div class="actions"><button class="btn btn-sm" data-goto="pack:${p.id}">Manage</button></div>
            </div>`).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>How it works</h3></div>
        <p class="muted small" style="margin:0">
          Structure: <strong>Pack → Category → Video / Link</strong>. Pick a pack in the sidebar to edit its name, description,
          price and password, then create categories (folders) and add videos or links inside them. Use the arrow buttons to reorder.
          Everything you change here is live on the public site immediately.
        </p>
      </div>`;
    el.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => { state.view = b.dataset.goto; render(); }));
  }

  // ---------------- Pack view ----------------
  function renderPack(el, pack) {
    el.innerHTML = `
      <div class="card">
        <div class="card-head"><h3>Pack details</h3><span class="badge">${esc(pack.slug)}</span></div>
        <form id="pack-form">
          <div class="row">
            <div class="field"><label>Name</label><input class="input" name="name" value="${esc(pack.name)}" required /></div>
            <div class="field"><label>Price</label><input class="input" name="price" type="number" step="0.01" min="0" value="${esc(pack.price)}" required /></div>
            <div class="field"><label>Currency</label><input class="input" name="currency" value="${esc(pack.currency)}" maxlength="8" /></div>
          </div>
          <div class="field"><label>Description</label><textarea class="input" name="description">${esc(pack.description)}</textarea></div>
          <div class="field">
            <label>New pack password <span class="muted">(leave blank to keep the current one)</span></label>
            <input class="input" name="password" type="text" autocomplete="off" placeholder="••••••" />
          </div>
          <div class="form-actions"><button class="btn btn-primary" type="submit">Save pack</button></div>
        </form>
      </div>

      <div class="card">
        <div class="card-head">
          <h3>Categories &amp; content</h3>
          <button class="btn btn-primary btn-sm" id="add-cat">+ New category</button>
        </div>
        <div id="cats">
          ${pack.categories.length ? pack.categories.map((c, idx) => categoryBlock(pack, c, idx)).join('') : '<div class="empty">No categories yet. Create one to start adding videos and links.</div>'}
        </div>
      </div>`;

    el.querySelector('#pack-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());
      if (!body.password) delete body.password;
      try {
        await api(`/api/admin/packs/${pack.id}`, { method: 'PUT', body });
        toast('Pack saved', 'success');
        await reload();
      } catch (err) { toast(err.message, 'error'); }
    });

    el.querySelector('#add-cat').addEventListener('click', () => categoryModal(pack));

    // Category-level actions
    el.querySelectorAll('[data-cat-action]').forEach((btn) =>
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const catId = Number(btn.dataset.cat);
        const cat = pack.categories.find((c) => c.id === catId);
        const action = btn.dataset.catAction;
        if (action === 'edit') categoryModal(pack, cat);
        if (action === 'delete') deleteCategory(cat);
        if (action === 'up' || action === 'down') moveCategory(pack, cat, action === 'up' ? -1 : 1);
        if (action === 'add-video') itemModal(pack, cat, null, 'video');
        if (action === 'add-link') itemModal(pack, cat, null, 'link');
      })
    );
    el.querySelectorAll('.tree-cat-head').forEach((head) =>
      head.addEventListener('click', () => {
        const id = Number(head.dataset.toggle);
        if (state.openCats.has(id)) state.openCats.delete(id); else state.openCats.add(id);
        render();
      })
    );

    // Item-level actions
    el.querySelectorAll('[data-item-action]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const cat = pack.categories.find((c) => c.id === Number(btn.dataset.cat));
        const item = cat.items.find((i) => i.id === Number(btn.dataset.item));
        const action = btn.dataset.itemAction;
        if (action === 'edit') itemModal(pack, cat, item, item.type);
        if (action === 'delete') deleteItem(item);
        if (action === 'up' || action === 'down') moveItem(cat, item, action === 'up' ? -1 : 1);
      })
    );
  }

  function categoryBlock(pack, c, idx) {
    const open = state.openCats.has(c.id);
    const last = pack.categories.length - 1;
    return `
      <div class="tree-cat">
        <div class="tree-cat-head" data-toggle="${c.id}">
          <span class="muted">${open ? '▾' : '▸'}</span>
          <span>📁</span>
          <span class="name">${esc(c.name)}</span>
          <span class="count">${c.items.length} item${c.items.length === 1 ? '' : 's'}</span>
          <div class="actions">
            <button class="btn btn-sm btn-icon" title="Move up" data-cat-action="up" data-cat="${c.id}" ${idx === 0 ? 'disabled' : ''}>↑</button>
            <button class="btn btn-sm btn-icon" title="Move down" data-cat-action="down" data-cat="${c.id}" ${idx === last ? 'disabled' : ''}>↓</button>
            <button class="btn btn-sm" data-cat-action="add-video" data-cat="${c.id}">+ Video</button>
            <button class="btn btn-sm" data-cat-action="add-link" data-cat="${c.id}">+ Link</button>
            <button class="btn btn-sm" data-cat-action="edit" data-cat="${c.id}">Edit</button>
            <button class="btn btn-sm btn-danger" data-cat-action="delete" data-cat="${c.id}">Delete</button>
          </div>
        </div>
        ${open ? `<div class="tree-cat-body">
          ${c.items.length ? c.items.map((i, j) => itemRow(c, i, j)).join('') : '<div class="muted small" style="padding:.5rem .25rem">Empty category — add a video or link.</div>'}
        </div>` : ''}
      </div>`;
  }

  function itemRow(c, i, j) {
    const last = c.items.length - 1;
    const sub = i.type === 'link'
      ? i.url
      : i.storage_key ? `Uploaded · ${esc(i.storage_driver)} · ${fmtSize(i.size_bytes)}` : `External · ${i.url}`;
    return `
      <div class="tree-item">
        <span class="badge ${i.type}">${i.type}</span>
        <span class="t-title" title="${esc(i.title)}">${esc(i.title)}</span>
        <span class="t-sub" title="${esc(sub)}">${esc(sub)}</span>
        <div class="actions">
          <button class="btn btn-sm btn-icon" title="Move up" data-item-action="up" data-cat="${c.id}" data-item="${i.id}" ${j === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn btn-sm btn-icon" title="Move down" data-item-action="down" data-cat="${c.id}" data-item="${i.id}" ${j === last ? 'disabled' : ''}>↓</button>
          <button class="btn btn-sm" data-item-action="edit" data-cat="${c.id}" data-item="${i.id}">Edit</button>
          <button class="btn btn-sm btn-danger" data-item-action="delete" data-cat="${c.id}" data-item="${i.id}">Delete</button>
        </div>
      </div>`;
  }

  function fmtSize(bytes) {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0; let n = bytes;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  // ---------------- Category CRUD ----------------
  function categoryModal(pack, cat) {
    const { el, close } = openModal(`
      <h3>${cat ? 'Edit category' : 'New category'}</h3>
      <p class="modal-sub">${cat ? 'Rename the folder or move it to another pack.' : `Create a folder inside ${esc(pack.name)}.`}</p>
      <form id="cat-form">
        <div class="field"><label>Name</label><input class="input" name="name" value="${esc(cat ? cat.name : '')}" required maxlength="80" /></div>
        <div class="field"><label>Pack</label>
          <select class="input" name="pack_id">
            ${state.packs.map((p) => `<option value="${p.id}" ${p.id === pack.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="error" id="cat-err"></div>
        <div class="form-actions">
          <button type="button" class="btn" data-close>Cancel</button>
          <button type="submit" class="btn btn-primary">${cat ? 'Save' : 'Create'}</button>
        </div>
      </form>`);
    el.querySelector('#cat-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target).entries());
      try {
        if (cat) await api(`/api/admin/categories/${cat.id}`, { method: 'PUT', body });
        else {
          const { category } = await api('/api/admin/categories', { method: 'POST', body });
          state.openCats.add(category.id);
        }
        close();
        toast(cat ? 'Category saved' : 'Category created', 'success');
        await reload();
      } catch (err) { el.querySelector('#cat-err').textContent = err.message; }
    });
  }

  async function deleteCategory(cat) {
    const ok = await confirmDialog(`Delete "${cat.name}" and all ${cat.items.length} item(s) inside it? Uploaded videos will be removed from storage.`);
    if (!ok) return;
    try {
      await api(`/api/admin/categories/${cat.id}`, { method: 'DELETE' });
      toast('Category deleted', 'success');
      await reload();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function moveCategory(pack, cat, delta) {
    const ids = pack.categories.map((c) => c.id);
    const idx = ids.indexOf(cat.id);
    const to = idx + delta;
    if (to < 0 || to >= ids.length) return;
    [ids[idx], ids[to]] = [ids[to], ids[idx]];
    try {
      await api('/api/admin/categories/reorder', { method: 'POST', body: { pack_id: pack.id, order: ids } });
      await reload();
    } catch (err) { toast(err.message, 'error'); }
  }

  // ---------------- Item CRUD ----------------
  function itemModal(pack, cat, item, type) {
    const isVideo = type === 'video';
    // New videos default to file upload; existing external videos open on the URL tab.
    const currentSource = item && !item.storage_key ? 'url' : 'upload';
    const allCats = state.packs.flatMap((p) => p.categories.map((c) => ({ ...c, packName: p.name })));

    const { el, close } = openModal(`
      <h3>${item ? 'Edit' : 'Add'} ${isVideo ? 'video' : 'link'}</h3>
      <p class="modal-sub">${isVideo ? 'Upload a video file or point to an external video URL.' : 'Any external http(s) URL.'}</p>
      <form id="item-form">
        <div class="field"><label>Title</label><input class="input" name="title" value="${esc(item ? item.title : '')}" required maxlength="200" /></div>
        <div class="field"><label>Category</label>
          <select class="input" name="category_id">
            ${state.packs.map((p) => `<optgroup label="${esc(p.name)}">
              ${p.categories.map((c) => `<option value="${c.id}" ${c.id === cat.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
            </optgroup>`).join('')}
          </select>
          <span class="muted small">Pick a category in any pack to move this ${type} there.</span>
        </div>

        ${isVideo ? `
        <div class="field"><label>Video source</label>
          <div class="segmented" id="source-switch">
            <button type="button" data-src="upload" class="${currentSource === 'upload' ? 'active' : ''}">Upload file</button>
            <button type="button" data-src="url" class="${currentSource === 'url' ? 'active' : ''}">External URL</button>
          </div>
        </div>
        <div class="field" id="upload-field">
          <label class="file-drop" id="file-drop">
            <input type="file" name="file" accept="video/*" />
            <div id="file-label">
              ${item && item.storage_key
                ? `<strong>Current file kept.</strong><br /><span class="small">Choose a new file to replace it (${esc(item.storage_driver)} · ${fmtSize(item.size_bytes)})</span>`
                : `<strong>Click to choose a video</strong><br /><span class="small">MP4 / WebM / MOV · up to ${state.maxUploadMb} MB · stored via "${esc(state.storageDriver)}"</span>`}
            </div>
          </label>
          <div class="progress hidden" id="progress"><div></div></div>
        </div>
        <div class="field" id="url-field">
          <label>Video URL</label>
          <input class="input" name="url" type="url" placeholder="https://… (direct .mp4 link, YouTube or Vimeo)" value="${esc(item && !item.storage_key ? item.url || '' : '')}" />
        </div>` : `
        <div class="field"><label>URL</label>
          <input class="input" name="url" type="url" placeholder="https://example.com" value="${esc(item ? item.url || '' : '')}" required />
        </div>`}

        <div class="error" id="item-err"></div>
        <div class="form-actions">
          <button type="button" class="btn" data-close>Cancel</button>
          <button type="submit" class="btn btn-primary" id="item-submit">${item ? 'Save' : 'Add'}</button>
        </div>
      </form>`, { wide: true });

    if (!allCats.length) el.querySelector('select[name=category_id]').innerHTML = '<option value="">No categories yet</option>';

    let source = currentSource;
    if (isVideo) {
      const applySource = () => {
        el.querySelector('#upload-field').classList.toggle('hidden', source !== 'upload');
        el.querySelector('#url-field').classList.toggle('hidden', source !== 'url');
        el.querySelectorAll('#source-switch button').forEach((b) => b.classList.toggle('active', b.dataset.src === source));
      };
      applySource();
      el.querySelectorAll('#source-switch button').forEach((b) =>
        b.addEventListener('click', () => { source = b.dataset.src; applySource(); })
      );
      el.querySelector('input[name=file]').addEventListener('change', (e) => {
        const f = e.target.files[0];
        if (f) el.querySelector('#file-label').innerHTML = `<strong>${esc(f.name)}</strong><br /><span class="small">${fmtSize(f.size)}</span>`;
      });
    }

    el.querySelector('#item-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = el.querySelector('#item-err');
      errEl.textContent = '';
      const f = e.target.elements; // note: form.title would return the HTML title attribute, not the input
      const fd = new FormData();
      fd.append('type', type);
      fd.append('title', f.title.value);
      fd.append('category_id', f.category_id.value);

      if (isVideo) {
        const file = f.file.files[0];
        if (source === 'upload') {
          if (file) fd.append('file', file);
          else if (!item || !item.storage_key) { errEl.textContent = 'Choose a video file to upload.'; return; }
        } else {
          if (!f.url.value) { errEl.textContent = 'Enter a video URL.'; return; }
          fd.append('url', f.url.value);
        }
      } else {
        fd.append('url', f.url.value);
      }

      const submit = el.querySelector('#item-submit');
      submit.disabled = true;
      try {
        const url = item ? `/api/admin/items/${item.id}` : '/api/admin/items';
        await uploadWithProgress(item ? 'PUT' : 'POST', url, fd, (pct) => {
          const bar = el.querySelector('#progress');
          if (bar) { bar.classList.remove('hidden'); bar.firstElementChild.style.width = `${pct}%`; }
        });
        close();
        toast(item ? 'Saved' : `${isVideo ? 'Video' : 'Link'} added`, 'success');
        await reload();
      } catch (err) {
        errEl.textContent = err.message;
        submit.disabled = false;
      }
    });
  }

  /** XHR wrapper so we can show upload progress for big video files. */
  function uploadWithProgress(method, url, formData, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url);
      xhr.withCredentials = true;
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      });
      xhr.onload = () => {
        let data = null;
        try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error((data && data.error) || `Request failed (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(formData);
    });
  }

  async function deleteItem(item) {
    const ok = await confirmDialog(`Delete "${item.title}"?${item.storage_key ? ' The uploaded file will be removed from storage.' : ''}`);
    if (!ok) return;
    try {
      await api(`/api/admin/items/${item.id}`, { method: 'DELETE' });
      toast('Deleted', 'success');
      await reload();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function moveItem(cat, item, delta) {
    const ids = cat.items.map((i) => i.id);
    const idx = ids.indexOf(item.id);
    const to = idx + delta;
    if (to < 0 || to >= ids.length) return;
    [ids[idx], ids[to]] = [ids[to], ids[idx]];
    try {
      await api('/api/admin/items/reorder', { method: 'POST', body: { category_id: cat.id, order: ids } });
      await reload();
    } catch (err) { toast(err.message, 'error'); }
  }

  // ---------------- Settings ----------------
  function renderSettings(el) {
    el.innerHTML = `
      <div class="card">
        <div class="card-head"><h3>Admin password</h3></div>
        <form id="pw-form">
          <div class="row">
            <div class="field"><label>Current password</label><input class="input" name="current" type="password" required autocomplete="current-password" /></div>
            <div class="field"><label>New password</label><input class="input" name="next" type="password" required minlength="4" autocomplete="new-password" /></div>
          </div>
          <div class="error" id="pw-err"></div>
          <div class="form-actions"><button class="btn btn-primary" type="submit">Change password</button></div>
        </form>
      </div>
      <div class="card">
        <div class="card-head"><h3>Storage</h3></div>
        <p class="muted small" style="margin:0 0 .5rem">
          New uploads are stored with the <strong>${esc(state.storageDriver)}</strong> driver (max ${state.maxUploadMb} MB per file).
          Change <code>STORAGE_DRIVER</code> in <code>.env</code> to <code>local</code> or <code>s3</code> and restart the server to switch.
          Existing videos remember which driver stored them, so they keep working after a switch.
        </p>
      </div>
      <div class="card">
        <div class="card-head"><h3>Pack passwords</h3></div>
        <p class="muted small" style="margin:0">Each pack has its own viewer password. Change it from the pack page (sidebar → pack → "New pack password").</p>
      </div>`;
    el.querySelector('#pw-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target).entries());
      const err = el.querySelector('#pw-err');
      err.textContent = '';
      try {
        await api('/api/admin/password', { method: 'PUT', body });
        toast('Admin password changed', 'success');
        e.target.reset();
      } catch (ex) { err.textContent = ex.message; }
    });
  }

  async function reload() {
    try {
      await refresh();
      render();
    } catch (err) {
      if (err.status === 401) return renderLogin();
      toast(err.message, 'error');
    }
  }

  init().catch((err) => { root.innerHTML = `<div class="empty">${esc(err.message)}</div>`; });
})();
