// js/charts.js
//
// Fancy-but-lightweight SVG charts:
// - Line chart: area gradient, smoothed path, ticks/grid, hover tooltip, points
// - Bar chart: axis/grid, smart x-labels, value labels, hover tooltip
//
// Zero deps, responsive, respects your existing CSS.
// ---------------------------------------------------------------------

/* ============================== Utilities ============================== */

const fmtInt = new Intl.NumberFormat().format;
const fmtShort = (n) => {
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n/1e9).toFixed(1).replace(/\.0$/,'')+'B';
  if (abs >= 1e6) return (n/1e6).toFixed(1).replace(/\.0$/,'')+'M';
  if (abs >= 1e3) return (n/1e3).toFixed(1).replace(/\.0$/,'')+'k';
  return String(n);
};
const fmtDate = (ts) => {
  try {
    return new Date(ts).toLocaleDateString(undefined, { month:'short', day:'2-digit' });
  } catch { return String(ts); }
};

function ensureTooltip() {
  let t = document.getElementById('chart-tooltip');
  if (!t) {
    t = document.createElement('div');
    t.id = 'chart-tooltip';
    Object.assign(t.style, {
      position:'fixed', left:'0', top:'0', transform:'translate(-50%, calc(-100% - 10px))',
      background:'rgba(20,23,33,.95)', color:'#e8eef2', padding:'6px 8px',
      border:'1px solid rgba(255,255,255,.08)', borderRadius:'8px',
      fontSize:'12px', pointerEvents:'none', zIndex:'100',
      boxShadow:'0 10px 30px rgba(0,0,0,.35)', opacity:'0', transition:'opacity .12s ease'
    });
    document.body.appendChild(t);
  }
  return t;
}
const tooltip = ensureTooltip();
function showTip(html, x, y) {
  tooltip.innerHTML = html;
  tooltip.style.left = x+'px';
  tooltip.style.top  = y+'px';
  tooltip.style.opacity = '1';
}
function hideTip() { tooltip.style.opacity = '0'; }

/* ============================== Math/scales ============================ */

function niceExtent(min, max) {
  if (!isFinite(min) || !isFinite(max)) return [0,1];
  if (min === max) {
    const pad = Math.abs(min) || 1;
    return [min - pad*0.5, max + pad*0.5];
  }
  return [min, max];
}

function scaleLinear([d0,d1], [r0,r1]) {
  const m = (d1 - d0) === 0 ? 0 : (r1 - r0) / (d1 - d0);
  return v => r0 + (v - d0) * m;
}

function scaleBand(domain, [r0,r1], padding=0.15) {
  const n = Math.max(1, domain.length);
  const step = (r1 - r0) / (n + padding*2);
  const bandwidth = step;
  return {
    bandwidth,
    pos: i => r0 + step*(padding + i)
  };
}

// “Nice” ticks like d3.ticks (simplified)
function niceTicks(min, max, count=5) {
  if (!(isFinite(min) && isFinite(max)) || count < 1) return [];
  if (min === max) { return [min]; }
  const span = max - min;
  const step0 = Math.pow(10, Math.floor(Math.log10(span / count)));
  const err = (span / count) / step0;
  const step =
    err >= 7.5 ? step0 * 10 :
    err >= 3.5 ? step0 * 5 :
    err >= 1.5 ? step0 * 2 :
                 step0;
  const start = Math.ceil(min / step) * step;
  const stop  = Math.floor(max / step) * step;
  const ticks = [];
  for (let v = start; v <= stop + 1e-9; v += step) ticks.push(+v.toFixed(12));
  return ticks;
}

/* ============================== SVG helpers ============================ */

function clearSVG(svg){ while (svg.firstChild) svg.removeChild(svg.firstChild); }
function el(svg, type, attrs={}) {
  const n = document.createElementNS('http://www.w3.org/2000/svg', type);
  for (const [k,v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  svg.appendChild(n); return n;
}
function addTitle(node, text){
  const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
  t.textContent = String(text ?? '');
  node.appendChild(t);
}
function sizeOf(svg, fallbackW=640, fallbackH=240) {
  const W = svg.clientWidth || Number(svg.getAttribute('width')) || fallbackW;
  const H = Number(svg.getAttribute('height')) || svg.clientHeight || fallbackH;
  return [W,H];
}

/* ============================== Animations ============================= */

function animatePathDraw(path, duration=800){
  const total = path.getTotalLength?.() ?? 0;
  if (!total) return;
  path.setAttribute('stroke-dasharray', total);
  path.setAttribute('stroke-dashoffset', total);
  requestAnimationFrame(()=>{
    path.style.transition = `stroke-dashoffset ${duration}ms ease`;
    path.setAttribute('stroke-dashoffset', '0');
  });
}
function animateBarGrow(rect, yFrom, hFrom, yTo, hTo, duration=500){
  rect.setAttribute('y', yFrom);
  rect.setAttribute('height', hFrom);
  requestAnimationFrame(()=>{
    rect.style.transition = `y ${duration}ms ease, height ${duration}ms ease`;
    rect.setAttribute('y', yTo);
    rect.setAttribute('height', Math.max(0, hTo));
  });
}

/* ============================== Public API ============================= */

/**
 * renderLineChart(svg, data, options)
 * data: [{x:number(timestamp or numeric), y:number, label?:string}]
 * options:
 *  - xAccessor, yAccessor (required)
 *  - titles?: string[]      // tooltip per point (optional)
 *  - yLabel?: string        // axis label
 *  - xIsTime?: boolean      // formats x ticks as dates
 *  - margin?: {t,r,b,l}
 */
export function renderLineChart(svg, data, {
  xAccessor,
  yAccessor,
  titles,
  yLabel,
  xIsTime = true,
  margin = { t: 18, r: 16, b: 34, l: 46 }
} = {}) {
  clearSVG(svg);
  if (!Array.isArray(data) || !data.length || !xAccessor || !yAccessor) return;

  const [W,H] = sizeOf(svg);
  const innerW = Math.max(0, W - margin.l - margin.r);
  const innerH = Math.max(0, H - margin.t - margin.b);
  if (innerW === 0 || innerH === 0) return;

  // Extents
  const xs = data.map(xAccessor);
  const ys = data.map(yAccessor);
  const [x0,x1] = niceExtent(Math.min(...xs), Math.max(...xs));
  const [y0,y1] = niceExtent(Math.min(...ys, 0), Math.max(...ys)); // include zero if below min
  const sx = scaleLinear([x0,x1], [margin.l, margin.l + innerW]);
  const sy = scaleLinear([y0,y1], [margin.t + innerH, margin.t]);

  // Frame & grid
  el(svg,'rect',{ x:margin.l, y:margin.t, width:innerW, height:innerH, fill:'none', stroke:'#232737' });

  const yTicks = niceTicks(y0, y1, 5);
  yTicks.forEach(v=>{
    const y = sy(v);
    el(svg,'line',{ x1:margin.l, y1:y, x2:margin.l+innerW, y2:y, stroke:'#232737' });
    const txt = el(svg,'text',{ x: margin.l - 8, y: y + 3, 'text-anchor':'end', 'font-size':'10', fill:'#9aa4af' });
    txt.textContent = fmtShort(v);
  });

  // x ticks: choose ~6 nicely spaced ticks
  const xTicksCount = Math.min(6, Math.max(2, Math.floor(innerW / 100)));
  const xTicks = niceTicks(x0, x1, xTicksCount);
  xTicks.forEach(v=>{
    const x = sx(v);
    el(svg,'line',{ x1:x, y1:margin.t, x2:x, y2:margin.t+innerH, stroke:'rgba(255,255,255,0.04)' });
    const txt = el(svg,'text',{ x, y: margin.t + innerH + 14, 'text-anchor':'middle', 'font-size':'10', fill:'#9aa4af' });
    txt.textContent = xIsTime ? fmtDate(v) : fmtShort(v);
  });

  // Optional Y axis label
  if (yLabel) {
    const t = el(svg,'text',{ x: margin.l - 34, y: margin.t + innerH/2, 'text-anchor':'middle', 'font-size':'11', fill:'#9aa4af', transform:`rotate(-90 ${margin.l - 34} ${margin.t + innerH/2})` });
    t.textContent = yLabel;
  }

  // Area gradient (defs scoped per chart)
  const gid = 'grad-' + Math.random().toString(36).slice(2,8);
  const defs = el(svg,'defs');
  const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  grad.setAttribute('id', gid);
  grad.setAttribute('x1','0'); grad.setAttribute('y1','0');
  grad.setAttribute('x2','0'); grad.setAttribute('y2','1');
  const stop1 = document.createElementNS(grad.namespaceURI, 'stop');
  stop1.setAttribute('offset','0%'); stop1.setAttribute('stop-color','#6ab0ff'); stop1.setAttribute('stop-opacity','0.35');
  const stop2 = document.createElementNS(grad.namespaceURI, 'stop');
  stop2.setAttribute('offset','100%'); stop2.setAttribute('stop-color','#6ab0ff'); stop2.setAttribute('stop-opacity','0.02');
  grad.append(stop1, stop2); defs.appendChild(grad);

  // Path & area (with slight smoothing)
  const linePts = data.map(p => [ sx(xAccessor(p)), sy(yAccessor(p)) ]);
  let d = '';
  for (let i=0;i<linePts.length;i++){
    const [x,y] = linePts[i];
    if (i===0) d += `M${x},${y}`;
    else {
      const [px,py] = linePts[i-1];
      const mx = (x + px)/2;
      d += ` Q${px},${py} ${mx},${(py+y)/2} T${x},${y}`; // gentle smooth
    }
  }
  const path = el(svg,'path',{ d, fill:'none', stroke:'#6ab0ff', 'stroke-width':2 });
  animatePathDraw(path, 900);

  const areaD = `${d} L ${margin.l + innerW},${margin.t + innerH} L ${margin.l},${margin.t + innerH} Z`;
  el(svg,'path',{ d: areaD, fill:`url(#${gid})`, opacity:'0.9' });

  // Points & interactive tooltip zone
  const hitRadius = Math.max(12, Math.min(24, innerW / Math.max(6, data.length)));
  data.forEach((p,i)=>{
    const x = sx(xAccessor(p));
    const y = sy(yAccessor(p));
    const dot = el(svg,'circle',{ cx:x, cy:y, r:3.4, fill:'#6ab0ff' });
    addTitle(dot, titles?.[i] ?? `${xIsTime ? fmtDate(xAccessor(p)) : xAccessor(p)} • ${fmtInt(yAccessor(p))}`);
    // larger invisible hit area for easier hover
    const hot = el(svg,'circle',{ cx:x, cy:y, r:hitRadius, fill:'transparent' });
    hot.addEventListener('pointerenter', (e)=>{
      showTip(`<strong>${xIsTime ? fmtDate(xAccessor(p)) : xAccessor(p)}</strong><br>${fmtInt(yAccessor(p))}`, e.clientX, e.clientY);
    });
    hot.addEventListener('pointermove', (e)=> showTip(tooltip.innerHTML, e.clientX, e.clientY));
    hot.addEventListener('pointerleave', hideTip);
  });
}

/**
 * renderBarChart(svg, data, options)
 * data: array of items
 * options:
 *  - xAccessor(d): label string
 *  - yAccessor(d): number
 *  - labelAccessor?: displayed label (default xAccessor)
 *  - yLabel?: string
 *  - margin?: {t,r,b,l}
 */
export function renderBarChart(svg, data, {
  xAccessor,
  yAccessor,
  labelAccessor = xAccessor,
  yLabel,
  margin = { t: 18, r: 16, b: 64, l: 46 } // bumped bottom margin
} = {}) {
  clearSVG(svg);
  if (!Array.isArray(data) || !data.length || !xAccessor || !yAccessor) return;

  const [W,H] = sizeOf(svg);
  const innerW = Math.max(0, W - margin.l - margin.r);
  const innerH = Math.max(0, H - margin.t - margin.b);
  if (innerW === 0 || innerH === 0) return;

  const ys = data.map(yAccessor);
  const [y0,y1] = niceExtent(0, Math.max(...ys));
  const sy = scaleLinear([y0,y1], [margin.t + innerH, margin.t]);

  const domain = data.map((_, i) => i);
  const band = scaleBand(domain, [margin.l, margin.l + innerW], 0.12);

  // Frame & Y grid
  el(svg,'rect',{ x:margin.l, y:margin.t, width:innerW, height:innerH, fill:'none', stroke:'#232737' });
  const yTicks = niceTicks(y0, y1, 5);
  yTicks.forEach(v=>{
    const y = sy(v);
    el(svg,'line',{ x1:margin.l, y1:y, x2:margin.l+innerW, y2:y, stroke:'#232737' });
    const txt = el(svg,'text',{ x: margin.l - 8, y: y + 3, 'text-anchor':'end', 'font-size':'10', fill:'#9aa4af' });
    txt.textContent = fmtShort(v);
  });

  if (yLabel) {
    const t = el(svg,'text',{ x: margin.l - 34, y: margin.t + innerH/2, 'text-anchor':'middle', 'font-size':'11', fill:'#9aa4af', transform:`rotate(-90 ${margin.l - 34} ${margin.t + innerH/2})` });
    t.textContent = yLabel;
  }

  // Bars
  const labelAngle = data.length > 8 ? -30 : 0;
  data.forEach((d,i)=>{
    const x = band.pos(i);
    const v = yAccessor(d);
    const y = sy(v);
    const h = (margin.t + innerH) - y;

    const rect = el(svg,'rect',{ x, y: margin.t + innerH, width: band.bandwidth*0.9, height: 0, fill:'#6ab0ff' });
    animateBarGrow(rect, margin.t + innerH, 0, y, h, 520);

    // Value label (inside or above)
    if (h > 16) {
      const val = el(svg,'text', { x: x + band.bandwidth*0.45, y: y + 12, 'text-anchor':'middle', 'font-size':'10', fill:'#00142b', opacity:'0.95', fontWeight:'700' });
      val.textContent = fmtShort(v);
    } else {
      const val = el(svg,'text', { x: x + band.bandwidth*0.45, y: y - 4, 'text-anchor':'middle', 'font-size':'10', fill:'#9aa4af' });
      val.textContent = fmtShort(v);
    }

    // X label (pushed down with dy)
    const label = String(labelAccessor(d) ?? '').slice(0, 18);
    const tx = el(svg,'text',{
      x: x + band.bandwidth*0.45,
      y: margin.t + innerH + 18,
      'text-anchor':'middle',
      'font-size':'10',
      fill:'#9aa4af',
      dy: '0.6em'  // shift further down
    });
    tx.textContent = label;
    if (labelAngle) {
      tx.setAttribute('transform', `rotate(${labelAngle} ${x + band.bandwidth*0.45} ${margin.t + innerH + 18})`);
    }

    // Tooltip hit target
    const hot = el(svg,'rect',{ x: x, y: margin.t, width: band.bandwidth, height: innerH, fill:'transparent' });
    const labelFull = String(labelAccessor(d) ?? '');
    hot.addEventListener('pointerenter', (e)=> showTip(`<strong>${labelFull}</strong><br>${fmtInt(v)} XP`, e.clientX, e.clientY));
    hot.addEventListener('pointermove', (e)=> showTip(tooltip.innerHTML, e.clientX, e.clientY));
    hot.addEventListener('pointerleave', hideTip);
  });
}
