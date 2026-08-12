/* ============================================================
   AccuMold — core behaviour
   Nav, scan-wipe page transitions, reveals, live telemetry,
   accordions, before/after, and the shared UI plumbing.
   ============================================================ */
(function () {
  'use strict';

  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------- 1. Scan-wipe page transition ---------- */
  const wipe = document.createElement('div');
  wipe.className = 'wipe';
  wipe.innerHTML = '<i></i>';
  document.body.appendChild(wipe);

  // Reveal on arrival — but only when we got here from another page on the
  // site. A cold load should paint the hero immediately, not behind a curtain.
  const CAME_FROM_SITE = 'am:nav';
  if (sessionStorage.getItem(CAME_FROM_SITE)) {
    sessionStorage.removeItem(CAME_FROM_SITE);
    requestAnimationFrame(() => {
      if (reduced) return;
      wipe.classList.add('on', 'out');
      setTimeout(() => wipe.classList.remove('on', 'out'), 640);
    });
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || reduced) return;
    const url = a.getAttribute('href');
    if (!url || url.startsWith('#') || url.startsWith('http') || url.startsWith('mailto:') ||
        a.target === '_blank' || a.hasAttribute('download') || e.metaKey || e.ctrlKey) return;
    if (a.pathname === location.pathname) return;
    e.preventDefault();
    sessionStorage.setItem(CAME_FROM_SITE, '1');
    wipe.classList.add('on');
    setTimeout(() => { location.href = url; }, 470);
  });

  /* ---------- 2. Nav: theme swap + hide on scroll ---------- */
  const nav = $('.nav');
  const burger = $('.burger');
  const links = $('.nav-links');

  if (burger) {
    burger.addEventListener('click', () => {
      const open = burger.getAttribute('aria-expanded') === 'true';
      burger.setAttribute('aria-expanded', String(!open));
      links.classList.toggle('open', !open);
      document.body.style.overflow = !open ? 'hidden' : '';
    });
  }

  // Any section marked .dark that sits under the nav flips it to dark chrome.
  const darkZones = $$('.dark, .hero, .phead, .foot, .rail, .cta-band');
  let lastY = 0;
  function onScroll() {
    const y = window.scrollY;
    if (nav) {
      const probe = y + 34;
      let dark = false;
      for (const z of darkZones) {
        const t = z.offsetTop, b = t + z.offsetHeight;
        if (probe >= t && probe < b) { dark = true; break; }
      }
      nav.dataset.theme = dark ? 'dark' : 'light';
      nav.classList.toggle('up', y > lastY && y > 420 && !links?.classList.contains('open'));
    }
    lastY = y;
  }
  let navTick = false;
  const queueScroll = () => {
    if (navTick) return;
    navTick = true;
    requestAnimationFrame(() => { navTick = false; onScroll(); });
  };
  addEventListener('scroll', queueScroll, { passive: true });
  addEventListener('resize', queueScroll);
  onScroll();

  /* ---------- 3. Scroll reveal ---------- */
  const io = new IntersectionObserver((es) => {
    es.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
  $$('[data-rise]').forEach((el) => io.observe(el));

  /* ---------- 4. Live telemetry strip (mirrors the app dashboard) ---------- */
  $$('[data-hud]').forEach((hud) => {
    const rh = hud.querySelector('[data-rh]');
    const tp = hud.querySelector('[data-temp]');
    let h = 55, t = 93;
    setInterval(() => {
      h = clamp(h + (Math.random() - 0.5) * 1.6, 48, 63);
      t = clamp(t + (Math.random() - 0.5) * 0.7, 88, 96);
      if (rh) rh.textContent = h.toFixed(0) + '%';
      if (tp) tp.textContent = t.toFixed(0) + '°F';
    }, 2600);
  });

  /* ---------- 5. Count-up stats ---------- */
  const cio = new IntersectionObserver((es) => {
    es.forEach((en) => {
      if (!en.isIntersecting) return;
      const el = en.target;
      cio.unobserve(el);
      const raw = el.dataset.count;
      const end = parseFloat(raw);
      const pre = el.dataset.pre || '';
      const suf = el.dataset.suf || '';
      const dec = (raw.split('.')[1] || '').length;
      const final = () => { el.textContent = pre + (dec ? end.toFixed(dec) : end.toLocaleString()) + suf; };
      if (reduced) { final(); return; }

      const dur = 1500; const t0 = performance.now();
      // rAF stops while the tab is hidden, which would strand the number on a
      // partial value forever. The timeout guarantees it lands on the real one.
      const settle = setTimeout(final, dur + 120);
      (function tick(now) {
        const p = clamp((now - t0) / dur, 0, 1);
        const e = 1 - Math.pow(1 - p, 3);
        const v = end * e;
        el.textContent = pre + (dec ? v.toFixed(dec) : Math.round(v).toLocaleString()) + suf;
        if (p < 1) requestAnimationFrame(tick);
        else { clearTimeout(settle); final(); }
      })(t0);
    });
  }, { threshold: 0.4 });
  $$('[data-count]').forEach((el) => cio.observe(el));

  /* ---------- 6. Accordion ---------- */
  $$('.acc-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      const panel = btn.nextElementSibling;
      btn.setAttribute('aria-expanded', String(!open));
      panel.style.maxHeight = open ? '0px' : panel.scrollHeight + 'px';
    });
  });

  /* ---------- 7. Before / after sliders ---------- */
  $$('.ba').forEach((ba) => {
    let drag = false;
    const set = (clientX) => {
      const r = ba.getBoundingClientRect();
      ba.style.setProperty('--sp', clamp(((clientX - r.left) / r.width) * 100, 0, 100) + '%');
    };
    const down = (e) => { drag = true; set((e.touches ? e.touches[0] : e).clientX); };
    const move = (e) => { if (drag) { set((e.touches ? e.touches[0] : e).clientX); e.preventDefault(); } };
    const up = () => { drag = false; };
    ba.addEventListener('mousedown', down); ba.addEventListener('touchstart', down, { passive: true });
    addEventListener('mousemove', move); addEventListener('touchmove', move, { passive: false });
    addEventListener('mouseup', up); addEventListener('touchend', up);
    ba.addEventListener('mousemove', (e) => { if (!drag && ba.dataset.hover !== 'off') set(e.clientX); });
  });

  /* ---------- 8. Tabbed screen switchers (app tour) ---------- */
  $$('[data-tour]').forEach((tour) => {
    const items = $$('.tour-item', tour);
    const screens = $$('.tour-screens img', tour);
    let idx = 0, timer;
    const go = (i) => {
      idx = i;
      items.forEach((it, n) => it.setAttribute('aria-selected', String(n === i)));
      screens.forEach((s, n) => s.classList.toggle('on', n === i));
    };
    const auto = () => { timer = setInterval(() => go((idx + 1) % items.length), 4200); };
    items.forEach((it, n) => it.addEventListener('click', () => { clearInterval(timer); go(n); auto(); }));
    go(0); if (!reduced) auto();
  });

  /* ---------- 9. Autoplay video only while visible ---------- */
  const vio = new IntersectionObserver((es) => {
    es.forEach((en) => {
      const v = en.target;
      if (en.isIntersecting) { v.play().catch(() => {}); } else { v.pause(); }
    });
  }, { threshold: 0.25 });
  $$('video[data-inview]').forEach((v) => vio.observe(v));

  /* ---------- 10. Unmute toggles ---------- */
  $$('[data-sound]').forEach((btn) => {
    const v = $(btn.dataset.sound);
    btn.addEventListener('click', () => {
      v.muted = !v.muted;
      btn.setAttribute('aria-pressed', String(!v.muted));
      btn.querySelector('span').textContent = v.muted ? 'Sound off' : 'Sound on';
      if (!v.muted) v.play().catch(() => {});
    });
  });

  /* ---------- 11. Email capture (demo — no endpoint wired) ---------- */
  $$('form[data-capture]').forEach((f) => {
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const note = $('.form-note', f);
      f.querySelector('.field').style.display = 'none';
      note.innerHTML = '<strong style="color:var(--green-lift)">Checklist on its way.</strong> Watch your inbox for the room-by-room moisture guide.';
    });
  });

  /* ---------- 12. Mark current nav link ---------- */
  const here = location.pathname.split('/').pop() || 'index.html';
  $$('.nav-link').forEach((a) => {
    if ((a.getAttribute('href') || '').split('/').pop() === here) a.setAttribute('aria-current', 'page');
  });
})();
