import sharp from 'sharp';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', '..', 'public');

interface Variant {
  width: number;
  height: number;
  suffix: string;
}

const variants: Variant[] = [
  { width: 320, height: 140, suffix: '320' },
  { width: 560, height: 220, suffix: '560' },
  { width: 1120, height: 440, suffix: '1120' },
];

const args = process.argv.slice(2);
// e.g. --input meow/M7.png  (relative to public/)
const inputArg = args[args.indexOf('--input') + 1] ?? 'meow/M7.png';
const inputPath = path.join(publicDir, inputArg);

if (!fs.existsSync(inputPath)) {
  console.error(`Input file not found: ${inputPath}`);
  process.exit(1);
}

const ext = path.extname(inputArg);
const base = path.basename(inputArg, ext);
const dir = path.dirname(inputArg);

console.log(`Processing: ${inputPath}`);

for (const v of variants) {
  const outName = `${base}-${v.suffix}.webp`;
  const outPath = path.join(publicDir, dir, outName);

  await sharp(inputPath)
    .resize(v.width, v.height, { fit: 'cover', position: 'centre' })
    .webp({ quality: 75 })
    .toFile(outPath);

  const { size } = fs.statSync(outPath);
  console.log(`  ✓ ${outName}  (${(size / 1024).toFixed(1)} KB)`);
}

console.log('\nDone. Variants saved to public/' + dir);
