// js/app.js
import { signinBasic, saveToken, getToken, clearToken, decodeJWT, gql } from './api.js';
import { Q_ME, Q_RESULTS_WITH_USER, Q_XP, Q_OBJECT_NAMES, Q_PASSED_OBJECTS_DETAILED } from './queries.js';
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

/* ----- Dashboard matching knobs ----- */
/*
 * These keywords are excluded if found in progress.path (case-insensitive).
 * Adjust if your campus counts some of these differently.
 */
const EXCLUDE_PATH_KEYWORDS = [
  'piscine',     // piscine-go, piscine-js, etc.
  'exam',        // exams
  'checkpoint',  // checkpoints
  'raid',        // raids
  '/audit',      // audit-only paths
  'quiz'         // quizzes if present
];

/* ------------------------------ UX helpers --------------------------- */
function show(view){
  if(view === 'login'){
    loginView.classList.add('active');
    profileView.classList.remove('active');
    loginView.setAttribute('aria-hidden', 'false');
    profileView.setAttribute('aria-hidden', 'true');
    logoutBtn.hidden = true;
  } else {
    profileView.classList.add('active');
    loginView.classList.remove('active');
    profileView.setAttribute('aria-hidden', 'false');
    loginView.setAttribute('aria-hidden', 'true');
    logoutBtn.hidden = false;
  }
}

function startLoading(msg='Loading…'){
  loadingEl.querySelector('p').textContent = msg;
  loadingEl.classList.remove('hidden');
  loadingEl.setAttribute('aria-hidden','false');
}
function stopLoading(){
  loadingEl.classList.add('hidden');
  loadingEl.setAttribute('aria-hidden','true');
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
function fmtNum(n){ return nf.format(n); }
function toDay(ts){ return new Date(ts).toISOString().slice(0,10); }
function isMobile(){ return window.matchMedia('(max-width: 600px)').matches; }

/* ------------------------------ init --------------------------------- */
document.addEventListener('DOMContentLoaded', async () => {
  if(getToken()){
    show('profile');
    startLoading('Fetching your profile…');
    try { await loadProfile(); }
    catch(err){ toast(err.message || String(err), 4000); }
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
    toast('Signin failed', 2500);
  }finally{
    stopLoading();
    loginForm.querySelector('button[type="submit"]').disabled = false;
  }
});

/* ------------------------------ helpers for dashboard parity -------- */
function shouldIncludePassedProgress(p){
  // Must be a "project"
  const type = (p?.object?.type || '').toLowerCase();
  if (type !== 'project') return false;

  // Exclude based on path keywords
  const path = (p?.path || '').toLowerCase();
  for (const k of EXCLUDE_PATH_KEYWORDS) {
    if (path.includes(k)) return false;
  }
  return true;
}

/* ------------------------------ data load ---------------------------- */
let isLoadingProfile = false;
async function loadProfile(){
  if (isLoadingProfile) return;
  isLoadingProfile = true;
  try{
    // 1) Who am I
    const me = await gql(Q_ME);
    const user = me?.user?.[0];
    if(!user) throw new Error('Failed to load user.');

    uLogin.textContent = user.login ?? '—';
    uEmail.textContent = user.email ?? '—';
    uId.textContent    = user.id ?? '—';

    // 2) Latest results (feed)
    const resultsData = await gql(Q_RESULTS_WITH_USER);
    const results = resultsData?.result ?? [];
    latestList.replaceChildren();
    if(!results.length){
      noResultsEl.hidden = false;
    }else{
      noResultsEl.hidden = true;
      results.forEach(r => {
        const li = document.createElement('li');
        const left = document.createElement('span');
        const right = document.createElement('strong');
        left.textContent = `${new Date(r.createdAt).toLocaleDateString()} • ${r.type || 'result'} #${r.id}`;
        right.textContent = String(r.grade);
        li.append(left, right);
        latestList.appendChild(li);
      });
    }

    // 3) Dashboard-matching XP
    const token = getToken();
    const payload = decodeJWT(token);
    const userId = Number(payload?.sub || payload?.userId || user.id);

    // Load all transactions + passed items with details
    const [xpData, passedData] = await Promise.all([
      gql(Q_XP, { userId }),
      gql(Q_PASSED_OBJECTS_DETAILED, { userId })
    ]);

    const txs = xpData?.transaction ?? [];
    const passedAll = passedData?.progress ?? [];

    // Filter passed objects to match dashboard rules
    const passed = passedAll.filter(shouldIncludePassedProgress);

    // Build set and pass-date map of included objects
    const passedSet = new Set();
    const passDateByObj = new Map();
    passed.forEach(p => {
      const oid = Number(p.objectId);
      if (!Number.isFinite(oid)) return;
      passedSet.add(oid);
      if (p.createdAt) passDateByObj.set(oid, p.createdAt);
    });

    // For each objectId, keep MAX transaction.amount (dedupe)
    const maxXPByObj = new Map();
    txs.forEach(t => {
      const oid = Number(t.objectId);
      if (!Number.isFinite(oid)) return;
      const amt = Number(t.amount || 0);
      const prev = maxXPByObj.get(oid) || 0;
      if (amt > prev) maxXPByObj.set(oid, amt);
    });

    // Official total: sum of max amounts for included + passed objects
    let officialTotal = 0;
    const officialEntries = []; // [{objectId, amount, passedAt}]
    maxXPByObj.forEach((maxAmt, oid) => {
      if (passedSet.has(oid)) {
        officialTotal += maxAmt;
        officialEntries.push({ objectId: oid, amount: maxAmt, passedAt: passDateByObj.get(oid) });
      }
    });

    uXP.textContent = fmtNum(officialTotal); // dashboard-style total

    // XP over time: add each object's max XP on its pass date
    const byDayOfficial = new Map();
    officialEntries.forEach(e => {
      const day = toDay(e.passedAt || Date.now());
      byDayOfficial.set(day, (byDayOfficial.get(day) || 0) + e.amount);
    });
    const seriesTime = [...byDayOfficial.entries()]
      .sort((a,b)=> a[0].localeCompare(b[0]))
      .map(([d,amt]) => ({ x: new Date(d).getTime(), y: amt, label: `${d}: ${amt} XP` }));

    if(seriesTime.length){
      noXPTime.hidden = true;
      renderLineChart(svgXPTime, seriesTime, {
        xAccessor: d => d.x,
        yAccessor: d => d.y,
        titles: seriesTime.map(d => d.label),
        yLabel: 'XP',
        margin: isMobile() ? { t:16, r:12, b:42, l:46 } : { t:18, r:16, b:34, l:46 }
      });
    }else{
      noXPTime.hidden = false;
    }

    // XP by project: use officialEntries (max per object)
    let bars = [];
    if(officialEntries.length){
      const ids = [...new Set(officialEntries.map(e => e.objectId))];
      const names = await gql(Q_OBJECT_NAMES, { ids });
      const nameMap = new Map((names?.object || []).map(o => [o.id, o.name]));

      bars = officialEntries.map(e => ({
        id: e.objectId,
        name: nameMap.get(e.objectId) || String(e.objectId),
        sum: e.amount
      }))
      .sort((a,b)=> b.sum - a.sum)
      .slice(0, 16);
    }

    if(bars.length){
      noXPProject.hidden = true;
      renderBarChart(svgXPProject, bars, {
        xAccessor: d => d.name,
        yAccessor: d => d.sum,
        labelAccessor: d => d.name,
        yLabel: 'XP',
        margin: isMobile() ? { t:16, r:12, b:76, l:46 } : { t:18, r:16, b:58, l:46 }
      });
    }else{
      noXPProject.hidden = false;
    }
  } finally {
    isLoadingProfile = false;
  }
}

/* ------------------------------ resize re-render --------------------- */
// Debounced re-render so charts adapt to viewport/rotation
let rerenderTimer = null;
window.addEventListener('resize', () => {
  if (loginView.classList.contains('active')) return; // not logged in
  clearTimeout(rerenderTimer);
  rerenderTimer = setTimeout(() => {
    loadProfile().catch(err => console.error(err));
  }, 200);
});
