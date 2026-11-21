#!/usr/bin/env node
// Replace dashboard asset placeholders with the pinned upstream bytes so one HTML file works offline
// inside the workbench preview CSP (inline scripts and data: fonts only). The bytes are checked against
// assets.json before use; nothing is fetched and nothing upstream is modified.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const defaultAssetsRoot = join(skillRoot, 'assets');
const PREVIEW_LIMIT = 5 * 1024 * 1024;
const PLACEHOLDER = /<(script|style)\s+data-t5-asset="([a-z-]+)"\s*>\s*<\/\1>/giu;

async function verifiedAsset(assetsRoot, manifest, path) {
  const entry = manifest.components.flatMap((component) => component.files.map((file) => ({ ...file, component })))
    .find((file) => file.path === path);
  if (!entry) throw new Error(`asset is not pinned: ${path}`);
  const bytes = await readFile(join(assetsRoot, path));
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== entry.sha256) throw new Error(`asset digest mismatch: ${path}`);
  return { bytes, component: entry.component };
}

export async function inlineDashboardAssets(html, { assetsRoot = defaultAssetsRoot } = {}) {
  const manifest = JSON.parse(await readFile(join(assetsRoot, 'assets.json'), 'utf8'));
  const used = [];
  const replacements = new Map();
  for (const match of html.matchAll(PLACEHOLDER)) {
    const [whole, tag, name] = match;
    if (replacements.has(whole)) continue;
    if (tag.toLowerCase() === 'script' && name === 'echarts') {
      const { bytes, component } = await verifiedAsset(assetsRoot, manifest, 'echarts/echarts.min.js');
      replacements.set(whole, `<script>/* ${component.name} ${component.version} | ${component.license} | see NOTICE */\n${bytes.toString('utf8')}\n</script>`);
      used.push(`${component.name} ${component.version}`);
    } else if (tag.toLowerCase() === 'script' && name === 'echarts-ko') {
      const { bytes } = await verifiedAsset(assetsRoot, manifest, 'echarts/langKO.js');
      replacements.set(whole, `<script>\n${bytes.toString('utf8')}\n</script>`);
    } else if (tag.toLowerCase() === 'style' && name === 'pretendard') {
      const faces = [];
      for (const [weight, file] of [[400, 'Pretendard-Regular.subset.woff2'], [700, 'Pretendard-Bold.subset.woff2']]) {
        const { bytes } = await verifiedAsset(assetsRoot, manifest, `pretendard/${file}`);
        faces.push(`@font-face{font-family:"Pretendard";font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${bytes.toString('base64')}) format("woff2")}`);
      }
      const component = manifest.components.find((item) => item.id === 'pretendard');
      replacements.set(whole, `<style>/* ${component.name} ${component.version} | ${component.license} */\n${faces.join('\n')}\n</style>`);
      used.push(`${component.name} ${component.version}`);
    } else throw new Error(`unknown dashboard asset placeholder: ${name}`);
  }
  let output = html;
  for (const [placeholder, replacement] of replacements) output = output.split(placeholder).join(replacement);
  return { html: output, used, bytes: Buffer.byteLength(output) };
}

function argument(name) { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = argument('--input'); const output = argument('--output');
  if (!input || !output) {
    process.stderr.write('Usage: inline-assets.mjs --input DRAFT.html --output DASHBOARD.html [--replace]\n');
    process.exit(2);
  }
  if (resolve(input) === resolve(output)) { process.stderr.write('Write a new output file; keep the draft.\n'); process.exit(2); }
  if (existsSync(output) && !process.argv.includes('--replace')) { process.stderr.write(`Output exists: ${output}\n`); process.exit(2); }
  const result = await inlineDashboardAssets(await readFile(input, 'utf8'));
  await writeFile(output, result.html);
  process.stdout.write(`${JSON.stringify({ output: resolve(output), bytes: result.bytes, assets: result.used,
    withinPreviewLimit: result.bytes <= PREVIEW_LIMIT }, null, 2)}\n`);
  if (result.bytes > PREVIEW_LIMIT) process.exit(1);
}
