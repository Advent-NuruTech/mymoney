const $ = s => document.querySelector(s);
const state = { entries: [], filter: 'all', user: localStorage.getItem('mm-user') || 'guest', clerk: null, syncing: false, configured: false, query: '', page: 1, editing: null, preferences: null, setupSaving: false, setupPromptedFor: null };
const db = await new Promise((resolve, reject) => { const request = indexedDB.open('my-money', 3); request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('entries')) request.result.createObjectStore('entries', { keyPath: 'id' }); const entries = request.transaction.objectStore('entries'); if (!entries.indexNames.contains('owner')) entries.createIndex('owner', 'owner'); if (!request.result.objectStoreNames.contains('metadata')) request.result.createObjectStore('metadata'); }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
function allEntries() { return new Promise((resolve, reject) => { const req = db.transaction('entries').objectStore('entries').index('owner').getAll(state.user); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
function put(entry) { return new Promise((resolve, reject) => { const tx = db.transaction('entries', 'readwrite'); tx.objectStore('entries').put(entry); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
const money = cents => new Intl.NumberFormat(undefined, { style: 'currency', currency: state.preferences?.currency || 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function status() { const el = $('#syncStatus'); el.classList.toggle('offline', !navigator.onLine); el.innerHTML = `<i></i> ${!navigator.onLine ? 'Offline · saved on device' : state.syncing ? 'Syncing…' : state.clerk?.user ? 'Connected · sync on' : 'Saved on this device'}`; }
async function render(refresh = false) {
  if (refresh || state.loadedOwner !== state.user) { const owner = state.user; const entries = await allEntries(); if (owner !== state.user) return; state.entries = entries.filter(x => !x.deleted); state.loadedOwner = owner; }
  const income = state.entries.filter(x => x.type === 'income').reduce((a,x) => a+x.cents,0);
  const expenses = state.entries.filter(x => x.type === 'expense').reduce((a,x) => a+x.cents,0);
  $('#balance').textContent = money(income-expenses); $('#income').textContent = money(income); $('#expenses').textContent = money(expenses);
  $('#entryCount').textContent = `${state.entries.length.toLocaleString()} ${state.entries.length === 1 ? 'entry' : 'entries'}`;
  const query = state.query.toLocaleLowerCase();
  const items = state.entries.filter(x => (state.filter === 'all' || x.type === state.filter) && (!query || `${x.description} ${x.category} ${x.date}`.toLocaleLowerCase().includes(query))).sort((a,b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const pageSize = 50, pages = Math.max(1, Math.ceil(items.length / pageSize)); state.page = Math.min(state.page, pages);
  const start = (state.page - 1) * pageSize;
  $('#resultsCount').textContent = items.length ? `Showing ${start + 1}-${Math.min(start + pageSize, items.length)} of ${items.length.toLocaleString()} transactions` : 'No transactions found';
  $('#transactions').innerHTML = items.length ? items.slice(start, start + pageSize).map(x => `<button type="button" class="transaction" data-detail="${escapeHtml(x.id)}" aria-label="View details for ${escapeHtml(x.description)}"><div class="stat-icon ${x.type === 'income' ? 'income-icon' : 'expense-icon'}">${x.type === 'income' ? '&#8601;' : '&#8599;'}</div><div class="details"><strong>${escapeHtml(x.description)}</strong><small>${escapeHtml(x.category)} &middot; ${escapeHtml(x.date)}</small></div><span class="value ${x.type === 'income' ? 'positive' : ''}">${x.type === 'income' ? '+' : '&minus;'}${money(x.cents)}</span><span class="transaction-chevron" aria-hidden="true">&#8250;</span></button>`).join('') : `<div class="empty"><div class="empty-icon">&#10035;</div><strong>${state.entries.length ? 'No matching transactions' : 'Your story starts here'}</strong><p>${state.entries.length ? 'Try another search or filter.' : 'Add your first transaction and see the big picture come together.'}</p>${state.entries.length ? '' : '<button data-open>+ &nbsp; Add a transaction</button>'}</div>`;
  $('#pagination').innerHTML = pages > 1 ? `<button data-page="${state.page-1}" ${state.page === 1 ? 'disabled' : ''}>Previous</button><span>Page ${state.page} of ${pages}</span><button data-page="${state.page+1}" ${state.page === pages ? 'disabled' : ''}>Next</button>` : '';
  status();
}
function openEntry(entry = null) {
  const form = $('#entryForm'); form.reset(); state.editing = entry?.id || null;
  $('#dialogTitle').textContent = entry ? 'Edit transaction' : 'Add a transaction';
  form.querySelector('[name=date]').value = entry?.date || today();
  if (entry) { form.elements.type.value = entry.type; form.elements.amount.value = (entry.cents / 100).toFixed(2); form.elements.description.value = entry.description; if (![...form.elements.category.options].some(option => option.value === entry.category)) form.elements.category.add(new Option(entry.category, entry.category)); form.elements.category.value = entry.category; }
  form.querySelector('.save-another').hidden = !!entry;
  $('#entryDialog').showModal();
}
let detailId = null;
function openDetail(entry) {
  detailId = entry.id;
  $('#detailTitle').textContent = entry.description;
  const date = new Date(`${entry.date}T12:00:00`);
  const formattedDate = Number.isNaN(date.getTime()) ? entry.date : new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(date);
  const created = new Date(entry.createdAt);
  $('#detailContent').innerHTML = `<p class="detail-amount ${entry.type === 'income' ? 'positive' : ''}">${entry.type === 'income' ? '+' : '&minus;'}${money(entry.cents)}</p><dl class="detail-list"><div><dt>Type</dt><dd>${entry.type === 'income' ? 'Income' : 'Expense'}</dd></div><div><dt>Category</dt><dd>${escapeHtml(entry.category)}</dd></div><div><dt>Date</dt><dd>${escapeHtml(formattedDate)}</dd></div><div><dt>Recorded</dt><dd>${Number.isNaN(created.getTime()) ? '?' : escapeHtml(new Intl.DateTimeFormat(undefined, {dateStyle:'medium', timeStyle:'short'}).format(created))}</dd></div></dl>`;
  $('#detailDialog').showModal();
}
$('#closeDetail').onclick = () => $('#detailDialog').close();
$('#detailEdit').onclick = () => { const entry = state.entries.find(x => x.id === detailId); if (entry) { $('#detailDialog').close(); openEntry(entry); } };
$('#detailDelete').onclick = async () => { const entry = state.entries.find(x => x.id === detailId); if (entry && confirm(`Delete "${entry.description}" (${money(entry.cents)})?`)) { await put({...entry, deleted:true, updatedAt:Date.now(), dirty:true}); $('#detailDialog').close(); await render(true); sync(); toast('Transaction deleted'); } };
let toastTimer; function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3000); }
function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
document.addEventListener('click', async e => {
  if(e.target.closest('[data-open]')) openEntry();
  const detail = e.target.closest('[data-detail]'); if (detail) { const entry = state.entries.find(x => x.id === detail.dataset.detail); if (entry) openDetail(entry); }
  const edit = e.target.closest('[data-edit]'); if(edit) { const entry = state.entries.find(x => x.id === edit.dataset.edit); if(entry) openEntry(entry); }
  const deletion = e.target.closest('[data-delete]'); if(deletion) { const entry = state.entries.find(x => x.id === deletion.dataset.delete); if(entry && confirm(`Delete "${entry.description}" (${money(entry.cents)})?`)) { await put({...entry, deleted:true, updatedAt:Date.now(), dirty:true}); await render(); sync(); toast('Transaction deleted'); } }
  const filter = e.target.closest('[data-filter]'); if(filter) { state.filter = filter.dataset.filter; state.page = 1; document.querySelectorAll('.filter').forEach(x => { x.classList.toggle('active', x.dataset.filter === state.filter); x.setAttribute('aria-pressed', String(x.dataset.filter === state.filter)); }); render(); }
  const page = e.target.closest('[data-page]'); if(page && !page.disabled) { state.page = Number(page.dataset.page); await render(); $('#activity').scrollIntoView({behavior:'smooth'}); }
});
$('#transactionSearch').addEventListener('input', e => { state.query = e.target.value.trim(); state.page = 1; render(); });
$('#closeDialog').onclick = () => $('#entryDialog').close();
$('#entryForm').onsubmit = async e => {
  e.preventDefault(); const f = new FormData(e.target); const amount = String(f.get('amount')); const cents = Math.round(Number(amount)*100); const description=String(f.get('description')).trim();
  if(!/^\d+(?:\.\d{1,2})?$/.test(amount) || !Number.isSafeInteger(cents) || cents <= 0 || cents > 100000000000 || !description) { toast('Enter a valid amount with up to two decimal places and a description.'); return; }
  const existing = state.entries.find(x => x.id === state.editing);
  await put({ ...existing, id:existing?.id || crypto.randomUUID(), owner:state.user, type:f.get('type'), cents, description, category:f.get('category'), date:f.get('date'), createdAt:existing?.createdAt || new Date().toISOString(), updatedAt:Date.now(), dirty:true, deleted:false });
  const another = e.submitter?.value === 'yes' && !existing;
  if (another) { e.target.elements.amount.value = ''; e.target.elements.description.value = ''; e.target.elements.amount.focus(); } else $('#entryDialog').close();
  await render(true); toast(existing ? 'Transaction updated' : 'Transaction saved'); sync();
};
const entryForServer = x => ({id:x.id,type:x.type,cents:x.cents,description:x.description,category:x.category,date:x.date,createdAt:x.createdAt,deleted:x.deleted});
function prepareSync(owner) { return new Promise((resolve,reject) => {
  const tx=db.transaction(['entries','metadata'],'readwrite'), entries=tx.objectStore('entries'), meta=tx.objectStore('metadata');
  const all=entries.index('owner').getAll(owner), cursor=meta.get(`cursor:${owner}`); let operations=[];
  all.onsuccess=()=>{ for(const x of all.result) { if(x.owner!==owner || operations.length>=100) continue;
    // Records saved by the previous app have no server version; upload them once.
    if(!x.dirty && x.version) continue;
    if(!x.pendingOperation) { x.pendingOperation={operationId:crypto.randomUUID(),baseVersion:x.version || '0',entry:entryForServer(x)}; x.dirty=true; entries.put(x); }
    operations.push(x.pendingOperation);
  }};
  tx.oncomplete=()=>resolve({cursor:cursor.result || '0',operations}); tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error);
}); }
function applySync(owner, response, choices) { return new Promise((resolve,reject)=>{
  const tx=db.transaction(['entries','metadata'],'readwrite'), store=tx.objectStore('entries'), meta=tx.objectStore('metadata');
  for(const result of response.results) {
    const snapshot=result.entry; const id=snapshot?.id || choices[result.operationId]?.id;
    if(!id) continue;
    const request=store.get(id); request.onsuccess=()=>{
      const local=request.result; if(!local || local.owner!==owner || local.pendingOperation?.operationId!==result.operationId) return;
      const changed=JSON.stringify(entryForServer(local))!==JSON.stringify(local.pendingOperation.entry);
      if(result.status==='conflict') {
        if(choices[result.operationId]?.keep || changed || !snapshot) store.put({...local,version:snapshot?.version || '0',pendingOperation:null,dirty:true});
        else store.put({...snapshot,owner,dirty:false,pendingOperation:null});
      } else if(changed) store.put({...local,version:snapshot.version,pendingOperation:null,dirty:true});
      else store.put({...snapshot,owner,dirty:false,pendingOperation:null});
    };
  }
  for(const change of response.changes) {
    const request=store.get(change.entry.id); request.onsuccess=()=>{ const local=request.result;
      if(local && (local.owner!==owner || local.dirty || local.pendingOperation)) return;
      if(!local || BigInt(local.version || '0') < BigInt(change.entry.version)) store.put({...change.entry,owner,dirty:false,pendingOperation:null});
    };
  }
  if(response.changes.length) meta.put(response.changes[response.changes.length-1].cursor,`cursor:${owner}`);
  tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error);
}); }
async function sync() {
  if(!navigator.onLine || !state.clerk?.user || state.syncing) return;
  const owner=state.user; state.syncing=true; status();
  try {
    for(let page=0; page<50 && state.user===owner; page++) {
      const token=await state.clerk.session.getToken(); if(!token || state.user!==owner) break;
      const request=await prepareSync(owner);
      const response=await fetch('/api/sync',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(request)});
      if(!response.ok) throw Error('Sync failed');
      const data=await response.json(); const choices={};
      for(const result of data.results) if(result.status==='conflict') {
        const operation=request.operations.find(x=>x.operationId===result.operationId);
        choices[result.operationId]={id:operation.entry.id,keep:confirm('This transaction changed on another device. Choose OK to keep this device’s version, or Cancel to use the server version.')};
      }
      await applySync(owner,data,choices);
      if(data.changes.length<200 && request.operations.length<100 && !data.results.some(x=>x.status==='conflict')) break;
    }
  } catch(e) { console.warn('Sync deferred:', e.message); toast('Sync will retry when connection is available.'); }
  finally {state.syncing=false; await render(true);}
}
// Preferences are stored with the Clerk user and cached per account for offline use.
const preferenceKey = owner => `mm-preferences:${owner}`;
function cachedPreferences(owner) { try { return JSON.parse(localStorage.getItem(preferenceKey(owner)) || 'null'); } catch { return null; } }
function validPreferences(value) { return value && typeof value.country === 'string' && /^[A-Z]{2}$/.test(value.country) && typeof value.currency === 'string' && /^[A-Z]{3}$/.test(value.currency); }
function applyPreferences(value) {
  state.preferences = validPreferences(value) ? {country:value.country, currency:value.currency} : null;
  $('#amountCurrency').textContent = state.preferences?.currency || 'USD';
  $('#settingsReminder').hidden = !!state.preferences;
}
const countryCodes = 'AD AE AF AG AI AL AM AO AR AS AT AU AW AZ BA BB BD BE BF BG BH BI BJ BM BN BO BQ BR BS BT BW BY BZ CA CD CF CG CH CI CK CL CM CN CO CR CU CV CW CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WS XK YE YT ZA ZM ZW'.split(' ');
const regionNames = new Intl.DisplayNames(['en'], {type:'region'});
const currencyNames = new Intl.DisplayNames(['en'], {type:'currency'});
const countrySelect = $('#countrySelect'), currencySelect = $('#currencySelect');
const countries = countryCodes.map(code => ({code, label:regionNames.of(code)})).sort((a,b) => a.label.localeCompare(b.label));
const currencies = Intl.supportedValuesOf('currency').map(code => ({code, label:`${code} - ${currencyNames.of(code)}`}));
function populateChoices(select, choices, query, selected) {
  const matches = choices.filter(item => `${item.label} ${item.code}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const chosen = choices.find(item => item.code === selected);
  if (chosen && !matches.includes(chosen)) matches.unshift(chosen);
  select.replaceChildren(new Option(matches.length ? 'Select an option' : 'No matches found', ''), ...matches.map(item => new Option(item.label, item.code)));
  select.value = selected || '';
}
function refreshChoices() {
  populateChoices(countrySelect, countries, $('#countrySearch').value.trim(), countrySelect.value);
  populateChoices(currencySelect, currencies, $('#currencySearch').value.trim(), currencySelect.value);
}
$('#countrySearch').addEventListener('input', refreshChoices);
$('#currencySearch').addEventListener('input', refreshChoices);
for (const [pickerId, searchId, select, summaryId, placeholder] of [
  ['countryPicker', 'countrySearch', countrySelect, 'countrySummary', 'Select your country'],
  ['currencyPicker', 'currencySearch', currencySelect, 'currencySummary', 'Select your currency']
]) {
  const picker = $(`#${pickerId}`), search = $(`#${searchId}`), summary = $(`#${summaryId}`);
  const updateSummary = () => { summary.textContent = select.value ? select.selectedOptions[0].text : placeholder; };
  picker.addEventListener('toggle', () => { if (picker.open) { document.querySelectorAll('.choice-picker').forEach(other => { if (other !== picker) other.open = false; }); search.focus(); } });
  select.addEventListener('change', () => { updateSummary(); picker.open = false; summary.focus(); });
  picker.updateSummary = updateSummary;
}

function openSetup() {
  const preferences = state.preferences;
  $('#countrySearch').value = ''; $('#currencySearch').value = '';
  populateChoices(countrySelect, countries, '', preferences?.country); populateChoices(currencySelect, currencies, '', preferences?.currency);
  $('#countryPicker').open = false; $('#currencyPicker').open = false;
  $('#countryPicker').updateSummary(); $('#currencyPicker').updateSummary();
  $('#setupError').textContent = '';
  if (!$('#setupDialog').open) $('#setupDialog').showModal();
}
$('#openSettings').onclick = $('#reminderSettings').onclick = openSetup;
$('#closeSetup').onclick = () => $('#setupDialog').close();
$('#setupForm').onsubmit = async e => {
  e.preventDefault();
  const owner = state.user, preferences = {country:countrySelect.value, currency:currencySelect.value};
  if (!validPreferences(preferences)) { $('#setupError').textContent = 'Please choose a country and currency.'; return; }
  const button = e.target.querySelector('[type=submit]'); button.disabled = true; state.setupSaving = true; $('#setupError').textContent = '';
  try {
    if (state.clerk?.user) {
      if (!navigator.onLine) throw new Error('Connect to the internet to save your account settings.');
      await state.clerk.user.update({unsafeMetadata:{...state.clerk.user.unsafeMetadata, moneyPreferences:preferences}});
      if (state.user !== owner) throw new Error('Your account changed. Please try again.');
    }
    localStorage.setItem(preferenceKey(owner), JSON.stringify(preferences)); applyPreferences(preferences);
    $('#setupDialog').close(); await render(); toast('Settings saved');
  } catch (error) { $('#setupError').textContent = error.message || 'Could not save settings. Please try again.'; }
  finally { state.setupSaving = false; button.disabled = false; }
};
async function setupAuth() { try { const config = await (await fetch('/api/config')).json(); if(!config.publishableKey || !config.clerkDomain) return; state.configured = true; const script = document.createElement('script'); script.async = true; script.crossOrigin = 'anonymous'; script.dataset.clerkPublishableKey = config.publishableKey; script.src = `https://${config.clerkDomain}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`; await new Promise((resolve,reject)=>{script.onload=resolve;script.onerror=reject;document.head.appendChild(script)}); await window.Clerk.load(); state.clerk=window.Clerk; async function update() { const previous = state.user; state.user = state.clerk.user?.id || 'guest'; if(state.clerk.user) localStorage.setItem('mm-user',state.user); else localStorage.removeItem('mm-user'); $('#signIn').textContent = state.clerk.user ? '↗  Account & sign out' : '↗  Sign in to sync'; const accountPreferences = state.clerk.user?.unsafeMetadata?.moneyPreferences;
  const preferences = validPreferences(accountPreferences) ? accountPreferences : cachedPreferences(state.user);
  if (validPreferences(accountPreferences)) localStorage.setItem(preferenceKey(state.user), JSON.stringify(accountPreferences));
  applyPreferences(preferences); await render();
  if (state.clerk.user && !validPreferences(preferences) && !state.setupSaving && state.setupPromptedFor !== state.user) { state.setupPromptedFor = state.user; openSetup(); }
  if (previous !== state.user && !state.clerk.user) { state.setupPromptedFor = null; if ($('#setupDialog').open) $('#setupDialog').close(); }
  sync(); } state.clerk.addListener(update); await update(); } catch(e) { console.warn('Authentication unavailable:', e.message); } }
$('#signIn').onclick = $('#accountShortcut').onclick = () => { if(!state.clerk) { toast(state.configured ? 'Sign-in is unavailable offline.' : 'Sign-in needs Clerk configuration.'); return; } state.clerk.user ? state.clerk.openUserProfile() : state.clerk.openSignIn(); };
window.addEventListener('online', () => {status();sync();}); window.addEventListener('offline',status); setInterval(sync, 60000); if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(console.error); applyPreferences(cachedPreferences(state.user)); await render(); setupAuth();
