/**
 * 31 Oct QA plan, item 9: phone validation ships +1 metadata only.
 *
 * isValidUsPhone must give the same answer as the full library's
 * isValidPhoneNumber(value, 'US') for anything the forms can produce, and the
 * committed metadata must match the installed library (rerun
 * `npm run phone-metadata` after an upgrade).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { isValidPhoneNumber } from 'libphonenumber-js';
import { formatUsPhone, isValidUsPhone } from '../src/utils/phone';
// @ts-expect-error plain .mjs build script, no types
import { nanpaMetadata } from '../scripts/build-phone-metadata.mjs';

const committed = JSON.parse(readFileSync(resolve(__dirname, '../src/utils/phone-metadata.json'), 'utf8'));

describe('+1 phone metadata', () => {
  it('is the current library slice for every +1 country', () => {
    expect(committed).toEqual(nanpaMetadata());
    expect(committed.country_calling_codes['1']).toEqual(expect.arrayContaining(['US', 'CA', 'PR']));
    expect(JSON.stringify(committed).length).toBeLessThan(10_000);
  });

  it('agrees with the full library on formatted 10-digit numbers', () => {
    // Every area-code shape (N00 to N99) with ordinary, 555 and 0/1 exchanges.
    const samples: string[] = [];
    for (let area = 200; area <= 999; area += 7) {
      for (const exchange of ['555', '867', '123', '011', '212']) {
        samples.push(formatUsPhone(`${area}${exchange}0142`));
      }
    }
    samples.push('(714) 555-0123', '(604) 555-1234', '(787) 555-1234', '(123) 456-7890', '(000) 000-0000', '(714) 555', '');
    const mismatches = samples.filter((v) => isValidUsPhone(v) !== isValidPhoneNumber(v, 'US'));
    expect(mismatches).toEqual([]);
    expect(isValidUsPhone('(714) 867-5309')).toBe(true);
    expect(isValidUsPhone('(123) 456-7890')).toBe(false);
  });

  it('no component imports the full libphonenumber-js metadata', () => {
    const dir = resolve(__dirname, '../src');
    const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => /\.(ts|tsx)$/.test(f));
    const offenders = files.filter((f) => /from 'libphonenumber-js'/.test(readFileSync(resolve(dir, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});

describe('ADU explorer images', () => {
  it('lists the phone-sized copies in srcset', () => {
    const src = readFileSync(resolve(__dirname, '../src/components/AduHouseExplorer.tsx'), 'utf8');
    expect(src).toContain('srcSet={srcSet(scene)}');
    for (const f of ['house-3d-420', 'house-3d-600', 'adu-scenes/detached-420', 'adu-scenes/renovation-720']) {
      expect(() => readFileSync(resolve(__dirname, `../public/${f}.webp`))).not.toThrow();
    }
  });
});
