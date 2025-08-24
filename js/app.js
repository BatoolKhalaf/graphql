// js/app.js
import { signinBasic, saveToken, getToken, clearToken, decodeJWT, gql } from './api.js';
import { Q_ME, Q_RESULTS_WITH_USER, Q_XP, Q_OBJECT_NAMES, Q_PASSED_OBJECTS } from './queries.js';
import { renderLineChart, renderBarChart } from './charts.js';

const loginView   = document.getElementById('login-view');
const profileView = document.getElementById('profile-view');
const logoutBtn   = document.getElementById('logout-btn');

const loginForm   = document.getElementById('login-form');
const idInput     = document.getElementById('identifier');
const pwInput     = document.getElementById('password');
const loginError  = document.getElementById('login-error');

const uLogin = document.getElementById('u-login');
const uEmail = document.getElementById('u-email');
const uId    = document.getElementById('u-id');
const uXP    = document.getElementById('u-xp');

const latestList   = document.getElementById('latest-results');
const noResultsEl  = document.getElementById('no-results');

const svgXPTime    = document.getElementById('xp-over-time');
const noXPTime     = document.getElementById('no-xp-time');
const svgXPProject = document.getElementById('xp-by-project');
const noXPProject  = document.getElementById('no-xp-project');

const loadingEl = document.getElementById('loading');
const toastEl   = document.getElementById('toast');

/* ------------------ Rules ------------------ */
const EXCLUDE_KEYWORDS = ['checkpoint', 'raid', '/audit']; // always drop
const PISCINE_KEYWORD  = 'piscine';

/* ------------------ UX helpers ------------------ */
function show(view){
  if(view === 'login'){
    loginView.classList.add('active');
    profileView.classList.remove('active');
    logoutBtn.hidden = true;
  } else {
    profileView.classList.add('active');
    loginView.classList.remove('active');
    logoutBtn.hidden = false;
  }
}

function startLoading(msg='Loading…'){
  loadingEl.querySelector('p').textContent = msg;
  loadingEl.classList.remove('hidden');
}
function stopLoading(){
  loadingEl.classList.add('hidden');
}

let toastTimer = null;
function toast(message, ms=2500){
  toastEl.textContent = message;
  toastEl.classList.remove('hidden');
  requestAnimationFrame(()=> toastEl.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{
    toastEl.classList.remove('show');
    setTimeout(()=> toastEl.classList.add('hidden'), 250);
  }, ms);
}

const nf = new Intl.NumberFormat();
function toDay(ts){ return new Date(ts).toISOString().slice(0,10); }
function isMobile(){ return window.matchMedia('(max-width: 600px)').matches; }

/* ------------------ init ------------------ */
document.addEventListener('DOMContentLoaded', async () => {
  if(getToken()){
    show('profile');
    startLoading('Fetching your profile…');
    try { await loadProfile(); }
    finally{ stopLoading(); }
  }else{
    show('login');
  }
});

logoutBtn.addEventListener('click', () => {
  clearToken();
  show('login');
  loginForm.reset();
  idInput.focus();
  toast('Logged out');
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  const identifier = idInput.value.trim();
  const password   = pwInput.value;
  if(!identifier || !password){
    loginError.textContent = 'Please enter both identifier and password.';
    loginError.hidden = false; return;
  }
  try{
    loginForm.querySelector('button[type="submit"]').disabled = true;
    startLoading('Signing you in…');
    const jwt = await signinBasic(identifier, password);
    saveToken(jwt);
    show('profile');
    startLoading('Loading your data…');
    await loadProfile();
    toast('Welcome 👋');
  }catch(err){
    loginError.textContent = err.message || 'Sign in failed.';
    loginError.hidden = false;
  }finally{
    stopLoading();
    loginForm.querySelector('button[type="submit"]').disabled = false;
  }
});

/* ------------------ loadProfile ------------------ */
let isLoadingProfile = false;
async function loadProfile(){
  if (isLoadingProfile) return;
  isLoadingProfile = true;
  try{
    const me = await gql(Q_ME);
    const user = me?.user?.[0];
    if(!user) throw new Error('Failed to load user.');
    uLogin.textContent = user.login ?? '—';
    uEmail.textContent = user.email ?? '—';
    uId.textContent    = user.id ?? '—';

    const [xpData, passedData] = await Promise.all([
      gql(Q_XP, { userId: user.id }),
      gql(Q_PASSED_OBJECTS, { userId: user.id })
    ]);
    const txsAll = xpData?.transaction ?? [];
    const passedRowsAll = passedData?.progress ?? [];

    const txs = txsAll.filter(t => {
      const p = (t.path||'').toLowerCase();
      return !EXCLUDE_KEYWORDS.some(k => p.includes(k));
    });
    const passedRows = passedRowsAll.filter(p => {
      const path = (p.path||'').toLowerCase();
      return !EXCLUDE_KEYWORDS.some(k => path.includes(k));
    });

    const idsFromTx        = new Set();
    const firstTxDateByObj = new Map();
    const maxXPByObj       = new Map();
    const samplePathByObj  = new Map();

    txs.forEach(t => {
      const oid = Number(t.objectId);
      if (!Number.isFinite(oid)) return;
      idsFromTx.add(oid);
      const amt = Number(t.amount || 0);
      if (amt > (maxXPByObj.get(oid) || 0)) maxXPByObj.set(oid, amt);
      const ts = new Date(t.createdAt).getTime();
      const prev = firstTxDateByObj.get(oid) ?? Infinity;
      if (ts < prev) firstTxDateByObj.set(oid, ts);
      if (!samplePathByObj.has(oid) && t.path) samplePathByObj.set(oid, t.path.toLowerCase());
    });

    const allObjIds = [...idsFromTx];
    const objMeta = allObjIds.length ? await gql(Q_OBJECT_NAMES, { ids: allObjIds }) : { object: [] };
    const typeById = new Map((objMeta?.object || []).map(o => [Number(o.id), (o.type || '').toLowerCase()]));
    const rawNameById = new Map((objMeta?.object || []).map(o => [Number(o.id), (o.name || '')]));
    const nameLowerById = new Map((objMeta?.object || []).map(o => [Number(o.id), (o.name || '').toLowerCase()]));

    const passDateByObj = new Map();
    passedRows.forEach(p => {
      const oid = Number(p.objectId);
      if (!Number.isFinite(oid)) return;
      const ts = new Date(p.createdAt).getTime();
      const prev = passDateByObj.get(oid) ?? Infinity;
      if (ts < prev) passDateByObj.set(oid, ts);
    });

    // Step 1: include ALL projects
    const projectIds = allObjIds.filter(oid => typeById.get(oid) === 'project');
    const includedIdsSet = new Set(projectIds);

    // Step 2: include ONE Piscine root project (largest XP)
    const piscineCandidates = allObjIds
      .filter(oid => {
        const n = (nameLowerById.get(oid) || '');
        const p = (samplePathByObj.get(oid) || '');
        return n.includes(PISCINE_KEYWORD) || p.includes(PISCINE_KEYWORD);
      })
      .map(oid => ({ oid, amt: maxXPByObj.get(oid) || 0 }))
      .filter(x => x.amt > 0)
      .sort((a,b)=> b.amt - a.amt);
    if (piscineCandidates.length) includedIdsSet.add(piscineCandidates[0].oid);

    // Step 3: always include exam micro exercises too
    allObjIds.forEach(oid => {
      if (includedIdsSet.has(oid)) return;
      if (typeById.get(oid) !== 'exercise') return;
      const nm = (nameLowerById.get(oid) || '');
      const path = (samplePathByObj.get(oid) || '');
      if (nm.includes('exam') || path.includes('exam')) {
        if ((maxXPByObj.get(oid) || 0) > 0) includedIdsSet.add(oid);
      }
    });

    const includedIds = [...includedIdsSet];

    const officialEntries = [];
    let officialTotal = 0;
    includedIds.forEach(oid => {
      const amt = maxXPByObj.get(oid) || 0;
      if (amt <= 0) return;
      const ts = passDateByObj.get(oid) ?? firstTxDateByObj.get(oid);
      if (ts == null) return;
      officialEntries.push({ objectId: oid, amount: amt, passedAt: new Date(ts).toISOString() });
      officialTotal += amt;
    });

    // ---- Display: ceil to whole kB ----
    const kb = Math.ceil(officialTotal / 1000);
    uXP.textContent = kb + ' kB';

    // --- Charts ---
    const byDay = new Map();
    officialEntries.forEach(e => {
      const day = toDay(e.passedAt);
      byDay.set(day, (byDay.get(day) || 0) + e.amount);
    });
    const seriesTime = [...byDay.entries()]
      .sort((a,b)=> a[0].localeCompare(b[0]))
      .map(([d,amt]) => ({ x: new Date(d).getTime(), y: amt }));

    if(seriesTime.length){
      noXPTime.hidden = true;
      renderLineChart(svgXPTime, seriesTime, {
        xAccessor: d => d.x,
        yAccessor: d => d.y,
        yLabel: 'XP',
        margin: isMobile() ? { t:16, r:12, b:42, l:46 } : { t:18, r:16, b:34, l:46 }
      });
    } else { noXPTime.hidden = false; }

    let bars = officialEntries.map(e => ({
      id: e.objectId,
      name: (rawNameById.get(e.objectId) || '').replace(/\bproject—|\bpiscine—/gi, ''),
      sum: e.amount
    }))
    .sort((a,b)=> b.sum - a.sum)
    .slice(0, 16);
    if(bars.length){
      noXPProject.hidden = true;
      renderBarChart(svgXPProject, bars, {
        xAccessor: d => d.name,
        yAccessor: d => d.sum,
        labelAccessor: d => d.name,
        yLabel: 'XP'
      });
    } else { noXPProject.hidden = false; }

    console.debug('[XP]', { included: includedIds.length, officialTotal, displayKB: kb });
  } finally {
    isLoadingProfile = false;
  }
}

let rerenderTimer = null;
window.addEventListener('resize', () => {
  if (loginView.classList.contains('active')) return;
  clearTimeout(rerenderTimer);
  rerenderTimer = setTimeout(() => {
    loadProfile().catch(console.error);
  }, 200);
});
