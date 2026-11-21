#!/usr/bin/env node
// Thin binding: places model-written <section> slides into the unmodified, pinned reveal.js engine and writes one
// self-contained HTML file that works offline and inside the T5 preview (no network, inline code only).
import { createHash } from 'node:crypto';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vendorRoot = join(skillRoot, 'vendor', 'reveal.js');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const THEMES = ['white', 'black'];

const USAGE = `Usage: build-deck.mjs --slides ABSOLUTE_SLIDES.html --output ABSOLUTE_DECK.html [options]

  --slides PATH     File containing only the <section> slide elements (notes in <aside class="notes">).
  --output PATH     Single self-contained HTML deck to write. Existing files need --replace.
  --title TEXT      Document title (default: first heading text or "발표 자료").
  --lang CODE       Document language (default: ko).
  --theme NAME      Upstream reveal.js theme: ${THEMES.join(' | ')} (default: white).
  --style PATH      Extra CSS for this deck (inlined; no external resources).
  --config JSON     Extra Reveal.initialize options, e.g. '{"transition":"fade","slideNumber":false}'.
  --replace         Overwrite an existing output the user asked to replace.

Viewing: arrow keys / space / swipe move, S opens the speaker window (browser only), N shows notes on the slide,
Esc shows the overview. Print to PDF: open the file with ?print-pdf appended and use the browser's print → Save as PDF.`;

function parseArgs(argv) {
  const options = { lang: 'ko', theme: 'white', replace: false };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--help' || flag === '-h') return { help: true };
    if (flag === '--replace') { options.replace = true; continue; }
    const key = { '--slides': 'slides', '--output': 'output', '--title': 'title', '--lang': 'lang',
      '--theme': 'theme', '--style': 'style', '--config': 'config' }[flag];
    if (!key || index + 1 >= argv.length) throw new Error(`unknown or incomplete option: ${flag}`);
    options[key] = argv[++index];
  }
  return options;
}

/** Resources a browser would fetch. Offline delivery and the preview CSP allow none of them. Links (<a href>) are
 * navigation, not loading, and remain allowed. */
function withoutEmbeddedData(text) {
  const source = String(text);
  const search = source.toLowerCase();
  const parts = [];
  let cursor = 0;
  for (let start = search.indexOf('data:', cursor); start >= 0; start = search.indexOf('data:', cursor)) {
    parts.push(source.slice(cursor, start), 'data:embedded');
    let end = start + 5;
    while (end < source.length) {
      const character = source.charCodeAt(end);
      if (character <= 32 || character === 34 || character === 39 || character === 41 || character === 62) break;
      end += 1;
    }
    cursor = end;
  }
  parts.push(source.slice(cursor));
  return parts.join('');
}

export function externalResourceReferences(text) {
  const found = [];
  // 긴 사진 data: 본문을 자원 속성 탐색에 다시 넣으면 정규식이 수 MB를 훑으며 스택을 넘긴다.
  const inspectable = withoutEmbeddedData(text);
  const patterns = [
    /<(?:script|img|video|audio|source|track|iframe|embed|input)\b[^>]*?\bsrc\s*=\s*["']?(?!data:|#)([^"'\s>]+)/giu,
    /<link\b[^>]*?\bhref\s*=\s*["']?(?!data:|#)([^"'\s>]+)/giu,
    /\bsrcset\s*=\s*["']([^"']+)["']/giu,
    /<(?:video)\b[^>]*?\bposter\s*=\s*["']?(?!data:)([^"'\s>]+)/giu,
    /<object\b[^>]*?\bdata\s*=\s*["']?(?!data:)([^"'\s>]+)/giu,
    /\bdata-background-(?:image|video|iframe)\s*=\s*["']?(?!data:)([^"'\s>]+)/giu,
    /\bdata-background\s*=\s*["']?((?:https?:)?\/\/[^"'\s>]+|[^"'\s>]+\.(?:png|jpe?g|gif|webp|svg|mp4|webm)(?:\?[^"'\s>]*)?)["'\s>]/giu,
    /@import\s+(?:url\()?\s*["']?([^"')\s;]+)/giu,
    /url\(\s*["']?(?!data:|#)([^"')\s]+)/giu,
  ];
  for (const pattern of patterns) for (const match of inspectable.matchAll(pattern)) found.push(match[1]);
  return [...new Set(found)];
}

async function verifiedVendorFile(lock, path) {
  const bytes = await readFile(join(vendorRoot, path));
  const expected = lock.files?.[path]?.sha256;
  if (!expected || sha256(bytes) !== expected) throw new Error(`pinned reveal.js file does not match its lock: ${path}`);
  return bytes.toString('utf8');
}

// 티파이브 기본 색 체계(skills/color-system/data)를 reveal 테마 변수에 얹는다 — 흰 테마는 밝은 면, 검은 테마는 어두운 면.
// 모델의 --style 이 뒤에 오므로 사용자·브랜드 색이 늘 이긴다. --t5-* 변수는 모델이 강조·보조 글자·선에 쓸 수 있다.
// 엔진 사본만 따로 옮긴 경우(엔진 무결성 시험)에도 엔진 확인이 먼저 돌도록, 색 체계는 쓸 때 읽는다.
async function t5ColorCss(theme) {
  const { HTML_SLIDES_DEFAULT_COLORS: c } = await import(pathToFileURL(join(skillRoot, '..', '..', 'src', 'axes', 'artifact', 'default-palette.js')).href);
  const [bg, text, accent, muted, line] = theme === 'black' ? [c.darkBg, c.darkText, c.darkAccent, c.darkMuted, c.darkLine] : [c.bg, c.text, c.accent, c.muted, c.line];
  return `:root{--r-background-color:${bg};--r-main-color:${text};--r-heading-color:${text};--r-link-color:${accent};--r-link-color-dark:${accent};`
    + `--r-link-color-hover:${accent};--r-selection-background-color:${accent};--t5-accent:${accent};--t5-muted:${muted};--t5-line:${line}}`
    + `.reveal-viewport{background:${bg}}`;
}

const escapeHtml = (value) => String(value).replace(/[&<>"]/gu, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export async function buildDeck({ slidesHtml, title = null, lang = 'ko', theme = 'white', extraCss = '', config = {} }) {
  if (!THEMES.includes(theme)) throw new Error(`theme must be one of: ${THEMES.join(', ')}`);
  if (!/<section\b/iu.test(slidesHtml)) throw new Error('slides file must contain <section> slide elements');
  if (/<\/?(?:html|head|body)\b/iu.test(slidesHtml)) throw new Error('slides file must contain only <section> elements, not a whole HTML document');
  if (/<\/?style\b/iu.test(extraCss) || /<\/?script\b/iu.test(extraCss)) throw new Error('--style must be plain CSS');
  const external = externalResourceReferences(`${slidesHtml}\n${extraCss}`);
  if (external.length) {
    throw Object.assign(new Error('deck references resources that would be fetched from outside the file; embed them as data: URLs or remove them'), { external });
  }
  const lock = JSON.parse(await readFile(join(skillRoot, 'vendor', 'reveal.lock.json'), 'utf8'));
  const [license, revealJs, revealCss, themeCss, notesJs] = await Promise.all([
    verifiedVendorFile(lock, 'LICENSE'), verifiedVendorFile(lock, 'dist/reveal.js'), verifiedVendorFile(lock, 'dist/reveal.css'),
    verifiedVendorFile(lock, `dist/theme/${theme}.css`), verifiedVendorFile(lock, 'dist/plugin/notes.js'),
  ]);
  const koreanCss = await readFile(join(skillRoot, 'assets', 't5-korean.css'), 'utf8');
  const colorCss = await t5ColorCss(theme);
  const heading = slidesHtml.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/iu)?.[1]?.replace(/<[^>]+>/gu, '').trim();
  const documentTitle = title ?? (heading || '발표 자료');
  const userConfig = JSON.stringify(config ?? {}).replaceAll('<', '\\u003c');
  const init = `(()=>{const base={hash:true,slideNumber:'c/t',showNotes:false,pdfSeparateFragments:false,plugins:[RevealNotes]};
Reveal.initialize(Object.assign(base,${userConfig})).then(()=>{Reveal.addKeyBinding({keyCode:78,key:'N',description:'발표자 메모 보기/숨기기'},()=>Reveal.configure({showNotes:!Reveal.getConfig().showNotes}));});})();`;
  const html = `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="reveal.js ${escapeHtml(lock.version)} via T5 html-slides">
<title>${escapeHtml(documentTitle)}</title>
<style>/* reveal.js ${lock.version} dist/reveal.css (MIT) */
${revealCss}</style>
<style>/* reveal.js ${lock.version} dist/theme/${theme}.css (MIT) */
${themeCss}</style>
<style>${koreanCss}</style>
<style>${colorCss}</style>
${extraCss ? `<style>${extraCss}</style>\n` : ''}</head>
<body>
<div class="reveal"><div class="slides">
${slidesHtml.trim()}
</div></div>
<script>/* reveal.js ${lock.version} dist/reveal.js, unmodified. License:
${license.replaceAll('*/', '* /')}*/
${revealJs}</script>
<script>/* reveal.js ${lock.version} dist/plugin/notes.js (MIT) */
${notesJs}</script>
<script>${init}</script>
</body>
</html>
`;
  return { html, engine: { name: lock.name, version: lock.version, integrity: lock.integrity, license: lock.license }, theme };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { console.log(USAGE); return; }
  for (const key of ['slides', 'output']) {
    if (!options[key] || !isAbsolute(options[key])) throw new Error(`--${key} must be an absolute path\n\n${USAGE}`);
  }
  if (!options.replace && await lstat(options.output).then(() => true, () => false)) {
    throw new Error('output already exists; use --replace only when the user asked to replace it');
  }
  const config = options.config ? JSON.parse(options.config) : {};
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('--config must be a JSON object');
  const built = await buildDeck({ slidesHtml: await readFile(options.slides, 'utf8'), title: options.title ?? null,
    lang: options.lang, theme: options.theme, extraCss: options.style ? await readFile(options.style, 'utf8') : '', config });
  const bytes = Buffer.from(built.html, 'utf8');
  await writeFile(options.output, bytes);
  console.log(JSON.stringify({ state: 'built', output: options.output, bytes: bytes.length, sha256: sha256(bytes),
    engine: built.engine, theme: built.theme,
    next: 'Verify with verify-deck.mjs, then register_output and open_preview. Rendering, navigation and notes are not yet observed.' }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({ state: 'failed', reason: error.message, ...(error.external ? { external: error.external } : {}) }, null, 2));
    process.exitCode = 1;
  });
}
