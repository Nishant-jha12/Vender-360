/**
 * Compare the key sets of every locale file.
 *
 * A missing key does not fail loudly at runtime -- i18next falls back to
 * English, so the screen just quietly appears in the wrong language and nobody
 * notices. This turns that into a build error instead.
 *
 *     npm run i18n:check
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'locales');
const BASE = 'en';

const flatten = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );

const locales = {};
for (const file of readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
  locales[file.replace('.json', '')] = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
}

const base = flatten(locales[BASE]);
let problems = 0;

console.log(`Locales: ${Object.keys(locales).join(', ')}  (${base.length} keys in ${BASE})`);

for (const [lang, data] of Object.entries(locales)) {
  const keys = flatten(data);
  const missing = base.filter((k) => !keys.includes(k));
  const extra = keys.filter((k) => !base.includes(k));
  // An empty string is as invisible as a missing key, and just as wrong.
  const blank = keys.filter((k) => {
    const value = k.split('.').reduce((o, part) => o?.[part], data);
    return typeof value === 'string' && value.trim() === '';
  });

  if (missing.length || extra.length || blank.length) {
    problems += 1;
    console.error(`\n  ${lang}:`);
    if (missing.length) console.error(`    missing (${missing.length}): ${missing.join(', ')}`);
    if (extra.length) console.error(`    not in ${BASE} (${extra.length}): ${extra.join(', ')}`);
    if (blank.length) console.error(`    empty (${blank.length}): ${blank.join(', ')}`);
  } else {
    console.log(`  ${lang}: ${keys.length} keys, complete`);
  }
}

if (problems) {
  console.error(`\n${problems} locale(s) out of step with ${BASE}.json`);
  process.exit(1);
}
console.log('\nAll locales carry the same keys.');
