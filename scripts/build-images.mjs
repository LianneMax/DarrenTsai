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
