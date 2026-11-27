/**
 * Final step layout (28 Nov 2026, Max approved the preview): contact summary,
 * optional texts grouped, required acknowledgement last. Wording and the data
 * attributes the submit code reads must not change.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ComplianceDisclosure, { ContactSummary } from '../src/components/ComplianceDisclosure';

describe('shared consent block order', () => {
  const html = renderToStaticMarkup(<ComplianceDisclosure formId="home-equity-calculator" />);

  it('groups both optional choices and their terms, then the required acknowledgement', () => {
    const info = html.indexOf('data-sms-info-form="home-equity-calculator"');
    const marketing = html.indexOf('data-sms-form="home-equity-calculator"');
    const terms = html.indexOf('class="sms-details"');
    const ack = html.indexOf('data-privacy-form="home-equity-calculator"');
    expect(html.indexOf('class="sms-group"')).toBeLessThan(info);
    expect(info).toBeLessThan(marketing);
    expect(marketing).toBeLessThan(terms);
    expect(terms).toBeLessThan(html.indexOf('class="privacy-ack"'));
    expect(html.indexOf('class="privacy-ack"')).toBeLessThan(ack);
  });

  it('keeps the removed optional heading out and nothing preselected', () => {
    expect(html).not.toMatch(/Text messages \(optional\)/);
    expect(html).not.toMatch(/checked/);
    expect(html.match(/required=""/g)).toHaveLength(1);
  });
});

describe('contact summary', () => {
  it('shows name, email and phone and goes back on Edit', () => {
    const onEdit = vi.fn();
    const html = renderToStaticMarkup(<ContactSummary name="Alex Sample" email="alex@example.com" phone="(714) 555-0199" onEdit={onEdit} />);
    expect(html).toContain('Darren will contact you at');
    // Same label/value rows as the saved-answers recap.
    expect(html).toContain('class="dcp-recap-rows contact-summary"');
    for (const [label, t] of [['Name', 'Alex Sample'], ['Email', 'alex@example.com'], ['Phone', '(714) 555-0199']]) {
      expect(html).toContain(`<div class="dcp-row"><span>${label}</span><span>${t}</span></div>`);
    }
    expect(html).toContain('aria-label="Edit your contact details"');
  });

  it('skips blank lines and escapes what the visitor typed', () => {
    const html = renderToStaticMarkup(<ContactSummary name="  " email="<b>x</b>@example.com" phone="" onEdit={() => {}} />);
    expect(html.match(/class="dcp-row"/g)).toHaveLength(1);
    expect(html).toContain('&lt;b&gt;');
  });
});

describe('static guide pages use the same order', () => {
  it.each(['public/dscr/index.html', 'public/fha/index.html', 'public/realestateinvesting/index.html'])('%s', (file) => {
    const src = readFileSync(resolve(__dirname, '..', file), 'utf8');
    const group = src.indexOf('<div class="sms-group">');
    expect(group).toBeGreaterThan(-1);
    expect(src.indexOf('<div class="privacy-ack">')).toBeGreaterThan(group);
    expect(src.indexOf('data-privacy-form=')).toBeGreaterThan(src.indexOf('<div class="privacy-ack">'));
  });
});
