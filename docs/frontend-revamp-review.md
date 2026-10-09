# Frontend revamp: review against the live setup (8 Oct 2026)

Review of "Darren Tsai Frontend Revamp: Comprehensive Source of Truth" (sections 2 to 20) against the repo and the Google Ads launch Kocah expects end of week / early next.

## Verdict
Direction is sound and compatible with the repo's backend (same /api/lead, Apps Script, Sheets, Follow-ups queue, HubSpot push, Bonzo, Resend). The risk is timing: the revamp moves the debt calculator off the homepage, and Kocah is about to build ads that point to the homepage.

## Rule for the launch
Ads launch on the pages that exist now. The revamp ships later in phases. Any ad URL that a phase changes is switched in the same release, coordinated with Kocah.

## Phases
What is left of these phases, and everything else before ads, is tracked in `docs/LAUNCH-CHECKLIST.md`.

0. Before launch (small): add /debt-consolidation/ serving the same debt calculator as /. Give Kocah /debt-consolidation/ as the debt ads URL so the later homepage change never touches a live ad URL. Canonical on each page to itself. Add to sitemap. **Built 8 Oct.**
1. Backend plumbing for new sources: home-equity and adu in SOURCE_SCHEMAS, new Sheet tabs, Follow-ups routes, CONTACT_SOURCES, HubSpot field mapping (L12 loan fields), licensed/test handling, contextual confirmation emails (extend send-contact-confirmation, no parallel system). Debt keeps its existing source value. Sheet column order follows docs/lead-sheet-schema.md (one planned migration).
2. Debt Consolidation refinements on /debt-consolidation/ (labels, optional mortgage fields, result hierarchy, remove Best Time to Call and How did you hear about us). Formulas from the repo only. **Built 9 Oct, on `main`.**
3. /home-equity/ (3 steps). Then repoint /yt/heloc and /yt/equity and any HELOC/equity ads to it, query strings preserved. **Built 9 Oct on the same branch, not live**, with the home-equity part of phase 1 (its schema, tab, Bonzo tags, contact source); the /yt/ links are repointed in netlify.toml. Ads move with Kocah.
4. Homepage becomes the goal hub. Same release: replace every /#savings link with /debt-consolidation/. Checked in the repo on 8 Oct: those are the four links in Nav.tsx, Hero.tsx's scroll button, and the `nav-savings` / `hero-savings` early-click keys; the three static landing pages do not link to /#savings. **Built 9 Oct, on `main`** (`src/components/HomeHub.tsx`). "Not sure where to start?" opens the existing contact modal (home-contact, Leads tab) rather than a new form. No ads point at /, so the change touches no ad URL.
5. /adu/. **Built 9 Oct, on `main`**, with the adu part of phase 1 (its schema, "ADU" tab, Bonzo tags and campaign property, `adu-contact` source) and /yt/adu, /yt/adu-c. Built before phase 4 so the homepage's Renovate / ADU card has a real page to link to.
6. Navigation polish for DSCR/FHA/REI/Mortgage Calculator; no rebuilds. **Built 10 Oct:** one `CALCULATORS` list in `Nav.tsx` for the dropdown and the drawer, and a `landing` nav (Contact and Book a Call only) on /debt-consolidation/, /home-equity/ and /adu/, as in preview v4. The static pages already had that nav; their logo now links to `/` instead of the www host.

## Every new page must inherit the speed and tracking work already shipped
attribution.js async in head; CallRail swap.js synchronous at end of body; Outfit Fallback font; hero visible at first paint (no opacity-0 entry); pre-rendered hero where React renders the page; no render-blocking CSS; GTM loads HubSpot (Window Loaded) automatically; generate_lead fired only on confirmed receipt with a form_id; no PII in the dataLayer.

## Sitemap and search
Update public/sitemap.xml when each new page goes live (/debt-consolidation/, /home-equity/, /adu/). Resubmit the sitemap in Search Console. No catch-all redirect; unknown paths stay real 404s. Netlify redirects only for aliases that change (/yt/heloc, /yt/equity).

## Dead ends to avoid
- /#savings links break the moment the homepage stops hosting the calculator (phase 4).
- Wireframe nav shows About, Resources, Contact and an Education section; no such pages exist. Use homepage anchors or build them; never link to a missing page. (Preview v4 uses About Me / Reviews anchors and sends "Explore resources" to /realestateinvesting/, which works.)
- Home Equity product cards' "Learn More" must expand in place or go to a real page. (Preview v4 expands in place.)
- No "download your guide" button without a deliverable file and email.
- Every funnel ends with confirmation, booking and call options.

## Codex design preview v4 (8 Oct), page by page
Source: Max's Codex session 2026-10-08, darren-frontend-preview-v4.html (static design preview, sample numbers, nothing submits; not in this repo). Checked by clicking every page, step and CTA.

- Homepage: hero "Make your next move with confidence", five goal cards (Invest opens a DSCR vs Real Estate Investing chooser), "Not sure where to start?" opens a call/schedule chooser, About Me, 9 real reviews, Calculators & Tools, Education, Book a Call. Gap: "Not sure" captures no lead or free text; the brief wanted a general-guidance form. Decide: chooser only, or add a short form to the Leads tab. Darren's subtitle reads "Mortgage & Real Estate"; confirm the approved title.
- Debt Consolidation: hero "Boost Your Monthly Cashflow", 4 steps kept with individual debt rows, weighted average rate, equity bar, optional rate/term, Today vs Cash-out refi vs Same-payoff refi vs Fixed HELOAN cards, credit tier and term controls, breakdowns. Fixes needed: step 4 still has Best Time to Call and How did you hear (remove, per Max); cards say "$X/mo lower payment" (use "Savings", per Max); the confirmation recap shows Estimated equity / Amount exploring / Goal, which belongs to Home Equity; debt recap should show total debt, today's payment and the chosen option.
- Home Equity: 3 steps as briefed. Goal and amount on step 1, HELOC and fixed loan cards plus cash-out note, optional preference, contact, recap. Matches the schema.
- ADU: home value, balance, project cost, amount to finance, purpose (ADU for family, Rental ADU, Renovation, Other), equity snapshot, remaining-budget note, financing paths, then contact and recap. Matches the schema.
- FHA: estimator kept with full breakdown, guide form, plus a new "Have Darren Review My Payment" form. Gap: guide form drops Credit Score (keep it). Two forms on one page need distinct Form IDs.
- DSCR: rent / PITIA explainer, inputs, tier slider, result, then "Get My Real Rate" opens the review form. Live DSCR also has the guide form; confirm the preview keeps it (it does not show one).
- Mortgage Calculator: same inputs and outputs; "Want Darren to Review These Numbers?" opens name/email/phone/state only. Gap: the live form and Leads tab carry Goals / Target Outcome / Timeline, and the brief keeps "What are you hoping to accomplish?" and "Anything else Darren should know?". Keep them.
- Real Estate Investing: case-study page kept, with a link to the DSCR calculator.
- All forms: state list is a 3-state sample; production keeps the full list and licensed-state check.

## Needed from Kocah because of the revamp
- Loan Type options that also cover HELOC, home equity loan, cash-out refinance and ADU/renovation, so the property is set up once.
- Use /debt-consolidation/ for debt ads; HELOC/equity ads start on / and move to /home-equity/ when it is live.
