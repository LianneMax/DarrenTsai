/**
 * Generates the small image variants from public/darren.jpg.
 *
 * The source is a 320x320 PNG (despite the .jpg name) at 134KB. It was being
 * served as the favicon on every page and as a 36px avatar, both of which
 * download the full 134KB. These derivatives keep Darren's headshot everywhere
 * it appeared and just stop shipping ten times the pixels needed.
 *
 * Run with: npm run images
 * Commit the output; this is not part of the build so a deploy never depends
 * on sharp being installable in CI.
 */
import sharp from 'sharp';
import { readFileSync, statSync } from 'node:fs';

const SRC = 'public/darren.jpg';

const OUTPUTS = [
  // Browser tab. 32px is the standard favicon render size; 2x covers retina.
  { file: 'public/favicon-32.png', size: 32 },
  { file: 'public/favicon-64.png', size: 64 },
  // iOS home screen.
  { file: 'public/apple-touch-icon.png', size: 180 },
  // The 36px avatar in the nav, footer and testimonial blocks, at 2x.
  { file: 'public/darren-avatar.png', size: 72 },
];

const before = statSync(SRC).size;
console.log(`source ${SRC}: ${before.toLocaleString()} bytes (320x320)\n`);

let total = 0;
for (const { file, size } of OUTPUTS) {
  await sharp(readFileSync(SRC))
    .resize(size, size, { fit: 'cover' })
    .png({ compressionLevel: 9, palette: true })
    .toFile(file);
  const bytes = statSync(file).size;
  total += bytes;
  console.log(`  ${file.padEnd(32)} ${String(size).padStart(3)}px  ${bytes.toLocaleString().padStart(7)} bytes`);
}

console.log(`\nfavicon: ${before.toLocaleString()} -> ${statSync('public/favicon-32.png').size.toLocaleString()} bytes`);
console.log(`all four derivatives combined: ${total.toLocaleString()} bytes`);

// The goal hub added a 96px hero portrait and a 240px About portrait, both
// pointing at the original 134KB PNG. PSI estimated 123–126KB wasted on 10 Oct.
// Separate WebP sizes cover the actual slots without upscaling the 320px source.
for (const size of [96, 192, 240, 320]) {
  const file = `public/darren-${size}.webp`;
  await sharp(readFileSync(SRC)).resize(size, size).webp({ quality: 82, effort: 6 }).toFile(file);
  console.log(`${file}: ${statSync(file).size.toLocaleString()} bytes`);
}

/**
 * The FHA hero carousel, as WebP (audit L4, 30 Sep).
 *
 * The six illustrations are 840x840 PNGs with alpha at ~240KB each, and the
 * first one is the /fha/ LCP element: on a throttled phone it was most of the
 * page's 14.9s Lighthouse LCP. WebP keeps the alpha at a third of the bytes.
 * The PNGs stay as the sources (drop a new one in and rerun this); the page
 * only references the .webp files. Every browser the site supports reads WebP.
 */
let before6 = 0;
let after6 = 0;
for (let n = 1; n <= 6; n++) {
  const src = `public/fha-illustrations/${n}.png`;
  const out = `public/fha-illustrations/${n}.webp`;
  await sharp(readFileSync(src)).webp({ quality: 80, alphaQuality: 90, effort: 6 }).toFile(out);
  before6 += statSync(src).size;
  after6 += statSync(out).size;
}
console.log(`fha carousel: ${before6.toLocaleString()} -> ${after6.toLocaleString()} bytes`);
