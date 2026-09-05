/**
 * Download Inter and Roboto into public/fonts so the app never asks a third
 * party for them at runtime.
 *
 * Loading fonts from fonts.googleapis.com hands Google every visitor's IP
 * address, User-Agent and referring page on each page load -- before anyone has
 * signed in, and with no way for a shopkeeper to decline. Self-hosting is the
 * only way to stop that, and it is also faster after the first cache hit.
 *
 *     npm run fonts
 *
 * Needs network access once. Until it is run the @font-face rules in index.css
 * simply do not match and the page falls back to the system UI font.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '..', 'public', 'fonts');

// Variable font files, so one request covers every weight the app uses.
const FONTS = [
  {
    name: 'inter-variable.woff2',
    css: 'https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap',
  },
  {
    name: 'roboto-variable.woff2',
    css: 'https://fonts.googleapis.com/css2?family=Roboto:wght@400..700&display=swap',
  },
];

// Google serves different formats by User-Agent; this one gets woff2.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

async function fetchFont({ name, css }) {
  const sheet = await (await fetch(css, { headers: { 'User-Agent': UA } })).text();
  const url = sheet.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/)?.[1];
  if (!url) throw new Error(`No woff2 URL found in the stylesheet for ${name}`);

  const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
  await writeFile(resolve(OUT, name), bytes);
  console.log(`  ${name}  ${(bytes.length / 1024).toFixed(0)} KB`);
}

await mkdir(OUT, { recursive: true });
console.log('Fetching fonts into public/fonts ...');
for (const font of FONTS) {
  await fetchFont(font);
}
console.log('Done. The app now serves its own fonts and contacts no third party.');
