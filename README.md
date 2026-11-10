# AccuMold website

A static, dependency-free site. Plain HTML, CSS and vanilla JavaScript — no build step, no framework, no npm install. Open `index.html` and it works.

## Preview locally

```bash
python3 website/serve.py
```

Then open http://127.0.0.1:4173. (Opening the files directly with `file://` also works, but a server is closer to production.)

## Structure

```
website/
├── index.html            Home — the scanner hero and the full story
├── how-it-works.html     The technology: pipeline, detection lab, risk simulator
├── app.html              The product: screen tour, features, sample report
├── who-its-for.html      Renter / homeowner / stakeholder, one section each
├── evidence.html         Real inspection findings and before/afters
├── consultations.html    Pricing, what a session involves, booking request
├── about.html            Moisture Master Pros, principles, accreditations
├── resources.html        Prevention guides and the checklist email capture
├── css/
│   ├── core.css          Design tokens, type, layout, nav, footer, buttons
│   └── views.css         The interactive set pieces
├── js/
│   ├── core.js           Nav, page transitions, reveals, sliders, forms
│   └── scan.js           Hero scanner, detection lab, risk simulator, rail
├── assets/
│   ├── app/              App screens, extracted from the 4K app reel
│   ├── img/              Real job photography and trust marks
│   ├── ui/               Logo lockups and favicon
│   └── video/            Web-encoded clips with poster frames
└── serve.py              Local preview server
```

## Cache busting

CSS and JS are linked with `?v=N`. **Bump that number in every HTML file whenever you edit `css/` or `js/`**, or returning visitors will keep the old file:

```bash
cd website && python3 -c "
import re, glob
for p in glob.glob('*.html'):
    t = open(p).read(); open(p,'w').write(re.sub(r'\?v=\d+', '?v=5', t))
"
```

## The interactions

| Where | What it does |
|---|---|
| Home hero | A live thermal analysis. The photo is scored per pixel for moisture/growth signal and re-coloured through the same ironbow ramp as a real thermal camera, revealed under a scan line you can drag. Detection reticles light up as the line passes them. |
| Home, four-step rail | The phone runs the actual flow — viewfinder, capture, analysis, report — driven by scroll position. The app UI is real HTML, not screenshots, so it animates. |
| Home, whole house | The cutaway house from the MMP commercial, with a scroll-driven sweep and per-room risk hotspots. |
| How it works, detection lab | A movable lens over real annotated inspection photographs. Inside the lens is the assessment layer; outside is the plain photo. |
| How it works, risk simulator | Humidity and temperature sliders driving a live risk index. The thresholds mirror the real science: above 60% RH colonisation begins in 24–48 hours, fastest at 77–86°F. |
| Everywhere | Scan-wipe page transitions between internal pages (skipped on cold loads), scroll reveals, before/after sliders. |

## Content rules locked into the copy

1. The hero sentence is verbatim and must stay verbatim: **"A free app that turns a phone photo into an instant mold risk report."**
2. **No "years of experience" claim anywhere.** AccuMold launched 2025; Moisture Master Pros is a separate, older brand. `about.html` states the distinction explicitly.
3. **Green only ever means safe**, exactly as the app uses it. Amber is moderate, red is high.
4. No launch dates are stated anywhere.
5. Every photograph is from a real Moisture Master Pros job. `evidence.html` carries a disclaimer that an app report is a risk assessment, not a lab result.

## Still needed before this goes live

- **Real store URLs.** Every App Store / Google Play badge points to `#`.
- **A form endpoint.** The email capture and consultation request are wired to a client-side success state only — nothing is sent anywhere yet.
- **Social URLs.** Footer TikTok / Instagram / Facebook links point to `#`.
- **Avatar photography.** There are no photographs of a renter, a family in a kitchen, or a professional at a desk. The three avatar panels currently use scene-led imagery instead. The homeowner panel uses the existing `ebook pic`, which is visibly AI-generated and should be replaced with a real photograph.
- **A logo SVG.** The lockup is raster only (PNG). An SVG would sharpen the nav and favicon.

## SEO and AI search (added 2026-10-27)

- Every page has a canonical URL, Open Graph and Twitter card tags, and JSON-LD structured data (Organization, WebSite, MobileApplication, Person, VideoObject, Service with prices, BreadcrumbList). **If a price, the founder bio or a social link changes, update the JSON-LD in the page `<head>` too**, or search engines will show stale facts.
- Internal links use clean URLs (`about`, not `about.html`) to match `cleanUrls` in `vercel.json`. `serve.py` maps them locally; opening files with `file://` no longer follows internal links.
- `speaker-kit` is `noindex` and out of the sitemap while it says "Coming soon". Remove both when the page has content.
- `llms.txt` summarises the site for AI assistants. Google ignores it; other AI tools may use it. Keep its facts in step with the pages.
- `sitemap.xml`: bump `<lastmod>` on any page you materially change.
- Social share image: `assets/og/accumold-og.jpg` (1200×630).
