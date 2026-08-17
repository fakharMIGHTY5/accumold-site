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
    const label = $('[data-lens-label]', hero);

    const BLUE = '5,114,233';

    // Colonies sit at fixed points and stay clear of the headline.
    const HOT = tags.map((t) => ({
      x: parseFloat(t.dataset.x), y: parseFloat(t.dataset.y),
      r: parseFloat(t.dataset.r || '0.13'), el: t
    }));

    // Spores: a wireframe sphere with knobbed spikes, the way mold is drawn
    // under a microscope. Each colony gets a handful at different sizes.
    function makeSpore(cx, cy, scale) {
      const spikes = [];
      const n = 15 + Math.floor(Math.random() * 5);
      for (let i = 0; i < n; i++) {                       // fibonacci sphere
        const y = 1 - (i / (n - 1)) * 2;
        const rad = Math.sqrt(Math.max(0, 1 - y * y));
        const th = i * 2.399963;
        spikes.push([Math.cos(th) * rad, y, Math.sin(th) * rad]);
      }
      return {
        cx, cy, scale, spikes,
        rot: Math.random() * 6.283,
        spin: (Math.random() * 0.5 + 0.25) * (Math.random() < 0.5 ? -1 : 1),
        tilt: Math.random() * 0.7 - 0.35,
        dx: (Math.random() - 0.5) * 0.004,
        dy: (Math.random() - 0.5) * 0.004,
        ph: Math.random() * 6.283
      };
    }

    const COLONIES = HOT.map((h) => {
      const list = [makeSpore(h.x, h.y, 1)];
      for (let i = 0; i < 9; i++) {
        list.push(makeSpore(
          h.x + (Math.random() - 0.5) * 0.20,
          h.y + (Math.random() - 0.5) * 0.26,
          0.20 + Math.random() * 0.34));
      }
      return list;
    });

    function project(p, rot, tilt) {
      const cr = Math.cos(rot), sr = Math.sin(rot);
      let x = p[0] * cr - p[2] * sr;
      let z = p[0] * sr + p[2] * cr;
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      const y = p[1] * ct - z * st;
      z = p[1] * st + z * ct;
      return [x, y, z];
    }

    // one spore, drawn as latitude/longitude wireframe plus knobbed spikes
    function drawSpore(s, R, t, alpha) {
      const cx = s.px, cy = s.py;
      const rot = s.rot + t * s.spin;
      const LAT = 6, LON = 10, SEG = 44;

      ctx.lineWidth = Math.max(0.5, R * 0.013);
      for (let i = 1; i < LAT; i++) {
        const phi = (Math.PI * i) / LAT;
        ctx.beginPath();
        for (let k = 0; k <= SEG; k++) {
          const th = (k / SEG) * 6.283185;
          const p = project([Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)], rot, s.tilt);
          const X = cx + p[0] * R, Y = cy + p[1] * R;
          k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
        }
        ctx.strokeStyle = 'rgba(' + BLUE + ',' + (alpha * 0.6) + ')';
        ctx.stroke();
      }
      for (let i = 0; i < LON; i++) {
        const lam = (Math.PI * i) / LON;
        ctx.beginPath();
        for (let k = 0; k <= SEG; k++) {
          const th = (k / SEG) * 6.283185;
          const p = project([Math.sin(th) * Math.cos(lam), Math.cos(th), Math.sin(th) * Math.sin(lam)], rot, s.tilt);
          const X = cx + p[0] * R, Y = cy + p[1] * R;
          k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
        }
        ctx.strokeStyle = 'rgba(' + BLUE + ',' + (alpha * 0.44) + ')';
        ctx.stroke();
      }

      // spikes with a rounded knob on the end
      const grow = 1 + Math.sin(t * 1.4 + s.ph) * 0.03;
      s.spikes.forEach((sp) => {
        const a = project(sp, rot, s.tilt);
        const depth = (a[2] + 1) / 2;                 // 0 back, 1 front
        const al = alpha * (0.4 + depth * 0.6);
        const x0 = cx + a[0] * R * 0.94, y0 = cy + a[1] * R * 0.94;
        const L = R * 1.42 * grow;
        const x1 = cx + a[0] * L, y1 = cy + a[1] * L;
        ctx.strokeStyle = 'rgba(' + BLUE + ',' + (al * 0.75) + ')';
        ctx.lineWidth = Math.max(0.6, R * 0.05 * (0.6 + depth * 0.4));
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        const kr = R * 0.15 * (0.7 + depth * 0.5);
        ctx.beginPath(); ctx.arc(x1, y1, kr, 0, 6.283185);
        ctx.strokeStyle = 'rgba(' + BLUE + ',' + al + ')';
        ctx.lineWidth = Math.max(0.5, R * 0.02);
        ctx.stroke();
      });
    }

    let W = 0, H = 0, dpr = 1;
    let px = 0.5, py = 0.5, tx = 0.5, ty = 0.42;
    let lensR = 0.17, visible = true, hasPointer = false;

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

    function frame(now) {
      requestAnimationFrame(frame);
      if (!visible) return;
      const t = now * 0.001;

      if (!hasPointer && !reduced) {
        tx = 0.5 + Math.cos(t * 0.30) * 0.35;
        ty = 0.47 + Math.sin(t * 0.44) * 0.27;
      }
      px = lerp(px, tx, reduced ? 1 : 0.15);
      py = lerp(py, ty, reduced ? 1 : 0.15);

      const ar = W / H;
      const half = Math.min(W, H) * lensR;

      let hit = -1;
      HOT.forEach((s, i) => {
        const dx = (px - s.x) * ar, dy = py - s.y;
        const on = Math.sqrt(dx * dx + dy * dy) < s.r;
        if (on) hit = i;
        s.el.classList.toggle('on', on);
        s.el.style.left = s.x * 100 + '%';
        s.el.style.top = s.y * 100 + '%';
      });

      ctx.clearRect(0, 0, W, H);

      // Nothing exists until the scanner is over it.
      ctx.save();
      ctx.beginPath();
      ctx.rect(px * W - half, py * H - half, half * 2, half * 2);
      ctx.clip();

      COLONIES.forEach((colony) => {
        colony.forEach((s) => {
          s.cx += s.dx * 0.0016; s.cy += s.dy * 0.0016;
          s.px = s.cx * W; s.py = s.cy * H;
          const R = half * 0.56 * s.scale;
          // fade in near the edge of the frame so they arrive, not pop
          const d = Math.max(Math.abs(s.px - px * W), Math.abs(s.py - py * H)) / half;
          const a = 1 - clamp((d - 0.55) / 0.5, 0, 1);
          if (a > 0.01) drawSpore(s, R, t, a);
        });
      });
      ctx.restore();

      lens.style.left = px * 100 + '%';
      lens.style.top = py * 100 + '%';
      if (outX) outX.textContent = (px * 100).toFixed(0).padStart(2, '0');
      if (outY) outY.textContent = (py * 100).toFixed(0).padStart(2, '0');
      if (outRh) outRh.textContent = (52 + Math.sin(t * 0.6) * 4 + (hit >= 0 ? 16 : 0)).toFixed(0) + '%';
      if (outLv) {
        outLv.textContent = hit >= 0 ? 'Detected' : 'Clear';
        outLv.dataset.lv = hit >= 0 ? 'found' : 'clear';
      }
      if (label) {
        label.textContent = hit >= 0 ? 'Mold detected' : 'Analyzing with AccuMold AI…';
        label.dataset.hit = hit >= 0 ? '1' : '0';
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
      nav.classList.toggle('scrolled', scrollY > 8);
    };
    const q = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; check(); }); };
    addEventListener('scroll', q, { passive: true });
    addEventListener('resize', q);
    check();
  }

  /* =========================================================
     3a. Who it's for — pick a person
     ========================================================= */
  $$('[data-who]').forEach((root) => {
    const picks = $$('.who-pick button', root);
    const cards = $$('.who-card', root);
    let i = 0, timer = null, touched = false;
    const go = (n) => {
      i = n;
      picks.forEach((p, k) => p.setAttribute('aria-current', String(k === n)));
      cards.forEach((c, k) => c.classList.toggle('on', k === n));
    };
    const play = () => { clearInterval(timer); if (!reduced && !touched) timer = setInterval(() => go((i + 1) % cards.length), 5200); };
    picks.forEach((p, n) => p.addEventListener('click', () => { touched = true; clearInterval(timer); go(n); }));
    go(0);
    new IntersectionObserver((e) => { if (e[0].isIntersecting) play(); else clearInterval(timer); },
      { threshold: 0.3 }).observe(root);
  });

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
      ['Texture.', 'Fuzzy and powdery reads very differently from flat and smooth. Tap what you can see.'],
      ['Spread.', 'Clustered and patchy suggests growth. A single isolated mark usually does not.'],
      ['Frame it properly.', 'Eight to twelve inches out, surface filling the frame, held steady. Good input, good answer.'],
      ['Take the photo.', 'Flash on for surface detail. One shot of the area you just described.'],
      ['Let it read.', 'AccuMold locks onto the area and analyses the surface against the conditions where you are.'],
      ['Get the report.', 'A clear detection result, the reasoning written out, and a certified expert one tap away.'],
      ['Find a pro.', 'Verified local professionals, filtered by distance. Call them or open their site from the app.']
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
      if (n === 6) {
        timers.push(setTimeout(() => show(7), 2600));
      }
    }

    tabs.forEach((t, n) => t.addEventListener('click', () => show(n)));
    $$('[data-go]', root).forEach((el) => {
      el.addEventListener('click', () => show(parseInt(el.dataset.go, 10)));
      el.style.cursor = 'pointer';
    });

    // Answering marks your choice, then moves on — so it reads as a question
    // being answered rather than a button that jumps.
    $$('[data-pick]', root).forEach((el) => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        $$('[data-pick]', el.parentElement).forEach((o) => o.classList.remove('sel'));
        el.classList.add('sel');
        clear();
        timers.push(setTimeout(() => show(parseInt(el.dataset.next, 10)), 420));
      });
    });

    show(0);
    // pause the auto hand-off if the section scrolls away mid-scan
    new IntersectionObserver((e) => { if (!e[0].isIntersecting) clear(); },
      { threshold: 0.2 }).observe(root);
  });
})();
