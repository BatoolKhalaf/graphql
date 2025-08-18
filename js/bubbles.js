// js/bubbles.js

const ROOT = document.getElementById('blobs');

// Tweakables
const CONFIG = {
  count: 7,                // how many blobs
  minSize: 180,            // px
  maxSize: 360,            // px
  minDur: 16,              // s (float animation)
  maxDur: 28,              // s
  minHueDur: 18,           // s (hue animation)
  maxHueDur: 30,           // s
  edgePadding: 6,          // % away from edges
  parallax: 10,            // px max shift from mouse
};

// Create once
function initBlobs() {
  if (!ROOT) return;
  ROOT.dataset.density = 'medium';

  for (let i = 0; i < CONFIG.count; i++) {
    const el = document.createElement('div');
    el.className = 'blob blob-parallax';

    const sz = rand(CONFIG.minSize, CONFIG.maxSize);
    const pos = randPos(CONFIG.edgePadding);

    el.style.setProperty('--sz', `${sz}px`);
    el.style.setProperty('--x', `${pos.x}px`);
    el.style.setProperty('--y', `${pos.y}px`);
    el.style.setProperty('--rot', `${rand(-6, 6)}deg`);
    el.style.setProperty('--dur', `${rand(CONFIG.minDur, CONFIG.maxDur)}s`);
    el.style.setProperty('--huedur', `${rand(CONFIG.minHueDur, CONFIG.maxHueDur)}s`);

    ROOT.appendChild(el);
  }

  attachParallax();
}

function rand(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function randPos(padPercent = 6) {
  // place in viewport-ish coordinates then center via translate(-50%,-50%)
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const padX = vw * (padPercent / 100);
  const padY = vh * (padPercent / 100);
  const x = rand(-vw/2 + padX, vw/2 - padX);
  const y = rand(-vh/2 + padY, vh/2 - padY);
  return { x, y };
}

function attachParallax() {
  let rafId = null;
  let targetX = 0, targetY = 0;
  const max = CONFIG.parallax;

  const onMove = (e) => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const dx = (e.clientX - cx) / cx; // -1..1
    const dy = (e.clientY - cy) / cy; // -1..1
    targetX = dx * max;
    targetY = dy * max;
    if (!rafId) rafId = requestAnimationFrame(applyParallax);
  };

  function applyParallax() {
    rafId = null;
    const blobs = ROOT.querySelectorAll('.blob');
    blobs.forEach((b, i) => {
      // layered feel: farther blobs move less
      const depth = (i + 1) / (blobs.length + 1); // 0..1
      const px = (targetX * depth).toFixed(2);
      const py = (targetY * depth).toFixed(2);

      // base position stored in --x/--y; we add a parallax offset via CSS transform compose
      // Trick: we modify a CSS variable that the base transform uses implicitly.
      // Simpler: add an extra translate via style.transform for better perf
      const base = `translate(-50%,-50%) translate3d(var(--x,0), var(--y,0),0) rotate(var(--rot,0deg))`;
      b.style.transform = `${base} translate(${px}px, ${py}px)`;
    });
  }

  window.addEventListener('pointermove', onMove, { passive: true });

  // On resize, gently re-scatter positions
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const blobs = ROOT.querySelectorAll('.blob');
      blobs.forEach((b) => {
        const pos = randPos(CONFIG.edgePadding);
        b.style.setProperty('--x', `${pos.x}px`);
        b.style.setProperty('--y', `${pos.y}px`);
      });
    }, 180);
  });
}

initBlobs();
