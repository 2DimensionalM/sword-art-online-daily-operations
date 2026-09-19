import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const failures = [];
const requireText = (source, token, file) => {
  if (!source.includes(token)) failures.push(`${file} must contain ${token}`);
};

const moodboardDir = resolve(root, 'docs/moodboard/p4g');
const moodboardImages = existsSync(moodboardDir)
  ? readdirSync(moodboardDir).filter((name) => name.endsWith('.png'))
  : [];
const moodboardManifest = JSON.parse(read('docs/moodboard/p4g/manifest.json'));

if (!Array.isArray(moodboardManifest.references) || moodboardManifest.references.length !== 8) {
  failures.push('docs/moodboard/p4g/manifest.json must describe exactly 8 evidence images');
}

if (moodboardImages.length !== 0 && moodboardImages.length !== 8) {
  failures.push(`private moodboard assets must be either complete or absent; found ${moodboardImages.length} of 8`);
}

if (moodboardImages.length === 8) {
  for (const reference of moodboardManifest.references) {
    const path = resolve(moodboardDir, reference.file);
    if (!existsSync(path)) {
      failures.push(`private moodboard asset is missing: ${reference.file}`);
      continue;
    }
    const digest = createHash('sha256').update(readFileSync(path)).digest('hex');
    if (digest !== reference.sha256) failures.push(`private moodboard asset checksum changed: ${reference.file}`);
  }
}

const brandCss = read('app/brand.css');
const brandComponent = read('app/components/BrandLockup.tsx');
const globalsCss = read('app/globals.css');
const styleGuide = read('docs/STYLE_GUIDE.md');
const homepageCss = read('app/homepage.css');

// LIFE COMMAND must use the same identity and shell as the other game pages.
for (const selector of ['.hero', '.day-card', '.menu-trigger', '.mission-summary', '.add-task', '.app-frame', '.persona-fx', '.tv-noise', '.brand-', '.logo-']) {
  if (homepageCss.includes(selector)) failures.push(`app/homepage.css must not override shared shell selector ${selector}`);
}
if (/\.view-dashboard(?:\.theme-(?:day|night))?\s*(?:::before|::after)?\s*\{/.test(homepageCss)) {
  failures.push('app/homepage.css must scope its composition inside .life-dashboard, never replace the shared page background');
}

for (const token of ['--logo-depth-x', '--logo-depth-y', '--logo-plane', 'perspective(', '.brand-plane', '.logo-face::before', '.logo-face::after', 'paint-order:stroke fill']) {
  requireText(brandCss, token, 'app/brand.css');
}

for (const token of ['className="brand-plane"', 'data-text="SWORD ART"', 'data-text="ONLINE"']) {
  requireText(brandComponent, token, 'app/components/BrandLockup.tsx');
}

if ((brandComponent.match(/logo-face/g) ?? []).length !== 2) {
  failures.push('BrandLockup must have exactly two logo-face layers sharing the same type and depth system');
}

for (const forbidden of ['.brand-signal', '.logo-sword', '.logo-art', '.brand-burst', '--color-orange', '--color-green', '--color-red', '--color-blue', '--color-violet']) {
  if (brandCss.includes(forbidden)) failures.push(`app/brand.css contains forbidden fragmented or multicolor logo token: ${forbidden}`);
}

if (/\.(?:brand|logo)-/.test(globalsCss)) {
  failures.push('app/globals.css must not own brand or logo selectors; keep the wordmark isolated in app/brand.css');
}

for (const token of ['## 6. Logo geometry harness', 'docs/moodboard/p4g', 'npm run design:check']) {
  requireText(styleGuide, token, 'docs/STYLE_GUIDE.md');
}

if (failures.length) {
  console.error('Design harness failed:\n' + failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('Design harness passed: moodboard evidence, unified perspective, shared depth, and limited logo palette are intact.');
