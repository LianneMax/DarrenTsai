/**
 * Writes src/utils/phone-metadata.json: libphonenumber-js "min" metadata cut
 * down to the +1 calling code (31 Oct QA plan, item 9).
 *
 * Every lead form formats the phone as a 10-digit US number before it is
 * validated, so only +1 data can ever be consulted. The full min metadata
 * covers every country (about 84KB) and was preloaded on the equity and ADU
 * pages; the +1 slice is about 4KB. All the countries that share +1 are kept
 * (US, Canada, the Caribbean), so results match the full library exactly.
 *
 * Run with: npm run phone-metadata (after upgrading libphonenumber-js).
 * tests/phone-metadata.test.ts fails if the committed file is out of date.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function nanpaMetadata() {
  const full = JSON.parse(readFileSync(require.resolve('libphonenumber-js/metadata.min.json'), 'utf8'));
  const codes = full.country_calling_codes['1'];
  return {
    version: full.version,
    country_calling_codes: { 1: codes },
    countries: Object.fromEntries(codes.map((country) => [country, full.countries[country]])),
  };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const out = 'src/utils/phone-metadata.json';
  const json = JSON.stringify(nanpaMetadata());
  writeFileSync(out, json + '\n');
  console.log(`${out}: ${json.length.toLocaleString()} bytes`);
}
