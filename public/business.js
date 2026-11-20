export function setupBusiness({ db, getClerk, getOwner, getCurrency, currencies, openEntry, duplicate, escapeHtml }) {
  const trigger = document.querySelector('#accountBusiness');
  if (!trigger) return { updateAuth() {} };
  const dialog = document.createElement('dialog');
  dialog.className = 'business-dialog';
  dialog.setAttribute('aria-labelledby', 'businessTitle');
  dialog.innerHTML = `
    <div class="modal-head">
      <h3 id="businessTitle">Business accounts</h3>
      <button class="close" type="button" aria-label="Close business accounts">&times;</button>
    </div>
    <p class="business-status" role="status"></p>
    <div class="business-content"></div>`;
  document.body.append(dialog);
  const content = dialog.querySelector('.business-content');
  const status = dialog.querySelector('.business-status');
  const inviteToken = () => new URLSearchParams(location.hash.slice(1)).get('business-invite');
  const roles = { owner: 'Owner', admin: 'Admin', member: 'Member' };
  let userId = getOwner() === 'guest' ? undefined : getOwner();
  let authenticated = false;
  let refreshOnIdle = false;
  let businesses = [];
  let active;
  let page = 0;
  let generation = 0;
  let busy = false;

  function clear() {
    generation++;
    busy = false;
    refreshOnIdle = false;
    businesses = [];
    active = undefined;
    page = 0;
    content.inert = false;
    content.replaceChildren();
    status.textContent = '';
  }

  dialog.querySelector('.close').onclick = () => dialog.close();
  dialog.addEventListener('close', () => { if (!dialog.open) clear(); });
  trigger.onclick = () => {
    document.querySelector('#accountDialog').close();
    open();
  };

  async function request(action, data = {}, owner = getOwner()) {
    if (!navigator.onLine) throw new Error('Connect to the internet to use business accounts.');
    const clerk = getClerk();
    const token = clerk?.user?.id === owner && await clerk?.session?.getToken();
    if (!token || clerk?.user?.id !== owner || getOwner() !== owner) throw new Error('Sign in to use business accounts.');
    const response = await fetch('/api/business', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, data }),
      signal: AbortSignal.timeout(15000),
    }).catch(() => { throw new Error('Connection interrupted. Try again.'); });
    const result = await response.json();
    if (!response.ok || result.error) {
      throw Object.assign(new Error(result.error || 'Business accounts are unavailable.'), {
        status: response.status, rejected: response.ok && !!result.error,
      });
    }
    return result;
  }

  function cache(storeName, mode, action) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const operation = action(transaction.objectStore(storeName));
      transaction.oncomplete = () => resolve(operation.result);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  const businessListKey = owner => `businesses:${owner}`;
  const cachedEntries = (owner, businessId) => cache('businessEntries', 'readonly', store =>
    businessId ? store.index('business').getAll([owner, businessId]) : store.index('owner').getAll(owner));
  const writeEntry = (owner, businessId, entry) => cache('businessEntries', 'readwrite', store =>
    store.put({ ...entry, owner, businessId }));

  async function save(item, entry) {
    const owner = item.owner;
    if (getOwner() !== owner) throw Error('Account changed. Reopen the business account.');
    const { type, cents, fee, description, category, date, time, reference, provider, source, createdAt, reportedBalance } = entry;
    const record = { id: entry.id, type, cents, fee, description, category, date, time, reference, provider, source, createdAt, reportedBalance, pending: true };
    const existing = await cachedEntries(owner, item.id);
    if (getOwner() !== owner) throw Error('Account changed. Reopen the business account.');
    if (duplicate(record, existing.filter(x => !x.error))) throw Error('This message or reference is already recorded.');
    await writeEntry(owner, item.id, record);
    if (getOwner() === owner && dialog.open && active?.id === item.id) {
      refreshTransactions(0);
    } else {
      sync();
    }
  }

  const syncing = new Map();
  function sync() {
    const owner = getClerk()?.user?.id;
    if (!navigator.onLine || !owner || getOwner() !== owner) return;
    if (syncing.has(owner)) return syncing.get(owner);
    let failed = false;
    const work = (async () => {
      const entries = await cachedEntries(owner);
      for (const { pending, owner: savedOwner, recorder, error, ...payload } of entries) {
        if (!pending || owner !== getClerk()?.user?.id || owner !== getOwner()) continue;
        try {
          const result = await request('record_transaction', payload, owner);
          await writeEntry(owner, payload.businessId, { ...payload, recorder: result.recorder, recorder_id: owner, syncedAt: result.syncedAt });
        } catch (error) {
          if (error.status === 400 || error.rejected) {
            await writeEntry(owner, payload.businessId, { ...payload, error: error.message });
          } else {
            failed = true;
            if (!error.status || error.status >= 500 || error.status === 401) break;
          }
        }
      }
    })().catch(() => { failed = true; }).finally(async () => {
      syncing.delete(owner);
      if (failed || owner !== getOwner()) return;
      const entries = await cachedEntries(owner).catch(() => []);
      if (entries.some(entry => entry.pending)) return sync();
    });
    syncing.set(owner, work);
    return work;
  }

  async function run(work) {
    if (busy) return;
    busy = true;
    const current = generation;
    const valid = () => current === generation && dialog.open;
    status.textContent = 'Loading…';
    content.inert = true;
    try {
      await work(valid);
      if (valid() && status.textContent === 'Loading…') status.textContent = '';
    } catch (error) {
      if (valid()) status.textContent = error.message;
    } finally {
      if (valid()) {
        busy = false;
        content.inert = false;
        if (refreshOnIdle) {
          refreshOnIdle = false;
          reconnect();
        }
      }
    }
  }

  const nameField = '<label class="field">Your display name<input name="name" required maxlength="100" autocomplete="name"></label>';
  function prefillName() {
    const user = getClerk()?.user;
    const field = content.querySelector('[name=name]');
    if (field) field.value = (user?.fullName || user?.username || '').slice(0, 100);
  }

  function open() {
    if (!dialog.open) {
      clear();
      dialog.showModal();
    }
    showHome();
  }

  function showHome(message = '') {
    const owner = getOwner();
    if (owner === 'guest') {
      content.inert = false;
      status.textContent = 'Sign in to create or join a business account.';
      content.innerHTML = '<button class="primary" type="button">Sign in</button>';
      content.querySelector('button').onclick = () => {
        const clerk = getClerk();
        if (!clerk || !navigator.onLine) {
          status.textContent = 'Sign-in is unavailable. Check your connection and try again.';
          return;
        }
        dialog.close();
        clerk.openSignIn();
      };
      return;
    }
    if (inviteToken() && getClerk()?.user) {
      showInvite();
      return;
    }
    content.innerHTML = '<button class="detail-delete" type="button">Refresh accounts</button>';
    content.querySelector('button').onclick = () => showHome();
    run(async valid => {
      let available;
      let online = navigator.onLine && getClerk()?.user?.id === owner;
      if (online) {
        try {
          available = await request('list', {}, owner);
          await cache('metadata', 'readwrite', store => store.put(available, businessListKey(owner)));
        } catch (error) {
          if (error.status === 401 || error.status === 403) throw error;
          online = false;
        }
      }
      if (!online) available = await cache('metadata', 'readonly', store => store.get(businessListKey(owner))) || [];
      if (!valid() || owner !== getOwner()) return;
      businesses = available;
      content.innerHTML = `
        <div class="account-actions business-accounts">${businesses.map(item => `
          <button type="button" data-business="${escapeHtml(item.id)}">
            <span><strong>${escapeHtml(item.name)}</strong><small>${roles[item.role]} · ${escapeHtml(item.currency)}</small></span>
            <span aria-hidden="true">›</span>
          </button>`).join('')}</div>
        ${online ? `<details ${businesses.length ? '' : 'open'}>
          <summary>Create a business account</summary>
          <form>
            <label class="field">Business name<input name="businessName" required maxlength="100" autocomplete="organization"></label>
            ${nameField}
            <label class="field">Currency<select name="currency" required aria-describedby="businessCurrencyHelp">
              ${currencies.map(({code, label}) => `<option value="${escapeHtml(code)}">${escapeHtml(label)}</option>`).join('')}
            </select></label>
            <p class="field-help" id="businessCurrencyHelp">This currency applies to all transactions in this account.</p>
            <button class="primary save" type="submit">Create business account</button>
          </form>
        </details>` : '<p class="field-help">Connect and sign in to create or join a business account.</p><button type="button" class="business-back business-reload">Refresh accounts</button>'}`;
      status.textContent = message;
      prefillName();
      content.querySelectorAll('[data-business]').forEach(button => {
        button.onclick = () => showBusiness({ ...businesses.find(item => item.id === button.dataset.business), owner });
      });
      const form = content.querySelector('form');
      if (!form) {
        content.querySelector('.business-reload').onclick = () => showHome();
        return;
      }
      form.elements.currency.value = getCurrency();
      let pending;
      form.onsubmit = event => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(form));
        const fingerprint = JSON.stringify(data);
        if (pending?.fingerprint !== fingerprint) pending = { fingerprint, id: crypto.randomUUID() };
        run(async valid => {
          await request('create', { ...data, id: pending.id });
          if (valid()) showHomeAfterRun('Business account created.');
        });
      };
    });
  }

  function showHomeAfterRun(message) {
    generation++;
    busy = false;
    showHome(message);
  }

  function showInvite() {
    status.textContent = '';
    content.inert = false;
    content.innerHTML = `
      <p>Accept your invitation to join a business account.</p>
      <form>${nameField}<button class="primary save" type="submit">Accept invitation</button></form>
      <button class="detail-delete" type="button">Back to business accounts</button>`;
    prefillName();
    const removeInvite = () => history.replaceState(history.state, '', location.pathname + location.search);
    content.querySelector('button[type=button]').onclick = () => { removeInvite(); showHome(); };
    const form = content.querySelector('form');
    form.onsubmit = event => {
      event.preventDefault();
      run(async valid => {
        await request('join', { token: inviteToken(), name: new FormData(form).get('name') });
        if (!valid()) return;
        removeInvite();
        showHomeAfterRun('You joined the business account.');
      });
    };
  }

  function formatAmount(value, currency) {
    const minor = BigInt(value);
    const format = new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fraction = new Intl.NumberFormat(undefined, { useGrouping: false, minimumIntegerDigits: 2 }).format(minor % 100n);
    return format.formatToParts(minor / 100n).map(part => part.type === 'fraction' ? fraction : part.value).join('');
  }

  function showBusiness(item) {
    active = item;
    page = 0;
    content.innerHTML = `
      <button class="business-back" type="button">‹ Business accounts</button>
      <h4>${escapeHtml(item.name)}</h4>
      <p class="field-help">${roles[item.role]} · ${escapeHtml(item.currency)}</p>
      <p class="field-help business-totals-label"></p>
      <div class="report-grid" aria-live="polite"></div>
      <p class="field-help business-queue" role="status"></p>
      <button class="primary save business-add" type="button">Add a transaction</button>
      ${item.role === 'owner' ? `
        <details>
          <summary>Invite someone</summary>
          <form class="business-invite">
            <label class="field">Access<select name="role"><option value="member">Member</option><option value="admin">Admin</option></select></label>
            <p class="field-help">Members see their own transactions. Admins see all transactions and totals.</p>
            <button class="primary save" type="submit">Create invite link</button>
          </form>
          <div class="business-link" hidden>
            <label class="field">Invite link<input readonly></label>
            <button type="button" class="detail-delete">Copy link</button>
            <p class="field-help">Share this link with one person. It expires after seven days or when used.</p>
          </div>
        </details>` : ''}
      <div class="business-history">
        <strong>${item.role === 'member' ? 'Your recordings' : 'Business activity'}</strong>
        <button type="button" class="business-back business-refresh">Refresh</button>
      </div>
      <div class="business-sales"></div>`;
    content.querySelector('.business-back').onclick = () => { active = undefined; showHome(); };
    content.querySelector('.business-refresh').onclick = () => refreshTransactions(page);
    content.querySelector('.business-add').onclick = async () => {
      try {
        const records = await cachedEntries(item.owner, item.id);
        if (!dialog.open || active !== item || getOwner() !== item.owner) return;
        openEntry(null, { ...item, records: records.filter(x => !x.error), save: entry => save(item, entry) });
      } catch {
        status.textContent = 'Could not open the transaction form. Try again.';
      }
    };
    const invite = content.querySelector('.business-invite');
    if (invite) {
      const link = content.querySelector('.business-link');
      const input = link.querySelector('input');
      link.querySelector('button').onclick = async () => {
        try {
          await navigator.clipboard.writeText(input.value);
          status.textContent = 'Invite link copied.';
        } catch {
          input.select();
          status.textContent = 'Copy the selected invite link to share it.';
        }
      };
      invite.onsubmit = event => {
        event.preventDefault();
        run(async valid => {
          const result = await request('invite', { businessId: item.id, role: invite.elements.role.value });
          if (!valid()) return;
          const url = new URL('/', location.origin);
          url.hash = new URLSearchParams({ 'business-invite': result.token }).toString();
          input.value = url.href;
          link.hidden = false;
        });
      };
    }
    refreshTransactions(0);
  }

  function refreshTransactions(nextPage) {
    if (busy) {
      refreshOnIdle = true;
      return;
    }
    run(valid => loadTransactions(nextPage, valid));
  }

  async function loadTransactions(nextPage, valid) {
    const { id, currency, owner } = active;
    let local = await cachedEntries(owner, id);
    if (!valid()) return;
    if (!navigator.onLine || !getClerk()?.user) {
      renderTransactions(undefined, local, currency, nextPage);
      return;
    }
    await sync();
    if (!valid()) return;
    local = await cachedEntries(owner, id);
    let result;
    try {
      result = await request('transactions', { businessId: id, page: nextPage }, owner);
    } catch {
      if (valid()) {
        renderTransactions(undefined, local, currency, nextPage);
        status.textContent = 'Showing transactions saved on this device. Refresh to try loading the synced history.';
      }
      return;
    }
    if (!valid()) return;
    const entries = result.sales.map(({ entry, created_at, own, ...record }) => ({
      ...entry, ...record, createdAt: entry.createdAt || created_at, syncedAt: created_at, own,
    }));
    for (const entry of entries.filter(record => record.own)) {
      const previous = local.find(x => x.id === entry.id);
      if (!previous?.pending) await writeEntry(owner, id, entry);
    }
    if (valid()) renderTransactions({ ...result, sales: entries }, local, currency, nextPage);
  }

  function renderTransactions(result, local, currency, nextPage) {
    const order = (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
    const pending = local.filter(x => x.pending || x.error).sort(order);
    const synced = local.filter(x => !x.pending && !x.error).sort(order);
    const total = synced.length;
    page = result ? nextPage : Math.min(nextPage, Math.max(0, Math.ceil(total / 20) - 1));
    const recent = result?.sales || synced.slice(page * 20, (page + 1) * 20);
    const visible = [...(page === 0 ? pending.filter(x => !recent.some(y => y.id === x.id)) : []), ...recent];
    const totals = local.filter(x => !x.error).reduce((sum, x) => {
      sum[x.type || 'income'] += BigInt(x.cents);
      sum.expense += BigInt(x.fee || 0);
      return sum;
    }, { income: 0n, expense: 0n });
    const summary = result?.summary || totals;
    const count = result?.summary.count ?? total;
    const amount = value => escapeHtml(formatAmount(value, currency));
    content.querySelector('.business-totals-label').textContent = result ?
      (active.role === 'member' ? 'Your synced totals' : 'Business synced totals') : 'Your transactions on this device';
    content.querySelector('.report-grid').innerHTML = `
      <div>Money In<strong>${amount(summary.income)}</strong></div>
      <div>Money Out<strong>${amount(summary.expense)}</strong></div>`;
    const queued = pending.filter(x => x.pending).length;
    content.querySelector('.business-queue').textContent = [
      queued ? `${queued} waiting to sync` : '',
      pending.length > queued ? `${pending.length - queued} could not sync` : '',
    ].filter(Boolean).join(' · ');
    const list = content.querySelector('.business-sales');
    list.innerHTML = visible.length ? visible.map(entry => {
      const incoming = entry.type !== 'expense';
      const activity = entry.error || (entry.pending ? 'Waiting to sync' : `Recorded by ${entry.recorder}`);
      return `<details class="business-transaction">
        <summary class="transaction"><span class="details"><strong>${escapeHtml(entry.description)}</strong>
        <small>${incoming ? 'Money In' : 'Money Out'} · ${escapeHtml(entry.date)} ${escapeHtml(entry.time || '')} · ${escapeHtml(activity)}</small></span>
        <span class="value ${incoming ? 'positive' : 'negative'}">${incoming ? '+' : '−'}${amount(entry.cents)}</span></summary>
        <dl class="detail-list">
          ${entry.category ? `<div><dt>Category</dt><dd>${escapeHtml(entry.category)}</dd></div>` : ''}
          ${entry.reference ? `<div><dt>Reference</dt><dd>${escapeHtml(entry.reference)}</dd></div>` : ''}
          ${entry.fee ? `<div><dt>Transaction fee</dt><dd>${amount(entry.fee)}</dd></div>` : ''}
          ${entry.reportedBalance != null ? `<div><dt>Message balance</dt><dd>${amount(entry.reportedBalance)}</dd></div>` : ''}
          ${active.role !== 'member' && entry.recorder_id ? `<div><dt>Recorder ID</dt><dd>${escapeHtml(entry.recorder_id)}</dd></div>` : ''}
          <div><dt>Recorded</dt><dd>${escapeHtml(formatTimestamp(entry.createdAt))}</dd></div>
          ${entry.syncedAt ? `<div><dt>Synced</dt><dd>${escapeHtml(formatTimestamp(entry.syncedAt))}</dd></div>` : ''}
        </dl>
        ${entry.source ? `<details><summary>Original message</summary><p>${escapeHtml(entry.source)}</p></details>` : ''}
      </details>`;
    }).join('') : '<p class="field-help">No transactions to show.</p>';
    if (page || count > 20) {
      list.insertAdjacentHTML('beforeend', `
        <div class="business-pages">
          <button type="button" class="detail-delete" ${page ? '' : 'disabled'}>Previous</button>
          <span>Page ${page + 1}</span>
          <button type="button" class="detail-delete" ${(page + 1) * 20 >= count ? 'disabled' : ''}>Next</button>
        </div>`);
      const [previous, next] = list.querySelectorAll('.business-pages button');
      previous.onclick = () => refreshTransactions(page - 1);
      next.onclick = () => refreshTransactions(page + 1);
    }
  }

  function formatTimestamp(value) {
    const time = new Date(value);
    return Number.isNaN(time.getTime()) ? 'Unavailable' :
      new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(time);
  }

  window.addEventListener('hashchange', () => {
    if (inviteToken()) {
      clear();
      open();
    }
  });
  if (inviteToken()) open();
  function updateAuth() {
    const nextUser = getClerk()?.user?.id;
    const changed = nextUser !== userId;
    const restored = nextUser && !authenticated;
    authenticated = !!nextUser;
    if (changed) {
      const shouldOpen = nextUser && (inviteToken() || (!userId && dialog.open));
      userId = nextUser;
      if (dialog.open) dialog.close();
      clear();
      if (shouldOpen) open();
    }
    if (nextUser && (changed || restored)) reconnect();
  }
  function reconnect() {
    if (busy) {
      refreshOnIdle = true;
      return;
    }
    if (dialog.open && active) refreshTransactions(page);
    else {
      sync();
      if (dialog.open) showHome();
    }
  }
  window.addEventListener('online', reconnect);
  window.addEventListener('offline', () => { if (dialog.open && active) refreshTransactions(page); });
  setInterval(() => { if (dialog.open && active) refreshTransactions(page); else sync(); }, 60000);
  return { updateAuth };
}
