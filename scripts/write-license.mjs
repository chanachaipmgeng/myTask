import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
loadEnvFile(join(root, '.env'));

const key = process.env.SYNCFUSION_LICENSE ?? '';
const contents = `// Generated from the environment by scripts/write-license.mjs. Do not commit.
export const syncfusionLicenseKey = ${JSON.stringify(key)};
`;

writeFileSync(join(root, 'src/app/core/syncfusion-license.generated.ts'), contents);

function loadEnvFile(path) {
  if (!existsSync(path)) {
    return;
  }
  const text = readFileSync(path, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const name = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[name] === undefined || process.env[name] === '') {
      process.env[name] = value;
    }
  }
}
