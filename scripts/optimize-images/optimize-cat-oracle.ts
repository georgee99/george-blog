import { mkdir, readdir } from "node:fs/promises";
import { join, parse } from "node:path";
import sharp from "sharp";

const sourceDir = join(process.cwd(), "public", "meow");
const outputDir = join(sourceDir, "oracle");
const filenames = (await readdir(sourceDir)).filter((filename) => /^[MS].*\.png$/i.test(filename));

if (filenames.length === 0) {
  throw new Error("No M or S PNG images found in public/meow.");
}

await mkdir(outputDir, { recursive: true });

for (const filename of filenames) {
  const output = join(outputDir, `${parse(filename).name}.webp`);
  await sharp(join(sourceDir, filename))
    .rotate()
    .resize(768, 768, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(output);
}

console.log(`Generated ${filenames.length} cat oracle images in public/meow/oracle.`);
