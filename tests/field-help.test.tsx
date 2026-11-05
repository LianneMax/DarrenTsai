/**
 * The "Not sure? Where to find it" tips under the home value and balance
 * fields (6 Nov 2026, P2 confidence review). They open on request, never
 * suggest a number, and keep the inputs themselves empty.
 */
import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { FieldHelp, MoneyInput, HOME_VALUE_TIPS, MORTGAGE_BALANCE_TIPS } from '../src/components/PageParts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('field help', () => {
  it('starts closed, opens and closes on the toggle, and names what it controls', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<FieldHelp id="he-value" tips={HOME_VALUE_TIPS} />));
    const toggle = host.querySelector('button')!;
    const panel = host.querySelector<HTMLUListElement>('#he-value-help')!;
    expect(toggle.getAttribute('aria-controls')).toBe('he-value-help');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);
    await act(async () => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hidden).toBe(false);
    expect(panel.querySelectorAll('li')).toHaveLength(HOME_VALUE_TIPS.length);
    expect(toggle.textContent).toBe('Hide tips');
    await act(async () => toggle.click());
    expect(panel.hidden).toBe(true);
    await act(async () => root.unmount());
    host.remove();
  });

  it('suggests no figure of its own and says a close estimate is fine', () => {
    const all = [...HOME_VALUE_TIPS, ...MORTGAGE_BALANCE_TIPS].join(' ');
    // Rounding guidance names a step size, never a home value or balance.
    expect(all.match(/\$[\d,]+/g)).toEqual(['$5,000', '$10,000']);
    expect(all).toMatch(/close estimate is fine/i);
    expect(all).not.toMatch(/—/);
  });

  it('leaves the money input empty when help is attached', () => {
    const html = renderToStaticMarkup(<MoneyInput id="he-balance" label="Current Mortgage Balance" value="" onChange={() => {}} placeholder="e.g. 350,000" help={MORTGAGE_BALANCE_TIPS} />);
    expect(html).toContain('value=""');
    expect(html).toContain('aria-controls="he-balance-help"');
  });
});
