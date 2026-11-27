/**
 * Builds lean, air-gapped Syncfusion Tailwind3 Light & Dark theme bundles
 * under `public/assets/themes/` containing ONLY the Syncfusion packages used
 * by Man-day Scorecard, without external Google Fonts `@import` or duplicated
 * `@font-face` / `:root` token blocks.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules', '@syncfusion');
const outDir = join(root, 'public', 'assets', 'themes');

const LIGHT_THEME_ENTRY = join(nm, 'ej2-tailwind3-theme', 'styles', 'tailwind3-lite.css');
const DARK_THEME_ENTRY = join(nm, 'ej2-tailwind3-dark-theme', 'styles', 'tailwind3-dark-lite.css');

const USED_COMPONENT_STYLES = [
  'ej2-icons/styles/tailwind3.css',
  'ej2-base/styles/tailwind3-lite.css',
  'ej2-buttons/styles/tailwind3-lite.css',
  'ej2-inputs/styles/tailwind3-lite.css',
  'ej2-popups/styles/tailwind3-lite.css',
  'ej2-lists/styles/tailwind3-lite.css',
  'ej2-splitbuttons/styles/tailwind3-lite.css',
  'ej2-dropdowns/styles/tailwind3-lite.css',
  'ej2-calendars/styles/tailwind3-lite.css',
  'ej2-navigations/styles/tailwind3-lite.css',
  'ej2-notifications/styles/tailwind3-lite.css',
  'ej2-layouts/styles/tailwind3-lite.css',
  'ej2-grids/styles/tailwind3-lite.css',
  'ej2-kanban/styles/tailwind3-lite.css',
  'ej2-treegrid/styles/tailwind3-lite.css',
  'ej2-gantt/styles/tailwind3-lite.css',
  'ej2-schedule/styles/tailwind3-lite.css',
];

function stripCommentsAndExternalImports(css) {
  let out = '';
  let i = 0;
  const n = css.length;
  while (i < n) {
    const ch = css[i];
    if (ch === '"' || ch === "'") {
      const q = ch;
      out += ch;
      i += 1;
      while (i < n) {
        const c = css[i];
        out += c;
        i += 1;
        if (c === '\\' && i < n) {
          out += css[i];
          i += 1;
        } else if (c === q) {
          break;
        }
      }
      continue;
    }
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out.replace(/@import\s*(?:url\([^)]*\)|"[^"]*"|'[^']*')\s*;?/gi, (m) =>
    m.includes('fonts.googleapis.com') ? '' : m,
  );
}

/** Light whitespace compaction without corrupting strings or calc() operators. */
function compactWhitespace(css) {
  let out = '';
  let i = 0;
  const n = css.length;
  let lastSpace = false;
  while (i < n) {
    const ch = css[i];
    if (ch === '"' || ch === "'") {
      const q = ch;
      out += ch;
      i += 1;
      while (i < n) {
        const c = css[i];
        out += c;
        i += 1;
        if (c === '\\' && i < n) {
          out += css[i];
          i += 1;
        } else if (c === q) {
          break;
        }
      }
      lastSpace = false;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      if (!lastSpace) {
        out += ' ';
        lastSpace = true;
      }
      i += 1;
      continue;
    }
    lastSpace = false;
    out += ch;
    i += 1;
  }
  return out
    .replace(/\s*([{};])\s*/g, '$1')
    .replace(/;\}/g, '}')
    .trim();
}

/** Extracts the master `:root` / `.e-dark-mode` CSS variable header before `.e-control,.e-css`. */
function extractThemeTokenHeader(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const marker = raw.indexOf('.e-control,.e-css');
  const slice = marker > 0 ? raw.slice(0, marker) : raw.slice(0, 40_000);
  return compactWhitespace(stripCommentsAndExternalImports(slice));
}

/**
 * Strips `@font-face` duplicates and any redundant `:root` / `.e-dark-mode` token
 * blocks from individual component CSS files so the master Light/Dark token header wins cleanly.
 */
function stripDuplicateBlocks(css, seenFontFaces) {
  let out = '';
  let i = 0;
  const n = css.length;
  while (i < n) {
    // Scan top-level prelude until `{` or `@charset/@import` `;`
    const start = i;
    while (i < n && css[i] !== '{' && css[i] !== ';') {
      const ch = css[i];
      if (ch === '"' || ch === "'") {
        const q = ch;
        i += 1;
        while (i < n) {
          const c = css[i];
          i += 1;
          if (c === '\\' && i < n) {
            i += 1;
          } else if (c === q) {
            break;
          }
        }
      } else {
        i += 1;
      }
    }
    if (i >= n) {
      out += css.slice(start);
      break;
    }
    if (css[i] === ';') {
      out += css.slice(start, i + 1);
      i += 1;
      continue;
    }
    // Found `{` — match closing `}`
    const prelude = css.slice(start, i).trim();
    let depth = 0;
    const bodyStart = i;
    while (i < n) {
      const ch = css[i];
      if (ch === '"' || ch === "'") {
        const q = ch;
        i += 1;
        while (i < n) {
          const c = css[i];
          i += 1;
          if (c === '\\' && i < n) {
            i += 1;
          } else if (c === q) {
            break;
          }
        }
        continue;
      }
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          i += 1;
          break;
        }
      }
      i += 1;
    }
    const block = css.slice(start, i);
    const body = css.slice(bodyStart + 1, i - 1);

    if (prelude.startsWith('@font-face')) {
      const key = compactWhitespace(body);
      if (seenFontFaces.has(key)) {
        continue;
      }
      seenFontFaces.add(key);
      out += block;
      continue;
    }

    // Strip redundant token-only `:root` / `.e-dark-mode` variable blocks (already in master header)
    const isTokenSelector =
      prelude === ':root' ||
      prelude === '.e-dark-mode' ||
      prelude === ':root,.e-dark-mode' ||
      prelude === ':root, .e-dark-mode';
    if (isTokenSelector && (body.includes('--color-sf-') || body.includes('--e-font-'))) {
      continue;
    }

    out += block;
  }
  return out;
}

if (!existsSync(LIGHT_THEME_ENTRY) || !existsSync(DARK_THEME_ENTRY)) {
  console.error('[build-sf-themes] Syncfusion theme packages not found; aborting theme build.');
  process.exit(1);
}

const lightTokens = extractThemeTokenHeader(LIGHT_THEME_ENTRY);
const darkTokens = extractThemeTokenHeader(DARK_THEME_ENTRY);

const seenFontFaces = new Set();
const componentChunks = [];
for (const rel of USED_COMPONENT_STYLES) {
  const fullPath = join(nm, rel);
  if (!existsSync(fullPath)) {
    console.warn(`[build-sf-themes] Missing ${rel}, skipping`);
    continue;
  }
  const raw = readFileSync(fullPath, 'utf8');
  const cleaned = compactWhitespace(stripCommentsAndExternalImports(raw));
  const deduped = stripDuplicateBlocks(cleaned, seenFontFaces);
  if (deduped) {
    componentChunks.push(deduped);
  }
}

const sharedComponentsCss = componentChunks.join('\n');
mkdirSync(outDir, { recursive: true });

const lightOut = join(outDir, 'tailwind3.css');
const darkOut = join(outDir, 'tailwind3-dark.css');
const lightCss = `${lightTokens}\n${sharedComponentsCss}\n`;
const darkCss = `${darkTokens}\n${sharedComponentsCss}\n`;

if (lightCss.includes('fonts.googleapis.com') || darkCss.includes('fonts.googleapis.com')) {
  throw new Error('[build-sf-themes] External fonts.googleapis.com @import leaked into built theme CSS');
}

writeFileSync(lightOut, lightCss, 'utf8');
writeFileSync(darkOut, darkCss, 'utf8');

console.log(
  `[build-sf-themes] built tailwind3.css (${Math.round(Buffer.byteLength(lightCss) / 1024)} KB) & tailwind3-dark.css (${Math.round(Buffer.byteLength(darkCss) / 1024)} KB) from ${USED_COMPONENT_STYLES.length} packages`,
);
