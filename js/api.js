// js/api.js

// Talk to the local Go proxy to avoid CORS.
const SIGNIN_URL = '/signin';
const GQL_URL    = '/graphql';

/* ------------------------------------------------------------------ */
/* Storage                                                            */
/* ------------------------------------------------------------------ */
export function saveToken(jwt){ localStorage.setItem('jwt', jwt); }
export function getToken(){ return localStorage.getItem('jwt'); }
export function clearToken(){ localStorage.removeItem('jwt'); }

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

// UTF-8 safe btoa (regular btoa breaks on non-ASCII)
function btoaUtf8(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

// Extract a clean JWT from any text body (handles quotes/newlines)
function extractJWT(text) {
  const trimmed = String(text || '').trim();
  const unquoted = (trimmed.startsWith('"') && trimmed.endsWith('"'))
    ? trimmed.slice(1, -1)
    : trimmed;
  const m = unquoted.match(/[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/);
  return m ? m[0] : null;
}

/* ------------------------------------------------------------------ */
/* JWT utils                                                          */
/* ------------------------------------------------------------------ */
export function decodeJWT(token){
  try{
    const parts = String(token).split('.');
    if(parts.length !== 3) return null;
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4; if (pad) b64 += '='.repeat(4 - pad);
    const jsonStr = atob(b64);
    // handle UTF-8 payloads safely
    const utf8 = decodeURIComponent(escape(jsonStr));
    return JSON.parse(utf8);
  }catch{
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Auth                                                               */
/* ------------------------------------------------------------------ */
// POST /signin with Basic auth -> upstream returns JWT (text)
export async function signinBasic(identifier, password){
  const id = String(identifier || '').trim();
  const pw = String(password || '');
  if(!id || !pw) throw new Error('Please enter both identifier and password.');

  // Build Basic header safely
  const credentials = btoaUtf8(`${id}:${pw}`);

  const res = await fetch(SIGNIN_URL, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${credentials}` }
  });

  const raw = await res.text().catch(()=> '');
  if(!res.ok){
    // Common: 401 invalid creds, 403 forbidden
    const msg = raw?.trim() || `Signin failed (HTTP ${res.status})`;
    throw new Error(msg);
  }

  const token = extractJWT(raw);
  if(!token){
    console.error('Unexpected signin response body:', raw);
    throw new Error('Signin returned no token.');
  }
  return token;
}

/* ------------------------------------------------------------------ */
/* GraphQL                                                            */
/* ------------------------------------------------------------------ */
// POST /graphql with Bearer -> returns { data, errors? }
export async function gql(query, variables = {}){
  const token = getToken();
  if(!token) throw new Error('Missing token');

  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type':'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ query, variables })
  });

  let body;
  try {
    body = await res.json();
  } catch {
    const raw = await res.text().catch(()=> '');
    throw new Error(raw?.trim() || `GraphQL HTTP ${res.status}`);
  }

  if(!res.ok) throw new Error(body?.errors?.[0]?.message || `GraphQL HTTP ${res.status}`);
  if(body?.errors?.length) throw new Error(body.errors[0].message || 'GraphQL error');

  return body?.data;
}
