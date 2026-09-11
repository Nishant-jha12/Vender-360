// Automated locale integrity verification
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const localesDir = join(process.cwd(), 'frontend', 'src', 'locales');
const files = readdirSync(localesDir).filter(f => f.endsWith('.json'));

let failed = false;
let baseKeys = null;

for (const f of files) {
  const data = JSON.parse(readFileSync(join(localesDir, f), 'utf-8'));
  const count = Object.keys(data).length;
  console.log(`Checking ${f}: ${count} top-level groups`);
  if (!baseKeys) {
    baseKeys = count;
  } else if (baseKeys !== count) {
    console.error(`Mismatch in ${f}: expected ${baseKeys}, found ${count}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('All locales verified successfully!');
