/**
 * Resend rejected 4 sends on 16 Sep with 422 "Invalid `to` field". By then the
 * lead is saved and the visitor has gone, so the only useful place to catch a
 * bad domain is the form. These tests pin the two things that matter: it catches
 * the common typos, and it stays quiet about anything it isn't sure of.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Result = { kind: 'typo' | 'undeliverable'; suggestion: string | null; email: string | null } | null;
let check: (v: string) => Result;
let message: (r: Result) => string;

beforeAll(() => {
  const src = readFileSync(resolve(__dirname, '../public/email-suggest.js'), 'utf8');
  const g: Record<string, unknown> = {};
  new Function('window', 'document', 'module', src)(g, undefined, undefined);
  const api = g.dtEmailSuggest as { check: typeof check; message: typeof message };
  check = api.check;
  message = api.message;
});

describe('catches what actually goes wrong', () => {
  it.each([
    ['max@gmial.com', 'max@gmail.com'],
    ['max@gmai.com', 'max@gmail.com'],
    ['max@gnail.com', 'max@gmail.com'],
    ['max@gmail.con', 'max@gmail.com'],
    ['max@yaho.com', 'max@yahoo.com'],
    ['max@hotmial.com', 'max@hotmail.com'],
    ['max@outlok.com', 'max@outlook.com'],
    ['max@iclod.com', 'max@icloud.com'],
  ])('%s -> %s', (input, expected) => {
    const r = check(input);
    expect(r?.kind).toBe('typo');
    expect(r?.email).toBe(expected);
  });

  it('flags addresses that can never receive mail', () => {
    expect(check('jane@example.com')?.kind).toBe('undeliverable');
    expect(check('test@test.com')?.kind).toBe('undeliverable');
    expect(message(check('jane@example.com'))).toMatch(/can't receive email/);
  });

  it('keeps the local part, including plus addressing', () => {
    expect(check('max+loans@gmial.com')?.email).toBe('max+loans@gmail.com');
  });
});

describe('stays quiet when unsure — a wrong guess must not stop a real address', () => {
  it.each([
    'max@gmail.com',
    'darren@realdarrentsai.com',
    'max@kocah.com',
    'someone@saxtonmortgage.com',
    'max@a-very-unusual-domain.io',
    'max@mail.ru',
    'max@protonmail.ch', // a real Proton domain, 2 edits from protonmail.com
    'max@',
    'max',
    '',
    'max@gmail',
  ])('%s', (input) => {
    expect(check(input)).toBeNull();
  });

  it('does not turn one real provider into another', () => {
    // 'aol.com' and 'me.com' are short; a 2-edit match would rewrite real domains.
    expect(check('max@aim.com')).toBeNull();
    expect(check('max@my.com')).toBeNull();
  });

  it('survives junk input instead of throwing', () => {
    for (const v of ['@@@', 'a@b@c.com', '  max@gmail.com  ']) expect(() => check(v)).not.toThrow();
  });
});

describe('wiring', () => {
  const pages = ['../index.html', '../debt-consolidation/index.html', '../home-equity/index.html', '../adu/index.html',
    '../mortgage-calculator/index.html', '../public/dscr/index.html', '../public/fha/index.html', '../public/realestateinvesting/index.html'];

  it.each(pages)('%s loads the shared checker', (page) => {
    expect(readFileSync(resolve(__dirname, page), 'utf8')).toContain('/email-suggest.js');
  });

  it('leaves React-owned inputs to React', () => {
    const src = readFileSync(resolve(__dirname, '../public/email-suggest.js'), 'utf8');
    expect(src).toContain("closest('#root')");
  });

  it.each(['../src/components/LeadForm.tsx', '../src/components/PageParts.tsx', '../src/components/DebtPageViews.tsx'])(
    '%s renders its own hint on blur, once the tap has landed',
    (file) => {
      const src = readFileSync(resolve(__dirname, file), 'utf8');
      expect(src).toMatch(/onBlur=\{\(e\) => hintAfterBlur\(e\.target\.value, (v\.)?setEmailHint\)\}/);
      expect(src).toContain('email-hint');
    },
  );
});

/**
 * The hint used to appear on the press of the next tap, move the layout a line,
 * and lose the tap: the release landed on another element. afterPress holds it
 * until the click has landed (9 Oct walkthroughs; see public/email-suggest.js).
 */
describe('the hint waits for the tap that took focus away', () => {
  let afterPress: (fn: () => void) => void;
  beforeAll(() => {
    const src = readFileSync(resolve(__dirname, '../public/email-suggest.js'), 'utf8');
    const g: Record<string, unknown> = {};
    new Function('window', 'document', 'module', src)(g, document, undefined);
    afterPress = (g.dtEmailSuggest as { afterPress: typeof afterPress }).afterPress;
  });

  it('shows at once after a keyboard Tab, when nothing is pressed', () => {
    const fn = vi.fn();
    afterPress(fn);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('waits for the click to land, then shows after its handlers', () => {
    vi.useFakeTimers();
    try {
      const target = document.body.appendChild(document.createElement('button'));
      const order: string[] = [];
      target.addEventListener('click', () => order.push('click'));
      target.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      afterPress(() => order.push('hint'));
      expect(order).toEqual([]);
      target.click();
      vi.advanceTimersByTime(1);
      expect(order).toEqual(['click', 'hint']);
      target.remove();
    } finally { vi.useRealTimers(); }
  });

  it('gives up waiting when the press was a scroll and never became a click', () => {
    vi.useFakeTimers();
    try {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      const fn = vi.fn();
      afterPress(fn);
      vi.advanceTimersByTime(799);
      expect(fn).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2);
      expect(fn).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
});
