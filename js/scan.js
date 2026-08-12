/* ============================================================
   AccuMold — the scanner
   Hero sweep + live thermal analysis, detection lab lens,
   risk simulator, dollhouse sweep, and the four-step rail.
   ============================================================ */
(function () {
  'use strict';

  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // rAF-batched scroll binding — layout reads stay off the scroll thread
  function onScrollRAF(fn) {
    let queued = false;
    const run = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; fn(); });
    };
    addEventListener('scroll', run, { passive: true });
    addEventListener('resize', run);
    fn();
  }

  /* ---------------------------------------------------------
     Ironbow LUT — the same false-colour ramp as the thermal
     camera in Moisture Master Pros' own inspection photos.
     --------------------------------------------------------- */
  const RAMP = [
    [0.00,   6,  10,  48],
    [0.22,  62,  18, 116],
    [0.45, 168,  32, 118],
    [0.68, 240,  86,  48],
    [0.86, 255, 176,  40],
    [1.00, 255, 250, 214]
  ];
  function ironbow(t) {
    t = clamp(t, 0, 1);
    for (let i = 1; i < RAMP.length; i++) {
      if (t <= RAMP[i][0]) {
        const a = RAMP[i - 1], b = RAMP[i];
        const k = (t - a[0]) / (b[0] - a[0]);
        return [lerp(a[1], b[1], k), lerp(a[2], b[2], k), lerp(a[3], b[3], k)];
      }
    }
    return [255, 250, 214];
  }

  /* =========================================================
     1. HERO SCANNER
     ========================================================= */
  const stage = $('[data-scanner]');
  if (stage) initHero(stage);

  function initHero(root) {
    const cv = $('canvas', root);
    const ctx = cv.getContext('2d', { alpha: false });
    const src = root.dataset.scanner;
    const rets = $$('.ret', root.parentElement);
    const bar = $('[data-scan-bar]');
    const pct = $('[data-scan-pct]');
    const hits = $('[data-scan-hits]');
    const verdict = $('[data-scan-verdict]');

    let W = 0, H = 0, dpr = 1;
    let img = new Image(); img.decoding = 'async'; img.src = src;
    let heat = null;              // offscreen thermal render
    let scanPat = null;           // cached sensor-scanline pattern
    let line = 0, target = 0.62;  // 0..1 of canvas height
    let auto = true, autoDir = 1, lastPointer = 0;
    let ready = false, visible = true;

    // stop painting entirely once the hero scrolls away
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { threshold: 0 }).observe(root);

    img.onload = () => { buildHeat(); ready = true; resize(); };

    /* Build the thermal analysis once, offscreen. Darker, less
       saturated pixels score as higher microbial/moisture risk —
       the same signal an inspector reads off a thermal frame. */
    function buildHeat() {
      const w = 760, h = Math.round(760 * img.height / img.width);
      const oc = document.createElement('canvas'); oc.width = w; oc.height = h;
      const oct = oc.getContext('2d');
      oct.drawImage(img, 0, 0, w, h);
      const d = oct.getImageData(0, 0, w, h), p = d.data;
      for (let i = 0; i < p.length; i += 4) {
        const r = p[i], g = p[i + 1], b = p[i + 2];
        const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const sat = mx === 0 ? 0 : (mx - mn) / mx;
        // dark + flat = growth; bright + warm = sound substrate
        let score = (1 - lum) * 1.28 - sat * 0.22 - 0.06;
        score = clamp(score, 0, 1);
        const c = ironbow(score);
        p[i] = c[0] * 0.86 + r * 0.14;
        p[i + 1] = c[1] * 0.86 + g * 0.14;
        p[i + 2] = c[2] * 0.86 + b * 0.14;
      }
      oct.putImageData(d, 0, 0);
      heat = oc;

      // sensor scanlines, baked once into a 1×4 tile
      const pc = document.createElement('canvas'); pc.width = 4; pc.height = 4;
      const pct = pc.getContext('2d');
      pct.fillStyle = 'rgba(120,180,255,.07)'; pct.fillRect(0, 0, 4, 1.4);
      scanPat = ctx.createPattern(pc, 'repeat');
    }

    function resize() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = root.clientWidth; H = root.clientHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    addEventListener('resize', resize); resize();

    // cover-fit mapping so reticles stay glued to real features
    function cover() {
      const s = Math.max(W / img.width, H / img.height);
      const w = img.width * s, h = img.height * s;
      return { x: (W - w) / 2, y: (H - h) / 2, w, h };
    }

    // particles — the spore drift from the brand commercial
    const dust = Array.from({ length: 46 }, () => ({
      x: Math.random(), y: Math.random(),
      r: Math.random() * 1.5 + 0.4, s: Math.random() * 0.00022 + 0.00006,
      o: Math.random() * 0.4 + 0.1
    }));

    // pointer takes control of the sweep
    root.addEventListener('pointermove', (e) => {
      const r = root.getBoundingClientRect();
      target = clamp((e.clientY - r.top) / r.height, 0.02, 0.99);
      auto = false; lastPointer = performance.now();
    });
    root.addEventListener('pointerleave', () => { auto = true; });

    let t0 = performance.now();
    function frame(now) {
      requestAnimationFrame(frame);
      if (!ready || !visible) { t0 = now; return; }
      const dt = Math.min(now - t0, 48); t0 = now;

      // hand control back after a pause
      if (!auto && now - lastPointer > 2600) auto = true;
      if (auto && !reduced) {
        target += autoDir * dt * 0.00018;
        if (target > 0.97) { target = 0.97; autoDir = -1; }
        if (target < 0.08) { target = 0.08; autoDir = 1; }
      }
      line = lerp(line, target, reduced ? 1 : 0.075);

      const c = cover();
      const y = line * H;

      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(img, c.x, c.y, c.w, c.h);

      // ---- scanned band: thermal analysis ----
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, y); ctx.clip();
      if (heat) { ctx.globalAlpha = 0.94; ctx.drawImage(heat, c.x, c.y, c.w, c.h); ctx.globalAlpha = 1; }

      // measurement grid
      ctx.strokeStyle = 'rgba(140,190,255,.13)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let gx = (c.x % 64); gx < W; gx += 64) { ctx.moveTo(gx + .5, 0); ctx.lineTo(gx + .5, y); }
      for (let gy = 0; gy < y; gy += 64) { ctx.moveTo(0, gy + .5); ctx.lineTo(W, gy + .5); }
      ctx.stroke();

      // sensor scanlines
      if (scanPat) { ctx.fillStyle = scanPat; ctx.fillRect(0, 0, W, y); }
      ctx.restore();

      // ---- leading edge ----
      const g = ctx.createLinearGradient(0, y - 130, 0, y);
      g.addColorStop(0, 'rgba(24,84,216,0)');
      g.addColorStop(1, 'rgba(77,139,255,.34)');
      ctx.fillStyle = g; ctx.fillRect(0, y - 130, W, 130);

      const lg = ctx.createLinearGradient(0, 0, W, 0);
      lg.addColorStop(0, 'rgba(77,139,255,0)');
      lg.addColorStop(.2, 'rgba(77,139,255,.9)');
      lg.addColorStop(.5, 'rgba(235,245,255,1)');
      lg.addColorStop(.8, 'rgba(77,139,255,.9)');
      lg.addColorStop(1, 'rgba(77,139,255,0)');
      ctx.save();
      ctx.shadowColor = 'rgba(77,139,255,.95)'; ctx.shadowBlur = 26;
      ctx.fillStyle = lg; ctx.fillRect(0, y - 1.2, W, 2.4);
      ctx.restore();

      // ---- drifting spores ----
      ctx.fillStyle = '#9FC6FF';
      dust.forEach((p) => {
        p.y -= p.s * dt * 60;
        if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); }
        ctx.globalAlpha = p.o * (p.y * H < y ? 0.85 : 0.35);
        ctx.beginPath(); ctx.arc(p.x * W, p.y * H, p.r, 0, 6.283); ctx.fill();
      });
      ctx.globalAlpha = 1;

      // ---- reticles + readout ----
      let live = 0;
      rets.forEach((r) => {
        const rx = parseFloat(r.dataset.x), ry = parseFloat(r.dataset.y);
        const px = c.x + rx * c.w, py = c.y + ry * c.h;
        r.style.left = px + 'px'; r.style.top = py + 'px';
        const on = py < y;
        r.classList.toggle('on', on);
        if (on) live++;
      });

      const p100 = Math.round(line * 100);
      if (bar) bar.style.width = p100 + '%';
      if (pct) pct.textContent = p100 + '%';
      if (hits) hits.textContent = String(live).padStart(2, '0');
      if (verdict) {
        const v = live >= 3 ? ['HIGH', '#FF8A8D'] : live >= 1 ? ['ELEVATED', '#E4A854'] : ['SCANNING', '#93A4C0'];
        verdict.textContent = v[0]; verdict.style.color = v[1];
      }
    }
    requestAnimationFrame(frame);
  }

  /* =========================================================
     2. DETECTION LAB — move the lens over real inspection photos
     ========================================================= */
  $$('[data-lab]').forEach((lab) => {
    const stage = $('.lab-stage', lab);
    const raw = $('.lab-raw', stage);
    const map = $('.lab-map', stage);
    const meta = $('[data-lab-meta]', lab);
    const tabs = $$('.lab-tab', lab);
    let idle = true, ax = 50, ay = 50, t = 0;

    const place = (x, y) => { stage.style.setProperty('--lx', x + '%'); stage.style.setProperty('--ly', y + '%'); };

    stage.addEventListener('pointermove', (e) => {
      idle = false;
      const r = stage.getBoundingClientRect();
      place(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
    });
    stage.addEventListener('pointerleave', () => { idle = true; });

    // gentle drift so the mechanic is discoverable without a pointer
    (function drift() {
      requestAnimationFrame(drift);
      if (!idle || reduced) return;
      t += 0.006;
      place(50 + Math.cos(t) * 26, 50 + Math.sin(t * 1.35) * 20);
    })();

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((x) => x.setAttribute('aria-selected', String(x === tab)));
        raw.src = tab.dataset.raw;
        map.src = tab.dataset.map;
        if (meta) meta.innerHTML = tab.dataset.meta;
      });
    });
  });

  /* =========================================================
     3. RISK SIMULATOR
     Mirrors the science in the brief: above 60% RH mould begins
     colonising in 24–48 hours, fastest between 77–86°F.
     ========================================================= */
  const sim = $('[data-sim]');
  if (sim) {
    const rh = $('[data-sim-rh]', sim);
    const tp = $('[data-sim-temp]', sim);
    const rhOut = $('[data-out-rh]', sim);
    const tpOut = $('[data-out-temp]', sim);
    const arc = $('[data-sim-arc]', sim);
    const num = $('[data-sim-num]', sim);
    const lvl = $('[data-sim-level]', sim);
    const copy = $('[data-sim-copy]', sim);
    const note = $('[data-sim-note]', sim);
    const LEN = 2 * Math.PI * 86 * 0.75; // 270° arc, r=86

    function render() {
      const h = +rh.value, t = +tp.value;
      rhOut.textContent = h + '%';
      tpOut.textContent = t + '°F';

      const hScore = clamp((h - 38) / 44, 0, 1);
      const tScore = clamp(1 - Math.abs(t - 81) / 34, 0.3, 1);
      const risk = clamp(hScore * 0.76 + hScore * tScore * 0.24, 0, 1);

      const band = risk < 0.34 ? 0 : risk < 0.63 ? 1 : 2;
      const col = ['#30C06C', '#E4A854', '#E5484D'][band];
      const name = ['Low', 'Moderate', 'High'][band];

      arc.style.stroke = col;
      arc.style.strokeDashoffset = String(LEN * (1 - risk));
      num.textContent = Math.round(risk * 100);
      num.style.fill = col;
      lvl.textContent = name;
      lvl.style.color = col;

      copy.textContent =
        band === 0
          ? `At ${t}°F and ${h}% humidity, conditions are not favourable for mould growth. Indoor air quality is generally stable. Keep monitoring and maintain good ventilation.`
          : band === 1
          ? `At ${t}°F and ${h}% humidity you are close to the threshold. Moisture is lingering on cool surfaces long enough for spores to settle. Dry the room out and re-scan in 48 hours.`
          : `At ${t}°F and ${h}% humidity, conditions actively favour growth. Once humidity holds above 60%, colonisation can begin within 24–48 hours. Scan the room and get it looked at.`;

      note.classList.toggle('on', h >= 60);
    }
    rh.addEventListener('input', render);
    tp.addEventListener('input', render);
    arc.style.strokeDasharray = LEN + ' ' + LEN * 2;
    render();
  }

  /* =========================================================
     4. DOLLHOUSE — scroll-driven whole-house sweep
     ========================================================= */
  const house = $('[data-house]');
  if (house) {
    const hots = $$('.hot', house);
    const sec = house.closest('section') || house.parentElement;
    function upd() {
      const r = sec.getBoundingClientRect();
      const vh = innerHeight;
      const p = clamp((vh - r.top) / (vh + r.height * 0.6), 0, 1);
      const sweep = p * 100;
      house.style.setProperty('--sweep', sweep + '%');
      hots.forEach((h) => h.classList.toggle('on', parseFloat(h.dataset.y) * 100 < sweep + 4));
    }
    hots.forEach((h) => { h.style.left = h.dataset.x * 100 + '%'; h.style.top = h.dataset.y * 100 + '%'; });
    onScrollRAF(upd);
  }

  /* =========================================================
     5. FOUR-STEP RAIL — Spot · Scan · Report · Act
     ========================================================= */
  const rail = $('[data-rail]');
  if (rail) {
    const steps = $$('.rail-step', rail);
    const screens = $$('[data-screen]', rail);
    const bars = $$('.rail-prog i b', rail);
    const track = rail.querySelector('.rail-track') || rail;
    let cur = -1;

    function upd() {
      const r = track.getBoundingClientRect();
      const total = r.height - innerHeight;
      const p = clamp(-r.top / total, 0, 1);
      const n = steps.length;
      const raw = p * n;
      const i = clamp(Math.floor(raw), 0, n - 1);
      const within = clamp(raw - i, 0, 1);

      bars.forEach((b, k) => { b.style.right = (k < i ? 0 : k > i ? 100 : (1 - within) * 100) + '%'; });

      if (i !== cur) {
        cur = i;
        steps.forEach((s, k) => s.classList.toggle('on', k === i));
        screens.forEach((s, k) => s.classList.toggle('on', k === i));
      }
    }
    onScrollRAF(upd);
  }

  /* =========================================================
     6. Magnetic buttons — small tactile detail
     ========================================================= */
  if (!reduced && matchMedia('(pointer:fine)').matches) {
    $$('.btn').forEach((b) => {
      b.addEventListener('pointermove', (e) => {
        const r = b.getBoundingClientRect();
        b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.12}px, ${(e.clientY - r.top - r.height / 2) * 0.18 - 2}px)`;
      });
      b.addEventListener('pointerleave', () => { b.style.transform = ''; });
    });
  }
})();
