import type { LandingConfig } from './components/LandingPage';
import HomeValueSearch from './components/HomeValueSearch';

/**
 * Route slug -> landing page config.
 * Each `source` is what Apps Script reads to write the right sheet + Bonzo tag,
 * which routes the lead into the matching Bonzo campaign.
 */
export const LANDINGS: Record<string, LandingConfig> = {
  // P1 — HELOC vs HEI / homeownership equity (highest priority)
  'heloc-hei': {
    source: 'heloc-hei',
    headline: 'HELOC vs. HEI: Unlock Your Home Equity the Smart Way',
    subheadline: 'See what your home is worth, then compare a HELOC against a Home Equity Investment: no monthly payments, no guesswork.',
    body: "You've built equity. The question is how to use it without wrecking your low mortgage rate. This free breakdown shows you both options side by side, with real numbers.",
    bullets: [
      'Your estimated home value + how much equity you can access',
      'HELOC vs HEI: monthly payments, costs, and trade-offs compared',
      'Which option fits your goals: pay off debt, renovate, or invest',
    ],
    magnetName: 'HELOC vs HEI Comparison + Home Value Report',
    ctaLabel: 'Get My Free Equity Report',
    extra: <HomeValueSearch />,
  },

  // P2 — DSCR for investors
  // NOTE: the primary DSCR experience is the standalone interactive calculator at
  // /dscr (public/dscr/index.html), which has its own lead capture + delivers the
  // DSCR Rate & Cash Flow Guide PDF. This React landing is a simple intro whose CTA
  // sends people into that calculator. Point YouTube links directly at
  // /dscr to skip this intro.
  'dscr': {
    source: 'dscr',
    headline: 'DSCR Loans for Investors: Qualify on the Property, Not Your Income',
    subheadline: 'No tax returns. No W-2s. Get financed based on the rental income of the property itself.',
    body: 'DSCR (Debt Service Coverage Ratio) loans let real estate investors scale without the income-doc headaches. Run the free calculator to see if your next deal cash-flows, then get the DSCR Rate & Cash Flow Guide.',
    bullets: [
      'Calculate your DSCR ratio in seconds',
      'See the minimum rent your property needs to qualify',
      'Understand rates, down payment, and reserves for investor loans',
    ],
    magnetName: 'DSCR Calculator + Rate & Cash Flow Guide',
    ctaLabel: 'Open the DSCR Calculator',
    ctaHref: '/dscr',
  },

  // P3 — Self-employed / bank statement loans (purchase)
  'self-employed': {
    source: 'self-employed',
    headline: 'Self-Employed? Buy a Home Without Tax Returns',
    subheadline: 'Bank statement loans qualify you on your real cash flow, not your write-offs.',
    body: "If you're a business owner or 1099 earner, your tax returns work against you at the bank. Bank statement loans use 12–24 months of deposits instead. See what you could qualify for.",
    bullets: [
      'Qualify using bank statements, not tax returns',
      'Ideal for business owners, 1099, gig, and commission earners',
      'Estimate your buying power based on real deposits',
    ],
    magnetName: 'Bank Statement Loan Qualifier',
    ctaLabel: 'See What I Can Qualify For',
  },

  // P4 — FHA calculator (lowest priority; feeds monthly newsletter)
  'fha': {
    source: 'fha',
    headline: 'Free FHA Mortgage Calculator',
    subheadline: 'Estimate your FHA monthly payment and how much home you can afford, stress-free.',
    body: 'FHA loans make homeownership possible with as little as 3.5% down. Use the free calculator to run your numbers, then get on the monthly newsletter for rate updates and tips.',
    bullets: [
      'Estimate your full FHA monthly payment (incl. MIP)',
      'See how much home you can afford',
      'Plus: monthly rate & market updates from Darren',
    ],
    magnetName: 'FHA Mortgage Calculator',
    ctaLabel: 'Download the FHA Calculator',
  },
};
