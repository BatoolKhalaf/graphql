// js/app.js
import { signinBasic, saveToken, getToken, clearToken, decodeJWT, gql } from './api.js';
import { Q_ME, Q_RESULTS_WITH_USER, Q_XP, Q_OBJECT_NAMES } from './queries.js';
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

function fmtNum(n){ return new Intl.NumberFormat().format(n); }
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

/* ------------------------------ data load ---------------------------- */
let isLoadingProfile = false;
async function loadProfile(){
  if (isLoadingProfile) return;
  isLoadingProfile = true;
  try{
    // 1) Who am I (simple query)
    const me = await gql(Q_ME);
    const user = me?.user?.[0];
    if(!user) throw new Error('Failed to load user.');

    uLogin.textContent = user.login ?? '—';
    uEmail.textContent = user.email ?? '—';
    uId.textContent    = user.id ?? '—';

    // 2) Latest results (nested user)
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

    // 3) XP transactions (with args) using userId from JWT
    const token = getToken();
    const payload = decodeJWT(token);
    const userId = Number(payload?.sub || payload?.userId || user.id); // fallbacks
    const xpData = await gql(Q_XP, { userId });
    const txs = xpData?.transaction ?? [];

    const totalXP = txs.reduce((acc,t)=> acc + (t.amount||0), 0);
    uXP.textContent = fmtNum(totalXP);

    // XP over time
    const byDay = new Map(); // day -> sum
    txs.forEach(t => {
      const day = toDay(t.createdAt);
      byDay.set(day, (byDay.get(day)||0) + (t.amount||0));
    });
    const seriesTime = [...byDay.entries()]
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

    // XP by project
    const byProject = new Map(); // objectId -> sum
    txs.forEach(t => {
      const key = Number(t.objectId);
      if(!Number.isFinite(key)) return;
      byProject.set(key, (byProject.get(key)||0) + (t.amount||0));
    });

    let bars = [];
    if(byProject.size){
      const ids = [...byProject.keys()];
      const names = await gql(Q_OBJECT_NAMES, { ids });
      const nameMap = new Map(names?.object?.map(o => [o.id, o.name]) || []);
      bars = ids.map(id => ({
        id, name: nameMap.get(id) || String(id), sum: byProject.get(id)
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
