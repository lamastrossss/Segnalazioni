import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const p = (x: string) => join(root, x);

describe('pacchetto dell\'estensione', () => {
  it('crea cartella, zip e file di versione', () => {
    execFileSync(process.execPath, [p('scripts/build-extension.mjs')], { cwd: root });
    expect(existsSync(p('dist/stage-review-estensione/manifest.json'))).toBe(true);
    expect(existsSync(p('dist/stage-review-estensione/lib/core.d.ts'))).toBe(false);
    const { version } = JSON.parse(readFileSync(p('extension/manifest.json'), 'utf8'));
    expect(JSON.parse(readFileSync(p('dist/extension-version.json'), 'utf8'))).toEqual({ version });
    const list = execFileSync('unzip', ['-l', p('dist/stage-review-estensione.zip')]).toString();
    for (const f of ['manifest.json', 'background.js', 'bridge.js', 'popup.html', 'popup.js', 'popup.css', 'config.js', 'lib/core.js', 'lib/popup.js', 'icons/icon128.png', 'tool.js']) {
      expect(list).toContain(`stage-review-estensione/${f}`);
    }
  }, 30_000);
});
