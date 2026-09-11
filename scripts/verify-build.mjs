// Automated pre-push build and verification script
import { execSync } from 'child_process';

console.log('Validating i18n dictionaries...');
execSync('npm --prefix frontend run i18n:check', { stdio: 'inherit' });

console.log('Validating production build...');
execSync('npm --prefix frontend run build', { stdio: 'inherit' });

console.log('Build validation passed cleanly!');
