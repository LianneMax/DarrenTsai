/**
 * 31 Oct QA plan, item 8: the copy batch.
 *
 * Each check pins one sentence a visitor read that was wrong or confusing:
 * a duplicated ZIP note, an "LTV" acronym, a "two questions" step with three,
 * a promise of contact nobody is notified to keep, and an "instant" PDF that is
 * actually emailed.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EquitySnapshot } from '../src/components/PageParts';
import { serviceAreaWording } from '../src/utils/serviceArea';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('home equity step 1', () => {
  it('says the mortgage share in plain words, not "LTV"', () => {
    const html = renderToStaticMarkup(<EquitySnapshot hv={650000} mb={305500} />);
    expect(html).not.toContain('LTV');
    expect(html).toContain('You owe about <strong>47%</strong> of the home');
  });

  it('drops the share line when there is no balance or the balance is above the value', () => {
    expect(renderToStaticMarkup(<EquitySnapshot hv={650000} mb={0} />)).not.toContain('You owe about');
    expect(renderToStaticMarkup(<EquitySnapshot hv={300000} mb={350000} />)).not.toContain('You owe about');
  });

  it('does not repeat the ZIP label under the State field', () => {
    const views = read('src/components/HomeEquityViews.tsx');
    expect(views).not.toContain('<p className="dcp-hint">ZIP of the home');
  });

  it('moves the GeoNames credit off the form and onto the legal page', () => {
    expect(read('src/components/ZipFeedback.tsx')).not.toContain('GeoNames');
    const legal = read('public/legal/index.html');
    expect(legal).toContain('https://www.geonames.org/export/zip/');
    expect(legal).toContain('CC BY 3.0');
  });
});

describe('FHA modal', () => {
  it('counts its three questions and asks a buyer where they are buying', () => {
    const fha = read('public/fha/index.html');
    expect(fha).not.toContain('Two quick questions about where the home is.');
    expect(fha).toContain('Three quick questions');
    expect(serviceAreaWording('fha-magnet').legend).toBe('Where are you buying?');
    expect(read('public/service-area.js')).toContain("legend: 'Where are you buying?'");
  });
});

describe('out-of-market pages', () => {
  it.each(['public/out-of-market-primary/index.html', 'public/out-of-market-dscr/index.html'])(
    '%s promises no follow-up nobody is notified to make', (file) => {
      expect(read(file)).not.toContain('he will be in touch');
    });
});

describe('/realestateinvesting/', () => {
  const rei = read('public/realestateinvesting/index.html');
  it('says the case study is emailed, not instant or downloaded', () => {
    expect(rei).not.toMatch(/instant PDF/i);
    expect(rei).not.toContain('download the case study');
    expect(rei).toContain('Free PDF, sent by email');
  });
  it('has no em dash in the page title', () => {
    expect(rei.match(/<title>([^<]*)<\/title>/)?.[1]).not.toContain('—');
  });
});
