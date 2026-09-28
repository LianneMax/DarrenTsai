# DarrenTsai
A clean, modern mortgage amortization calculator and lead capture web app for Darren Tsai (NMLS# 2438102), Southern California Mortgage &amp; Real Estate Broker. Built with React, TypeScript, and CSS. Features real-time amortization calculations, a full payment schedule, and a Google Sheets lead funnel. Deployed on Netlify.

## Commands

```bash
netlify dev          # functions + Vite together, which is what you want locally
npm test             # vitest run
npm run lint         # eslint .
npm run build        # tsc -b && vite build
npm run test:layout  # real-browser layout check, by hand (see below)
```

**Run `npm run test:layout` before pushing any change to a page or the CSS.**
It builds the site, serves it, and drives Chromium over all five pages at nine
widths from 320px to 1440px, failing on any sideways scroll or any form field
under 16px at phone widths (which is what makes iOS zoom mid-form). It is
deliberately not part of `npm test` or the Netlify build: it needs a browser
binary and a build, and a deploy that fails for want of Chromium is worse than
the bug it looks for. `npm test` cannot do this job at all, because jsdom has no
layout engine.

See `CLAUDE.md` for how the lead flow fits together, and `audit.md` for the
open items and their history.
