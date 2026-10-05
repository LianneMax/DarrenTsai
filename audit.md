# realdarrentsai.com lead-path audit

Last updated 28 Sep 2026 · Max (with Claude) · re-tested against `origin/main` at `80b21e4`, Apps Script deployment @39 (round R9); H3 deployed 29 Sep as @41

The pipes work and most of the first-round fixes are live and verified (27 Sep). Round 5 (`87f7166..d3a246c`) then fixed every remaining code item: the forms that sent or showed values the visitor never chose (R3-1, R3-3, R3-7, R3-9, R3-10, R4-1 to R4-9) and the booking path that could stall or lose data (R3-2, R3-5, R3-8). All of it is **fixed in code and not verified live**, and the Apps Script part is **not yet deployed**. What remains genuinely outside the code: GTM tags (#6, #16, R3-6), the CallRail pool (#8), four YouTube descriptions (#14), and the confirmation-email settings.

This file is written for people and for Claude Code. Every open item has a file and line (or a tool and setting), a fix, and a way to check it. Line numbers in the R3 items are as of `c95ec19`; older items were written against `40d4628`, so search for the quoted code if they have moved.

**Scope covered:** every landing page and form (`/`, `/dscr/`, `/fha/`, `/realestateinvesting/`, `/mortgage-calculator/`), all 10 `/yt/*` short links, the 30 most recent YouTube descriptions and pinned comments, the lead Sheet, Gmail inboxes, Resend, CallRail, GTM, GA4, Google Ads, Bonzo, Calendly, Search Console, and a code read of the lead path.

**Status key:** Open · Partly fixed · Fixed in code (not re-checked live) · Fixed (verified live 27 Sep).

**Where to start:** "Launch fixes, 30 Sep" (directly below: L1 to L4 are the next Claude Code round), then "HubSpot, 29 Sep" and "GTM, 29 Sep". H3, the HubSpot push, is built (29 Sep) and ships dark: it needs an Apps Script deploy, then Kocah's form, then two Script Properties. GTM and GA4 are now done (#6, #16, R3-6). The confirmation email (#4) and the YouTube descriptions (#14) are now live and verified 29 Sep. Still open, outside the code: CallRail pool (#8), to revisit once ads raise traffic.

---

## Decisions, 30 Sep

- **Kocah (Niko, 29 Sep):** keep our forms; HubSpot gets each lead through the Forms API with the GCLID attached (H3). GTM is the only tag setup; never add the raw `AW-18451324434` snippet.
- **Ownership:** the lead Apps Script and Resend stay on Max's accounts for now (Max, 30 Sep). Keep 2-step verification on both.
- **calendly_booking:** stays an observation event and is never imported into Google Ads (CLAUDE.md). It is marked as a key event in GA4 (29 Sep) for GA4 reporting only.
- **GA4, 29 Sep:** internal-traffic filter Active (Max's IP is tagged `tt=internal`), retention 14 months. Google Ads and Search Console links confirmed.
- **SOP:** the Google Doc "Real Darren Tsai SOP: Tracking, Lead Operations and Onboarding" was rebuilt with one tab per system on 30 Sep. Update it when a procedure changes.

---

## Launch fixes, 30 Sep: ad landing pages (L1 to L6)

From the 29 Sep launch-readiness check (PageSpeed Insights mobile, live site, Google Ads account 645-417-8442). None of these is a lead-path bug. L1 and L2 are the ones Google Ads reviewers and financial-services policy look at; L3 and L4 are quality work; L5 waits on Darren.

**PageSpeed Insights, mobile, 29 Sep** (`/fha/` did not complete: PSI daily quota; retry)

| Page | Perf | A11y | Best Pr. | SEO | FCP | LCP | TBT | CLS | Speed Index |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | 86 | 89 | 100 | 100 | 2.6 s | 2.6 s | 110 ms | 0.002 | 6.7 s |
| `/dscr/` | 88 | 89 | 100 | 100 | 2.6 s | 2.6 s | 230 ms | 0.007 | 3.9 s |
| `/realestateinvesting/` | 78 | 95 | 100 | 100 | 2.6 s | 2.6 s | 530 ms | 0 | 4.2 s |

| # | Status | What | Where | Fix | Check |
| --- | --- | --- | --- | --- | --- |
| L1 | Verified live, 1 Oct (see "Live re-check of dc97979") | `/dscr/` has no footer: no privacy policy link and no NMLS Consumer Access link (the other pages have both). Google Ads financial-services landing pages are expected to show both | `public/dscr/index.html` | Add the same footer the other static pages use (privacy link, NMLS #2438102 with a link to nmlsconsumeraccess.org, DRE, Equal Housing). Copy it, don't invent new licence text | Open `/dscr/` on mobile and desktop: footer present, links work, layout check passes |
| L2 | Verified live, 1 Oct; re-indexing requested for `/investing`, `/homeowners`, `/agent-career` | Old URLs return 404 and Google still indexes them ("duplicate without canonical"): `/investing`, `/homeowners`, `/agent-career`, and the old `/post/…` URL | `netlify.toml` | 301 `/investing` and `/investing/*` → `/realestateinvesting/`; `/homeowners`, `/agent-career` and `/post/*` → `/`. Put them above any catch-all | `curl -I` each: 301 with the right Location. Then Max requests re-indexing in Search Console |
| L3 | Verified live (visual), 1 Oct. Local Lighthouse accessibility 100 on all five pages; PSI a11y still to record | Accessibility (PSI): text contrast too low on `/`, `/dscr/`, `/realestateinvesting/`; no `<main>` landmark on `/` and `/realestateinvesting/`; links that rely on colour alone on `/`; an `aria-hidden="true"` element that contains focusable elements on `/`; headings out of order on `/dscr/` | Site CSS/tokens, `src/` components, `public/*/index.html` | See prompt. Fix the colour tokens, not one-off overrides. Don't change the visual design beyond what contrast requires | Lighthouse accessibility 95+ on each page; the layout check still passes at all 9 widths |
| L4 | Partly fixed, 30 Sep: our own render-blocking requests and the FHA image weight are fixed; what remains is third-party (see "what was done") | Performance: render-blocking requests (est. 1.8 s on `/dscr/` and `/realestateinvesting/`, 0.4 s on `/`); cache lifetimes too short (~108 KB on repeat visits); legacy JavaScript (~13 KB); total blocking time 530 ms on `/realestateinvesting/` | `public/*/index.html` `<head>`, fonts, `netlify.toml` headers | See prompt. Don't delay or remove GTM, CallRail swap or HubSpot: tracking must still fire on first load | LCP ≤ 2.5 s and TBT ≤ 200 ms on each page in PSI mobile, and GTM, GA4 page_view, CallRail swap and `hubspotutk` still work |
| L5 | Blocked on Darren + Saxton | No consent line on any form for calls and texts (Kocah's guide step 8; Bonzo texts leads) | All forms | Once Darren and Saxton approve the wording, add it under every submit button | Wording on every form, same text everywhere |
| L6 | Partly done: local Lighthouse on `/fha/` recorded below (30 Sep). Still wants one PSI mobile run on the live site, since local and PSI numbers are not comparable | `/fha/` PageSpeed score not taken | — | Re-run PSI mobile on `/fha/` | Score recorded here |

### Prompt for Claude Code (L1 to L4)

Work through L1 to L4 in `audit.md` ("Launch fixes, 30 Sep"). These are the Google Ads landing pages, so nothing in the lead path or tracking may change behaviour.

1. **L1, `/dscr/` footer.** Add the footer the other static landing pages already use (privacy policy link, NMLS #2438102 linking to NMLS Consumer Access, CA DRE #02103705, Equal Housing Opportunity). Reuse the existing markup and styles. Don't write new licence or company text; if the pages disagree, keep the homepage footer's wording and tell Max.
2. **L2, redirects.** In `netlify.toml`, add 301s: `/investing` and `/investing/*` → `/realestateinvesting/`; `/homeowners`, `/agent-career` and `/post/*` → `/`. Make sure they come before any catch-all rule and don't touch the `/yt/*` redirects. Add them to the tests if redirects are tested.
3. **L3, accessibility.** Run Lighthouse (the repo has Playwright/Chromium; `npx lighthouse` with `--only-categories=accessibility --form-factor=mobile` against a local build or preview is fine) on `/`, `/dscr/`, `/fha/`, `/realestateinvesting/` and `/mortgage-calculator/` to get the exact failing elements. Then:
   - contrast: fix the colour tokens that fail (usually muted grey text on the dark teal hero and small footer text) so they reach 4.5:1 for body text and 3:1 for large text, keeping the look as close as possible;
   - wrap each page's primary content in one `<main>`;
   - links inside paragraphs get an underline (or another non-colour cue);
   - the `aria-hidden="true"` element on `/` must not contain focusable children: remove `aria-hidden` or add `tabindex="-1"`/`inert` to its focusables, whichever matches its purpose (for example a hidden duplicate nav or closed modal);
   - `/dscr/` headings in order (no jumping from h1 to h3).
4. **L4, performance.** Find what blocks render in each `<head>` (usually the Google Fonts stylesheet and page CSS). Preconnect to the font hosts, use `font-display: swap`, and preload or inline the critical CSS if it's small. Give hashed static assets the long immutable cache they should already have (check `netlify.toml` headers cover fonts and images too). Check whether the legacy-JS warning comes from our build target or a third party; only change our build target if it's safe for the browsers we support. For the 530 ms blocking time on `/realestateinvesting/`, profile what runs on load and defer our own non-critical work (for example calculators below the fold). **Do not** delay, lazy-load or remove GTM, the CallRail swap script or HubSpot: GA4 page_view, number swap and the `hubspotutk` cookie must still happen on first load.
5. Keep all tests, lint, build and `npm run test:layout` passing. Record results per item in `audit.md` (before/after Lighthouse scores per page), commit and push, and tell Max what changed so the live site can be re-checked in PageSpeed on the live site.

L5 (consent line) is not part of this prompt: it waits on wording from Darren and Saxton.

### L1 to L4: what was done (30 Sep, Claude Code)

Checks: `npm test` 717 passed (20 files; 17 new in `tests/launch-fixes.test.ts`), `npm run lint` clean, `npm run build` OK, `npm run test:layout` OK (45 checks). Tracking was checked by driving Chromium over all five pages on first load, before and after: GTM (`gtm.js`), GA4 `page_view` to `/g/collect`, CallRail `swap.js`, HubSpot `hs-scripts` and the `hubspotutk` cookie all fire on every page, exactly as before.

**L1, `/dscr/` footer.** The light-grey disclaimer band is replaced by the same `site-footer` that `/fha/` and `/realestateinvesting/` use (markup and CSS copied, not rewritten): name, NMLS #2438102, CA DRE Broker #02103705, Saxton Mortgage, LLC NMLS #1717191, licensed states, the DRE statement, phone, email, LinkedIn, Equal Housing Lender, and the Privacy Policy / NMLS Consumer Access / Legal / Terms / Accessibility / Site Map links. The DSCR-specific educational disclaimer is kept inside it. **For Max: the pages disagreed.** The old DSCR band ended "Saxton Mortgage, NMLS #2525913"; the homepage, `/fha/` and `/realestateinvesting/` all say **NMLS #1717191** (`COMPANY_NMLS` in `src/config.ts`). Per the prompt the homepage wording won and the #2525913 sentence was dropped. Please confirm #1717191 is Saxton's company NMLS; if it is #2525913, every other page is the one that is wrong.

**L2, redirects.** `netlify.toml`: 301 `/investing` and `/investing/*` → `/realestateinvesting/`; 301 `/homeowners`, `/agent-career` and `/post/*` → `/`. There is no catch-all in the file (it was removed on purpose), the `/yt/*` 302s are untouched, and a test pins all of it. After deploy: `curl -I` `https://realdarrentsai.com/investing`, `/investing/anything`, `/homeowners`, `/agent-career`, `/post/anything`, each a 301 with the right `Location`; then request re-indexing in Search Console.

**L3, accessibility.** Contrast was a token problem: white on the old teal `#517686` was only 4.9:1, so no muted text on it could reach 4.5:1. Same hues, changed in `src/index.css` and each static page's `:root`:

| Token | Was | Now | Why |
| --- | --- | --- | --- |
| `--teal` | `#517686` | `#466a7a` | White 4.9 → 5.8:1, which leaves room for a muted tier |
| `--header-text` (static pages) | `#c8e2e8` | `#d4e8ee` | Muted copy on teal 3.6 → 4.6:1 |
| `--accent` (static pages) | `#219ebc` | `#1a7f99` | White button text 3.1 → 4.6:1 |
| `--accent-on-teal` (new) | n/a | `#8fd8ea` | The accent word in the `/dscr/` and `/realestateinvesting/` headlines was 1.6:1 on teal; 3.7:1 now (large text) |
| `--on-teal-muted` (new) | opacity 0.55 to 0.8 | white at 0.85 | Footer small print 2.9 to 4.0 → 4.75:1 |

Also: the `/dscr/` ratio panel is a slightly darker inset instead of a lighter one (on a lighter panel even white measured 4.2:1), and the active rate in the `/dscr/` rate ladder is white. One `<main>` per page (React via `App.tsx` and `MortgageCalculatorApp.tsx`). The NMLS link in the homepage disclosure is underlined. The closed mobile menu on `/` and `/mortgage-calculator/` stays `aria-hidden` and its links now leave the tab order (`tabIndex=-1` until it opens). `/dscr/` "Get Your Actual Rate & Terms" is an `h2`. Not on the list but failing Lighthouse too: footer compliance links are now 24px tap targets, and the `/fha/` carousel dots are 24px buttons drawn as the same 8px dots.

**What will look different on the live site:** the teal is one step darker everywhere (heroes, footers, rate ladder), accent buttons are a deeper blue, and the headline accent word on `/dscr/` and `/realestateinvesting/` is a light cyan instead of mid blue. The contact modal's success buttons still hard-code the old teal; they pass contrast and were left alone.

**L4, performance.** What blocked render, per Lighthouse: the Google Fonts stylesheet (~0.8 s), `booking-chooser.js` and `email-suggest.js` (~0.3 to 0.6 s together), `attribution.js` (the GTM loader) and CallRail `swap.js`. Done:
- Outfit is self-hosted: `public/fonts/outfit-v15-latin.woff2` (plus `-latin-ext`), the same variable file Google served for all five weights, `font-display: swap`, preloaded in each `<head>`. No request to `fonts.googleapis.com` or `fonts.gstatic.com` any more.
- `booking-chooser.js` and `email-suggest.js` are `defer`: nothing uses them before a click or a field blur.
- The `/fha/` hero carousel is WebP (`npm run images` now writes it from the PNGs): 1.45 MB → 419 KB, and slide 1, the page's LCP element, is preloaded.
- Cache headers: `booking-chooser.js` and `email-suggest.js` get the same 1 hour as `attribution.js`; `/fha-illustrations/*` and `darren-avatar.png` a week (not hashed, so not immutable).

Deliberately **not** changed: `attribution.js` (loads GTM) and CallRail `swap.js` stay synchronous in the `<head>`, as the prompt requires; they are the render-blocking time that remains. **The legacy-JS warning (13 KB) is HubSpot's `collectedforms.js`, not our build**, so the build target is unchanged. **The short-cache warning (~106 KB) is all HubSpot and CallRail files**, whose cache lifetimes we cannot set. **The `/realestateinvesting/` blocking time is third-party:** with the tracking scripts blocked the page scores 99 with 0 ms TBT, before and after; the long tasks are HubSpot analytics (~1.1 s of script on a throttled phone), GA4's gtag and the Ads gtag that GTM loads. Our own on-load work is under 70 ms. So LCP ≤ 2.5 s is realistic in PSI; TBT ≤ 200 ms on `/realestateinvesting/` probably is not while HubSpot's tracking code and both gtags load on every page view.

**Lighthouse, local, mobile (30 Sep).** Lighthouse 13.5 against `vite preview`, simulated mobile throttling on a slow laptop. Not comparable with PSI: the laptop's CPU makes every script look 2 to 4 times slower, and on localhost CallRail loads over `http:` and HubSpot sets third-party cookies, which is why Best Practices reads 54 to 58 here and 100 in PSI. Compare before with after, not with the PSI table above.

Full run, everything loading (tracking included):

| Page | Perf before → after | A11y before → after | Best Pr. | SEO | FCP before → after | LCP before → after | TBT before → after |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | 30 → 29 | 85 → **100** | 54 | 100 | 5.4 → 5.7 s | 7.9 → 11.2 s | 3,000 → 2,610 ms |
| `/dscr/` | 37 → 33 | 89 → **100** | 54 | 100 | 4.9 → 4.4 s | 10.3 → 9.9 s | 1,350 → 2,620 ms |
| `/fha/` | 31 → 32 | 92 → **100** | 58 | 100 | 5.9 → 5.4 s | 14.9 → 11.6 s | 1,690 → 1,700 ms |
| `/realestateinvesting/` | 33 → 32 | 92 → **100** | 58 | 100 | 5.9 → 5.6 s | 10.5 → 10.5 s | 1,630 → 1,990 ms |
| `/mortgage-calculator/` | 31 → 31 | 87 → **100** | 58 | 100 | 6.0 → 5.6 s | 10.5 → 11.1 s | 2,190 → 2,490 ms |

The performance columns there move by run-to-run noise, because HubSpot and the gtags dominate the main thread on this machine. To see what our own changes did, the same pages with only the tracking scripts blocked (Google Fonts left in for the "before" build, so the font change is measured fairly):

| Page | Perf before → after | FCP before → after | LCP before → after | TBT before → after |
| --- | --- | --- | --- | --- |
| `/` | 91 → 94 | 2.5 → 1.8 s | 2.8 → 2.4 s | 80 → 40 ms |
| `/dscr/` | 94 → 99 | 2.5 → 1.4 s | 2.5 → 1.9 s | 0 → 0 ms |
| `/fha/` | 73 → 94 | 2.5 → 1.4 s | 6.6 → 3.0 s | 0 → 0 to 90 ms (noise across runs) |
| `/realestateinvesting/` | 94 → 99 | 2.5 → 1.4 s | 2.5 → 1.9 s | 0 → 0 ms |
| `/mortgage-calculator/` | 93 → 97 | 2.5 → 1.7 s | 2.7 → 2.3 s | 10 → 50 ms |

**L6, `/fha/` score:** local only, above (accessibility 100, SEO 100). Still take one PSI mobile run on the live `/fha/` after deploy, alongside the re-check of the other three.

---

### Live re-check of dc97979 (1 Oct, Max)

Netlify: production is `main@dc97979`, published 30 Sep 12:10.

| Item | Result |
| --- | --- |
| L2 redirects | `/investing`, `/investing/x`, `/homeowners`, `/agent-career`, `/post/x` are all server redirects (`fetch` with `redirect: 'manual'` returns `opaqueredirect`), landing on `/realestateinvesting/` and `/` as planned. `netlify.toml` has `status = 301` for each. `/yt/rei` still works (302). Search Console live test of `/investing` fetches the `/realestateinvesting/` page. Indexing requested for `/investing`, `/homeowners`, `/agent-career` |
| L1 footer | `/dscr/` footer present on mobile (375 px) and desktop, teal `#466a7a`. Links: Privacy Policy, NMLS Consumer Access (#2438102), Legal, Terms, Accessibility, Site Map, phone, email, LinkedIn. NMLS shown: #2438102 (Darren), #1717191 (Saxton). #2525913 no longer on the page. Small nit: on mobile the second link row starts with a stray "·" separator |
| L3 colours | `/`, `/dscr/`, `/fha/`, `/realestateinvesting/`, `/mortgage-calculator/` look right at desktop width: darker teal, deeper-blue buttons, light-cyan headline word |
| Tracking | Fresh load of `/realestateinvesting/`: GTM-N7Z8Q4QF and G-627RJ4FDSP loaded, GA4 `page_view` sent for each page (seen in GA4 Realtime), CallRail swapped the number to (714) 984-0932, `hubspotutk` and `_ga` cookies set |
| L4 / L6 PageSpeed | Run 1 Oct in the PSI web UI (mobile). Accessibility 100 on all four, but performance is worse than 29 Sep. See the table below |

**PageSpeed Insights, mobile, 1 Oct (after dc97979)**

| Page | Perf | A11y | Best Pr. | SEO | FCP | LCP | TBT | CLS | Speed Index | 29 Sep LCP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` (run 1) | 69 | 100 | 100 | 100 | 1.8 s | 5.9 s | 130 ms | 0 | 7.4 s | 2.6 s |
| `/` (run 2) | 65 | 100 | 100 | 100 | 1.8 s | 9.4 s | 180 ms | 0 | 6.7 s | |
| `/dscr/` | 77 | 100 | 100 | 100 | 1.8 s | 4.2 s | 320 ms | 0.007 | 3.5 s | 2.6 s |
| `/fha/` | 59 | 100 | 100 | 100 | 1.9 s | 7.9 s | 500 ms | 0 | 4.7 s | not run |
| `/realestateinvesting/` | 80 | 100 | 100 | 100 | 1.7 s | 3.0 s | 430 ms | 0 | 4.9 s | 2.6 s |

Accessibility is fixed (89 to 100). FCP improved (2.6 s to 1.7 to 1.9 s). LCP got worse on every page, and PSI blames "element render delay" (1.7 to 2.2 s), not download time. LCP elements: `/fha/` `<p class="hero-sub anim anim-3">` (starts at opacity 0 and fades in); `/` a small header/footer text element. Still render-blocking on `/fha/`: `/attribution.js` (540 ms) and CallRail `swap.js` (750 ms). Unused JS: three `gtag/js` copies (GA4, Ads via GTM, Ads via HubSpot pixel) plus `gtm.js`, about 313 KiB unused. Not yet known whether the LCP drop comes from dc97979 or from the HubSpot scripts added in GTM v6 on 29 Sep; needs a with/without comparison (L7).

Two things noticed while checking:

- A second, plain `gtag/js?id=AW-18451324434` loads next to the GTM one. It is not in the site HTML; it is injected at runtime, most likely by HubSpot's ads pixel (`hsadspixel`) since Google Ads was connected in HubSpot on 16 Sep. It sends an Ads `page_view` only, no conversions. Decided 1 Oct (Max): keep it for now. It doesn't affect conversions; revisit if Kocah isn't using HubSpot ad audiences or page speed needs the extra script gone.
- GA4 Realtime counted this check session: the internal-traffic rule ("Remove Developer", Google tag G-627RJ4FDSP) only matched 136.158.59.180, and Max's IP is now 210.19.247.166. Fixed 1 Oct: added `210.19.247.0/24` to the rule; hits from Max now carry `tt=internal`. Max's home IP can change; if Realtime shows her again, add the new IP (whatsmyip) to the same rule.

**NMLS check (1 Oct).** Saxton's legal page (saxtonmortgage.com/legal) lists both numbers: #1717191 is Saxton Mortgage, LLC (multi-state, San Diego HQ); #2525913 is Dream Home Development Corporation, a California-only subsidiary that operates as "Saxton Mortgage" (CA DRE 02205650). Both are real. The site now uses #1717191 everywhere; #2525913 is still in the four Resend emails (`netlify/functions/send-*.mts`), `scripts/build_dscr_pdf.py` and the REI case-study PDF. Darren signs as Saxton Mortgage, LLC NMLS #1717191 and is licensed in 8 states, so #1717191 is the consistent choice. Waiting on a one-line yes from Darren before changing the emails and PDFs (L8).

### L7 and L8: prompt for Claude Code (1 Oct)

```
Read audit.md "Live re-check of dc97979" first.

L7, LCP regression. PSI mobile LCP got worse after dc97979 (/: 2.6 s to 5.9 to 9.4 s; /fha/: 7.9 s; /dscr/: 4.2 s; /realestateinvesting/: 3.0 s). PSI says "element render delay", not download.
1. Find the cause before changing anything: run Lighthouse mobile locally on the four pages for dc97979 and its parent (3e93cbc), and for dc97979 with the GTM HubSpot tag blocked (block js-na2.hs-scripts.com). Record all three in audit.md.
2. Fix what is ours: the hero text that is the LCP element must not start at opacity 0. Keep the fade-in for elements below it, or make the hero text visible from the first paint (e.g. animate transform only). Check /fha/ .hero-sub.anim-3 and the / hero.
3. /fha/ still has /attribution.js and CallRail swap.js render-blocking. attribution.js can be `defer` as long as it still runs before any form submit and still stores gclid/UTMs on first load. swap.js: load it async only if the number swap still happens on first load; check it.
4. Don't remove or delay GTM, GA4, CallRail or HubSpot. Tracking must still fire on first load (GTM, GA4 page_view, swap.js, hubspotutk).
Check: Lighthouse mobile LCP <= 2.5 s on the four pages, accessibility stays 100, npm test, lint, build and the layout check pass.

L8, NMLS: do NOT change yet. Waiting on Darren to confirm #1717191 for the emails and PDFs. (Confirmed 2 Oct; done, see "L8" below.)
```

### L7: what was found and done (1 Oct, Claude Code)

**Cause: mostly HubSpot, not dc97979.** Lighthouse 13.5, mobile, run locally against `vite preview`, three runs per page, median LCP. Local numbers sit far above PSI's (the laptop's CPU inflates every script), so read across the rows, not against PSI:

| Page | 3e93cbc (before dc97979) | dc97979 | dc97979, HubSpot blocked | L7 fix | L7 fix, HubSpot blocked |
| --- | --- | --- | --- | --- | --- |
| `/` | 10.9 s · TBT 2,770 ms | 10.2 s · 1,800 ms | 6.3 s · 460 ms | 10.1 s · 2,790 ms | 6.4 s · 630 ms |
| `/dscr/` | 10.7 s · 1,720 ms | 10.4 s · 1,800 ms | 5.6 s · 430 ms | 10.0 s · 2,220 ms | 5.7 s · 440 ms |
| `/fha/` | 14.9 s · 1,460 ms | 11.4 s · 1,940 ms | 7.5 s · 420 ms | 11.9 s · 2,020 ms | 7.6 s · 420 ms |
| `/realestateinvesting/` | 10.9 s · 1,640 ms | 10.0 s · 1,670 ms | 6.4 s · 560 ms | 7.0 s · 1,890 ms | 6.3 s · 480 ms |

- dc97979 did not make LCP worse on any page: equal or better than its parent everywhere (`/fha/` 14.9 to 11.4 s from the WebP carousel).
- Blocking only `js-na2.hs-scripts.com` cuts LCP by 4 to 5 s and TBT by about three quarters on every page. The HubSpot tag (GTM v6, 29 Sep) went live after the 29 Sep PSI run, which is why the 1 Oct PSI numbers look like a regression. HubSpot loads its analytics, banner, ads pixel and collected-forms scripts, and the ads pixel brings the second Ads gtag noted above.
- Ours: on `/`, `/fha/` and `/realestateinvesting/` the hero text faded in from opacity 0, and an element at opacity 0 is not "painted" for LCP, so LCP waited for a fade whose frames queue behind all of that script. That is PSI's "element render delay" and why its LCP element on `/` was a small nav text.

**Changes.**
- Hero entrance is movement only: `.hero-anim` (`src/index.css`) and `.anim` (`/fha/`, `/realestateinvesting/`) now use a `heroRise` keyframe that animates `transform` and never `opacity`. The hero text is visible from the first frame and still rises into place; the fade below the fold (`.reveal`) is unchanged. In the observed (unthrottled) traces LCP now equals FCP on every page, and the LCP element is the real hero (`h1.hero-headline` on `/`, `h1.hero-title` on `/realestateinvesting/`, `p.hero-sub` on `/fha/`). `/realestateinvesting/` median LCP 10.0 to 7.0 s with everything loading.
- `/attribution.js` is `async` with `fetchpriority="high"` on all five pages, so it no longer blocks render. `async`, not `defer`: `defer` would hold GTM until the whole page had parsed; `async` starts it as soon as the file arrives, no later than before. Every reader (form submit, phone/Calendly click tracking) checks `window.DT` at that moment. Checked in Chromium with `?gclid=…&utm_…` on all five pages: gclid and UTMs stored on first load, `DT.attr()` returns them, GTM, GA4 `page_view`, CallRail `swap.js`, HubSpot and `hubspotutk` all fire.
- `/fha/` slide 1 (the LCP image when the carousel wins) no longer has `decoding="async"`, which Chrome advises against for the LCP image.
- **CallRail `swap.js` stays synchronous.** Tested: loaded `async`, the number was never swapped on any page within 10 s; synchronous, it swaps in 0.6 to 0.9 s. The prompt's condition was not met.

**What is left, and it is not code.** With HubSpot loading, local LCP stays 7 to 12 s and TBT around 2 s, and LCP ≤ 2.5 s is not reachable here; in PSI the gap should be smaller but HubSpot is the largest item. Options for Max and Kocah, none taken because the prompt forbids delaying HubSpot: fire the GTM HubSpot tag on Window Loaded instead of All Pages (`hubspotutk` would still be set on first load, a second or so later); switch off the parts of HubSpot the site does not use (ads pixel, cookie banner, collected forms) in HubSpot's settings; or accept the score, since HubSpot is a decision about tracking, not a page bug. Re-run PSI mobile on the four pages after deploy to get the real numbers.

**Also seen.** `/mortgage-calculator/` showed the real number during the checks after the four pool numbers had been handed out to test sessions in the same few minutes: the CallRail pool is small (#8), not this change.

`npm test` 725 passed (8 new L7 checks in `tests/launch-fixes.test.ts`), `npm run lint` clean, `npm run build` OK, `npm run test:layout` OK (45 checks).

### L8: Saxton NMLS in emails and PDFs (2 Oct, Claude Code)

Darren confirmed 2 Oct (WhatsApp): use Saxton Mortgage, LLC NMLS #1717191 everywhere. "Saxton is our parent company. Dreamhome is only for California." Nothing on the site, in the emails or in the PDFs names #2525913 or Dream Home any more.

- **The four Resend emails** (`netlify/functions/send-contact-confirmation.mts`, `send-dscr-guide.mts`, `send-fha-guide.mts`, `send-rei-guide.mts`). The licence line now reads "Darren Tsai, DRE #02103705 | NMLS #2438102. Saxton Mortgage, LLC | NMLS #1717191 (NMLS Consumer Access)." followed by each email's own disclaimer, unchanged. The "Dream Home Development Corporation is a subsidiary…" sentence is gone: it only existed to reconcile the two numbers. Its NMLS Consumer Access link moved into the licence line. Dream Home's corporate CA DRE #02205650 is dropped with it; Darren's own DRE #02103705 stays, as on the site. The CAN-SPAM address line now says "Saxton Mortgage, LLC, 9191 Towne Centre Drive, Suite 400, San Diego, CA 92122", the same address as before.
- **DSCR guide PDF.** `scripts/build_dscr_pdf.py` now says #1717191, and `public/magnets/dscr-rate-cashflow-guide.pdf` was rebuilt from it. Before editing, the script rebuilt the published PDF pixel for pixel, so the rebuild only changed the NMLS lines (pages 2 to 6). The number is the same length, so nothing reflowed, and the cover the DSCR sender draws lead data onto is untouched.
- **REI case-study PDF** (`public/magnets/real-estate-investing-case-study.pdf`). There is no source for it in the repo, so it was edited in place with PyMuPDF. On pages 1 and 12 the old number was removed without painting over the background, and the new text was redrawn in Outfit Regular at the same size, colour and baseline. Before/after renders match apart from the digits.
- Both senders fetch the PDFs from the live site and cache them only in memory, so the deployed functions pick the new files up straight away.
- `tests/launch-fixes.test.ts` fails if #2525913 or "Dream Home" comes back into any sender or the DSCR build script. `npm test` 730 passed, lint clean, build OK.

**Check after deploy:** request each guide once (DSCR, FHA, REI) and submit the contact modal once. Each email's footer should read NMLS #1717191 with no Dream Home line. In the attached DSCR and REI PDFs, the footer and closing disclaimer should say #1717191.

### Live re-check of 7557412 (L7) and 11e17c2 (L8), 3 Oct (Max)

Both are live: every page serves `attribution.js` async, and `/fha/` and `/realestateinvesting/` use the new `heroRise` animation.

**PageSpeed Insights, mobile, 3 Oct**

| Page | Perf | A11y | FCP | LCP | TBT | CLS | Speed Index | LCP 1 Oct |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | 43 | 100 | 2.0 s | 6.0 s | 1,520 ms | 0 | 8.2 s | 5.9 to 9.4 s |
| `/dscr/` | 80 | 100 | 1.7 s | 1.7 s | 710 ms | 0.007 | 3.5 s | 4.2 s |
| `/fha/` | 70 | 100 | 1.8 s | 1.8 s | 1,300 ms | 0 | 4.8 s | 7.9 s |
| `/realestateinvesting/` | 87 | 100 | 1.8 s | 1.8 s | 400 ms | 0.004 | 4.0 s | 3.0 s |

L7 worked on the three static pages: LCP is now 1.7 to 1.8 s, under the 2.5 s target. What holds the score down now is blocking time (TBT 400 to 1,520 ms, target 200 ms), which is the third-party scripts (HubSpot, GTM, gtag copies). `/` is still slow on LCP (6.0 s) because the hero is rendered by React after the scripts load. Single PSI runs; TBT varies a lot run to run. Next lever: fire the HubSpot tag on Window Loaded in GTM, and have Kocah switch off the unused HubSpot parts (ads pixel, collected forms, banner).

**L8 emails and PDFs**

Four test leads submitted (built-in browser, `?tt=internal`); each fired `generate_lead` and `virtual_page_view`, and each email arrived within about two minutes.

| Lead | Form | Email footer |
| --- | --- | --- |
| TEST L8 Dscr, +l8dscr, (714) 555-0181 | `/dscr/` magnet | Saxton Mortgage, LLC NMLS #1717191, no Dream Home line |
| TEST L8 Fha, +l8fha, (714) 555-0182 | `/fha/` magnet | same |
| TEST L8 Rei, +l8rei, (714) 555-0183 | `/realestateinvesting/` magnet | same |
| TEST L8 Contact, +l8contact, (714) 555-0184 | contact modal on `/realestateinvesting/` | same |

PDFs in `public/magnets/` (the deployed files): the DSCR guide and the REI case study show #1717191 and #2438102 only. The FHA spreadsheet has no NMLS text. #2525913 now appears only in audit.md and the guard test.

Test data to clean: the four TEST L8 rows in the Sheet (Dscr, FHA, Real Estate Investing, Leads tabs), their Follow-ups rows, and the four emails in Max's Gmail.

### GTM version 7: HubSpot tag on Window Loaded (5 Oct, Max)

Published 5 Oct 20:57 as "HubSpot on Window Loaded". The Custom HTML tag "HubSpot – tracking code" now fires on a new trigger "Window Loaded" (All Window Loaded Events) instead of All Pages. Nothing else changed. Checked live on `/fha/`: the HubSpot loader and analytics script still load, `hubspotutk` is set, and CallRail still swaps the number.

**PageSpeed Insights, mobile, 5 Oct (after GTM v7), one run per page**

| Page | Perf | LCP | TBT | 3 Oct perf / LCP / TBT |
| --- | --- | --- | --- | --- |
| `/` | 69 | 5.1 s | 220 ms | 43 / 6.0 s / 1,520 ms |
| `/dscr/` | 80 | 3.6 s | 350 ms | 80 / 1.7 s / 710 ms |
| `/fha/` | 68 | 2.7 s | 1,240 ms | 70 / 1.8 s / 1,300 ms |
| `/realestateinvesting/` | 81 | 1.7 s | 620 ms | 87 / 1.8 s / 400 ms |

Accessibility, best practices and SEO are 100 on all four. The homepage improved clearly. The three landing pages are within run-to-run noise: the HubSpot scripts still run during the measurement window, only later. The remaining lever is fewer scripts: Kocah switching off the HubSpot ads pixel, collected forms and banner if unused.

Cleaned 5 Oct: the four TEST L8 rows and their four Follow-ups rows are deleted (each checked by timestamp first). The Sheet now holds six real leads: Steven Salas (Debt Consolidation), Leslie Sutton and Kent Devereaux (Leads), Husain Habib (Real Estate Investing), Schenique and Beth Gonzal (Fha, both from yt-buyer links: description and pinned-comment). The four test emails are still in Max's Gmail.

### L9: stray "·" at the start of a footer link row (5 Oct, Claude Code)

Measured in Chromium at the nine layout-check widths. On a phone, a row of footer links started with "·" on **all five pages**, not just `/dscr/`: 375px on `/dscr/` and `/fha/`, and 320, 360 and 414px on `/`, `/mortgage-calculator/` and `/realestateinvesting/`. The cause: each dot was its own flex item, so it could wrap to the next line alone. The dots are now each link's `::after` (every link but the last) in the three static pages and in `src/index.css`, and the `<span>` separators are gone from their markup and from `Footer.tsx`. A dot now wraps with the link before it, so a row can end on a dot but never start with one. Spacing and colour are unchanged, and `content: '·' / ''` keeps the dots silent for screen readers, as `aria-hidden` did. Re-measured: no row starts with a dot at any width on any page. `npm test` 738 passed (8 new L9 checks), lint clean, layout check OK (45).

**Also 5 Oct:** a `.gitattributes` (`* text=auto`, binaries listed) stops seven untouched files (`eslint.config.js`, `public/404.html`, `public/sitemap.xml`, `src/mortgage-main.tsx`, `src/utils/emailSuggest.ts`, `tsconfig.json`, `vite.config.ts`) from showing as modified in Git clients that don't apply `core.autocrlf`. They differed only in CRLF vs LF. The repo already stores every text file as LF, so no file content changed. With the attribute in place, every tracked file matches the index under `core.autocrlf=false`.

### Homepage LCP: putting the hero in the HTML (note, 5 Oct, Claude Code; not built)

**Why `/` lags the landing pages** (5.1 s after GTM v7, against 1.7 to 3.6 s). The three landing pages are plain HTML, so their hero paints as soon as the HTML and CSS arrive. On `/` the HTML holds an empty `<div id="root">`. Nothing but the background paints until the browser has downloaded and run the app's JavaScript (`main` 41 KB plus the shared chunk 381 KB, about 118 KB compressed), and on a throttled phone that waits behind GTM and the gtags too. L7 removed the fade, so the delay left is React itself.

**Option A: pre-render only the nav and hero (recommended if GTM v7 isn't enough).** At build time, a small Vite plugin renders `<Nav>` and `<Hero>` to static HTML with `react-dom/server` and writes it into `index.html`'s `#root`. `main.tsx` stays as it is: `createRoot` replaces that HTML with the same markup once the app loads. The same components produce both, so the two can't drift.
- *Effort:* about half a day, including a test that the built `index.html` contains the hero headline, and a PSI before/after.
- *Expected gain:* the hero paints with the first frame, like the landing pages. LCP should land near FCP (about 2 s in PSI). A replaced element of the same size does not create a new LCP entry. Unverified until measured.
- *Risk: low.* Hero and Nav render from props and `config.ts` only: no state read at render, no browser APIs, and no phone number for CallRail to swap and React to overwrite. The lead path isn't touched: the forms, `attribution.js`, GTM and `/api/lead` are all outside it.
- *What to watch:*
  - For the second or two before the app loads, the hero's "Book a call" and contact buttons do nothing on click. Its `#savings` links still work, because they are plain anchors.
  - The space below the hero stays empty until the app loads, as it does today.
  - The nav must render in its top-of-page state, which it already does.

**Option B: pre-render the whole homepage and hydrate (`hydrateRoot`).** Bigger win: all the content is in the HTML for first paint and for SEO. *Risk: medium to high, on the lead path.*
- It needs a server build of the app, a build-time render step and a switch to hydration.
- Any difference between server and client render (the debt calculator is 1,182 lines of state, the reviews carousel, the rates fetch) makes React throw away that part and redraw it, with a visible flash.
- A visitor who types into the calculator or lead form before hydration finishes could lose what they typed.
- Not worth it for a single page that sells one CTA, unless SEO for `/` becomes a goal.

**Option C: nothing more.** If repeated PSI runs after GTM v7 settle near 2.5 s, stop here.

**Suggested order:** take three PSI runs of `/` on GTM v7, since one run is noisy. If LCP stays above 2.5 s, build Option A and measure again. Option B only if there is a separate reason for it.

## HubSpot, 29 Sep: access, tracking code, and the lead push (H1 to H4)

Agreed with Kocah (Niko, 29 Sep): keep our forms, send each lead to HubSpot with the GCLID attached; GTM is the only tag setup (no raw `AW-18451324434` snippet).

**Access.** Max joined Darren's portal (Hub ID 247401197, data centre NA2) as liannemaxbalbastro@gmail.com. The role is limited: no Account & Billing, Users, Ads, Forms, Reports or pipeline settings; tracking settings are read-only; contact properties are visible (223). admin@kocah.com is already Super Admin. Google Ads is already a connected app (installed 16 Sep). Plan tier is not visible to this role. Workflows are locked ("Unlock with Sales Hub Professional").

**Done: HubSpot tracking code via GTM (container version 6, 29 Sep).** Custom HTML tag `HubSpot – tracking code`, All Pages: `<script type="text/javascript" id="hs-script-loader" async defer src="https://js-na2.hs-scripts.com/247401197.js"></script>`. Verified live on `/`, `/dscr/`, `/fha/`, `/realestateinvesting/`, `/mortgage-calculator/`: script loads, `hubspotutk` and `__hstc` cookies set, no HubSpot cookie banner shown.

| # | Status | What | Owner | Fix / check |
| --- | --- | --- | --- | --- |
| H1 | Open | Plan tier unknown. Ad conversion events (Kocah guide step 6b) need Marketing Hub Starter or above | Darren / Kocah | Read Account & Billing (Super Admin). Upgrade decision before the conversion events are created, since HubSpot only counts stage changes after an event exists |
| H2 | Open | Kocah's deal → lifecycle workflow (guide step 6a) needs workflows, which this account doesn't have | Kocah | Either the pipeline's built-in "sync lifecycle stage" setting (Kocah to confirm it covers Application Submitted → Opportunity and Funded → Customer on this tier) or a Pro upgrade |
| H3 | Deployed dark (Apps Script @41), verified live 29 Sep (test lead +h3skip: saved, Bonzo skipped as test, `pushToHubSpot: skipped, HUBSPOT_PORTAL_ID/HUBSPOT_FORM_GUID not set`, confirmation email 200, Follow-up done); waiting on HubSpot setup | `/api/lead` doesn't send leads to HubSpot | Kocah (form), then Max (Script Properties) | Built 29 Sep, see "H3: what was built" below. Ships dark: does nothing until `HUBSPOT_PORTAL_ID` and `HUBSPOT_FORM_GUID` are set |
| H4 | Open | CallRail qualified-call rule and CallRail → HubSpot integration | Kocah (Niko to define "qualified") | Installing the CallRail app in HubSpot is an OAuth grant; Max's role may not allow it |

**Needed in HubSpot before H3 goes live (Kocah, Super Admin):**
1. A HubSpot form used only as the API target, e.g. "Website lead (API)", with fields email, firstname, lastname, phone, state. Send Max its form GUID. **None of them required except email**: a phone-only or name-less lead would otherwise be refused.
2. Contact properties for what the site already sends (single-line text unless noted): `rdt_lead_source`, `rdt_form_id`, `rdt_page_path`, `rdt_gclid`, `rdt_gbraid`, `rdt_wbraid`, `rdt_msclkid`, `rdt_fbclid`, `rdt_first_utm_source`, `rdt_first_utm_medium`, `rdt_first_utm_campaign`, `rdt_latest_utm_source`, `rdt_latest_utm_medium`, `rdt_latest_utm_campaign`, `rdt_licensed_state` (Yes/No), `rdt_test_lead` (Yes/No), plus Kocah's Loan Type, Loan Amount, Property Use, Lead Source Detail.
3. **Every property in 2 added to that form as a hidden field.** A contact property alone is not enough: since 2022 the Forms API refuses a submission containing any field the form does not declare (400 `FIELD_NOT_IN_FORM_DEFINITION`). The code survives this (see below), but a missing field means that value never reaches HubSpot.
4. For the two Yes/No properties: if they are dropdowns, the option **internal values** must be exactly `Yes` and `No`, which is what is sent.

### Prompt for Claude Code (H3)

Add a HubSpot push for every saved lead. HubSpot account 247401197 (NA2). Keep all current behaviour; this is an extra destination next to Bonzo.

1. **Visitor cookie.** In `netlify/functions/lead.mts`, read the `hubspotutk` cookie from the request's Cookie header (same origin, so the browser sends it) and pass it to Apps Script as `hutk`, along with the page URL and page title the form already knows. Don't add work to the synchronous path beyond reading the cookie.
2. **Push from Apps Script, not Netlify.** Add `pushToHubSpot(ss, data)` in `google-apps-script.js`, run at the same point and with the same follow-up/retry, Debug logging and failure-alert handling as `pushToBonzo`. Use Script Properties `HUBSPOT_PORTAL_ID` and `HUBSPOT_FORM_GUID`; when either is missing, return `skipped` (the same pattern as `sendContactConfirmation`), so this can deploy before HubSpot is ready.
3. **Endpoint.** HubSpot Forms API v3 submit: `POST https://api.hsforms.com/submissions/v3/integration/submit/{portalId}/{formGuid}` with `fields` (objectTypeId `0-1`) and `context: { hutk, pageUri, pageName }`. Check HubSpot's docs for whether NA2 portals need a regional host.
4. **Fields.** email, firstname, lastname, phone, state, and every `rdt_*` property listed above from the attribution snapshot. Send only non-empty values; never send 0 or placeholder text for a blank. Also try HubSpot's own `hs_google_click_id` with the gclid; if HubSpot rejects it as read-only, leave it out and rely on `hutk` (the tracking code now records the gclid landing visit) plus `rdt_gclid`.
5. **Test leads.** Skip HubSpot for `isTestLead` unless the Script Property `HUBSPOT_SEND_TESTS` is `true` (so Max can test end to end), and always set `rdt_test_lead` = Yes on those.
6. **Returning leads.** HubSpot dedupes by email, so a repeat lead updates one contact. Don't treat a repeat as a failure (unlike Bonzo's 422, #9).
7. **Tests.** Add tests for: skip when properties are missing, test-lead skip and override, blank values not sent, `hutk` passed through from the cookie, and a non-2xx response going to the retry queue and alert.
8. Record it in `audit.md` under H3 and tell Max which Apps Script deployment to update in place.

Expected behavior: with the two Script Properties set, a Contact submit on `/` shows up in HubSpot within about a minute as a form submission on one contact, with the source, click ID and page filled in. The Debug tab shows `pushToHubSpot: 200`. With the properties unset, nothing changes and Debug shows `skipped`.

### H3: what was built (29 Sep)

All eight steps of the prompt, plus three things the prompt did not know. 700 tests pass (34 new, in `tests/hubspot-push.test.ts` and `tests/lead-endpoint.test.ts`), lint clean, build and `test:layout` pass.

**Where each piece lives**

- **Cookie.** `netlify/functions/lead.mts` reads `hubspotutk` and adds it to the body as `hutk` (`readHutk`). Only a well-formed value (32 hex characters) is passed; without one the body goes upstream byte for byte as before. The cookie wins over any `hutk` in the body.
- **Page URL, title, form.** The forms did not send these; they only went to the dataLayer. `public/attribution.js` `attr()` now adds `pageUri` (full URL), `pageName` (document title) and `firstUtmMedium`, which reaches all eight submit paths at once because every one merges `attr()` into its body. `formId` is added at each call site (`useLeadSubmit.ts` and the six static submits), with the same ids as GA4's `form_id`.
- **Push.** `pushToHubSpot(ss, data)` in `google-apps-script.js`, run by `processFollowUps` right after `pushToBonzo`. Script Properties `HUBSPOT_PORTAL_ID`, `HUBSPOT_FORM_GUID`, optional `HUBSPOT_SEND_TESTS` and `HUBSPOT_FORMS_HOST`. Skips (Debug: `pushToHubSpot: skipped, ...`) when unconfigured, for a test lead, and for a lead with no email, since HubSpot identifies contacts by email.
- **Fields.** `hubspotFields()`: email, firstname, lastname, phone, state, and the `rdt_*` set. Blank values are never sent. `rdt_page_path` is the path of `pageUri`. The latest click id goes to its network's `rdt_*`, and the first touch's too when it was a different network. `rdt_licensed_state` only when the lead gave a state. `hs_google_click_id` is tried with the gclid.

**What the prompt did not know**

1. **Unknown fields fail the whole submission.** HubSpot refuses a submission over one field the form does not declare. So on a 400 that names fields, the push resubmits once without them (never without email), and the lead still lands. It then emails Darren and Max once per 6 hours at most: "HubSpot is dropping lead fields: ...", naming what is missing from the form. `hs_google_click_id` being refused on its own is expected and sends no email.
2. **A HubSpot retry must not re-send the guide.** Bonzo is pushed once, but HubSpot is retried like the guide (1, 5, 20, 60, 180 minutes; 429, 5xx and throws retry; any other 4xx is rejected at once). The row's Status now says which job is still owed: `guide-retry:N` (the guide only, the same meaning as before), `hubspot-retry:N` (HubSpot only), `retry:N` (both). A delivered guide is never mailed twice, and old rows keep their meaning. Terminal: `hubspot-rejected`, `hubspot-failed`, both alerted and both in the daily digest. No new Follow-ups column: Payload stays last.
3. **NA2 host.** HubSpot's docs give no NA2-specific submit host (EU has `api-eu1.hsforms.com`). Default is `api.hsforms.com`. If the first live submit answers 404 or a redirect for the portal, set Script Property `HUBSPOT_FORMS_HOST` (e.g. `api-na2.hsforms.com`); no deploy needed.

Also fixed on the way: the daily digest told the reader to "clear the Status cell to retry it", but a blank Status is terminal and is never retried. The digest now says per row what did not happen (guide not sent, or not in HubSpot).

**Deployed 29 Sep.** Apps Script deployment `AKfycbyb...fyVQ` updated in place from @40 to @41 ("H3: HubSpot push (dark), db99142"), same `/exec` URL, which answers `{"status":"ok"}`. Before overwriting, both the editor's code and @40 were checked against the repo's previous commit: identical, so nothing made in the editor was lost. Netlify is serving the new `attribution.js` and form ids. Still to check by hand: step 3 below (one test submit, Debug shows the skip).

**To deploy (done 29 Sep; kept for the next change)**

1. Update the existing Apps Script deployment in place (`AKfycbyb...fyVQ`, currently @39) to a new version; do not create a new deployment. No trigger changes, so no `installTriggers()`.
2. Netlify deploys the site from `main` on push (lead.mts, attribution.js, the form ids). The two sides can go in either order: Apps Script ignores the new body fields until HubSpot is configured.
3. Check: a normal test submit still completes, and the Debug tab shows `pushToHubSpot: skipped, HUBSPOT_PORTAL_ID/HUBSPOT_FORM_GUID not set`.

**To turn on (after Kocah's setup above)**

1. Script Properties: `HUBSPOT_PORTAL_ID` = `247401197`, `HUBSPOT_FORM_GUID` = the form's GUID, and for the first test `HUBSPOT_SEND_TESTS` = `true`.
2. Submit a Contact test lead on `/` from a browser that has visited a `?gclid=TEST...` URL first. Within about a minute: Debug shows `pushToHubSpot: 200`, HubSpot has one contact with the submission, `rdt_gclid`, source, form id and page path filled, and `rdt_test_lead` = Yes.
3. Remove `HUBSPOT_SEND_TESTS` (or set it to anything but `true`), and delete the test contact.

---

## GTM, 29 Sep: Calendly events and generate_lead parameters (container version 5)

Done in the GTM and GA4 web interfaces (Max's work Chrome, signed in as liannemaxbalbastro@gmail.com). No code change.

**GTM container GTM-N7Z8Q4QF, version 5 "Calendly events + generate_lead parameters", published 29 Sep.** 10 changes:

| Type | Name | Setting |
| --- | --- | --- |
| Variable | `DLV – lead_source`, `DLV – form_id`, `DLV – page_path` | Data Layer Variable, version 2, names `lead_source`, `form_id`, `page_path` |
| Trigger | `CE – calendly_open`, `CE – calendly_booking`, `CE – calendly_stalled` | Custom Event, exact event name, all custom events |
| Tag | `GA4 – calendly_open`, `GA4 – calendly_booking`, `GA4 – calendly_stalled` | GA4 Event, G-627RJ4FDSP (uses the container's Google tag), parameter `page_path` = `{{DLV – page_path}}`, fired by the matching trigger |
| Tag (modified) | `GA4 – generate_lead` | Added `lead_source`, `form_id`, `page_path` from the three variables. `user_data` deliberately not sent to GA4 (Google doesn't allow personal data there) |

**Verified live** (realdarrentsai.com/dscr/?tt=internal, after publishing):

- Book a Call → Schedule sent `en=calendly_open` to G-627RJ4FDSP with `dp=/dscr/`.
- A test Contact submit (`liannemaxbalbastro+gtm-dscrc@gmail.com`, (714) 555-0191) sent `en=generate_lead` with `ep.lead_source=dscr-contact` and `ep.form_id=dscr-contact-modal`. No email, phone or name in the hit.
- GA4 Realtime showed both `calendly_open` and `generate_lead` within a minute. (Chrome's network panel reported the hits as 503, but GA4 received them, so that status is a reporting quirk of this browser.)
- `calendly_booking` and `calendly_stalled` were not triggered: they're built the same way as `calendly_open`, and confirmed present in the published container. The first real booking will show `calendly_booking` in GA4.

**GA4 property (a408041122 / p554186839):** event-scoped custom dimensions **Lead source** (`lead_source`) and **Form** (`form_id`) created 29 Sep. They fill in from now on; reports can take 24 to 48 hours. `page_path` needs no dimension: GA4 reads it as the standard page path.

**Left for later:** mark `calendly_booking` as a key event in GA4 (Admin → Events → star it) once the first real booking has come through; GA4 only lists an event after it has received one. Don't import it into Google Ads, since `generate_lead` is already the Ads conversion.

Test data: the Sheet row `TEST GTM DSCR Contact` (Leads).

---

## Re-test R9, 28 Sep: layout verification of `80b21e4`

Clean clone of `80b21e4`: **666 tests pass, lint, tsc and build clean.**

**How the layout was measured this time.** jsdom can't measure layout (Claude Code was right about that), so I ran the built site (`vite preview` of the same commit) in real headless Chromium with Playwright, at 320, 360, 375, 414 (Android phone emulation, touch, mobile user agent), 768, 850, 1024, 1280 and 1440px, on all five pages. Each page fails if `scrollWidth > clientWidth` or, at phone widths, if any input, select or textarea is under 16px. Third-party requests (fonts, Calendly, CallRail) were blocked, so text uses fallback fonts.

To prove the check catches real problems, I ran it on the pre-R8 commit `caa65ca` first. It found exactly the R8 issues: header buttons ending at 361px on `/dscr/` and `/fha/` (R8-4), the DSCR card at 322px on a 320px phone, the licensed strip at 915px on an 850px screen (R8-2), the FHA carousel and form overflow at 850 and 1024px (R8-1, R8-3), and the 14.4px state search box on all three landing pages (R8-5).

**On `80b21e4` the same check finds nothing: no sideways scroll on any page at any width, and no input under 16px.**

Spot check on the live site (Claude in-app browser, 360 × 780 phone): `/dscr/` fits exactly (360 = 360), Contact ends at 250px and Book a Call at 344px, and the phone calendar URL now carries `hide_event_type_details=1` (R8-6).

| Item | Result |
| --- | --- |
| R8-1 FHA form at 850–1060px | Fixed, verified: no overflow at 850 or 1024px |
| R8-2 licensed strip | Fixed, verified: no overflow at 850px on `/dscr/` or `/fha/` |
| R8-3 carousel 8px | Fixed, verified: `/fha/` and `/realestateinvesting/` fit at every width |
| R8-4 header at 360/320px | Fixed, verified: both header buttons inside the screen at 320 and 360px; DSCR cards fit at 320px (the one thing Claude Code couldn't measure) |
| R8-5 16px inputs | Fixed, verified: no input under 16px on any page at phone width |
| R8-6 phone calendar | Fixed, verified in the URL (`hide_event_type_details=1` at 360px). The visual effect of that parameter was confirmed in R7 |

### Decided and done: the real-browser layout test (commit 34de5f4)

`npm run test:layout` builds the site, serves it with `vite preview` and drives Chromium over all five pages at 320, 360, 375, 414, 768, 850, 1024, 1280 and 1440px, the first four as a touch Pixel 5. 45 checks, about a minute. A page fails on any sideways scroll, and at phone widths on any focusable field under 16px. Everything that is not localhost is aborted, so a run means the same thing on every machine and a pass never depends on Calendly, CallRail or Google Fonts being up; the cost is fallback fonts. The preview server is stopped in a `finally` block, through `taskkill /T` on Windows, where `npx` wraps the real process and a plain kill leaves the port held.

It is outside `npm test` and the Netlify build, as recommended: it needs a browser binary and a build, and a deploy that fails for want of Chromium is a worse outcome than the bug it looks for. `CLAUDE.md` and `README.md` both say to run it before pushing any change to a page or the CSS.

**Proved before it was committed.** With `width:104px` put back on the two `/dscr/` header buttons *and* the 400px header rule removed, so the pre-R8-4 state is reproduced exactly, it reports 320px and 360px with the header ending at 361px, against the 362px measured by hand last round. With only the inline widths back it reports 320px alone, which is correct: the 400px rule on its own is enough to fit 360px. Restored, it is silent across all 45 checks:

```
Layout OK: 5 pages x 9 widths (45 checks), no sideways scroll, no field under 16px on phones.
```

What it does not replace is `tests/layout-overflow.test.ts`, which runs in `npm test` on every machine with no browser and names the rule behind each R8 overflow. That one stops a known fix being undone; this one finds the next one.

### Test data

None this round.

---

## Re-test R8, 28 Sep: live verification of `caa65ca` (Apps Script @39)

Claude in-app browser, visible (Calendly rendered). Clean clone of `caa65ca`: **651 tests pass, lint, tsc and build clean.** One test lead: `liannemaxbalbastro+r8-fhac@gmail.com` (FHA Contact, (714) 555-0181). No booking made.

**R7-1 is fixed.** Calendly's details step now opens with the visitor's name and email filled in.

| Check | Result |
| --- | --- |
| Submit FHA Contact, then Book a Call → Schedule → Sep 30, 2:45am → Next | Name `TEST R8 FHA Contact`, Email `liannemaxbalbastro+r8-fhac@gmail.com` filled. Calendly sent `calendly.event_type_viewed` and `calendly.date_and_time_selected` as expected |
| Move to `/dscr/` in the same tab, same steps | Still filled (read from `sessionStorage.dt_known_lead`) |
| New tab | Not checked in a browser. `sessionStorage` is per tab by design, so a new tab starts empty |
| Iframe `src` | `…/15min?embed_domain=realdarrentsai.com&embed_type=Inline&hide_gdpr_banner=1`, no visitor data in the URL |

### New issues found (R8): layout at tablet and small-laptop widths

Found while testing the calendar in an 866px-wide window, then measured on every page at 768, ~850, 1024 and 1280px.

| # | Priority | Status | What's wrong | Where | Fix | Expected behavior (how to verify) |
| --- | --- | --- | --- | --- | --- | --- |
| R8-1 | P2 | Fixed, verified R9 (commit ad1c775) | **The FHA guide form runs off the right edge between about 821 and 1060px wide.** `.explainer-grid` is `1fr 460px` with a 56px gap and only collapses at `max-width:820px`. At 850px the page scrolls sideways to 1043px and the "Get the Free Calculator" form is cut off; at 1024px it still overhangs by ~40px. This is the FHA lead form, on iPad-landscape and small-laptop screens | `public/fha/index.html` line 600 (`.explainer-grid{…grid-template-columns:1fr 460px;gap:56px…}`) and the `@media(max-width:820px)` block at 644–661 | Let the grid shrink instead of overflowing: `grid-template-columns:minmax(0,1fr) minmax(0,460px)` (or `minmax(320px,460px)`), and/or raise the single-column breakpoint for this grid to ~1080px. Check the sticky form still works where it's two columns | At 850, 1024 and 1280px: no sideways scroll on `/fha/` (`document.documentElement.scrollWidth` equals `clientWidth`) and the whole form is visible |
| R8-2 | P3 | Fixed, verified R9 (commit 2cceac7) | **The "Licensed in…" strip overflows on `/dscr/` and `/fha/` between about 821 and 900px.** `.licensed-strip-inner` is `flex-wrap:nowrap` and its items `white-space:nowrap`; the last item ends at ~894px on an 850px screen, so the page scrolls sideways by ~47px | `public/dscr/index.html` line 136 and `public/fha/index.html` line 561 (`.licensed-strip-inner`), `.licensed-item{white-space:nowrap}` | Allow wrapping (`flex-wrap:wrap`, with a row gap) or move the column layout from the 820px breakpoint up to ~920px. Same rule on both pages | At 850px: no sideways scroll on `/dscr/` or `/fha/`; the strip wraps or stacks cleanly |
| R8-3 | P3 | Fixed, verified R9 (commit 00e7ea7) | **`/fha/` and `/realestateinvesting/` are ~8px wider than the screen at every width tested** (768, 1024, 1280). Small, but it means the page can be nudged sideways on a phone or trackpad. Likely a full-width element sized with `100vw` (which includes the scrollbar) or a carousel track without `overflow:hidden` | Find with devtools on each page: the element whose right edge is past `clientWidth` | Use `width:100%` instead of `100vw`, or clip the offending wrapper with `overflow-x:clip` (not `hidden` on `body`, which breaks the sticky form) | `scrollWidth` equals `clientWidth` on both pages at 375, 768, 1024 and 1280px |
| R8-4 | P2 | Fixed, verified R9 (commit 1deb5b5) | **On 360px phones the header's "Book a Call" button is cut off on `/dscr/` and `/fha/`.** The two header buttons are fixed at 104px each (`style="width:104px…"`), so `.site-nav-actions` ends at 362px: the page scrolls sideways and the right edge of "Book a Call" is clipped. 360px is the most common Android width (many Samsung phones). At 320px it overflows by ~46px and the `/dscr/` calculator cards also run past the edge. 375px and wider are fine | `public/dscr/index.html` lines 866–867 and the same header in `public/fha/index.html` (`#openContactBtn`, `#openCalendlyBtn` with inline `width:104px`); `.site-nav-actions` | Drop the fixed inline widths and let the buttons size to their text with smaller padding under ~400px, or hide the header Contact button on phones (the sticky bar already has Get My Real Rate and Call). Check the `.dscr-card` padding at 320px | At 320, 360 and 375px on `/dscr/` and `/fha/`: no sideways scroll, both header buttons fully visible |
| R8-5 | P3 | Fixed, verified R9 (commit 1dceb6f) | **The state search box makes iPhones zoom in.** The search field inside the state dropdown on `/dscr/`, `/fha/` and `/realestateinvesting/` is 14.4px. iOS Safari zooms the page when a focused input is under 16px, and the visitor then has to pinch back out mid-form. Every other input on the site is 16px or larger | The state select's search `<input placeholder="Search…">` in the three landing pages (shared custom-select styles) | Set that input's `font-size` to `16px` (it can look the same with `transform`-free spacing tweaks) | On an iPhone, open State on any landing-page form and tap the search box: the page doesn't zoom |
| R8-6 | P3 | Fixed, verified R9 (commit 70e7fae) | **On phones the calendar opens on Darren's photo and description, not the dates.** The phone panel is 585px tall and the details block takes about 350px of it, so the visitor scrolls inside the panel to find a day. R6-1 hides that block between 780 and 1199px only | `public/booking-chooser.js` `embedUrl()` (`w >= DETAILS_HIDE_MIN && w < SIDE_BY_SIDE_MIN`) | Add `hide_event_type_details=1` below 780px as well, so it's hidden everywhere except the side-by-side layout (where it's the left column) | At 375px: "Select a Day" and the month grid are the first thing in the calendar panel |

Everything else on `/`, `/mortgage-calculator/` and `/dscr/` fits at 768, 1024 and 1280px.

**Phones (checked 28 Sep, emulated Android at 320, 360, 375 and 414px):** `/`, `/mortgage-calculator/` and `/realestateinvesting/` fit at every width, and nothing overflows on any page at 375 or 414. The Contact modal scrolls inside its own panel and its submit button is reachable; the guide-form modals fit on screen; the booking chooser lists Call first and Calendly's phone layout loads and works; Monthly Reset dropdowns open within the screen; the sticky bars sit under the modals. The ~8px overflow in R8-3 doesn't appear on phones (it's a desktop-scrollbar effect). Issues found: R8-4 to R8-6. Not checked: a real iPhone/Safari (R8-5 is from the computed font size, which is what triggers the zoom).

### Round 9, 28 Sep: what was fixed in code

Commits `ad1c775..70e7fae` on `main`, one per item. **666 tests pass, lint, tsc
and build clean.** Front end deployed by Netlify. **No Apps Script change**, so
deployment @39 stands.

None of it is verified live. Every item needs the check in its Expected behavior
column, at the eight widths.

**The requested overflow test could not be written as specified, and this is the
one thing worth arguing with.** The ask was a test that loads each page at 320,
360, 375, 414, 768, 850, 1024 and 1280px and fails when
`documentElement.scrollWidth > clientWidth`. jsdom has no layout engine: every box
is 0x0 and both of those numbers are 0 at every width, so such a test would pass
on the current, broken code and on any code. Measuring for real needs a browser
(Playwright, or vitest browser mode), which is a new dependency and a decision for
Max rather than something to slip into a layout round.

`tests/layout-overflow.test.ts` is the substitute: every overflow found this round
pinned as the rule that caused it, across all six items, with the widths it was
measured at in the comments. **All 15 assertions fail against the pre-R8 code**,
which was confirmed before any fix went in. What it cannot do is find the *next*
overflow, which is exactly what a measurement would be for, so the offer stands:
say the word and Playwright goes in with the eight-width test as asked.

**Where I did something other than the suggested fix, and why:**

- **R8-1 does both halves**, not either: `minmax(0,1fr) minmax(0,460px)` so the
  columns shrink, and the single-column breakpoint at 1080px. minmax alone would
  stop the overflow while squeezing the form into a column too narrow to use.
  `.explainer-form` drops its sticky position with the second column, because
  pinned in a single-column flow it sits over the content below it.
- **R8-2 wraps rather than stacking early.** A 920px stack would put the strip in
  a column on screens with room for two rows of it.
- **R8-3 is fixed at the source, and `src/index.css` is deliberately left alone.**
  On the two landing pages the carousel's parent section is already full width, so
  the 100vw break-out was doing no work and `width:100%` is the same picture. On
  the React pages it really does sit inside a padded container, and the overhang is
  invisible there because `html` and `body` set `overflow-x:hidden` — which is
  also the answer to why the homepage measured clean, and which cannot be copied
  onto the landing pages because it breaks their sticky form.
- **R8-4 hides nothing.** The fixed 104px moves into the stylesheet, so the look is
  unchanged above 400px and the buttons size to their text below it. Hiding the
  header Contact button would have been simpler, but the sticky bar duplicates one
  CTA, not both.
- **R8-4 also tightens the DSCR card**, as the row suggested checking: 320px leaves
  280px inside the container, and 28px of card padding each side left the rows
  224px. Under 360px the container drops to 14px and the card to 20px/16px. **This
  is the one R8 fix I could not reason to a number**, because measuring the rows
  needs a browser; if the cards still overflow at 320px, that is where to look.
- **R8-4 leaves `/realestateinvesting/` alone, deliberately.** It carries the same
  inline `width:104px` on the same two header buttons, but it hides
  `.site-nav-actions` entirely at 900px and shows a hamburger instead, so the
  fixed width never applies at a phone width. That is why REI measured clean on
  phones while `/dscr/` and `/fha/`, which have no hamburger, did not. The guard
  test covers the two pages where the rule can bite.
- **R8-5 fixes four copies of the dropdown, not three.** `src/index.css` carries
  the same search box, at the same 0.9rem, for the homepage and the calculator.
- **R8-6 reverses an R6-1 test** rather than adding one. The old test asserted the
  details block stays on a phone, which is the behaviour being fixed.

### Test data from this round (R8)

- [ ] Sheet: `TEST R8 FHA Contact` (Leads) plus Follow-ups and Debug rows
- No Calendly booking was made

---

## Re-test R7, 28 Sep: live verification of `d3210e6` (Apps Script @39)

Tested in the Claude in-app browser **while it was visible**, so Calendly actually rendered this time. Clean clone of `d3210e6`: **643 tests pass, lint, tsc and build clean.** One test lead: `liannemaxbalbastro+r7-rei@gmail.com` (REI guide form, (714) 555-0171).

**R6-1 is fixed. R6-2 is only half fixed: our side now hands Calendly the name and email correctly, but Calendly still doesn't show them. The cause is found and the fix is proven by hand (R7-1).**

| Item | What I checked | Result |
| --- | --- | --- |
| R6-1 at 1440px | Book a Call → Schedule on `/dscr/` | Card 1160px, frame 1124px × 700px. Calendly side by side: Darren's details left, month grid and time zone right. No stall message (`calendly.page_height` and `calendly.event_type_viewed` both received) |
| R6-1 at 1000px | Same | Card 720px, URL has `hide_event_type_details=1`, "Select a Date & Time" and the month grid are the first thing in the panel. Calendly still leaves ~60px of its own white space above its card; acceptable |
| R6-1 phone width (539px pane) | Same | Phone layout, unchanged |
| R6-2 guide form | Submit REI "Send Me The Case Study" | `sessionStorage.dt_known_lead` = `{"name":"TEST R7 REI Guide","email":"liannemaxbalbastro+r7-rei@gmail.com"}` |
| R6-2 across pages | Move to `/dscr/`, Book a Call → Schedule | `initInlineWidget` receives `prefill: {name, email}` from storage (checked by wrapping the call). Iframe `src` carries only embed options: `…/15min?embed_domain=realdarrentsai.com&embed_type=Inline&hide_gdpr_banner=1` |
| R6-2 on screen | Pick Sep 30, 2:45am → Next | **Name and Email empty** on "Enter Details" |

### New issue found (R7)

| # | Priority | Status | What's wrong | Where | Fix | Expected behavior (how to verify) |
| --- | --- | --- | --- | --- | --- | --- |
| R7-1 | P2 | Fixed, verified live R8 (commit 2442cac) | **Calendly's `prefill` is sent before the booking page listens, so it's lost.** The current `widget.js` no longer puts prefill in the iframe URL at all (checked: calling `Calendly.initInlineWidget` with `prefill` and with or without `utm` gives a `src` with no `name`/`email`). It posts a `calendly.prefill` message into the frame around the frame's load; the booking page isn't listening yet, and the details step opens empty. That explains every failed check so far, including the R5/R6 URL version, which Calendly also ignored. **Proven by hand:** on the empty details step, posting `{event: 'calendly.prefill', payload: {name, email}}` to the iframe from the parent page filled both Name and Email immediately. The same diagnosis and fix are described in [this public fix for the same widget behaviour](https://github.com/aminsaedi/prompthealth-frontend/pull/115) | `public/booking-chooser.js`: the Calendly message listener (the one that already checks `e.origin !== CALENDLY_ORIGIN` and handles `calendly.event_type_viewed` / `calendly.page_height` / `calendly.event_scheduled`), and `open()` where `config.prefill` is set | Keep `config.prefill` as is. When a known lead exists, also post `{event: 'calendly.prefill', payload: {name, email}}` to **that panel's iframe** (`frame.querySelector('iframe').contentWindow`, target origin `https://calendly.com`) when Calendly reports (a) `calendly.event_type_viewed` and (b) `calendly.date_and_time_selected`. For (b), send once straight away and once more after ~500ms, because the details form draws just after that event. Only react to messages whose `e.source` is that iframe's `contentWindow` and whose origin is `https://calendly.com`; send only name and email; do nothing when there is no known lead; stop when the panel closes. Add tests for: no message without a lead, message only to the Calendly frame and origin, sent on both events | Visible Chrome window: submit any form (guide, Contact or homepage), Book a Call → Schedule → pick a time → Next: Name and Email are filled. Same after a reload and after moving to another page in the same tab. In a new tab: empty |

Not a bug: Calendly shows **+63** in the phone field because it picks the country from the visitor's location. US visitors get +1. Phone can't be prefilled through the embed.

### Round 8, 28 Sep: what was fixed in code

Commit `2442cac` on `main`. **651 tests pass, lint, tsc and build clean.** Front
end deployed by Netlify. **No Apps Script change**, so deployment @39 stands.

Not verified live. It needs a visible browser and the details step, which is how
it was found.

**My R6-2 explanation was wrong and is corrected in the code comments.** I wrote
that `widget.js` serialises `prefill` into the iframe `src`, so passing it on the
URL as well meant each field arrived twice. Max's check with a visible browser
shows the `src` carries no prefill at all, with or without `utm`. The values are
posted into the frame instead, too early to be heard. Removing them from the URL
in R6-2 was still right, for a different reason: on that path Calendly ignores
them, and the embed `src` is the one thing here a visitor can read out of
devtools.

**Where I did something other than the suggested fix, and why:**

- **The `e.source` check gates the prefill branch only**, not the whole listener.
  That branch is the one that posts something back, so it is the one that needs
  to know *which* frame it is answering. Requiring a source on the others would
  change two behaviours that have nothing to do with R7-1: `calendly_booking`
  from the popup fallback, where the frame is not ours, and the stall watcher,
  whose job is to react to the first sign of life from Calendly.
- **The target origin is named, never `'*'`.** This message carries the visitor's
  name and email; a wildcard hands them to whatever happens to be in the frame.
- **The pending re-send is cleared in `close()`.** It re-reads the frame when it
  fires as well, so a panel closed inside the 500ms window posts nothing.
- **The `calendly_stalled` path is untouched.** `calendly.date_and_time_selected`
  is not treated as a render signal: by then the watcher has long settled on
  `event_type_viewed` or `page_height`, and adding a third signal would only
  make the stall test harder to reason about.
- **One test pins that `config.prefill` is still passed.** It is what Calendly
  documents, it costs nothing, and if Calendly fixes the timing at their end it is
  the route that should win.

### Test data from this round (R7)

- [ ] Sheet: `TEST R7 REI Guide` (Real Estate Investing) plus Follow-ups and Debug rows
- [ ] Gmail: one REI case-study email to `+r7-rei`
- No Calendly booking was made (stopped at the details step)

---

## Re-test R6, 27 Sep: live verification of `d277ad3` (Apps Script @39)

Fresh browser session (storage cleared), then the Sheet, Follow-ups and Debug tabs. Three test leads: `liannemaxbalbastro+r6-reset`, `+r6-dscrc`, `+r6-dscr0` (phones (714) 555-0161 to 0163). Clean clone of `d277ad3`: **631 tests pass, lint, tsc and build clean**, no bare numeric placeholder anywhere. A scan of the served HTML of all five pages finds no input with a preset `value` and no pre-selected option.

**All eight R5 items are fixed and verified.** Max's hand check then turned up two booking issues (R6-1, R6-2 below).

| Item | What I checked | Result |
| --- | --- | --- |
| R5-1 | Debt Consolidation header, then a Monthly Reset lead with tier 660–679 and 15 years, Afternoon, Google | Header ends `Licensed?, Test?, Status, Contacted, HELOAN Credit Tier, HELOAN Term` (40 columns). Row: `TEST` under Test?, `10.49` under HELOAN Credit Tier, `15` under HELOAN Term, Status and Contacted blank, Best Time `Afternoon (12pm–5pm)`, Lead Source `Google`. HELOAN $99/mo, saves $171/mo (checked by hand: $9,000 at 10.49% over 15 years is $99) |
| R5-2 | Fresh `/mortgage-calculator/` | Loan Amount empty with `e.g. 330,000`; Rate empty with `e.g. 6.5` |
| R5-3 | Step 3 before picking a tier or term | Every HELOAN line `—`, including Blended Monthly Savings |
| R5-4 | FHA at 3% down, then 3.5% with no tax or insurance | 3%: "FHA needs at least 3.5% down." and the result waits. 3.5%: $2,662 "before taxes and insurance", Property tax, Home insurance and HOA all `—` |
| R5-5 | `/dscr/` guide sent with an empty calculator | "Check your email for the DSCR guide. Run the calculator above and send the form again if you would like a rate snapshot…". Sheet row blank for DSCR, Down Payment, Loan, Rate |
| R5-6 | Fallback link after a form submit, and after arriving from `/yt/buyer` | `…/15min?name=TEST%20R6%20Reset%20Tier%20Picked&email=…r6-reset%40gmail.com`; from `/yt/buyer`: `…/15min?utm_source=youtube&utm_medium=social&utm_campaign=yt-buyer&utm_content=description`. The inline iframe carries the same UTMs |
| R5-7 | Contact on `/`, `/dscr/`, `/fha/`, `/realestateinvesting/` | "Talk to Darren · No credit pull. No pressure. Four fields and a licensed loan officer gets back to you." `/mortgage-calculator/` keeps "Want Darren to Review Your Numbers?" |
| R5-8 | Follow-ups payload for a four-field `/dscr/` Contact | `"loanAmount":"","termYears":"","annualRate":""` |
| R3-4 | All three R6 leads | Debug: "test lead, not enrolled" for each; guide email still sent |

One thing to consider, not a bug: the new DSCR message invites the visitor to send the form again after running the calculator. That creates a second Sheet row for the same person (Bonzo already handles a returning email). Fine as is; worth knowing when reading the Dscr tab.

### Checked by hand (Max, 27 Sep, normal Chrome window)

1. **R3-2, no false alarm: passed.** Book a Call → Schedule: the calendar loaded and the "taking longer than it should" message did not appear.
2. **R3-5, prefill: failed.** After submitting a form and picking a time, Calendly's Name and Email were empty (Phone showed +63 because Calendly picks the country from the visitor's location; real US visitors get +1). See R6-2.

Two more things seen in the same test (see R6-1): the calendar sits under a large empty band, and it uses Calendly's stacked layout rather than the side-by-side one.

### New issues found (R6, by hand)

| # | Priority | Status | What's wrong | Where | Fix | Expected behavior (how to verify) |
| --- | --- | --- | --- | --- | --- | --- |
| R6-1 | P2 | Fixed, verified live R7 (commit f2890f0) | **The booking calendar is cramped and stacked.** The panel is 720px wide on desktop. Calendly picks its layout from the width of the element it's embedded in: **1100px or more** gives the side-by-side layout (details left, calendar and times right); **650–1099px** gives the stacked layout we have (avatar, title and description on top, calendar below, with a large blank band above the card); under 650px is the phone layout ([Calendly: embed layout and sizing](https://calendly.com/help/how-to-control-your-embed-layout-and-sizing)). The visitor has to scroll inside the panel before they see a single date | `public/booking-chooser.js` styles: `.dt-book-card.dt-cal{max-width:520px…}`, `@media(min-width:780px){.dt-book-card.dt-cal{max-width:720px;}}`, `.dt-book-frame{min-width:280px;height:680px;max-height:72vh;}` | On viewports **≥ 1200px**, widen the calendar card so the frame itself is at least 1100px wide (the card has 18px padding each side, so card max-width ≈ 1160px), and give the frame about 700px height (`max-height` ~85vh) so dates and times show without scrolling. Between 780 and 1199px, keep the current width but add `hide_event_type_details=1` to the Calendly URL (decided when the panel opens, from the window width), so the calendar starts at the top instead of under the avatar block. Keep the phone layout as is. Also pass `hide_gdpr_banner=1`. Don't change the Back / Close row | At 1440px wide: the calendar opens side by side (Darren's details on the left, month grid and times on the right), no blank band above it, dates visible without scrolling inside the panel. At ~1000px wide: the month grid is the first thing in the panel. On a phone: unchanged |
| R6-2 | P2 | Fixed, verified live R8 (commits 1920ed0, f2890f0, 2442cac) | **Calendly doesn't fill in the visitor's name and email.** The iframe URL does carry `name=` and `email=` after a form submit (checked in R5 and R6), but on Max's visible test the details step was empty. Two gaps in our code make this worse whatever Calendly's reason: (a) the three guide forms (DSCR "Get My Real Rate", FHA "Get the Free Calculator", REI "Send Me The Case Study") never call `DTBooking.identify`, only the Contact modals and React forms do, so booking after a guide request never has a name or email; (b) the known lead lives only in memory, so a reload or moving to another page loses it | `public/booking-chooser.js` (`knownLead`, `identify`, `calendlyUrlFor`, `config.prefill`); guide-form submit handlers in `public/dscr/index.html` (~1507), `public/fha/index.html` (~1838), `public/realestateinvesting/index.html` (~1343) | 1) Call `DTBooking.identify({name, email})` after a successful submit of each guide form, same as the Contact modals. 2) Keep the known lead in `sessionStorage` (name and email only; per tab; wrapped in try/catch) and read it back when the chooser loads, so it survives a reload and a move to another page. 3) For the inline widget, pass the name and email the documented way only, through `Calendly.initInlineWidget({ prefill: { name, email } })` ([Calendly: pre-fill in an embed](https://calendly.com/help/how-to-pre-fill-invitee-information-in-an-embed)), and log (in a test, not the console) the final iframe `src` to make sure `name` and `email` appear exactly once. Keep the URL parameters on the new-tab fallback link, where there is no widget. 4) Say in the commit what you found about why the URL version didn't fill the form, if you can tell | In a visible Chrome window: submit any form on any page (including a guide form), click Schedule, pick a time: Name and Email are filled. Reload the page, Book a Call → Schedule → pick a time: still filled |

### Round 7, 28 Sep: what was fixed in code

Commits `1920ed0..f2890f0` on `main`. **643 tests pass, lint, tsc and build
clean.** Front end deployed by Netlify. **No Apps Script change**, so deployment
@39 stands.

Neither item is verified live. Both need a visible browser, which is the reason
they were found by hand in the first place.

**Why the URL prefill did not fill the form, as far as I can tell.** R3-5 put the
name and email on the embed URL as well as through `config.prefill`, so that the
values could be verified by reading the iframe `src` without a browser. That is
most likely what broke it: `widget.js` serialises `config.prefill` into the same
`src`, so each field arrived twice and nothing Calendly documents says which copy
wins. Max's check is consistent with that and rules out the simpler
explanations: the `src` demonstrably carried both values and the details step was
still empty, so they were not missing and they were not malformed. I cannot
confirm which copy Calendly read without a visible browser, so this is the
best-supported reading rather than a proven cause. Either way the fix is the
same, and it is the documented one: prefill only.

**Where I did something other than the suggested fix, and why:**

- **One commit covers both items** (`f2890f0`). They meet in the same function:
  the URL handed to `initInlineWidget` gains the layout options and loses the
  visitor data in the same edit. `1920ed0` is the separable half of R6-2, the
  three guide forms.
- **`hide_gdpr_banner=1` goes on the embed URL only**, not on the new-tab
  fallback link. It is an embed option describing an iframe that link does not
  open, and the fallback's query string has one job: carrying the name, email
  and UTMs that a plain link has no other way to pass.
- **The wide breakpoint is 1200px, the card 1160px.** 1160 less 18px of padding
  each side leaves the frame 1124px, which clears Calendly's 1100px threshold
  with room for a scrollbar. Both numbers are pinned in
  `tests/booking-chooser.test.ts` against the threshold that is the reason for
  them, so they cannot be quietly tidied downwards.
- **`sessionStorage`, not `localStorage`.** Per tab and gone when the tab is, so
  a name cannot greet the next person on a shared machine. Every read and write
  is in try/catch: private mode and blocked site data both throw, and the panel
  must still open.
- **The new tests count both values across everything passed to Calendly**, not
  just the URL, so a second prefill route reappearing anywhere in the config
  fails rather than being tolerated because the URL happens to look clean.
- **`CLAUDE.md` was wrong in two places** and is updated: it said the known lead
  is never stored, and it still claimed 541 tests.

### Test data from this round (R6)

- [ ] Sheet: `TEST R6 Reset Tier Picked` (Debt Consolidation), `TEST R6 DSCR Contact` (Leads), `TEST R6 DSCR Empty` (Dscr), plus Follow-ups and Debug rows
- [x] Bonzo: none created
- [ ] Gmail: one DSCR guide email to `+r6-dscr0`

---

## Re-test R5, 27 Sep: live verification of `e7817dc` (Apps Script @38)

Checked in a fresh browser session (storage cleared) against the live site, then in the Sheet (every tab, Debug, Follow-ups), Gmail and Bonzo. Ten test leads, `liannemaxbalbastro+r5-…@gmail.com`, phones (714) 555-0151 to 0160, one per form and path. Code checked independently on a clean clone of `e7817dc`: **601 tests pass, lint, tsc and build clean**, and `grep 'placeholder="[0-9]'` returns nothing.

Round 5 fixed almost everything it set out to. One Apps Script change broke the Debt Consolidation tab (R5-1), and a few smaller things turned up. Local repo note: the files that `git status` lists as modified (README.md, Nav.tsx, index.css and others) are **line-ending changes only**: `git diff --ignore-cr-at-eol` is empty. There were never real uncommitted edits; the earlier note in this file was wrong.

### Verified fixed (R5)

| Item | What I checked | Result |
| --- | --- | --- |
| R3-1 | Fresh `/dscr/`, open Contact | Loan Amount and Rate blank, placeholders `e.g. 400,000` / `e.g. 6.5`. After a full calculation they fill with the visitor's own figures (225,000 / 7.63) |
| R4-1 | Rent 2,000 + price 300,000 only | No DSCR, no pill: "Add the annual property tax and insurance to see your DSCR". Adding 3,600 / 1,800 shows 0.98, Below standard qualification |
| R3-3 | `/dscr/` guide sent with an empty calculator | Sheet: DSCR, Down Payment, Loan, Rate all blank. Email: "[PDF] Your DSCR Rate & Cash Flow Guide", no Snapshot. Full calculation: Sheet 0.98 / 25% / $225,000 / 7.63%, email "Snapshot and Guide" |
| R3-4 | All ten R5 leads | Debug: "pushToBonzo: test lead, not enrolled" for each. No R5 prospect in Bonzo. Sheet rows and guide emails still arrive |
| R3-5 | Submit Monthly Reset, then Book → Schedule | iframe `src` carries `name=TEST R5 Reset Untouched&email=liannemaxbalbastro+r5-reset@gmail.com`. Calendly's details step not reached (see "Check by hand") |
| R3-7 | One debt + home numbers, nothing else touched | HELOAN card: "Pick your credit range and a term below"; tier and term "Select…"; step 4 Best Time and How Did You Find Me "Select…". Sheet: Best Time, Lead Source, Mortgage Rate, Mortgage Term, HELOAN figures all blank; Monthly Savings 108 (the refi figure, which was computed). **But see R5-1** |
| R3-8 | Step 4 | Form only, no Calendly button. Booking offered on the success card |
| R3-9 | Contact on `/`, `/dscr/`, `/fha/`, `/realestateinvesting/`, and `/mortgage-calculator/` untouched | Term blank on all. 30 only when the calculator was used (400,000 / 6.5 → 400000 / 30 / 6.5) |
| R3-10 | Fresh `/mortgage-calculator/` | Rate empty with `e.g. 6.5`, no schedule, message "Enter a loan amount and an interest rate…". Contact untouched: blank loan/rate and "Darren will reach out within 1 business day". **Loan Amount shows `0`, see R5-2** |
| R4-2 | Price 400,000 + rate 6.5 | Waiting: "Add a down payment of at least 3.5%". 3.5% down: $2,662 "per month, before taxes and insurance". With tax and insurance: $3,197 "per month, all in". Math checks out (P&I $2,482, MIP $180) |
| R4-3 | Four-field Contact on every page | "Darren will reach out within 1 business day." With loan and rate filled on `/mortgage-calculator/`, it says "review your numbers… He has the numbers from your schedule", which is now true |
| R4-4 | Monthly Reset success card | "Questions? Call: (714) 942-4217" |
| R4-6 | FHA estimator filled, guide form sent | FHA tab: Purchase Price 400000, Down Payment % 3.5, Rate 6.5, Annual Tax 4920, Annual Insurance 1500, Monthly HOA blank, Est. Monthly Payment 3197. New columns appended correctly at the end |
| R4-7 | New Monthly Reset | Both debt rows "Select debt type…"; payload sends `type: ""` |
| R4-8 | Contact Goals on each page | `/`: homeowner example; `/dscr/`: "Buying a rental in Phoenix…"; `/fha/`: "First home, about $400k…"; `/realestateinvesting/`: "first out-of-state rental…" |
| R4-9 | Every number field, live | All `e.g.` with thousands commas (`e.g. 5,000`, `e.g. 650,000`, `e.g. 2,400`, `e.g. 4,920`); Contact Loan/Rate `e.g. 400,000` / `e.g. 6.5` on every page |
| R3-2 | Schedule in the Claude in-app browser (calendar never rendered) | Fallback appeared: "The calendar is taking longer than it should…" with Call and "Open the calendar in a new tab". **Not yet checked in a visible browser where the calendar does load** (see "Check by hand") |

### New issues found (R5)

| # | Priority | Status | What's wrong | Where | Fix | Expected behavior (how to verify) |
| --- | --- | --- | --- | --- | --- | --- |
| R5-1 | P1 | Fixed, verified live R6 (commit 5c98d10) | **Debt Consolidation columns are now misaligned.** `HELOAN Credit Tier` and `HELOAN Term` were inserted *before* the triage columns (`Test?`, `Status`, `Contacted`), not appended. The live tab already had the triage columns at the end, so `ensureHeaders` only added the last two names again. The header row now ends `Licensed? \| Test? \| Status \| Contacted \| Status \| Contacted`, and new rows are written in a different order from the header: the R5 row has `TEST` under **Contacted**, and a lead who picks a credit tier will have `8.99` under **Test?** and `10` under **Status**. Test filtering on this tab is broken from @38 on | `google-apps-script.js` `DEBT_CONSOLIDATION_HEADERS` (`.concat(ATTR_HEADERS, ['Licensed?'], ['HELOAN Credit Tier', 'HELOAN Term'], TRIAGE_HEADERS)`) and the matching `.concat(...)` in the Debt Consolidation branch of `doPost` | Code: put the two new names **after** `TRIAGE_HEADERS`, in both the header list and the row builder, so the order is `… Licensed?, Test?, Status, Contacted, HELOAN Credit Tier, HELOAN Term`. Add a test that pins the header list deployed at @37 (38 names, ending `Test?, Status, Contacted`) as an exact prefix of `DEBT_CONSOLIDATION_HEADERS`, and the same for every tab, so an insert anywhere but the end fails. Sheet (by hand, after deploying): rename **AM1** to `HELOAN Credit Tier` and **AN1** to `HELOAN Term`, and delete the `TEST R5 Reset Untouched` row (written in the wrong order) | Header row ends `Licensed?, Test?, Status, Contacted, HELOAN Credit Tier, HELOAN Term`. Submit Monthly Reset with a tier and term picked: `TEST` under Test?, tier and term under their own names, Status and Contacted blank |
| R5-2 | P2 | Fixed, verified live R6 (commit fc239c6) | **`/mortgage-calculator/` Loan Amount opens showing `0`.** The rate field is empty with its placeholder, but the loan field's value is `0`, so its `e.g. 330,000` placeholder never shows. Nothing is sent (the result and prefill both need a loan and a rate), but it's a pre-filled value | `src/components/Calculator.tsx` lines 78–80: `useState(inputs.loanAmount.toLocaleString('en-US'))`, and `(0).toLocaleString()` is `"0"` | `useState(inputs.loanAmount ? inputs.loanAmount.toLocaleString('en-US') : '')`, matching `handleLoanBlur`. Extend `field-rules.test.ts` to render the page and check every number input's initial value is empty, since the static scan can't see React state | Fresh `/mortgage-calculator/` (sessionStorage cleared): Loan Amount empty, `e.g. 330,000` visible |
| R5-3 | P3 | Fixed, verified live R6 (commit c14ca8a) | **Monthly Reset says "No savings at this rate" before a rate is chosen.** With no credit tier or term picked, the HELOAN breakdown's last line reads "Blended Monthly Savings vs. Today: No savings at this rate", while the card above correctly says "Pick your credit range and a term" | `DebtSavingsCalculator.tsx`, `BreakdownRow` "Blended Monthly Savings vs. Today" (`heloanSave > 0 ? … : heloanAmt > 0 ? 'No savings at this rate' : '—'`) | Show `—` until both a tier and a term are chosen; "No savings at this rate" only when a priced option really saves nothing | Step 3 untouched: every HELOAN line shows `—` |
| R5-4 | P3 | Fixed, verified live R6 (commit eeb243d) | **FHA estimator copy doesn't match what it shows.** At 3% down the note says "The figures below use what you entered", but no figures are shown (the result waits for 3.5%). And in the "before taxes and insurance" state the breakdown still lists Property tax **$0** and Home insurance **$0** | `public/fha/index.html` `calculate()`: `downNote.textContent`, and the `fhaTaxOut` / `fhaInsOut` rows | Note: "FHA needs at least 3.5% down." Show `—` for tax, insurance and HOA when they're blank | 3% down: note has no "figures below". Price + rate + 3.5% only: tax and insurance rows read `—` |
| R5-5 | P3 | Fixed, verified live R6 (commit b98f6d7) | **DSCR success promises a breakdown that isn't sent.** After an empty-calculator submit, the success says "Check your email for your DSCR breakdown"; the email is only the guide (correctly, per R3-3) | `public/dscr/index.html` magnet success copy | When no DSCR was sent: "Check your email for the DSCR guide." Keep "breakdown" when numbers were run | Empty calculator submit: success mentions the guide, not a breakdown |
| R5-6 | P3 | Fixed, verified live R6 (commit 798eb9d) | **"Open the calendar in a new tab" drops the name, email and UTMs.** The stall fallback links the bare `CALENDLY_URL`, while the inline embed now carries name and email | `public/booking-chooser.js` `showStall`: `href="' + CALENDLY_URL + '"` | Use `calendlyUrlFor(knownLead)` and append the same UTM parameters the inline widget gets | After a form submit, trigger the fallback: the new-tab link carries `name=`, `email=` and any `utm_` values |
| R5-7 | P3 | Fixed, verified live R6 (commit 3ba1c0f) | **Every Contact modal is headed "Want Darren to Review Your Numbers? … Just your real numbers"**, including on pages where the visitor has no numbers and the form doesn't need any. Same habit as R4-3, in the heading | `src/components/LeadForm.tsx` / `ContactModal.tsx` heading; the copied modal heading in `public/dscr/`, `public/fha/`, `public/realestateinvesting/` | A neutral heading such as "Talk to Darren" with "No credit pull. No pressure." Keep the numbers wording on `/mortgage-calculator/`, where the form carries them | Open Contact on `/`, `/dscr/`, `/fha/`, `/realestateinvesting/`: no "your numbers" |
| R5-8 | P3 | Fixed, verified live R6 (commit 3ba1c0f) | **The copied Contact modals still send `0` for a blank loan and rate.** Payloads from `/dscr/`, `/fha/` and `/realestateinvesting/` carry `loanAmount: 0, annualRate: 0` (Follow-ups tab). The Sheet shows blank only because the Apps Script turns 0 into `''`; the rescue email and anything else reading the payload sees 0 | `public/dscr/index.html` ~2033–2035, same lines in `public/fha/` and `public/realestateinvesting/` (`parseFloat(...) \|\| 0`) | Send `''` when blank, like the React form already does | Follow-ups payload for a four-field Contact shows `"loanAmount":""` and `"annualRate":""` |

### Round 6, 27 Sep: what was fixed in code

Commits `5c98d10..3ba1c0f` on `main`. **631 tests pass, lint, tsc and build
clean.** Front end deployed by Netlify; Apps Script redeployed (see below).

Nothing here has been verified live. Each item still needs the check in its
Expected behavior column.

**R5-1 was mine, and the reason it shipped is worth writing down.** Every
existing test passed it, because they all compare the file against itself: the
row and the header list agreed, the attribution block was contiguous, the
lengths matched. None of them can see the live sheet, which is the only place
the damage happens. `ensureHeaders` writes past the sheet's current last column
and nothing else, so "append" has to mean the end of the whole list, not the end
of the part that reads sensibly.

`tests/sheet-columns.test.ts` pins every tab's header list as deployed at @37
and requires it to stay an exact prefix, by position, of the current list. I
confirmed it fails against the @38 ordering before fixing the code. That is the
only invariant `ensureHeaders` can honour.

**Where I did something other than the suggested fix, and why:**

- **R5-2.** Fixed as suggested. The test extension went further than the
  wording: rather than checking the rendered value on `/mortgage-calculator/`
  only, `tests/field-rules.test.tsx` renders the savings calculator and the
  contact modal too, and asserts the opposite case as well (the modal DOES fill
  loan and rate when `prefillNumbers` is set). The file is now `.tsx` and
  `vitest.config.ts` picks up that extension, enables the JSX runtime and raises
  the timeout, since a cold render pulls zod and libphonenumber through the
  transform.
- **R5-4.** Also dashed the **HOA** row, not just tax and insurance. The field
  says "if any", so a blank there is as meaningful as the other two.
- **R5-6.** `calendlyUrlFor` now takes the UTMs as well and builds the link for
  both paths, rather than duplicating the parameter logic in `showStall`, so the
  two cannot drift apart again.
- **R5-7.** The React modal takes the heading and subtitle as props rather than
  branching inside on the page, because `/mortgage-calculator/` genuinely keeps
  the numbers wording and the other four do not. The neutral subtitle is "No
  credit pull. No pressure. Four fields and a licensed loan officer gets back to
  you", which says what the form now is.

**Apps Script change waiting to be deployed** (`google-apps-script.js`): one
change only. `DEBT_CONSOLIDATION_HEADERS` and the Debt Consolidation row builder
in `doPost` put `HELOAN Credit Tier` and `HELOAN Term` **after** `TRIAGE_HEADERS`
/ `triageRow(data)` instead of before. Final order: `… Licensed?, Test?, Status,
Contacted, HELOAN Credit Tier, HELOAN Term`.

**The live Sheet still needs your two edits**, which I have not touched: rename
**AM1** to `HELOAN Credit Tier` and **AN1** to `HELOAN Term`, and delete the
`TEST R5 Reset Untouched` row, which was written in the wrong order.

### Check by hand (needs a visible browser)

Both browsers available to me were hidden windows, where Calendly doesn't render, so these two can't be closed from here:

1. **R3-2, no false alarm.** In a normal, visible Chrome window: open any page, Book a Call → Schedule, wait 10 seconds. The calendar should show and the "taking longer than it should" message should **not** appear. (In a hidden window it does appear, which is correct there.)
2. **R3-5, prefill.** Submit any form, then Schedule, pick a time: Name and Email on Calendly's details step are filled.

### Test data from this round (R5)

- [x] Sheet: `TEST R5 Reset Untouched` deleted (R5-1). Still to clean: the other R5 rows, `Home Contact`, `Calc Untouched`, `Calc Used`, `DSCR Contact`, `FHA Contact`, `REI Contact` (Leads), `R5 DSCR Full`, `R5 DSCR Empty` (Dscr), `R5 FHA Estimator` (FHA), plus 10 Follow-ups rows and the Debug rows
- [x] Bonzo: none created (R3-4 working). R3 and R4 test prospects are gone too
- [ ] Gmail: three R5 guide emails (DSCR Snapshot, DSCR Guide, FHA)

---

## Re-test, 27 Sep: live verification of `c95ec19` (Apps Script @37)

Checked in a browser against the live site, then downstream in the Sheet, Bonzo, Gmail, Resend, GTM, CallRail and YouTube. Test leads: `liannemaxbalbastro+calc-r3`, `+dscr-r3`, `+dscrc-r3` (555-013x phones). Build checked independently from a clean clone: **541 tests pass, lint, tsc and build clean.**

Most fixes hold. Eighteen new problems (one, R4-5, decided not to fix) plus a placeholder cleanup (R4-9). R3-7 to R3-10 came from a second pass for values the visitor didn't choose; R4-1 to R4-9 from a third pass (R4) that inventoried every field on every page in a fresh session and submitted the least-effort path on all eight forms, then traced each lead to the Sheet, Bonzo and Gmail.

### Verified fixed

| # | What I checked | Result |
| --- | --- | --- |
| 1 | Homepage debts load empty (placeholders "e.g. 5000"); Continue blocked with "Enter at least one debt…"; balance alone is not enough; pill tabs 2–4 can't skip ahead | Fixed. Sheet row carries the typed debt (12,000 / 360), not 26,500 / 670 |
| 2 | Empty Home step blocked with "Enter your home value, mortgage balance and monthly payment…" | Fixed |
| 3 | One claim site-wide ($900–$1,500); step 4 and sticky bar echo the visitor's own result ("about $208 a month") | Fixed |
| 4 | Contact modal: 4 required fields, rest labelled optional; loan fields blank on `/` and `/fha/` | Fixed on `/`, `/fha/`, `/realestateinvesting/`. **Not on `/dscr/` (R3-1) or `/mortgage-calculator/` (R3-10)** |
| 5 | `lead_source` = `home-contact` / `dscr-contact`; Sheet Source column matches | Fixed |
| 9 | Returning email: Debug row "returning lead, already a prospect, not re-enrolled"; no LEAD PIPELINE FAILURE email | Alert fixed. Prospect is still not updated or re-enrolled (by design until HubSpot); stays **Partly fixed** |
| 10 | "Access my home equity" in Target Outcome; Sheet stores `access-equity` | Fixed in the Sheet. Bonzo tag `target:access-equity` not seen, because my test hit the returning-lead path |
| 11 | Three same-tick clicks on "Get My Free Savings Analysis" → 1 `/api/lead` request, 1 Sheet row | Fixed |
| 12 | Origin check is `e.origin !== 'https://calendly.com'` | Fixed |
| 13 | `/dscr/` inputs empty, result says "Enter the monthly rent and the purchase price…" | Fixed |
| 15 | `Test?` / `Status` / `Contacted` appended; my rows flagged `TEST` | Fixed on tabs written since @37. Older test rows (Smoke, R1, R2) are not back-filled |
| 17 | FHA estimator on the page: $400k, 5% down, 7%, $4,920 tax, $1,500 ins, $350 HOA → $3,618 with MIP $161 (0.50%); 3.5% down → MIP $180 (0.55%). Single column at 375 px, no horizontal scroll | Fixed |
| 19 | Start Sep 2026: 2026 row = 4 payments; payoff Aug 2056 = last row | Fixed |
| 21 | Calendar iframe 684 px wide at 1440 px | Fixed |
| 22–25 | "Call Darren directly"; option lines separated; REI hero `$170,000` in HTML; FHA "MIP adds $161"; out-of-state message on every form | Fixed |
| — | `/api/send-contact-confirmation`: GET 405, unauthenticated POST 401 | Deployed and guarded. No confirmation sent yet (env/Script Properties not set, as expected) |

### New issues found

| # | Priority | Status | What's wrong | Where | Fix | Expected behavior (how to verify) |
| --- | --- | --- | --- | --- | --- | --- |
| R3-1 | P1 | Fixed, verified live R5 (commit 87f7166) | **DSCR Contact modal still pre-fills a rate the visitor never chose.** Interest Rate opens as **7.63%** with nothing entered, and it's saved (Leads row, Rate 7.63). `LF_CONTACT_PREFILL` reads `#outRate`, which shows the default tier rate even when rent and price are empty | `public/dscr/index.html` line 1615 (`LF_CONTACT_PREFILL`), used at 1978–1984 | Return `{}` unless rent and price are entered | Fresh `/dscr/`, open Contact: both optional fields blank |
| R3-2 | P1 | Fixed, verified by hand 27 Sep (commit e80eabf) | **Stall fallback never fires on a real stall.** It settles on the iframe `load` event, which fires ~2 s in, but Calendly's content then stayed blank for 15–20 s (twice, Claude in-app browser). No "open in a new tab" or Call option appeared | `public/booking-chooser.js` `watchForStall`, lines 268–294 | Settle on Calendly's own `calendly.event_type_viewed` / `calendly.page_height` postMessage (same origin check), not iframe `load` | Throttle to Slow 3G, pick Schedule: fallback shows at 8 s unless the calendar has rendered |
| R3-3 | P2 | Fixed, verified live R5 (commit 814a424) | **DSCR guide promises "the exact numbers you just ran" when none were run.** The form can be sent with an empty calculator; the Sheet stores DSCR 0.0, Loan $0, Rate 0.0763 and Down Payment 25% (the slider's starting position), and the email attaches `your-dscr-rate.pdf` built from zeros. Bonzo gets the same zeros as fields: `loan_amount` 0, `interest_rate` 7.63, `loan_program` "DSCR 0.00" (`addMortgageFields`) | `public/dscr/index.html` magnet submit; `netlify/functions/send-dscr-guide.mts` | If rent/price are empty, send the guide only, with copy that doesn't claim a snapshot (or ask for the two numbers first) | Submit `/dscr/` form with no numbers: email has no snapshot PDF |
| R3-4 | P2 | Fixed, verified live R5 (commit 7078726) | **Test leads still go into live Bonzo campaigns.** `TEST R3 DSCR` is Active in DSCR Campaign although the Sheet flags it `TEST` | `google-apps-script.js` `pushToBonzo` | Skip the Bonzo push (or skip campaign enrolment) when `isTestLead` is true | Submit with a test email: Sheet row, no Bonzo prospect |
| R3-5 | P3 | Fixed, verified live R8 (see R7-1) | Calendly prefill not confirmed. `initInlineWidget` is called with `prefill {name, email}`, but the embed URL carries no `name`/`email` params. May be how Calendly now passes it; I couldn't reach the details step in the in-app browser | `public/booking-chooser.js` line 251 | Check by hand in case 1.7 | After a form submit, Schedule → pick a time: Name and Email are filled |
| R3-6 | P3 | Fixed 29 Sep (GTM v5) | New `calendly_stalled` event also has no GTM tag, so stalls can't be seen in GA4 | GTM | Add with the #6 tags | — |
| R3-7 | P1 | Fixed, verified live R5 (commit 7078726); see R5-1 | **Monthly Reset (Debt Consolidation) sends preset answers as if the visitor chose them.** The empty-debt and empty-home gates hold (checked live: pill 4 and Continue both refuse). But once one debt and the three home numbers are in, the rest is already answered for them: **HELOAN Credit Tier = 680+ (8.99%)**, **HELOAN Term = 10 Years**, **Best Time to Call = Morning**, **How Did You Find Me = YouTube**. A visitor who clicks straight through to talk to Darren sends all four as fact. In the Sheet: Best Time to Call and Lead Source are the defaults, and HELOAN Monthly Payment / Savings and Monthly Savings are priced at the best credit tier. Blank Mortgage Rate / Term are also saved as `0`, which reads as a 0% rate. The Sheet has no column for the credit tier or HELOAN term, so Darren can't tell the savings figure was priced at 680+ | `src/components/DebtSavingsCalculator.tsx` lines 185–186 (`heloanTier` 8.99, `heloanTerm` 10), 194–195 (`bestTime`, `leadSrc`); payload `mortgageRate: mr, mortgageTerm: mt` | Start all four as `''` with the existing "Select…" placeholders. Show the HELOAN column as "Pick your credit range" until a tier is chosen (don't price at 680+). Require Best Time and How Did You Find Me before submit, or send `''` if untouched. Send `''` instead of `0` for blank rate/term. Add the chosen tier and term to the payload and Sheet (new columns at the end) | **Confirmed in the Sheet (R4, `TEST R4 Reset Untouched`):** Best Time `Morning (8am–12pm)`, Lead Source `YouTube`, Mortgage Rate `0`, Mortgage Term `0`, Monthly Savings `156` priced at 680+. None of those were chosen. Enter one debt + home numbers, click through without touching anything else: step 3 shows no tier/term chosen, step 4 dropdowns show "Select…", Sheet row has blank Best Time, Lead Source, Mortgage Rate and Term |
| R3-8 | P2 | Fixed, verified live R5 (commit 7078726) | **Booking from Monthly Reset loses the numbers.** Step 4's "Book a call with Darren / Schedule a Free 15-Min Call" card opens Calendly without submitting the form. A visitor who books this way never creates a Sheet row, so Darren gets the call with none of the debts, home value or savings they just entered | `DebtSavingsCalculator.tsx` lines ~1000–1020 (the booking card under the step-4 form; `openCalendly` = `openCalendlyPopup`) | Remove the pre-submit booking card from step 4. Keep booking on the success card ("Book a Free Strategy Call"), where the lead is already saved and Calendly can be prefilled with name and email. Tradeoff: one extra step for someone who only wants to book, but every booked call arrives with its numbers. The header/sticky "Book a Call" buttons stay as they are (no numbers exist there) | Step 4 shows the form and no Calendly button. After submitting, the success card offers booking. Booking from there, the Debt Consolidation row already exists |
| R3-9 | P3 | Fixed, verified live R5 (commit 50ed6ba) | **Term (Years) is 30 on every Contact lead, whatever the visitor did.** Confirmed in the Sheet (R4): `/`, `/fha/` and `/realestateinvesting/` Contact rows all say 30 with nothing entered. The three landing pages hard-code `termYears: 30`; the React form (`/` and `/mortgage-calculator/`) sends the calculator hook's default term, which is 30 on the homepage because there's no calculator there. None of the Contact forms asks for a term | `public/dscr/index.html` line 2034, `public/fha/index.html` line 2387, `public/realestateinvesting/index.html` line 2077; `src/components/LeadForm.tsx` lines 110 and 177 (`\|\| 30`); written by `google-apps-script.js` line 959 | Send `''` for term from every Contact form unless the visitor used the mortgage calculator (see R3-10). Drop the `\|\| 30` fallback | Submit Contact on `/`, `/fha/`, `/dscr/`, `/realestateinvesting/`: Term (Years) is blank |
| R3-10 | P2 | Fixed, verified live R5 (commit 50ed6ba); see R5-2 | **`/mortgage-calculator/` Contact sends the calculator's starting numbers as the visitor's.** The calculator loads with real values, not placeholders: Loan **330,000**, Rate **6.41**, Term 30, start this month. The Contact modal copies them into Loan Amount and Interest Rate (checked live with a fresh session). A visitor who opens Contact without touching the calculator sends $330,000 / 6.41% / 30 years. This is the same pattern as the "real May lead logged at 6.41%". **Confirmed in the Sheet (R4, `TEST R4 Calc Untouched`): 330000 / 30 / 6.41.** The success message then says "He has the numbers from your schedule, so the call can start with your actual payment", which isn't true for this visitor | `src/hooks/useMortgageInputs.ts` `defaultInputs`; `src/MortgageCalculatorApp.tsx` line 38 (`prefillNumbers`); `src/components/LeadForm.tsx` lines 108–110 | Only prefill once the visitor has changed a calculator field (track a `touched` flag next to the inputs in sessionStorage); otherwise leave both fields blank and send no term. Preferred, to match `/dscr/` and `/fha/`: load the calculator with Loan Amount and Rate **empty** (placeholders `e.g. 330,000` and `e.g. 6.5`) and show the schedule once both are entered. Term (30) and start month can stay pre-selected, since they're standard settings the visitor can see, but only send them with a lead if the calculator was used | Fresh private window, open Contact without touching the calculator: Loan Amount and Rate blank. Change the loan to 400,000, open Contact: 400,000 is filled |
| R4-1 | P1 | Fixed, verified live R5 (commit 87f7166) | **DSCR says "Qualifies" when taxes and insurance are blank.** Blank tax and insurance count as $0. Rent 2,000 and price 300,000 alone show **1.26, Qualifies for a DSCR loan**; add the placeholder-level tax (3,600) and insurance (1,800) and it's **0.98, Below standard qualification**. The 1.26 is what reaches the Sheet, the Bonzo `loan_program` and the PDF (R4 `TEST R4 DSCR Partial`, DSCR 1.26) | `public/dscr/index.html` `calculate()` lines 1161–1166 (`\|\| 0` on tax and insurance); result shown once rent and price exist | Require tax and insurance before showing a DSCR (HOA can stay optional, it says "if any"). Until then, the result card keeps its waiting message: "Add property tax and insurance to see your DSCR". Don't allow the guide form to send a DSCR that was computed without them | Enter only rent and price: no DSCR or Qualifies pill. Add tax and insurance: DSCR appears and matches a hand calculation |
| R4-2 | P2 | Fixed, verified live R5 (commit 7a84db0); see R5-4 | **FHA estimator shows an "all in" payment with required inputs missing.** Price 400,000 and rate 6.5 alone show **$2,759 per month, all in**: that's 0% down (base loan = the full price, which FHA doesn't allow) with $0 tax and $0 insurance. The 3.5% note only appears when the down payment is between 0 and 3.5, not when it's blank. Nothing is saved, but the visitor is shown a wrong number | `public/fha/index.html` `calculate()` around line 1593 (`ready = price > 0 && rate > 0`; blank down = 0) | Treat down payment as required (`ready` needs down ≥ 3.5). Either require tax and insurance too, or drop "all in" and label the total "before taxes and insurance" until they're entered | Price + rate only: result stays waiting. Add 3.5% down: payment shows, labelled without "all in" until tax and insurance are filled |
| R4-3 | P2 | Fixed, verified live R5 (commits 50ed6ba, d3a246c); see R5-7 | **Success messages claim numbers the visitor never gave.** Every Contact form says "Darren will review your numbers", including the minimal 4-field submit. The homepage adds "the savings calculator above shows your full breakdown"; `/mortgage-calculator/` adds "He has the numbers from your schedule" (see R3-10). Fix-first #18 is therefore only partly done | `src/components/LeadForm.tsx` line 206; `nextStep` in `src/App.tsx` line 41 and `src/MortgageCalculatorApp.tsx` line 39; `lf-success-body` in `public/fha/index.html` line 2101, `public/realestateinvesting/index.html` line 1791 and the same block in `public/dscr/index.html` | Base the copy on what was sent: with no loan or rate, "Darren will reach out within 1 business day"; mention "your numbers" only when Loan Amount or Rate is filled | Submit Contact with only the 4 required fields on each page: no mention of "your numbers" |
| R4-4 | P2 | Fixed, verified live R5 (commit 7078726) | **"Call or text" on the Monthly Reset success card goes to a CallRail pool number.** Live it read "Questions? Call or text: (714) 984-0932" (swapped by CallRail). Texts to pool numbers land in CallRail's messaging inbox, not Darren's phone (see CallRail setup) | `src/components/DebtSavingsCalculator.tsx` line 1040 | Change to "Call" only, or turn on text forwarding in CallRail and confirm a test text reaches Darren | Text the number shown: it reaches Darren, or the copy no longer says text |
| R4-6 | P3 | Fixed, verified live R5 (commit 7a84db0) | **FHA offer doesn't match the page.** The page now has the estimator, but the form is still "Get the Free Calculator", the success says "Check your email for the FHA calculator spreadsheet", and the email attaches `fha-affordability-calculator.xlsx` (R4). Numbers typed into the estimator aren't sent with the form, so Darren doesn't get them | `public/fha/index.html` magnet copy and payload (lines ~1864–1869); FHA guide email | Darren's call on the offer. Code side: send the estimator inputs with the lead when they're filled (blank stays blank) | Fill the estimator, submit: the Fha row or Bonzo note has the price, down, rate |
| R4-7 | P3 | Fixed, verified live R5 (commit 7078726) | **Debt rows are pre-labelled "Credit Card" and "Auto Loan".** Someone with two cards types into the "Auto Loan" row. The type isn't in the Sheet today, but it's in the payload (`debts`) and in the rescue email | `DebtSavingsCalculator.tsx` lines 172–175 (`type: 'Credit Card'`, `'Auto Loan'`) | Start each row with no type ("Select type…") and don't require it; send the type only if chosen | New row shows "Select type…" |
| R4-8 | P3 | Fixed, verified live R5 (commit d3a246c) | **Goals example is the homeowner one on every page.** "e.g. Lower my monthly payments, pay off credit card debt, save for a rental property…" shows on `/fha/` (buyers), `/dscr/` and `/realestateinvesting/` (investors) | Contact modal `cGoals` placeholder in each `public/*/index.html`; `lf-goals` in `LeadForm.tsx` | One example per page, e.g. FHA "e.g. First home, about $400k, want to keep the payment under $2,800"; DSCR "e.g. Buying a rental in Phoenix, want to know if the rent covers it" | Open Contact on each page: the example fits the page |
| R4-9 | P3 | Fixed, verified live R5 (commit d3a246c) | **Number placeholders aren't consistent.** Most use `e.g.` without thousands separators (`e.g. 400000`, `e.g. 650000`, `e.g. 5000`); `/mortgage-calculator/` Loan Amount uses `330,000` with no `e.g.` and Rate has no placeholder; the Contact modal's optional Loan Amount and Interest Rate have no placeholder on any page | `src/components/DebtSavingsCalculator.tsx` lines 512, 525, 537, 614, 623, 635, 643, 651; `src/components/Calculator.tsx` line 132 (+ rate input ~169); `src/components/LeadForm.tsx` `lf-loanAmount`, `lf-rate`; `public/dscr/index.html` 931–947 and `cLoanAmount`/`cRate` (~1721, 1727); `public/fha/index.html` 1099–1119 and `cLoanAmount`/`cRate`; `public/realestateinvesting/index.html` `cLoanAmount`/`cRate` | One format everywhere (see Field rules): dollars `e.g. 400,000` (comma for ≥ 1,000), rates `e.g. 6.5`, percents `e.g. 3.5`, years `e.g. 27`, HOA `e.g. 0`. Exact values: debts `e.g. 5,000` / `e.g. 150` / `e.g. 24.99`; home `e.g. 650,000` / `e.g. 350,000` / `e.g. 2,200` / `e.g. 3.5` / `e.g. 27`; DSCR `e.g. 2,400` / `e.g. 320,000` / `e.g. 3,600` / `e.g. 1,800` / `e.g. 0`; FHA `e.g. 400,000` / `e.g. 3.5` / `e.g. 6.5` / `e.g. 4,920` / `e.g. 1,500` / `e.g. 0`; mortgage calculator `e.g. 330,000` / `e.g. 6.5`; every Contact modal Loan Amount `e.g. 400,000`, Interest Rate `e.g. 6.5`. Name, email and phone placeholders are out of scope (no `e.g.` there, by convention) | Every money, rate, percent or year field on `/`, `/mortgage-calculator/`, `/dscr/`, `/fha/`, `/realestateinvesting/` and in every Contact modal is empty on load and shows an `e.g.` placeholder in this format. Grep for `placeholder="[0-9]` returns nothing |

### Round 5, 27 Sep: what was fixed in code

Commits `87f7166..d3a246c` on `main`. **601 tests pass, lint, tsc and build
clean.** Netlify has deployed the front end; **the Apps Script needs deploying
by hand** (see the list at the end of this section).

Nothing here has been verified live. Every item still needs the check in its
Expected behavior column.

**Where I did something other than the suggested fix, and why:**

- **R3-7, Best Time and How Did You Find Me.** The fix offered a choice: require
  them, or send `''` when untouched. I sent `''`. Both dropdowns now open on
  "Select…" and stay optional, because making two more fields mandatory on the
  form that already has seven is a cost paid by every visitor to fix a problem
  that blank solves.
- **R3-7, the new Sheet columns** are `HELOAN Credit Tier` and `HELOAN Term`,
  appended at the end of Debt Consolidation as instructed. They hold the raw
  values the dropdowns carry (`10.49`, `15`), not their labels, so they line up
  with the rate and term the figures were actually priced at.
- **R3-5, the Calendly prefill.** I could not confirm whether `config.prefill`
  arrives, and I have no browser to reach the details step in. Rather than
  leave it unverifiable I also put the name and email on the booking URL, which
  Calendly has always accepted and which anyone can check by reading the
  iframe's `src`. Both are passed and they agree, so whichever path Calendly
  reads gives the same answer. **Still worth confirming by hand.**
- **R3-2, the stall signal.** As suggested: `calendly.event_type_viewed` or
  `calendly.page_height`, behind the existing exact-origin check. Worth saying
  why the check matters here and not only for bookings: a forged "it rendered"
  would suppress the fallback, which is the visitor's only way out of a blank
  panel.
- **R3-10.** I took the preferred option, not the `touched` flag. With the
  calculator opening empty, "it holds a loan and a rate" *is* "it was used", so
  no extra state was needed. Term and start date keep their positions.
- **R4-2.** Both halves, not either: the result waits for a down payment of at
  least 3.5%, **and** the total is labelled "before taxes and insurance" until
  those two are in.
- **R4-7, the debt type placeholder** reads "Select debt type…" rather than
  "Select type…", which is what the control already said.
- **R4-6.** Code side only, as asked. The offer copy and the .xlsx are
  untouched. Seven columns appended to the end of the FHA tab.
- **R3-4** was not on the list for this round, but it is one line next to the
  R3-7 Apps Script work and it was putting test prospects into live campaigns,
  so it went in with them.
- **Two test fixtures moved off the 555-01xx range** (`tests/bonzo-push.test.ts`,
  `tests/apps-script-followups.test.ts`). That range is a test marker now, and
  those fixtures exist to exercise the Bonzo push that R3-4 skips.
- **`tests/field-rules.test.ts` is new.** The R3 and R4 items are the same habit
  found in different places, so this scans all five pages for the rule rather
  than the instance: no bare numeric placeholder, no `value="123"` on a number
  input, one thousands-comma format, no `|| 30` term fallback, and success copy
  that varies with what was sent. It is the part most worth keeping.

**Apps Script changes waiting to be deployed** (`google-apps-script.js`):

1. `DEBT_CONSOLIDATION_HEADERS` gains `'HELOAN Credit Tier', 'HELOAN Term'`,
   appended after `Licensed?` and before the triage columns.
2. The Debt Consolidation row builder writes those two, and now writes `''`
   instead of `0` for Mortgage Rate, Mortgage Term, Monthly Savings, HELOAN
   Monthly Payment and HELOAN Monthly Savings.
3. `SOURCE_SCHEMAS['fha']` gains seven columns at the end: Purchase Price, Down
   Payment %, Rate, Annual Tax, Annual Insurance, Monthly HOA, Est. Monthly
   Payment, with the matching row values.
4. `pushToBonzo` returns early for `isTestLead(data)`, logging
   "test lead, not enrolled" to the Debug tab. The Sheet row and the guide email
   are unaffected.

No triggers changed, so `installTriggers` does not need re-running. All new
columns are appends, so `ensureHeaders` adds them on the next write to each tab
with no manual migration.

**Decided not to fix:** R4-5 (Monthly Reset numbers are not copied to Bonzo). The numbers are in the Sheet, which is enough until HubSpot replaces Bonzo.

### Still open (not code)

- **#6, #16 GTM:** done 29 Sep, see "GTM, 29 Sep" at the top.
- **#8 CallRail:** still "Pool is swapping too fast". A headless bot ("Lightpanda") was also holding a pool number.
- **#14 YouTube:** the same four descriptions still link the bare homepage.
- **Contact confirmation:** needs `CONTACT_CONFIRM_API_KEY` (Netlify) and `NETLIFY_CONTACT_CONFIRM_URL` / `NETLIFY_CONTACT_CONFIRM_KEY` (Script Properties).
- Real Estate Investing tab still has three blank header columns. (Term always 30 is now R3-9.)

### Field rules: what may appear in a field before the visitor touches it

The goal is that nothing reaches the Sheet, Bonzo or an email unless the visitor typed or picked it. Suggestions are fine; values are not.

| Field kind | Allowed on load | Why |
| --- | --- | --- |
| Money, rate, percent, years (calculators and the optional Contact Loan/Rate) | Empty value, grey placeholder **with** `e.g.`, dollars with a thousands comma: `e.g. 400,000`, `e.g. 6.5`, `e.g. 3.5`, `e.g. 27`, `e.g. 0` for HOA (R4-9) | A bare grey number reads as already filled (this is how #1 and R3-10 happened). `e.g.` is the normal way to mark a numeric sample. Same format on every page. Keep them realistic, since R4-1 shows people's numbers land near them |
| Name, email, phone | Empty value, placeholder **without** `e.g.` (`Jane Investor`, `jane@email.com`, `(555) 555-5555`) | Standard convention; nobody reads `jane@email.com` as their own address. The Contact modals currently have no placeholders here, which is also fine |
| Free text (Goals) | Placeholder with `e.g.` and a sentence | Already done. Make the example fit the page (R4-8) |
| Dropdowns that describe the visitor (state, credit tier, best time, how they found us, target, timeline, debt type) | "Select…" with nothing chosen | Any pre-selection is an answer on their behalf (R3-7, R4-7) |
| Dropdowns that are tool settings the visitor can see (mortgage calculator term, start month) | May be pre-selected | They're settings, not facts about the person. Only send them with a lead if the tool was used (R3-9, R3-10) |
| Sliders (DSCR down payment) | Must have a position | Fine on the page. Don't send it with a lead unless the calculator was actually filled (R3-3) |
| Results | Waiting message until every input the result depends on is filled | R4-1, R4-2 |
| Blank optional numbers | Saved as blank | Not `0`: a 0% mortgage rate or 0-year term reads as an answer (R3-7) |

Current placeholders checked 27 Sep: the calculator number fields on `/`, `/dscr/`, `/fha/` use `e.g.` but without commas; `/mortgage-calculator/` uses `330,000` with no `e.g.`; the Contact modal Loan/Rate fields have none. R4-9 lists every change.

### Check on every audit: nothing the visitor didn't choose reaches the Sheet

The recurring bug on this site is a value that looks like the visitor's answer but was set by the page (example debts, 7.63%, 6.41%, Term 30, 680+ credit, "YouTube"). Every audit, for every form and calculator:

1. Load it fresh (new private window) and click straight through without touching anything. Every step that lets you pass should only have your own input, placeholders or "Select…".
2. List every field that has a value on load: text inputs, dropdowns, sliders, radio buttons, hidden fields. Anything with a real value either gets a placeholder or is clearly labelled as an assumption, not an answer.
3. Submit, then open the Sheet row. Every non-blank cell must trace back to something typed or picked. Blank stays blank (not `0`, not a default).
4. Check each "book a call" / "email Darren" shortcut: does the visitor's data still reach the Sheet if they skip the form?
5. Check the email that goes out: it must not claim numbers the visitor didn't enter.

### Test data from this round

- [ ] R4 (27 Sep, all flagged `TEST` in the Sheet): Sheet rows `TEST R4 Reset Untouched` (Debt Consolidation), `Home Contact`, `Calc Untouched`, `FHA Contact`, `REI Contact` (Leads), `R4 FHA Magnet` (Fha), `R4 REI Magnet` (Real Estate Investing), `R4 DSCR Partial` (Dscr), plus Follow-ups rows
- [x] Bonzo R4: all eight `TEST R4 …` prospects. **Three are Active in live campaigns** (DSCR Campaign, FHA Calculator Campaign: Licensed, Real Estate Investing) because of R3-4
- [ ] Gmail: three R4 guide emails in liannemaxbalbastro@gmail.com (DSCR, FHA, REI); no failure alerts this round

- [ ] Sheet: `TEST R3 Calc` (Debt Consolidation, Leads), `TEST R3 DSCR` (Dscr), `TEST R3 DSCR Contact` (Leads), plus 4 Follow-ups rows and 2 Debug rows
- [x] Bonzo: TEST R3 Calc, TEST R3 DSCR (**Active in DSCR Campaign**), TEST R3 DSCR Contact
- [x] Local repo: the "uncommitted edits" were line endings only (see Re-test R5). Nothing to commit

---

## Fix first

Ranked by how many YouTube leads each one loses or mislabels. P1 items should be done before ad spend starts.

**Status as of 27 Sep.** Commits `774b7f7..c95ec19` and Apps Script @37 are deployed. Everything marked **Fixed (verified 27 Sep)** was checked on the live site and downstream in the Sheet and Bonzo. Items the re-test found still broken point to their R3 entry.

Still **Open** (not code): #6 and #16 are GTM tags and parameters, #8 is the CallRail pool, #14 is four YouTube descriptions, and the `/heloc` page in #10 is Darren's decision.

One thing #4 needs before it does anything: the confirmation email is built and
wired, but it stays silent until these three exist.

```
Netlify env var   CONTACT_CONFIRM_API_KEY      = <new random string>
Script Property   NETLIFY_CONTACT_CONFIRM_URL  = https://realdarrentsai.com/api/send-contact-confirmation
Script Property   NETLIFY_CONTACT_CONFIRM_KEY  = <same random string>
```

The Apps Script skips rather than fails without them, so deploying in either
order is safe and no alert fires in the meantime.

| # | Priority | Status | What's wrong | Where | Fix | How to verify |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | P1 | Fixed (verified 27 Sep); see R3-7 | **"Boost Your Monthly Cashflow" submits example debts as real data.** Step 1 loads two filled-in debts (Credit Card $8,500 / $250 / 24.99%, Auto Loan $18,000 / $420 / 7.5%). Visitors who don't replace them send $26,500 total debt and $670/mo to the Sheet and to Darren as if they typed it. Both of my 26 Sep test leads did exactly this without touching step 1 | `src/components/DebtSavingsCalculator.tsx` lines 164–167 (`useState<Debt[]>` defaults) | Start both debt rows at `bal: 0, pmt: 0, rate: 0`. The inputs already render `value={d.bal \|\| ''}` with placeholders `5000` / `150` / `24.99` (lines 454, 467, 479), so they will show as grey examples. Block "Continue to Home Info" until at least one debt has a balance and payment | Load `/`, don't touch step 1, try to continue: it should stop you. Fill one debt, submit: the Debt Consolidation row shows your numbers, not 26,500 / 670 |
| 2 | P1 | Fixed (verified 27 Sep); see R3-7 | **Calculator shows results on empty input.** Step 2 (home value, balance, payment, rate, term) can be left blank; the comparison then shows HELOAN **$0/mo** and "Save $670/mo". Grey placeholders (650000, 350000…) look like pre-filled values | `DebtSavingsCalculator.tsx` line 600 (`goStep(3)` with no validation), placeholders lines 550–587 | Require home value, balance and payment before `goStep(3)`; prefix placeholders with "e.g." | Leave step 2 blank and click "See My Comparison": it should refuse |
| 3 | P1 | Fixed (verified 27 Sep) | **Three different savings claims on one page.** Hero card **$1,500–$3,000/mo**; sticky bar and step 4 **$900–$1,500/mo**; the tool's own default result **$334/mo**. A viewer who just saw $334 is told a call "could free up $900–$1,500" | `src/components/Hero.tsx` line 69; `DebtSavingsCalculator.tsx` lines 819 and 1008 | Pick one claim Saxton signs off on, or drop the ranges. Step 4 should repeat the visitor's own result | Only one savings figure appears on `/`, and step 4 echoes the computed number |
| 4 | P1 | Fixed, verified live 29 Sep (confirmation email: Netlify var was saved as NETLIFY_CONTACT_CONFIRM_KEY; re-added as CONTACT_CONFIRM_API_KEY, test lead +confirm4 got 200 and the email landed in the inbox) | **Contact form: 8 required fields, pre-filled optional numbers, and no confirmation email.** On every page except `/mortgage-calculator/` the optional Loan Amount and Rate carry the mortgage-calculator defaults **$330,000 / 6.41%**; a real May lead is logged at 6.41%. "Send My Info to Darren" sends no email to the visitor | `src/components/LeadForm.tsx` line 77 (prefill), defaults `src/hooks/useMortgageInputs.ts` lines 15–17; same modal copied into `public/dscr/`, `public/fha/`, `public/realestateinvesting/` `index.html` | Cut to name, email, phone, state; leave the optional fields blank outside `/mortgage-calculator/`; send an instant reply with Darren's calendar link | Open Contact on `/`: fields blank. Submit: a confirmation lands in the inbox |
| 5 | P1 | Fixed (verified 27 Sep) | **Every Contact-modal lead is labelled `MortgageCalculator`**, on any page, so Sheet, Bonzo tags and GA4 can't tell an equity lead from a DSCR lead | `LeadForm.tsx` line 148; `public/fha/index.html` 2133; `public/realestateinvesting/index.html` 2041; `public/dscr/index.html` 1983 | One `lead_source` per page and form (e.g. `home-contact`, `dscr-contact`) | Submit Contact on `/dscr/`: Sheet Source and Bonzo tag say dscr-contact |
| 6 | P1 | Fixed, verified 29 Sep (GTM v5) | **Bookings never reach GA4.** `calendly_open` and `calendly_booking` fire into the dataLayer (verified with a real booking) but GTM has no tags for them, so GA4 Realtime shows neither | GTM container `GTM-N7Z8Q4QF` | Add GA4 event tags for both (observation only, not imported to Ads) and publish | Book a slot: `calendly_booking` appears in GA4 Realtime |
| 7 | P1 | Fixed (R3-2 verified 27 Sep) | **No fallback if the calendar stalls.** In the Claude app browser Calendly sat on its spinner for 20+ s, twice, with no way out. In Chrome it loaded in 3–5 s | `public/booking-chooser.js` | After ~8 s show "Open the calendar in a new tab" and the Call option | Block `calendly.com` in DevTools, pick Schedule: the fallback appears |
| 8 | P1 | Decided 29 Sep: keep pool 4, sources All, swap target 714-887-5432; the alert came from test bursts and a bot. Revisit when peak hourly visitors pass 16 after ads start | **CallRail pool is already "swapping too fast"** (live alert) because Tracking sources = All, so every YouTube and organic visitor takes one of 4 numbers | CallRail → Numbers → Website pool | Limit the pool to paid sources, or add numbers before launch | The CallRail alert clears |
| 9 | P1 | Partly fixed | **Returning leads fail.** Bonzo answers 422 "already exists" for a known email and Darren gets a LEAD PIPELINE FAILURE instead of an updated contact. Any viewer who downloads a second guide hits this | `google-apps-script.js` Bonzo push | Upsert by email in whichever CRM stays (HubSpot) | Submit twice with one email: one contact, updated, no alert |
| 10 | P1 | Partly fixed | **HELOC and equity viewers land on a debt-consolidation page**, and Target Outcome has no equity option | `/yt/heloc`, `/yt/equity` → `/` | Build `/heloc` (Darren's decision); meanwhile add "Access my home equity" to Target Outcome and HELOC wording | — |
| 11 | P2 | Fixed (verified 27 Sep) | **Double submit.** Button now disables and reads "Sending…", but two clicks in the same tick still sent two requests: two Sheet rows 2 ms apart, two Follow-ups, and a 422 failure alert | `DebtSavingsCalculator.tsx` lines 194, 279, 314 (`sending` is state, read before React re-renders) | Guard with a `useRef` set synchronously before the request | In DevTools: `b.click(); b.click()` sends one `/api/lead` |
| 12 | P2 | Fixed (verified 27 Sep) | **Calendly origin check is loose.** `indexOf('calendly.com')` accepts `calendly.com.anything.example`, so a forged booking could be counted | `public/booking-chooser.js` line 303 | `if (e.origin !== 'https://calendly.com') return;` | Unit test with a lookalike origin is rejected |
| 13 | P2 | Fixed (verified 27 Sep); see R3-3 | **DSCR calculator loads with sample numbers** ($2,400 rent, $320,000 price) and already says "Qualifies, 1.12". 3 of 5 DSCR Sheet rows are the untouched sample | `public/dscr/index.html` inputs `rent`, `price`, `tax`, `insurance` | Same as #1: placeholders, result hidden until the visitor enters rent and price | Fresh load shows no result |
| 14 | P2 | Fixed, verified live 29 Sep (all 115 descriptions and pinned comments now on /yt/ links; details in the Codex outputs youtube-cleanup-audit.md) | **Four recent video descriptions link the bare homepage** (no campaign), three below the "…more" fold; the ARM video's pinned comment sends viewers to FHA | YouTube: `xEEcVDxgc5k`, `Nw_UqwLkrpM`, `6Wj7FaqlPhU`, `4Mbmp5K1zIc` | Put the bucket short link on line 1 (see YouTube section) | Descriptions contain `/yt/...` |
| 15 | P2 | Fixed (verified 27 Sep) | **Sheet can't separate tests from leads:** 4 real leads ever vs 20+ test rows | Lead Sheet | Add a Test flag (or route test emails to a Tests tab) plus Status / Contacted columns until HubSpot is live | Filter hides all tests |
| 16 | P2 | Fixed, verified 29 Sep (GTM v5, GA4 dimensions) | **GA4 can't tell which form converted:** the `generate_lead` tag sends no parameters, though the dataLayer has them | GTM tag "GA4 – generate_lead" | Add `lead_source`, `form_id`, `page_path` (never `user_data`); register as custom dimensions | Parameters visible in GA4 DebugView |
| 17 | P2 | Fixed (verified 27 Sep) | **FHA "calculator" is an Excel attachment**; most YouTube viewers are on phones. Success copy promises a "payment breakdown" for numbers the visitor never gave | `/fha/` guide email | Link a web calculator or send a PDF | — |
| 18 | P2 | Fixed (R4-3 verified R5) | Contact success message says "check out the savings calculator above" on every page | `LeadForm.tsx` line 173 | Match the next step to the page | — |
| 19 | P2 | Fixed (verified 27 Sep) | Mortgage calculator schedule counts 12 payments in the start year (Sep 2026), so it ends 2055 while the summary says Sep 2056 | `src/components/AmortizationTable.tsx`, `src/hooks/useMortgageInputs.ts` | Count only the months left in the start year | Last table year equals payoff year |
| 20 | P3 | Fixed (verified 27 Sep) | Booking chooser text runs together: "Call (714) 942-4217Straight through, no waiting", "Schedule a timeFree 15 minute call" | `public/booking-chooser.js` styles | Put the sub-line on its own line | — |
| 21 | P3 | Fixed (R3-5 prefill verified R8; side-by-side layout R6) | At desktop the 520 px panel gets Calendly's narrow layout, so the date grid is below the fold; name and email aren't prefilled for a lead who just submitted | `public/booking-chooser.js` sizing | Widen to ~700 px on desktop; pass name and email when known | — |
| 22 | P3 | Fixed (verified 27 Sep) | "Straight through, no waiting" promises something one forwarded cell can't always keep | `public/booking-chooser.js` copy | "Call Darren directly" | — |
| 23 | P3 | Fixed (verified 27 Sep) | REI hero HTML says "$0 Estimated value today" until an animation runs | `public/realestateinvesting/index.html` line 841 | Put `$170,000` in the HTML and animate from there | View source shows $170,000 |
| 24 | P3 | Fixed (verified 27 Sep) | FHA example uses 0.55% MIP ($177) for 5% down; the page's own text says 0.50% ($161) | `public/fha/index.html` line 962 | Correct to $161 | — |
| 25 | P3 | Fixed (verified 27 Sep) | All forms accept all 50 states with no message | Every state dropdown | Save the lead, but say where Darren lends | — |

---

## Re-test, 26 Sep: shipped fixes

Commits `fd401a8..40d4628`, five test leads from YouTube short links, one real Calendly booking (booked, checked, cancelled).

| Fix | Status | What I saw |
| --- | --- | --- |
| New Sheet columns (Mortgage Rate, Mortgage Term) | Fixed | 3.5 and 27 landed in their own columns; Total Debt Balance and the historical row (29,656.80) still aligned |
| "Refi, Same Payoff Date" card | Fixed | $2,942 at 27 years, plus "Adds 3 years to your payoff" and "Trades your 3.50% rate for about 7.03%". Math checks out |
| Double submit | Partly fixed | See Fix first #11 |
| Campaign routing (Apps Script @36) | Fixed | DSCR → DSCR Campaign, FHA → FHA Calculator Campaign: Licensed, REI → Real Estate Investing. Contact and Calculator → no campaign |
| Guide emails | Working | DSCR, FHA, REI all Delivered in Resend within a minute |
| Booking chooser | Fixed | Opens from header, sticky bar, success steps and every landing-page button. Call shows a CallRail pool number, so the swap runs on the injected link. Schedule first on desktop, Call first on phone |
| Calendar inline | Fixed | Renders in the panel, not a new tab; Back and Close work; UTMs reach Calendly (`utm_campaign=yt-heloc`) |
| `calendly_open` | Fixed | Fires exactly once per open |
| `calendly_booking` | Fires, not recorded | Fired once on confirmation; never reaches GA4 (Fix first #6) |
| FHA sticky Call button | Fixed | Real `tel:` link |
| Vanishing lead (rescue email on 500/413) | Fixed in code | Not tested live, deliberately |

---

## The YouTube viewer's path

*Baseline from 25–26 Sep. Example debts, sample DSCR inputs, the three savings figures, the 8-field Contact form, the $0 REI hero and the FHA .xlsx are fixed (see Fix first). Short links and YouTube descriptions are unchanged.*

All 10 short links redirect correctly with the right `utm_campaign` and `utm_content`. The problems start once the viewer lands.

| Short link | Lands on | What the viewer sees | Opt-in offered | Gap |
| --- | --- | --- | --- | --- |
| `/yt/heloc`, `/yt/equity` | `/` | "Most mortgages cost you money", debt-consolidation calculator with example debts filled in, three conflicting savings figures | Calculator step 4 (7 fields), Contact (8), booking chooser | No HELOC wording; HELOC and equity viewers get the same page |
| `/yt/dscr` | `/dscr/` | DSCR calculator pre-filled, result shown free | "Get My Real Rate", 4 fields | Sample numbers; static 6.75–7.50% rates; no footer, privacy or NMLS link |
| `/yt/rei` | `/realestateinvesting/` | BRRRR case study, gated PDF | 4-field form, booking chooser | Hero "$0"; page not in the site nav |
| `/yt/buyer` | `/fha/` | FHA explainer; calculator emailed after opt-in | 5-field form, booking chooser | Title says calculator, none on the page; the emailed one is .xlsx |

What works and should stay: the email typo check (caught `gmial.com`), no-credit-pull reassurance next to each form, the 4-field REI and FHA forms, the booking chooser on every success step, and a 404 page that points to the five tools. On a 375 px phone the homepage has no horizontal scroll.

### Page-by-page form tests

| Page | Form | Fields | lead_source / form_id | Email | Result |
| --- | --- | --- | --- | --- | --- |
| `/` | Savings calculator step 4 | 7 | DebtConsolidation / debt-savings-calculator | None | Saves. Debts now typed by the visitor; credit tier, HELOAN term, best time and lead source are still preset (R3-7); Schedule skips the form (R3-8) |
| `/` | Contact modal | 4 required | home-contact | None until #4 settings are set | Saves; loan fields blank (fixed) |
| `/dscr/` | "Get My Real Rate" | 4 | dscr / dscr-magnet | PDF snapshot + guide | Works; can be sent with an empty calculator (R3-3); Contact modal prefills 7.63% (R3-1) |
| `/fha/` | "Get the Free Calculator" | 5 | fha / fha-magnet | .xlsx | Works (#17) |
| `/realestateinvesting/` | "Send Me The Case Study" | 4 | real-estate-investing / rei-magnet | PDF | Works end to end |
| `/mortgage-calculator/` | "Want Darren to review these numbers?" | 4 required | mortgage-calculator-contact | None until #4 settings are set | Works, but the prefilled numbers are the calculator's starting values unless the visitor changed them (R3-10) |

### YouTube descriptions and pinned comments

30 most recent long-form videos (3 Mar – 22 Sep). No GetResponse links remain; every pinned comment uses a `-c` short link. Rechecked 26 Sep: these four are unchanged.

| Video | Published | Description link | Pinned link | Problem |
| --- | --- | --- | --- | --- |
| [The Fed Raised Rates](https://www.youtube.com/watch?v=xEEcVDxgc5k) | 22 Sep | `realdarrentsai.com/` | `/yt/equity-c` | Untracked; newest video |
| [Fixed Rate vs ARM](https://www.youtube.com/watch?v=Nw_UqwLkrpM) | 8 Sep | `realdarrentsai.com/`, line 7 | `/yt/buyer-c` (FHA) | Untracked, below the fold; ARM viewers sent to FHA |
| [HEI vs HELOC](https://www.youtube.com/watch?v=6Wj7FaqlPhU) | 25 Aug | `realdarrentsai.com/`, line 7 | `/yt/equity-c` | Untracked, below the fold |
| [How does a HELOC work?](https://www.youtube.com/watch?v=4Mbmp5K1zIc) | 18 Aug | `realdarrentsai.com/`, line 7 | `/yt/heloc-c` | Untracked, below the fold |

---

## Tracking and tools

*Baseline from 25–26 Sep, re-checked 27 Sep where noted.*

| Tool | Confirmed | Open |
| --- | --- | --- |
| Site tags | GTM-N7Z8Q4QF loads once; GA4 G-627RJ4FDSP via GTM; no raw Ads tag; CallRail swap.js loads | swap.js loads at end of body, not `<head>` (plan item 4) |
| GTM | Tags: Google tag, generate_lead, phone_click | No Calendly tags (#6); generate_lead has no parameters (#16); container quality shows 2 issues |
| GA4 | `generate_lead` arrives as a key event within a minute | Internal-traffic filter still in Testing: test sessions (`tt=internal`) are counted |
| Google Ads 645-417-8442 | "Real Darren Tsai (web) generate_lead" Primary; Phone Call Primary | $0 spend, one Video campaign "Not eligible, no ads" (ends 28 Sep); Phone Call sits in the "Other" goal; no booked-call action; security-tasks warning. `docs/MANUAL-TEST-RUNBOOK.md` says Ads is "live and spending": confirm which account, or correct the runbook |
| Bonzo | Leads arrive within a minute with state and source tags; routing correct (@36) | Returning leads no longer alert but aren't updated (#9); test leads still enter live campaigns (R3-4); Contact and Calculator leads get no campaign |
| CallRail | Swap works, including on the chooser's injected link | Pool "swapping too fast" (#8). Integrations: Google Ads, GA4, JS active; HubSpot and Business Profile not connected |
| Calendly | Inline widget, UTMs passed, booking event fires | Not in GA4 (#6); stall fallback doesn't fire (R3-2); prefill unconfirmed (R3-5) |
| Search Console | Sitemap submitted | 3 indexed / 15 not. `/investing`, `/homeowners`, `/agent-career` and a `/post/…` URL are "duplicate without canonical" and now 404. Google still shows the old title "Mortgage Calculator & Broker" |
| Business Profile | — | This login manages 0 businesses, yet Ads has a Profile "Directions" action, so it lives under another login |
| HubSpot | — | Not connected. Invite from Darren in liannemaxbalbastro@gmail.com, 24 Sep |

Quick wins: 301 the four old URLs (`/investing` → `/realestateinvesting/`, the rest → `/`) and request re-indexing of the homepage.

### CallRail setup

| Setting | Value | Note |
| --- | --- | --- |
| Pool size | 4 | Alert says too small |
| Tracking sources | All | Limit to paid, or give YouTube its own static number |
| Swap target | (714) 887-5432 | Correct; this is the number in the page HTML |
| Calls forward to | (714) 717-2245 | Recording, greeting and whisper on. California needs two-party consent: confirm the greeting says calls may be recorded |
| Texts | CallRail Messaging app | Texts to pool numbers don't reach Darren's phone |
| Other number | (714) 676-8170 | Not used on the site |

### Lead Sheet

[DarrenTsai | Calculator Leads](https://docs.google.com/spreadsheets/d/1DZ98FIyaF8hYi-c3FPMLVF71dVVnJWyejg4_J2ZkepI/edit): 4 real leads ever (May, May, Jul, Aug), none with attribution (they predate 16 Sep) and none from a short link yet.

| Tab | Notes |
| --- | --- |
| Leads (Contact modal) | Source now per page (fixed). Rate still prefilled on `/dscr/` (R3-1) and `/mortgage-calculator/` (R3-10); Term always 30 from `/dscr/`, `/fha/`, `/realestateinvesting/` (R3-9) |
| Debt Consolidation | Debts are now the visitor's own (fixed). Best Time and Lead Source are the form's defaults when untouched; savings priced at the 680+ tier; blank mortgage rate/term saved as 0 (R3-7) |
| Dscr | Rate and down payment stored as fractions (0.07, 0.25), loan amount as text ("$240,000"). Empty-calculator submits store DSCR 0.0 / Loan $0 (R3-3) |
| Real Estate Investing | Three blank columns at the end of the header row |
| Follow-ups | One test accepted with `you@gmail.com`, a placeholder address |

### Emails (Gmail and Resend)

All guide emails in the last 15 days show Delivered in Resend, within about a minute.

- The Contact modal still sends nothing to the visitor: the confirmation email is deployed but waits on the three settings under Fix first (#4).
- Guide email footers show Saxton's head office, (858) 925-2102 and info@saxtonmortgage.com, and "Dream Home Development Corporation DBA Saxton Mortgage, NMLS #2525913, operating only in California". A non-California lead reads that the company only operates in California.
- The Calendly link in each email has no UTMs.
- Resend lives in the `liannemaxbalbastro` workspace and failure alerts come from liannemaxbalbastro@gmail.com: lead delivery depends on personal accounts (same ownership decision as the Apps Script).
- Resend flags "link URLs don't match sending domain" (Calendly, Saxton links); minor.

### Follow-up readiness (CallRail + HubSpot; Bonzo tentative)

| Lead type | Lands in | Follow-up today | Needed |
| --- | --- | --- | --- |
| Guide form (DSCR, FHA, REI) | Sheet, Bonzo, guide email | Guide email + Bonzo campaign | `/api/lead` creates or updates the HubSpot contact by email, with attribution |
| Contact modal | Sheet, Bonzo (no campaign) | None | Same handoff, plus an instant confirmation email |
| Savings calculator | Sheet, Bonzo (no campaign) | None | Same |
| Phone call | CallRail → (714) 717-2245 | Darren answers or misses it | CallRail–HubSpot integration; missed-call text-back |
| Calendly booking | Calendly | Calendly's own emails | GA4 tags (#6); send bookings to HubSpot |

Build order once HubSpot is open: dedupe by email (#9), one lead_source per form (#5), a Test flag (#15), then the CallRail–HubSpot integration.

---

## Compliance and consistency

These need Darren and Saxton, not code.

| Item | What's live | Where |
| --- | --- | --- |
| Saxton NMLS | #1717191 in the site footer; #2525913 (Dream Home Development Corp DBA Saxton Mortgage, "operating only in California") in the DSCR disclaimer and every guide email | Footer vs `/dscr/` and emails |
| Phone | Site, Bonzo and third-party profiles use (714) 887-5432 (942-xxxx numbers are CallRail pool numbers). Guide emails show Saxton's (858) 925-2102 | Email footers |
| Title | "Senior Loan Officer" (site), "Home Loan Equity Advisor" (LinkedIn), "Senior Loan Consultant" (smarterhomebuyers.com) | Profiles |
| Location | Lake Forest, CA (Experience.com); Huntington Beach, CA (LinkedIn) | Profiles |
| SMS consent | Every form collects a phone with no consent line, while Bonzo texts | All forms |
| Privacy / licence links | `/dscr/` has no footer: no privacy policy or NMLS lookup link (also expected on Google Ads financial-services landing pages) | `/dscr/` |
| Rate figures | Homepage: live Freddie Mac rates. DSCR: now live, Freddie Mac PMMS plus a spread per down-payment tier (8.13 / 7.63 / 7.38% as of 24 Sep). FHA: "market range". New "Refi, Same Payoff Date" card adds more rate figures | Sign-off with Saxton |

---

## Code-level findings (from the refactor review)

| # | Status | What | Where |
| --- | --- | --- | --- |
| C1 | Fixed in code | Failed lead could vanish with no rescue email on the 500/413 paths | `netlify/functions/lead.mts` |
| C2 | Fixed (verified 27 Sep) | Double submit (#11) | `DebtSavingsCalculator.tsx` |
| C3 | Fixed | Rate and term collected but unused; now used and saved | `DebtSavingsCalculator.tsx` |
| C4 | Fixed | `calendly_open` never fired from buttons; now fires from `booking-chooser.js` | `public/attribution.js`, `public/booking-chooser.js` |
| C5 | Fixed | FHA mobile "Call" opened Calendly; now dials | `public/fha/index.html` |

---

## Test data and cleanup

Test identities used: `liannemaxbalbastro+<case>@gmail.com`, `lmbalbastro+<case>@gmail.com`, `lianne_balbastro+<case>@dlsu.edu.ph`, phones (714) 555-01xx. Use a new `+tag` per test, because Bonzo rejects an email it has already seen (#9).

- [x] Bonzo: round 1 and round 2 test prospects deleted
- [x] Calendly: TEST R2 Booking (29 Oct 11:45am PT) cancelled
- [x] Sheet: all test rows deleted 30 Sep (Leads, Debt Consolidation, Dscr, FHA, Real Estate Investing, Follow-ups). Only the 4 real leads remain: Leslie Sutton, Kent Devereaux (Leads), Steven Salas (Debt Consolidation), Husain Habib (Real Estate Investing). Debug tab left as is (trimmed daily)
- [x] Work browser: site data for realdarrentsai.com cleared 30 Sep (localStorage, cookies)
- [x] HubSpot invite accepted 29 Sep (see "HubSpot, 29 Sep")

Not checked: FHA email inbox placement for lmbalbastro@gmail.com (Resend shows Delivered), the Business Profile (not on this login), a real iPhone/Safari, Lighthouse scores.

Tooling note: an extension in the work Chrome (likely a password manager) opens over any focused form field and blocks automation. Run form tests in a clean profile or the Claude in-app browser.
