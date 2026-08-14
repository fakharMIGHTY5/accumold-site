/* ============================================================
   AccuMold — v2
   The scanner is the site. Everything else gets out of its way.
   ============================================================ */
(function () {
  'use strict';

  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* =========================================================
     1. THE SCANNER
     A moisture field nobody can see, rendered as survey
     contours. The lens is the only thing that makes it real.
     ========================================================= */
  const field = $('[data-field]');
  if (field) initScanner(field);

  function initScanner(root) {
    const cv = $('canvas', root);
    const ctx = cv.getContext('2d');
    const hero = root.closest('.hero');
    const lens = $('.lens', hero);
    const tags = $$('.tag', hero);
    const outX = $('[data-out-x]', hero);
    const outY = $('[data-out-y]', hero);
    const outLv = $('[data-out-lv]', hero);
    const outRh = $('[data-out-rh]', hero);

    // Hotspots live in normalised space and stay clear of the headline.
    const HOT = tags.map((t) => ({
      x: parseFloat(t.dataset.x), y: parseFloat(t.dataset.y),
      r: parseFloat(t.dataset.r || '0.13'), el: t
    }));

    // A couple of drifting sources keep the field alive.
    const DRIFT = [
      { x: 0.35, y: 0.62, a: 0.55, sx: 0.00007, sy: -0.00005 },
      { x: 0.68, y: 0.45, a: 0.45, sx: -0.00005, sy: 0.00008 }
    ];

    // The page is white. The field only exists inside the lens — which is the
    // whole point of the product, so it may as well be the whole mechanic.
    const N = 150;                    // lens buffer resolution
    const oc = document.createElement('canvas'); oc.width = N; oc.height = N;
    const octx = oc.getContext('2d');
    const oimg = octx.createImageData(N, N);
    const obuf = oimg.data;

    let W = 0, H = 0, dpr = 1;
    let px = 0.5, py = 0.5;           // lens position, normalised
    let tx = 0.5, ty = 0.42;          // target
    let lensR = 0.17;                 // as a share of the smaller edge
    let t0 = 0, visible = true, hasPointer = false;

    new IntersectionObserver((e) => { visible = e[0].isIntersecting; }, { threshold: 0 }).observe(root);

    function size() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = root.clientWidth; H = root.clientHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lens.style.setProperty('--d', Math.min(W, H) * lensR * 2 + 'px');
    }
    addEventListener('resize', size);

    root.addEventListener('pointermove', (e) => {
      const r = root.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width;
      ty = (e.clientY - r.top) / r.height;
      hasPointer = true;
    });
    root.addEventListener('pointerleave', () => { hasPointer = false; });

    // Moisture at a point: a few fixed sources plus slow background drift.
    function fieldAt(nx, ny, ar, t) {
      let f = 0;
      for (let k = 0; k < HOT.length; k++) {
        const s = HOT[k];
        const dx = (nx - s.x) * ar, dy = ny - s.y;
        f += 0.95 * Math.exp(-(dx * dx + dy * dy) / 0.012);
      }
      for (let k = 0; k < DRIFT.length; k++) {
        const s = DRIFT[k];
        const dx = (nx - s.x) * ar, dy = ny - s.y;
        f += s.a * Math.exp(-(dx * dx + dy * dy) / 0.045);
      }
      return f + 0.115 * Math.sin(nx * 8.0 + t * 0.5) * Math.cos(ny * 6.5 - t * 0.38)
               + 0.055 * Math.sin(nx * 17.0 - t * 0.31) * Math.sin(ny * 13.0 + t * 0.22);
    }

    function frame(now) {
      requestAnimationFrame(frame);
      if (!visible) return;
      const t = now * 0.001;

      // idle: the lens wanders the wall on its own
      if (!hasPointer && !reduced) {
        tx = 0.5 + Math.cos(t * 0.30) * 0.35;
        ty = 0.47 + Math.sin(t * 0.44) * 0.27;
      }
      px = lerp(px, tx, reduced ? 1 : 0.15);
      py = lerp(py, ty, reduced ? 1 : 0.15);

      // drifting sources
      DRIFT.forEach((s) => {
        s.x += s.sx * (now - t0 || 16); s.y += s.sy * (now - t0 || 16);
        if (s.x < 0.15 || s.x > 0.85) s.sx *= -1;
        if (s.y < 0.15 || s.y > 0.85) s.sy *= -1;
      });
      t0 = now;

      const ar = W / H;
      const lrx = (Math.min(W, H) * lensR) / W;
      const lry = (Math.min(W, H) * lensR) / H;

      // which hotspot is the lens sitting on?
      let hit = -1;
      HOT.forEach((s, i) => {
        const dx = (px - s.x) * ar, dy = py - s.y;
        if (Math.sqrt(dx * dx + dy * dy) < s.r) hit = i;
        s.el.classList.toggle('on', Math.sqrt(dx * dx + dy * dy) < s.r);
        s.el.style.left = s.x * 100 + '%';
        s.el.style.top = s.y * 100 + '%';
      });

      // ---- render, but only what the lens is over ----
      const K = 26;            // contour interval
      const e = 0.0016;        // sample step for the gradient
      const half = 1.06;       // buffer covers slightly more than the circle

      for (let j = 0; j < N; j++) {
        const ny = py + ((j / (N - 1)) - 0.5) * 2 * lry * half;
        for (let i = 0; i < N; i++) {
          const nx = px + ((i / (N - 1)) - 0.5) * 2 * lrx * half;
          const o = (j * N + i) * 4;

          // circular falloff, soft at the rim
          const ux = (i / (N - 1) - 0.5) * 2 * half;
          const uy = (j / (N - 1) - 0.5) * 2 * half;
          const rr = Math.sqrt(ux * ux + uy * uy);
          if (rr > 1) { obuf[o + 3] = 0; continue; }
          const edge = 1 - clamp((rr - 0.82) / 0.18, 0, 1);

          const f = fieldAt(nx, ny, ar, t);

          // Normalise by the gradient so every contour is the same width,
          // instead of smearing across the flat parts of the field.
          const gx = (fieldAt(nx + e, ny, ar, t) - f) / e;
          const gy = (fieldAt(nx, ny + e, ar, t) - f) / e;
          const g = Math.max(Math.sqrt(gx * gx + gy * gy), 0.02);
          const u = f * K;
          const spatial = (Math.abs(u - Math.round(u)) / K) / g;
          const line = 1 - clamp(spatial / 0.0022, 0, 1);

          // a fine measurement grid under the contours
          const grid = ((nx * 110) % 1 < 0.035 || (ny * 74) % 1 < 0.035) ? 0.16 : 0;

          const heat = clamp((f - 0.78) / 0.45, 0, 1);
          const a = (line * 0.95 + grid + 0.035) * edge;

          obuf[o]     = 24 + (229 - 24) * heat;
          obuf[o + 1] = 84 + (72 - 84) * heat;
          obuf[o + 2] = 216 + (77 - 216) * heat;
          obuf[o + 3] = clamp(a, 0, 1) * 255;
        }
      }
      octx.putImageData(oimg, 0, 0);

      ctx.clearRect(0, 0, W, H);
      const dw = Math.min(W, H) * lensR * 2 * half;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(oc, px * W - dw / 2, py * H - dw / 2, dw, dw);

      // ---- lens + readout ----
      lens.style.left = px * 100 + '%';
      lens.style.top = py * 100 + '%';
      if (outX) outX.textContent = (px * 100).toFixed(0).padStart(2, '0');
      if (outY) outY.textContent = (py * 100).toFixed(0).padStart(2, '0');
      if (outRh) outRh.textContent = (52 + Math.sin(t * 0.6) * 4 + (hit >= 0 ? 16 : 0)).toFixed(0) + '%';
      if (outLv) {
        outLv.textContent = hit >= 0 ? 'Detected' : 'Clear';
        outLv.dataset.lv = hit >= 0 ? 'found' : 'clear';
      }
    }
    size();
    requestAnimationFrame(frame);
  }

  /* =========================================================
     2. STEPS — one idea on screen at a time
     ========================================================= */
  $$('[data-steps]').forEach((root) => {
    const steps = $$('.step', root);
    const shots = $$('.phone-s img', root);
    const ghost = $('.ghost', root);
    const dots = $$('.dots button', root);
    const figure = $('.steps-figure', root);
    const n = steps.length;
    let i = 0, timer = null, touched = false;

    const go = (k) => {
      i = (k + n) % n;
      steps.forEach((s, m) => s.classList.toggle('on', m === i));
      shots.forEach((s, m) => s.classList.toggle('on', m === i));
      dots.forEach((d, m) => d.setAttribute('aria-current', String(m === i)));
      if (ghost) ghost.textContent = String(i + 1);
    };
    const play = () => { clearInterval(timer); if (!reduced && !touched) timer = setInterval(() => go(i + 1), 4600); };
    const stop = () => { touched = true; clearInterval(timer); };

    dots.forEach((d, k) => d.addEventListener('click', () => { stop(); go(k); }));

    // Drag or swipe the phone to move between steps.
    if (figure) {
      figure.classList.add('drag');
      let x0 = null;
      figure.addEventListener('pointerdown', (e) => { x0 = e.clientX; figure.setPointerCapture(e.pointerId); });
      figure.addEventListener('pointerup', (e) => {
        if (x0 === null) return;
        const dx = e.clientX - x0; x0 = null;
        if (Math.abs(dx) > 34) { stop(); go(i + (dx < 0 ? 1 : -1)); }
      });
      figure.addEventListener('pointercancel', () => { x0 = null; });
    }

    // Arrow keys once the section has been interacted with or focused.
    root.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { stop(); go(i + 1); }
      if (e.key === 'ArrowLeft') { stop(); go(i - 1); }
    });

    go(0);
    new IntersectionObserver((e) => { if (e[0].isIntersecting) play(); else clearInterval(timer); },
      { threshold: 0.3 }).observe(root);
  });

  /* =========================================================
     3. Nav picks up the colour of whatever is behind it
     ========================================================= */
  const nav = $('.nav');
  const links = $('.links');
  const burger = $('.burger');

  if (burger) {
    burger.addEventListener('click', () => {
      const open = burger.getAttribute('aria-expanded') === 'true';
      burger.setAttribute('aria-expanded', String(!open));
      links.classList.toggle('open', !open);
      document.body.style.overflow = !open ? 'hidden' : '';
    });
    links.addEventListener('click', (e) => {
      if (e.target.closest('a')) {
        burger.setAttribute('aria-expanded', 'false');
        links.classList.remove('open');
        document.body.style.overflow = '';
      }
    });
  }

  if (nav) {
    const blues = $$('.blue');
    let queued = false;
    const check = () => {
      const probe = nav.offsetHeight * 0.5;
      let on = 'white';
      for (const b of blues) {
        const r = b.getBoundingClientRect();
        if (r.top <= probe && r.bottom > probe) { on = 'blue'; break; }
      }
      nav.dataset.on = on;
    };
    const q = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; check(); }); };
    addEventListener('scroll', q, { passive: true });
    addEventListener('resize', q);
    check();
  }

  /* =========================================================
     3b. Accordions and the consultation form
     ========================================================= */
  $$('.acc-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      const panel = btn.nextElementSibling;
      btn.setAttribute('aria-expanded', String(!open));
      panel.style.maxHeight = open ? '0px' : panel.scrollHeight + 'px';
    });
  });

  // No endpoint is wired yet — this only confirms to the person filling it in.
  $$('form[data-capture]').forEach((f) => {
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const note = $('.form-note', f);
      $$('label, .b', f).forEach((el) => { el.style.display = 'none'; });
      note.innerHTML = '<strong style="color:var(--blue)">Request received.</strong> We\'ll come back with times shortly.';
      note.style.fontSize = '1rem';
      note.style.letterSpacing = 'normal';
      note.style.textTransform = 'none';
    });
  });

  /* =========================================================
     4. Reveals
     ========================================================= */
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.06 });
  $$('[data-r]').forEach((el) => io.observe(el));
})();

/* ============================================================
   The scan demo — the phone is something you use, not a slideshow
   ============================================================ */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  $$('[data-demo]').forEach((root) => {
    const views = $$('.view', root);
    const tabs = $$('.track button', root);
    const cap = $('.cap', root);
    const bar = $('.an2-bar i', root);
    const rows = $$('.an2-list div', root);
    const CAPS = [
      ['Spot it.', 'Your dashboard shows the risk where you are before you scan anything. Tap Quick Mold Scan.'],
      ['Pick your scan.', 'AccuMold\'s own AI analysis, or send it straight to a certified expert for review.'],
      ['Answer five questions.', 'Texture, spread, location. Your own observations combined with the AI — under fifteen seconds.'],
      ['Frame it properly.', 'Eight to twelve inches out, surface filling the frame, held steady. Good input, good answer.'],
      ['Take the photo.', 'Flash on for surface detail. One shot of the area you just described.'],
      ['Let it read.', 'AccuMold locks onto the area and analyses the surface against the conditions where you are.'],
      ['Get the report.', 'A clear detection result, the reasoning written out, and a certified expert one tap away.']
    ];
    let i = 0, timers = [];

    const clear = () => { timers.forEach(clearTimeout); timers = []; };

    function show(n) {
      clear();
      i = n;
      views.forEach((v, k) => v.classList.toggle('on', k === n));
      tabs.forEach((t, k) => t.setAttribute('aria-current', String(k === n)));
      if (cap) cap.innerHTML = '<h3>' + CAPS[n][0] + '</h3><p>' + CAPS[n][1] + '</p>';

      // the analysing step runs itself, then hands over to the report
      if (n === 5) {
        timers.push(setTimeout(() => show(6), 2600));
      }
    }

    tabs.forEach((t, n) => t.addEventListener('click', () => show(n)));
    $$('[data-go]', root).forEach((el) => {
      el.addEventListener('click', () => show(parseInt(el.dataset.go, 10)));
      el.style.cursor = 'pointer';
    });

    show(0);
    // pause the auto hand-off if the section scrolls away mid-scan
    new IntersectionObserver((e) => { if (!e[0].isIntersecting) clear(); },
      { threshold: 0.2 }).observe(root);
  });
})();
