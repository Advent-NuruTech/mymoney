import { accounts, balance, totals, reportTotals, activityRows, groups, needsReview, duplicate, transferMatches, parseMessage, cents, categories, UNASSIGNED } from '/ledger.js';
const $ = s => document.querySelector(s);
let installPrompt = null;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
window.addEventListener('appinstalled', () => { installPrompt = null; const button = $('#accountInstall'); if (button) button.hidden = true; const help = $('#installHelp'); if (help) help.hidden = true; });
const appInstalled = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const historyPage = document.querySelector('.app').dataset.historyPage === 'true';
const state = { entries: [], filter: 'all', user: localStorage.getItem('mm-user') || 'guest', clerk: null, syncing: false, configured: false, query: '', page: 1, editing: null, preferences: null, setupSaving: false, setupPromptedFor: null };
const db = await new Promise((resolve, reject) => { const request = indexedDB.open('my-money', 3); request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('entries')) request.result.createObjectStore('entries', { keyPath: 'id' }); const entries = request.transaction.objectStore('entries'); if (!entries.indexNames.contains('owner')) entries.createIndex('owner', 'owner'); if (!request.result.objectStoreNames.contains('metadata')) request.result.createObjectStore('metadata'); }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
function allEntries() { return new Promise((resolve, reject) => { const req = db.transaction('entries').objectStore('entries').index('owner').getAll(state.user); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
function put(entry) {
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('entries','readwrite'),store=tx.objectStore('entries');
  const request=store.get(entry.id);
  request.onsuccess=()=>{const old=request.result;if(old){const now=new Date().toISOString();store.put({id:crypto.randomUUID(),owner:entry.owner,type:'audit',parentId:entry.id,cents:0,category:'',description:old.description,date:now.slice(0,10),createdAt:now,deleted:false,before:entryForServer(old),dirty:true});}store.put(entry);};
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
}
const money = cents => new Intl.NumberFormat(undefined, { style: 'currency', currency: state.preferences?.currency || 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function status() { const el = $('#syncStatus'); el.classList.toggle('offline', !navigator.onLine); el.innerHTML = `<i></i> ${!navigator.onLine ? 'Offline · saved on device' : state.syncing ? 'Syncing…' : state.clerk?.user ? 'Connected · sync on' : 'Saved on this device'}`; }
async function render(refresh = false) {
  if (refresh || state.loadedOwner !== state.user) { const owner = state.user; const entries = await allEntries(); if (owner !== state.user) return; state.records = entries; state.entries = entries.filter(x => !x.deleted && groups.includes(x.type)).sort((a,b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)); state.loadedOwner = owner; }
  const summary = reportTotals(state.entries,{...financialFilters,group:state.filter}); const income = summary.income;
  const expenses = summary.expense;
  $('#balance').textContent = money(accounts(state.records).reduce((sum,a) => sum + balance(state.records,a.id),0)); $('#income').textContent = money(income); $('#expenses').textContent = money(expenses);
  $('#entryCount').textContent = `${state.entries.length.toLocaleString()} ${state.entries.length === 1 ? 'entry' : 'entries'}`;
  const query = state.query.toLocaleLowerCase();
  const items = activityRows(state.entries).filter(x => (state.filter === 'all' || x.type === state.filter || (state.filter === 'review' && needsReview(x))) && matchesFilters(x) && (!query || `${x.description} ${x.category} ${x.date}`.toLocaleLowerCase().includes(query)));
  const pageSize = historyPage ? 50 : 5, pages = Math.max(1, Math.ceil(items.length / pageSize)); state.page = Math.min(state.page, pages);
  const start = (state.page - 1) * pageSize;
  $('#resultsCount').textContent = items.length ? `Showing ${start + 1}-${Math.min(start + pageSize, items.length)} of ${items.length.toLocaleString()} transactions` : 'No transactions found';
  $('#transactions').innerHTML = items.length ? items.slice(start, start + pageSize).map(x => `<button type="button" class="transaction" data-detail="${escapeHtml(x.parentId||x.id)}" aria-label="View details for ${escapeHtml(x.description)}"><div class="stat-icon ${x.type === 'income' ? 'income-icon' : 'expense-icon'}">${x.type === 'income' ? '&#8601;' : '&#8599;'}</div><div class="details"><strong>${escapeHtml(x.description)}</strong><small>${escapeHtml(x.category||'Needs Review')} &middot; ${escapeHtml(nameOf(x.accountId))} &middot; ${escapeHtml(x.date)}${x.fee?' ? Charges '+money(x.fee):''}</small></div><span class="value ${x.type === 'income' ? 'positive' : 'negative'}">${x.type === 'transfer' ? '&#8644;' : x.type === 'income' ? '+' : '&minus;'}${money(x.cents)}</span><span class="transaction-chevron" aria-hidden="true">&#8250;</span></button>`).join('') : `<div class="empty"><div class="empty-icon">&#10035;</div><strong>${state.entries.length ? 'No matching transactions' : 'Your story starts here'}</strong><p>${state.entries.length ? 'Try another search or filter.' : 'Add your first transaction and see the big picture come together.'}</p>${state.entries.length ? '' : '<button data-open>+ &nbsp; Add a transaction</button>'}</div>`;
  $('#pagination').innerHTML = historyPage && pages > 1 ? `<button data-page="${state.page-1}" ${state.page === 1 ? 'disabled' : ''}>Previous</button><label>Page <input id="pageJump" type="number" min="1" max="${pages}" value="${state.page}" aria-label="Page number"> of ${pages}</label><button data-page="${state.page+1}" ${state.page === pages ? 'disabled' : ''}>Next</button>` : '';
  renderFinance(summary); status();
}
function openEntry(entry = null) {
  const form = $('#entryForm'); form.reset(); state.editing = entry?.id || null;
  $('#dialogTitle').textContent = entry ? 'Edit transaction' : 'Add a transaction';
  form.querySelector('[name=date]').value = entry?.date || today();
  if (entry) { form.elements.type.value = entry.type; form.elements.amount.value = (entry.cents / 100).toFixed(2); form.elements.description.value = entry.description; if (![...form.elements.category.options].some(option => option.value === entry.category)) form.elements.category.add(new Option(entry.category, entry.category)); form.elements.category.value = entry.category; }
  form.querySelector('.save-another').hidden = !!entry;
  prepareEntry(entry); $('#entryDialog').showModal();
}
let detailId = null;
function openDetail(entry) {
  detailId = entry.id;
  $('#detailTitle').textContent = entry.description;
  const date = new Date(`${entry.date}T12:00:00`);
  const formattedDate = Number.isNaN(date.getTime()) ? entry.date : new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(date);
  const created = new Date(entry.createdAt);
  $('#detailContent').innerHTML = `<p class="detail-amount ${entry.type === 'income' ? 'positive' : 'negative'}">${entry.type === 'income' ? '+' : '&minus;'}${money(entry.cents)}</p><dl class="detail-list"><div><dt>Type</dt><dd>${entry.type === 'transfer' ? 'Move Money' : entry.type === 'income' ? 'Money In' : entry.type === 'adjustment' ? 'Reconciliation adjustment' : 'Money Out'}</dd></div><div><dt>Category</dt><dd>${escapeHtml(entry.category)}</dd></div><div><dt>Date</dt><dd>${escapeHtml(formattedDate)}</dd></div><div><dt>Recorded</dt><dd>${Number.isNaN(created.getTime()) ? '?' : escapeHtml(new Intl.DateTimeFormat(undefined, {dateStyle:'medium', timeStyle:'short'}).format(created))}</dd></div></dl>`;
  detailFinance(entry); $('#detailDialog').showModal();
}
$('#closeDetail').onclick = () => $('#detailDialog').close();
$('#detailEdit').onclick = () => { const entry = state.entries.find(x => x.id === detailId); if (entry) { if(entry.type==='adjustment'){toast('Delete an incorrect adjustment and reconcile again to preserve its history.');return;} $('#detailDialog').close(); openEntry(entry); } };
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
$('#pagination').addEventListener('change', e => { if (e.target.id === 'pageJump') { const page = Number(e.target.value); state.page = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1; render(); } });
$('#transactionSearch').addEventListener('input', e => { state.query = e.target.value.trim(); state.page = 1; render(); });
$('#closeDialog').onclick = () => $('#entryDialog').close();
$('#entryForm').onsubmit = saveFinanceEntry;
const entryForServer = x => Object.fromEntries(Object.entries(x).filter(([key,value]) => !['owner','dirty','version','pendingOperation','updatedAt'].includes(key) && value !== undefined));
function prepareSync(owner) { return new Promise((resolve,reject) => {
  const tx=db.transaction(['entries','metadata'],'readwrite'), entries=tx.objectStore('entries'), meta=tx.objectStore('metadata');
  const all=entries.index('owner').getAll(owner), cursor=meta.get(`cursor:${owner}`); let operations=[], bytes=100;
  all.onsuccess=()=>{ for(const x of all.result) { if(x.owner!==owner || operations.length>=100) continue;
    // Records saved by the previous app have no server version; upload them once.
    if(!x.dirty && x.version) continue;
    if(!x.pendingOperation) { x.pendingOperation={operationId:crypto.randomUUID(),baseVersion:x.version || '0',entry:entryForServer(x)}; x.dirty=true; entries.put(x); }
    const size=new TextEncoder().encode(JSON.stringify(x.pendingOperation)).length; if(bytes+size>240000) break; bytes+=size; operations.push(x.pendingOperation);
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
    while(state.user===owner) {
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
      if(data.changes.length<200 && request.operations.length===0 && !data.results.some(x=>x.status==='conflict')) break;
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
// Keep common currencies available even when a mobile browser has incomplete
// Intl currency data (or does not implement supportedValuesOf).
const currencyCodes = 'AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XCG XOF XPF YER ZAR ZMW ZWG'.split(' ');
const currencies = [...new Set([...currencyCodes, ...(Intl.supportedValuesOf?.('currency') || [])])].sort().map(code => ({code, label:`${code} - ${currencyNames.of(code)}`}));
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
  picker.addEventListener('toggle', () => { if (picker.open) { document.querySelectorAll('.choice-picker').forEach(other => { if (other !== picker) other.open = false; }); if (!window.matchMedia('(pointer: coarse)').matches) search.focus(); } });
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
$('#reminderSettings').onclick = openSetup;
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
let authLoading = false;
async function setupAuth() { if (authLoading || state.clerk) return; authLoading = true; try { const config = await (await fetch('/api/config')).json(); if(!config.publishableKey || !config.clerkDomain) return; state.configured = true; const script = document.createElement('script'); script.async = true; script.crossOrigin = 'anonymous'; script.dataset.clerkPublishableKey = config.publishableKey; script.src = `https://${config.clerkDomain}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`; await new Promise((resolve,reject)=>{script.onload=resolve;script.onerror=reject;document.head.appendChild(script)}); await window.Clerk.load({appearance:{variables:{colorPrimary:'#003b19', colorText:'#003b19', colorBackground:'#ffffff', colorInputBackground:'#ffffff', borderRadius:'0.75rem'}}}); state.clerk=window.Clerk; async function update() { const previous = state.user; state.user = state.clerk.user?.id || 'guest'; if(state.clerk.user) localStorage.setItem('mm-user',state.user); else localStorage.removeItem('mm-user'); $('#signIn').textContent = state.clerk.user ? '↗  Account & sign out' : '↗  Sign in to sync'; $('#signIn').textContent = state.clerk.user ? 'Edit profile' : 'Sign in to sync'; const name = state.clerk.user?.fullName || state.clerk.user?.username || state.clerk.user?.primaryEmailAddress?.emailAddress; setAccountAvatar($('#accountShortcut'), state.clerk.user, name); $('#accountShortcut').setAttribute('aria-label', name ? `Edit profile for ${name}` : 'Account'); const accountPreferences = state.clerk.user?.unsafeMetadata?.moneyPreferences;
  const preferences = validPreferences(accountPreferences) ? accountPreferences : cachedPreferences(state.user);
  if (validPreferences(accountPreferences)) localStorage.setItem(preferenceKey(state.user), JSON.stringify(accountPreferences));
  applyPreferences(preferences); await render();
  if (state.clerk.user && !validPreferences(preferences) && !state.setupSaving && state.setupPromptedFor !== state.user) { state.setupPromptedFor = state.user; openSetup(); }
  if (previous !== state.user) { document.querySelectorAll('dialog[data-finance]').forEach(d => d.close()); importQueue = []; imported = null; Object.keys(financialFilters).forEach(k=>financialFilters[k]=''); if ($('#entryDialog').open) $('#entryDialog').close(); if ($('#detailDialog').open) $('#detailDialog').close(); state.editing = null; detailId = null; }
  if (previous !== state.user && !state.clerk.user) { state.setupPromptedFor = null; if ($('#setupDialog').open) $('#setupDialog').close(); }
  if ($('#accountDialog').open) updateAccount(); sync(); } state.clerk.addListener(update); await update(); } catch(e) { console.warn('Authentication unavailable:', e.message); } finally { authLoading = false; } }
function setAccountAvatar(element, user, name) {
  const initial = name?.trim().charAt(0).toUpperCase() || '?';
  element.textContent = initial;
  if (!user?.imageUrl) return;
  const image = document.createElement('img');
  image.alt = '';
  image.referrerPolicy = 'no-referrer';
  image.onerror = () => { if (image.parentNode === element) element.textContent = initial; };
  image.src = user.imageUrl;
  element.replaceChildren(image);
}
function updateAccount() {
  const user = state.clerk?.user;
  const name = user?.fullName || user?.username || user?.primaryEmailAddress?.emailAddress || (state.user !== 'guest' ? 'Account on this device' : 'Your account');
  $('#accountName').textContent = name;
  $('#accountEmail').textContent = user?.primaryEmailAddress?.emailAddress || '';
  setAccountAvatar($('#accountInitial'), user, user ? name : '');
  const offline = !navigator.onLine;
  $('#accountStatus').textContent = offline ? 'Offline' : user ? (state.syncing ? 'Syncing' : 'Connected') : 'Account unavailable';
  $('#accountStatusDetail').textContent = offline ? 'Your transactions remain available on this device.' : user ? 'Your transactions are saved on this device and sync when connected.' : 'Connect to access your account.';
  $('#accountInstall').hidden = appInstalled();
  $('#installHelp').hidden = true;
  $('#accountSignIn').hidden = !!user || state.user !== 'guest';
  $('#accountProfile').hidden = !user && state.user === 'guest';
  $('#accountProfile').disabled = !user || offline;
  $('#accountSignOut').hidden = !user;
  $('#accountSignOut').disabled = offline;
}
function openAccount() {
  updateAccount(); if (!$('#accountDialog').open) $('#accountDialog').showModal();
}
async function signOut() { try { if (!state.clerk?.user || !navigator.onLine) throw new Error('Unavailable'); await state.clerk.signOut(); if ($('#accountDialog').open) $('#accountDialog').close(); } catch (error) { toast('Could not sign out. Please check your connection and try again.'); } }
$('#closeAccount').onclick = () => $('#accountDialog').close();
$('#accountSignIn').onclick = () => { if (!state.clerk) { toast(navigator.onLine ? (state.configured ? 'Sign-in is unavailable. Please try again.' : 'Sign-in needs Clerk configuration.') : 'Sign-in is unavailable offline.'); return; } $('#accountDialog').close(); state.clerk.openSignIn(); };
$('#accountProfile').onclick = () => { if (state.clerk?.user && navigator.onLine) { $('#accountDialog').close(); state.clerk.openUserProfile(); } };
$('#accountInstall').onclick = async () => {
  const help = $('#installHelp');
  if (installPrompt) {
    const prompt = installPrompt; installPrompt = null;
    try { await prompt.prompt(); await prompt.userChoice; }
    catch { help.textContent = 'Open your browser menu and choose Install app or Add to Home Screen.'; help.hidden = false; }
    return;
  }
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  help.textContent = ios ? 'In Safari, tap Share, then Add to Home Screen.' : 'Open your browser menu and choose Install app or Add to Home Screen, if available.';
  help.hidden = false;
};
$('#accountSettings').onclick = () => { $('#accountDialog').close(); openSetup(); };
$('#accountSignOut').onclick = signOut;
$('#signIn').onclick = $('#accountShortcut').onclick = openAccount;

let imported = null, importQueue = [];
const financialFilters = {account:'', category:'', from:'', to:'', period:''};
const nameOf = id => accounts(state.records || []).find(a => a.id === (id || UNASSIGNED))?.description || 'Unknown account';
function matchesFilters(x) {
 const f=financialFilters;
 return (!f.account || (x.accountId||UNASSIGNED)===f.account || x.toAccountId===f.account) && (!f.category || x.category===f.category) && (!f.from || x.date>=f.from) && (!f.to || x.date<=f.to);
}
function options(list,value='',blank='Select account') { return `<option value="">${blank}</option>`+list.map(a=>`<option value="${escapeHtml(a.id)}" ${a.id===value?'selected':''}>${escapeHtml(a.description)}${a.archived?' (archived)':''}</option>`).join(''); }
function dialog(id,title,body) {
 let d=$('#'+id); if(!d) {d=document.createElement('dialog');d.id=id;d.dataset.finance='true';document.body.append(d);}
 d.innerHTML=`<div class="modal-head"><h3>${title}</h3><button type="button" class="close" aria-label="Close" data-close="${id}">&times;</button></div>${body}`;
 d.showModal(); return d;
}
function renderFinance(summary) {
 const wallets=accounts(state.records), cats=[...new Set([...categories,...state.entries.map(x=>x.category).filter(Boolean),...state.records.filter(x=>x.type==='category'&&!x.archived&&!x.deleted).map(x=>x.description)])];
 $('#financePanel').innerHTML=`<section class="finance-section"><div class="section-heading"><div><p class="eyebrow">YOUR MONEY</p><h3>Accounts</h3><p>Keep bank, mobile money and cash balances together.</p></div><div class="finance-actions"><button class="primary" id="newWallet">+ Add account</button><button id="importMoney">Paste / import messages</button><button id="manageCategories">Categories</button></div></div><div class="wallet-grid">${wallets.length===1?'<div class="account-empty"><strong>Add your first account</strong><p>Choose where your money lives, then record its transactions.</p><button type="button" class="primary" data-new-wallet>+ Add account</button></div>':''}${wallets.filter(a=>a.id!==UNASSIGNED||state.entries.some(x=>!x.accountId||x.accountId===UNASSIGNED||x.toAccountId===UNASSIGNED)).map(a=>`<article class="wallet ${a.archived?'archived':''}"><small>${escapeHtml(a.kind)}${a.archived?' · Archived':''}</small><h4>${escapeHtml(a.description)}</h4><strong>${money(balance(state.records,a.id))}</strong><p class="form-hint">Opening ${money(a.opening||0)} ? In ${money(totals(state.entries.filter(x=>x.accountId===a.id)).income)} ? Out ${money(totals(state.entries.filter(x=>x.accountId===a.id)).expense)}</p><div class="finance-actions"><button data-wallet-history="${escapeHtml(a.id)}">History</button>${a.id===UNASSIGNED?'':`<button data-wallet="${a.id}">Edit</button><button data-reconcile="${a.id}">Reconcile</button>`}</div></article>`).join('')}</div><p class="form-hint">Archived accounts remain in your total and financial history. Unassigned records need an account.</p><div class="report-filters"><label>Account<select id="reportAccount">${options(wallets,financialFilters.account,'All accounts')}</select></label><label>Category<select id="reportCategory"><option value="">All categories</option>${cats.map(c=>`<option ${financialFilters.category===c?'selected':''}>${escapeHtml(c)}</option>`).join('')}</select></label><label>Period<select id="reportPeriod">${[['','All time'],['day','Today'],['week','This week'],['month','This month'],['year','This year']].map(([v,l])=>`<option value="${v}" ${financialFilters.period===v?'selected':''}>${l}</option>`).join('')}</select></label><label>From<input type="date" id="reportFrom" value="${financialFilters.from}"></label><label>To<input type="date" id="reportTo" value="${financialFilters.to}"></label></div><div class="report-grid"><div>Money In<strong>${money(summary.income)}</strong></div><div>Money Out <small>(includes fees)</small><strong>${money(summary.expense)}</strong></div><div>Money Moved<strong>${money(summary.transfer)}</strong></div><div>Transaction Charges<strong>${money(summary.fees)}</strong></div><button data-filter="review">Needs Review<strong>${summary.review}</strong></button></div>${summary.review?'<p class="review-note">A little detail helps: explain your uncategorized transactions when you have a moment.</p>':''}</section>`;
 $('#newWallet').onclick=()=>editWallet(); $('#importMoney').onclick=openImport; $('#manageCategories').onclick=manageCategories;
 for(const [id,key] of [['reportAccount','account'],['reportCategory','category'],['reportFrom','from'],['reportTo','to']]) $('#'+id).onchange=e=>{financialFilters[key]=e.target.value;state.page=1;render();};
 $('#reportPeriod').onchange=e=>{const p=e.target.value,d=new Date();financialFilters.period=p;financialFilters.to=p?today():'';if(p==='week')d.setDate(d.getDate()-((d.getDay()+6)%7));if(p==='month')d.setDate(1);if(p==='year'){d.setMonth(0);d.setDate(1);}financialFilters.from=p?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:'';state.page=1;render();};
}
function prepareEntry(entry) {
 const f=$('#entryForm'); imported=entry?.source?entry:null;
 const wallets=accounts(state.records).filter(a=>!a.archived||[entry?.accountId,entry?.toAccountId].includes(a.id));
 $('#entryAccounts').innerHTML=`<div class="form-row entry-account-row"><div><label class="field"><span id="sourceLabel">Account</span><select name="accountId" required>${options(wallets,entry?.accountId||'')}</select></label><button type="button" class="text-action" data-add-entry-account="accountId">+ Add account</button></div><div id="destinationField"><label class="field">To<select name="toAccountId">${options(wallets,entry?.toAccountId||'')}</select></label><button type="button" class="text-action" data-add-entry-account="toAccountId">+ Add destination account</button></div></div><p id="importContext" class="import-context" hidden></p>`;
 $('#entryExtras').innerHTML=`<details id="entryExtraDetails" ${entry?.fee||entry?.reference?'open':''}><summary>Fee &amp; reference <span class="optional">(optional)</span></summary><label class="field" id="feeField">Transaction fee <span class="optional">(optional)</span><input name="fee" type="number" min="0" step="0.01" value="${((entry?.fee||0)/100).toFixed(2)}"></label><label class="field">Reference <span class="optional">(optional)</span><input name="reference" maxlength="40" value="${escapeHtml(entry?.reference||'')}"></label></details>`;
 f.elements.time.value=entry?entry.time||'':currentTime();
 $('#timeHint').textContent=entry?'Keep the recorded time, or change it if needed.':'New entries use the current time if left blank.';
 $('#entryAccounts').querySelectorAll('[data-add-entry-account]').forEach(button=>{button.onclick=()=>editWallet(null,account=>{
  for(const name of ['accountId','toAccountId']) f.elements[name].add(new Option(account.description,account.id));
  f.elements[button.dataset.addEntryAccount].value=account.id;
  updateEntryFields();
 });});
 const cat=f.elements.category; for(const c of [...categories,...state.records.filter(x=>x.type==='category'&&!x.archived&&!x.deleted).map(x=>x.description)]) if(![...cat.options].some(o=>o.value===c))cat.add(new Option(c,c));
 if(!entry)cat.value='';
 f.onchange=updateEntryFields; updateEntryFields();
 f.elements.description.onblur=()=>{if(!cat.value){const previous=state.entries.find(x=>x.description.toLowerCase()===f.elements.description.value.trim().toLowerCase()&&x.category);if(previous){cat.value=previous.category;toast('Category suggested from your history. You can change it.');}}};
}
function updateEntryFields() {
 const f=$('#entryForm'), move=f.elements.type.value==='transfer', a=accounts(state.records).find(x=>x.id===f.elements.accountId.value), b=accounts(state.records).find(x=>x.id===f.elements.toAccountId.value);
 $('#sourceLabel').textContent=move?'From':'Account'; $('#destinationField').hidden=!move;f.elements.toAccountId.required=move;
 $('#entryAccounts .entry-account-row').classList.toggle('is-transfer',move);
 const cash=a?.kind==='cash'&&(!move||b?.kind==='cash'); $('#feeField').hidden=cash; if(cash)f.elements.fee.value='0';
}
function currentTime() { return new Date().toTimeString().slice(0,5); }
async function importId(x) {
 const data=new TextEncoder().encode(`${state.user}:${x.provider}:${x.reference.toUpperCase()}`);
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(b=>b.toString(16).padStart(2,'0')).join('');
 return `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
}
async function saveFinanceEntry(e) {
 e.preventDefault(); if(state.savingEntry)return;state.savingEntry=true; const f=e.target, v=f.elements;
 try {
  const old=state.entries.find(x=>x.id===state.editing), amount=cents(v.amount.value), fee=cents(v.fee.value||'0');
  if(amount<=0||fee<0)throw Error('Enter a positive amount and a non-negative fee.');
  if(!v.accountId.value)throw Error('Select the account involved.');
  if(v.type.value==='transfer'&&(!v.toAccountId.value||v.toAccountId.value===v.accountId.value))throw Error('Choose two different accounts.');
  const x={...old,...(imported||{}),id:old?.id||crypto.randomUUID(),owner:state.user,type:v.type.value,cents:amount,fee,accountId:v.accountId.value,toAccountId:v.type.value==='transfer'?v.toAccountId.value:'',description:v.description.value.trim()|| (v.type.value==='transfer'?'Move Money':v.category.value||'Unexplained transaction'),category:v.category.value,date:v.date.value,time:v.time.value||(old?'':currentTime()),reference:v.reference.value.trim(),review:false,createdAt:old?.createdAt||new Date().toISOString(),updatedAt:Date.now(),dirty:true,deleted:false};
  if(!old && x.reference && x.provider) x.id=await importId(x);
  if(state.user!==x.owner)throw Error('Account changed. Please reopen the transaction.');
  if(duplicate({...x,id:old?.id},state.records))throw Error('This message or reference is already recorded.');
  const possible=transferMatches(x,state.records);
  if(imported&&possible.length){const match=possible[0]; if(x.fee && x.fee!==match.fee)throw Error('The fee differs from the existing transfer. Correct that transfer before linking this message.'); if(confirm(`This may be the other side of an existing transfer: ${nameOf(match.accountId)} → ${nameOf(match.toAccountId)}, ${money(match.cents)}. Link this message to that transfer?`)){await put({...match,linkedMessages:[...(match.linkedMessages||[]),{source:x.source,reference:x.reference,provider:x.provider,accountId:x.accountId,reportedBalance:x.reportedBalance}],dirty:true,updatedAt:Date.now()});$('#entryDialog').close();await render(true);sync();nextImport();return;}throw Error('Possible duplicate: review the existing transfer before importing this message.');}
  await put(x);await render(true);sync();toast('Transaction saved');
  if(e.submitter?.value==='yes'&&!old&&!imported)openEntry();else {$('#entryDialog').close();nextImport();}
 }catch(error){toast(error.message);}finally{state.savingEntry=false;}
}
function detailFinance(x) {
 const audit=[...(x.audit||[]),...state.records.filter(a=>a.type==='audit'&&a.parentId===x.id).map(a=>({at:a.createdAt,before:a.before}))];
 $('#detailContent').insertAdjacentHTML('beforeend',`<dl class="detail-list"><div><dt>Account</dt><dd>${escapeHtml(nameOf(x.accountId))}</dd></div>${x.type==='transfer'?`<div><dt>To</dt><dd>${escapeHtml(nameOf(x.toAccountId))}</dd></div>`:''}<div><dt>Transaction Charges</dt><dd>${money(x.fee||0)}</dd></div><div><dt>Reference / time</dt><dd>${escapeHtml(x.reference||'—')} ${escapeHtml(x.time||'')}</dd></div>${x.reportedBalance!=null?`<div><dt>Message balance (at transaction)</dt><dd>${money(x.reportedBalance)}</dd></div>`:''}</dl>${x.source?`<details><summary>Original message</summary><p>${escapeHtml(x.source)}</p></details>`:''}<details><summary>Change history (${audit.length})</summary>${audit.map(a=>`<p>${escapeHtml(a.at)}: ${escapeHtml(a.before.description)} · ${money(a.before.cents)} · ${escapeHtml(a.before.category)}</p>`).join('')||'<p>No edits recorded.</p>'}</details>`);
}
async function saveRecord(values,old) {
 const now=new Date().toISOString(), record={...old,id:old?.id||crypto.randomUUID(),owner:state.user,cents:0,category:'',date:today(),createdAt:old?.createdAt||now,deleted:false,...values,updatedAt:Date.now(),dirty:true};await put(record);await render(true);sync();return record;
}
function editWallet(id,onSaved) {
 const a=state.records.find(x=>x.id===id);
 const d=dialog('walletDialog',a?'Edit account':'Add account',`<p class="modal-sub">A place you keep money: a bank, mobile wallet or cash.</p><form id="walletForm"><label class="field">Account name<input name="name" required maxlength="100" placeholder="e.g. M-PESA, Equity or Cash" value="${escapeHtml(a?.description||'')}"></label><label class="field">Account type<select name="kind" required><option value="">Choose a type</option>${[['mpesa','M-PESA'],['airtel','Airtel Money'],['bank','Bank'],['cash','Cash Wallet'],['savings','Savings'],['custom','Other']].map(([v,l])=>`<option value="${v}" ${a?.kind===v?'selected':''}>${l}</option>`).join('')}</select></label><label class="field">Starting balance (${escapeHtml(state.preferences?.currency||'USD')})<input name="opening" type="number" step="0.01" required aria-describedby="openingHelp" value="${((a?.opening||0)/100).toFixed(2)}"></label><p id="openingHelp" class="field-help">The amount in this account before the transactions you will record. Use 0 if you are adding its full history.</p>${a?`<details><summary>More options</summary><label class="field">Display order<input name="position" type="number" min="0" step="1" value="${a.position||0}"></label><label class="checkbox-field"><input name="archived" type="checkbox" ${a.archived?'checked':''}> Archive this account</label><p class="field-help">Archived balances stay in your total. Changing the starting balance changes the calculated balance.</p></details>`:''}<p id="walletError" class="setup-error" role="alert"></p><button class="primary save">${a?'Save changes':'Add account'}</button></form>`);
 $('#walletForm').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button[type="submit"],button.save');if(button.disabled)return;button.disabled=true;try{const v=e.target.elements;if(!v.name.value.trim())throw Error('Enter an account name.');const account=await saveRecord({type:'account',description:v.name.value.trim(),kind:v.kind.value,opening:cents(v.opening.value),position:v.position?Number(v.position.value):accounts(state.records).length,archived:v.archived?.checked||false},a);d.close();onSaved?.(account);toast(a?'Account updated':'Account added');}catch(err){$('#walletError').textContent=err.message;}finally{button.disabled=false;}};
}
function reconcile(id) {
 const a=accounts(state.records).find(x=>x.id===id), calculated=balance(state.records,id);
 const checks=state.records.filter(x=>['reconciliation','adjustment'].includes(x.type)&&x.accountId===id&&!x.deleted).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 const messages=state.entries.filter(x=>x.accountId===id&&x.reportedBalance!=null).sort((a,b)=>(b.date+(b.time||'')).localeCompare(a.date+(a.time||'')));
 const m=messages[0], historical=m?balance(state.records,id,`${m.date}T${m.time||'00:00'}`):0;
 const d=dialog('reconcileDialog',`Reconcile ${escapeHtml(a.description)}`,`<p>Calculated balance: <strong>${money(calculated)}</strong></p>${m?`<p>Message on ${escapeHtml(m.date)} ${escapeHtml(m.time||'')}: ${money(m.reportedBalance)}. Calculated at that time: ${money(historical)}. Difference: ${money(m.reportedBalance-historical)}. Verify the message and transaction order before using this evidence.</p>`:''}<form id="reconcileForm"><label class="field">Actual balance confirmed now<input name="actual" type="number" step="0.01" required></label><p id="reconcileDifference">Enter your confirmed balance.</p><label class="field">Notes<input name="note" maxlength="100" placeholder="Missing transaction, fee, or correction"></label><label><input name="adjust" type="checkbox"> Record the difference as an explicit reconciliation adjustment</label><p class="form-hint">Check missing transactions, duplicate entries, amounts and fees first. Adjustments are excluded from income and spending.</p><button class="primary save">Save reconciliation</button></form><h4>Reconciliation history</h4>${checks.map(c=>`<p>${escapeHtml(c.createdAt)} · Actual ${money(c.actual)} · Calculated ${money(c.calculated)} · ${c.actual===c.calculated?'Reconciled':'Needs Review'} · ${escapeHtml(c.description)}</p>`).join('')||'<p>No confirmations yet.</p>'}`);
 $('#reconcileForm').elements.actual.oninput=e=>{try{const diff=cents(e.target.value)-calculated;$('#reconcileDifference').textContent=`Difference: ${money(diff)} · ${diff===0?'Reconciled':'Needs Review'}`;}catch{}};
 $('#reconcileForm').onsubmit=async e=>{e.preventDefault();try{const v=e.target.elements,actual=cents(v.actual.value),diff=actual-calculated;if(v.adjust.checked&&diff&&!v.note.value.trim())throw Error('Explain the adjustment so the history stays clear.');await saveRecord({type:v.adjust.checked&&diff?'adjustment':'reconciliation',accountId:id,description:v.note.value.trim()||'Balance confirmed',actual,calculated,cents:v.adjust.checked?diff:0,category:'Reconciliation',time:new Date().toTimeString().slice(0,5)});d.close();}catch(err){toast(err.message);}};
}
function manageCategories() {
 const custom=state.records.filter(x=>x.type==='category'&&!x.deleted);
 const d=dialog('categoryDialog','Categories',`<p>Use Parent / Child for subcategories. Renaming a category preserves the original labels in transaction history.</p><form id="categoryForm"><label class="field">Category<select name="id"><option value="">New category</option>${custom.map(c=>`<option value="${c.id}">${escapeHtml(c.description)}</option>`).join('')}</select></label><label class="field">Name<input name="name" maxlength="50" required placeholder="Business / Supplies"></label><label><input name="archived" type="checkbox"> Archive category</label><button class="primary save">Save category</button></form>`);
 $('#categoryForm').elements.id.onchange=e=>{const c=custom.find(x=>x.id===e.target.value);$('#categoryForm').elements.name.value=c?.description||'';$('#categoryForm').elements.archived.checked=!!c?.archived;};
 $('#categoryForm').onsubmit=async e=>{e.preventDefault();const v=e.target.elements;await saveRecord({type:'category',description:v.name.value.trim(),archived:v.archived.checked},custom.find(x=>x.id===v.id.value));d.close();};
}
function openImport() {
 const d=dialog('importDialog','Paste a money message',`<p class="modal-sub">Copy a bank or mobile money message, paste it here, then check the details before saving.</p><div class="paste-heading"><label for="messageText">Message text</label><button type="button" id="pasteMessage" class="text-action">Paste from clipboard</button></div><textarea id="messageText" class="message-input" rows="7" maxlength="500000" placeholder="Paste your transaction message here…" aria-describedby="pasteHelp"></textarea><p id="pasteHelp" class="field-help">You can also press Ctrl+V, or touch and hold to paste. For multiple messages, leave a blank line between them.</p><details class="import-file"><summary>Or upload a text / JSON file</summary><label class="field">Choose file<input id="messageFile" type="file" accept=".txt,.json,text/plain,application/json"></label></details><p id="importSummary" class="field-help" role="status" aria-live="polite"></p><button type="button" id="extractMessages" class="primary save">Review message</button><p class="form-hint">Processed on this device, even offline. Nothing is saved until you confirm.</p>`);
 $('#pasteMessage').onclick=async()=>{try{if(!navigator.clipboard?.readText)throw Error('unavailable');const text=await navigator.clipboard.readText();if(!text.trim())throw Error('empty');if(text.length>500000)throw Error('large');$('#messageText').value=text;$('#importSummary').textContent='Pasted. Review the message when you are ready.';}catch(err){$('#importSummary').textContent=err.message==='large'?'Paste fewer than 500,000 characters.':'Tap the message box and paste using Ctrl+V or touch and hold → Paste.';}$('#messageText').focus();};
 $('#messageFile').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>500000)throw Error('Choose a file smaller than 500 KB.');let text=await file.text();if(file.name.endsWith('.json')){const items=JSON.parse(text);if(!Array.isArray(items))throw Error('JSON should be an array of messages.');text=items.map(x=>typeof x==='string'?x:x.body||x.message||x.text||'').join('\n\n');}$('#messageText').value=text;}catch(err){$('#importSummary').textContent=err.message;}};
 $('#extractMessages').onclick=()=>{try{if(!$('#messageText').value.trim())throw Error('Paste a transaction message first.');const chunks=$('#messageText').value.split(/\n\s*\n|\n(?=[A-Z0-9]{6,30}\s+Confirmed)/i).filter(x=>x.trim());let skipped=0;const pending=[];for(const chunk of chunks){const x=parseMessage(chunk,accounts(state.records));if(!x||x.source.length>12000||duplicate(x,[...state.records,...pending]))skipped++;else pending.push(x);}importQueue=pending;$('#importSummary').textContent=pending.length?`${pending.length} ready; ${skipped} unrelated or duplicate messages skipped.`:'No new transactions found. Check that you pasted the full message with its amount. Already imported messages are skipped.';if(pending.length){toast(`${pending.length} messages ready; ${skipped} skipped`);d.close();nextImport();}}catch(err){$('#importSummary').textContent=err.message;}};
}
function nextImport() {
 imported=null;if(!importQueue.length)return;const x=importQueue.shift();openEntry();imported=x;$('#dialogTitle').textContent='Review transaction';$('#entryForm .save-another').hidden=true;const v=$('#entryForm').elements;v.type.value=x.type;v.amount.value=(x.cents/100).toFixed(2);v.fee.value=(x.fee/100).toFixed(2);v.description.value=x.description;v.date.value=x.date;v.time.value=x.time||currentTime();v.reference.value=x.reference;v.accountId.value=x.accountId;v.category.value='';$('#entryExtraDetails').open=!!(x.fee||x.reference);updateEntryFields();$('#timeHint').textContent=x.time?'Time taken from the message. You can change it.':'No time found. Using the current time; change it if needed.';$('#importContext').hidden=false;$('#importContext').textContent=`Check the account, amount and date before saving. ${importQueue.length?importQueue.length+' more queued. ':''}${x.feeConfirmed?'Fee extracted from message.':'No fee found; none assumed.'} ${x.reportedBalance!=null?'Message balance: '+money(x.reportedBalance):''}`;
}
$('#entryDialog').addEventListener('cancel',()=>{importQueue=[];imported=null;});
$('#closeDialog').onclick=()=>{importQueue=[];imported=null;$('#entryDialog').close();};
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.close)$('#'+b.dataset.close).close();if(b.dataset.wallet)editWallet(b.dataset.wallet);if(b.dataset.reconcile)reconcile(b.dataset.reconcile);if(b.dataset.walletHistory){financialFilters.account=b.dataset.walletHistory;state.filter='all';state.page=1;render();$('#activity').scrollIntoView({behavior:'smooth'});}});
document.addEventListener('click',e=>{if(e.target.closest('[data-new-wallet]'))editWallet();if(e.target.closest('[data-import-messages]'))openImport();});
const shared=new URLSearchParams(location.search).get('text');if(shared){openImport();$('#messageText').value=shared;history.replaceState(null,'',location.pathname);}

window.addEventListener('online', () => {status(); if ($('#accountDialog').open) updateAccount(); if (!state.clerk) setupAuth(); else sync();}); window.addEventListener('offline', () => {status(); if ($('#accountDialog').open) updateAccount();}); setInterval(sync, 60000); if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(console.error); applyPreferences(cachedPreferences(state.user)); await render(); setupAuth();
