/**
 * Resend rejected 4 sends on 16 Sep with 422 "Invalid `to` field". By then the
 * lead is saved and the visitor has gone, so the only useful place to catch a
 * bad domain is the form. These tests pin the two things that matter: it catches
 * the common typos, and it stays quiet about anything it isn't sure of.
 */
import { describe, it, expect, beforeAll } from 'vitest';
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
  const pages = ['../index.html', '../public/dscr/index.html', '../public/fha/index.html', '../public/realestateinvesting/index.html'];

  it.each(pages)('%s loads the shared checker', (page) => {
    expect(readFileSync(resolve(__dirname, page), 'utf8')).toContain('/email-suggest.js');
  });

  it('leaves React-owned inputs to React', () => {
    const src = readFileSync(resolve(__dirname, '../public/email-suggest.js'), 'utf8');
    expect(src).toContain("closest('#root')");
  });

  it.each(['../src/components/LeadForm.tsx', '../src/components/DebtSavingsCalculator.tsx'])(
    '%s renders its own hint on blur',
    (file) => {
      const src = readFileSync(resolve(__dirname, file), 'utf8');
      expect(src).toContain('checkEmail(e.target.value)');
      expect(src).toContain('email-hint');
    },
  );
});
