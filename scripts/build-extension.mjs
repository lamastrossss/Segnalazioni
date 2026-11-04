// Prepara l'estensione per la distribuzione: cartella pronta da caricare, zip e file di versione.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'extension');
const dist = join(root, 'dist');
const name = 'stage-review-estensione';
const out = join(dist, name);

const manifest = JSON.parse(readFileSync(join(src, 'manifest.json'), 'utf8'));
const referenced = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  ...Object.values(manifest.icons),
  'bridge.js', 'popup.js', 'popup.css', 'config.js', 'lib/core.js', 'lib/popup.js',
];
for (const f of referenced) {
  if (!existsSync(join(src, f))) throw new Error(`File mancante nell'estensione: ${f}`);
}

mkdirSync(dist, { recursive: true });
rmSync(out, { recursive: true, force: true });
cpSync(src, out, { recursive: true, filter: f => !f.endsWith('.d.ts') && !f.endsWith('.DS_Store') });

const zip = join(dist, `${name}.zip`);
rmSync(zip, { force: true });
execFileSync('zip', ['-r', '-X', '-q', `${name}.zip`, name], { cwd: dist });
writeFileSync(join(dist, 'extension-version.json'), JSON.stringify({ version: manifest.version }));
console.log(`estensione ${manifest.version} → dist/${name}.zip`);
