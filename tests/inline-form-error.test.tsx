/**
 * Validation messages show on the page, not in a pop-up (28 Nov 2026, Max:
 * consistent errors on every form). The dialog is kept only for an uncertain
 * save, which needs a decision rather than a correction.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { InlineFormError } from '../src/components/PageParts';

describe('InlineFormError', () => {
  it('is announced, focusable and says the entries are kept', () => {
    const html = renderToStaticMarkup(<InlineFormError message="Please enter a valid email address." />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('<strong>Check your details.</strong> Please enter a valid email address.');
    expect(html).toContain('Your entries are still here.');
  });

  it('renders nothing without a message', () => {
    expect(renderToStaticMarkup(<InlineFormError message={null} />)).toBe('');
    expect(renderToStaticMarkup(<InlineFormError message="" />)).toBe('');
  });
});

describe('every funnel uses it, and the dialog only for an uncertain save', () => {
  const src = (f: string) => readFileSync(resolve(__dirname, '..', 'src/components', f), 'utf8');
  it.each(['HomeEquityCalculator.tsx', 'DebtSavingsCalculator.tsx'])('%s', (f) => {
    expect(src(f)).toMatch(/message=\{errorKind === 'save' \? errorMsg : null\}/);
    expect(src(f)).toMatch(/formError: errorKind === 'validation' \? errorMsg : null/);
  });
  it('the views render it at the top of the step', () => {
    expect(src('HomeEquityViews.tsx')).toContain('<InlineFormError message={v.formError} />');
    expect(src('DebtPageViews.tsx')).toContain('<InlineFormError message={v.formError} />');
    expect(src('AduViews.tsx')).toContain('<InlineFormError className="adu-inline-error form-inline-error"');
  });
  it('Back is "← Back" on every step', () => {
    for (const f of ['HomeEquityViews.tsx', 'DebtPageViews.tsx', 'PageParts.tsx']) {
      for (const m of src(f).matchAll(/back="([^"]*)"/g)) expect(m[1], f).toBe('← Back');
    }
  });
});
