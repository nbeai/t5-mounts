#!/usr/bin/env node
// PowerPoint(.pptx) ↔ HTML 발표(이 스킬의 reveal.js 한 파일) 결정적 변환과 충실도 대조. 모델이 다시 짓지 않는다.
// 옮기는 것: 장 순서·글(문단)·발표자 메모·표(칸 글)·그림(같은 바이트). 옮기지 않는 것은 notCarried 목록으로 말한다
// (PowerPoint 애니메이션·도형의 정확한 위치와 크기·테마 글꼴 / HTML 의 단계 보이기·움직이는 차트와 데모).
//   node deck-convert.mjs --from 발표.pptx --to 발표.html     (또는 --from 발표.html --to 발표.pptx)
//   node deck-convert.mjs --compare 원본 --with 결과           두 덱의 대조(옮겨진 것·빠진 것)
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strFromU8, unzipSync } from 'fflate';
import { parseHTML } from 'linkedom';
import PptxGenJS from '@lofcz/pptxgenjs';
import { inspectPptxBytes } from '../../../src/areas/document/pptx-deliverable.js';
import { officeAttribute, officeElements, parseOfficeXml } from '../../../src/areas/document/office-xml-observation.js';
import { buildDeck } from './build-deck.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const clean = (text) => String(text ?? '').replace(/\s+/gu, ' ').trim();
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };

// ---------- 읽기: 두 형식을 같은 꼴(장마다 글·메모·표·그림)로 ----------
function relationships(archive, part) {
  const path = posix.join(posix.dirname(part), '_rels', `${posix.basename(part)}.rels`);
  if (!archive[path]) return new Map();
  return new Map([...officeElements(parseOfficeXml(strFromU8(archive[path])), 'package', 'Relationship')]
    .map((node) => [node.getAttribute('Id'), posix.normalize(posix.join(posix.dirname(part), node.getAttribute('Target') ?? ''))]));
}
const paragraphs = (root) => [...officeElements(root, 'drawing', 'p')]
  .map((paragraph) => clean([...officeElements(paragraph, 'drawing', 't')].map((node) => node.textContent).join(''))).filter(Boolean);

async function pptxOutline(path) {
  const bytes = await readFile(path); const archive = unzipSync(new Uint8Array(bytes));
  const observed = inspectPptxBytes(bytes);
  const features = { animations: 0 };
  const slides = observed.slides.map((slide) => {
    const document = parseOfficeXml(strFromU8(archive[slide.part])); const rels = relationships(archive, slide.part);
    const texts = []; let title = null;
    for (const shape of officeElements(document, 'presentation', 'sp')) {
      const lines = paragraphs(shape); if (!lines.length) continue;
      const placeholder = [...officeElements(shape, 'presentation', 'ph')][0]?.getAttribute('type');
      if (!title && ['title', 'ctrTitle'].includes(placeholder)) title = lines[0];
      texts.push(...lines);
    }
    const tables = [...officeElements(document, 'drawing', 'tbl')].map((table) => [...officeElements(table, 'drawing', 'tr')]
      .map((row) => [...officeElements(row, 'drawing', 'tc')].map((cell) => clean(paragraphs(cell).join(' ')))));
    const images = [];
    for (const blip of officeElements(document, 'drawing', 'blip')) {
      const target = rels.get(officeAttribute(blip, 'relationship', 'embed')); const media = target && archive[target];
      if (media) images.push({ sha256: sha256(media), bytes: media, type: MIME[posix.extname(target).slice(1).toLowerCase()] ?? 'image/png' });
    }
    features.animations += [...officeElements(document, 'presentation', 'timing')].length ? [...officeElements(document, 'presentation', 'par')].length || 1 : 0;
    return { title, texts, notes: clean(slide.notes), tables, images };
  });
  return { format: 'pptx', slides, features };
}

function htmlSlides(document) {
  const top = [...document.querySelectorAll('.reveal .slides > section, body > section')];
  return top.flatMap((section) => { const nested = [...section.querySelectorAll(':scope > section')]; return nested.length ? nested : [section]; });
}
async function htmlOutline(path) {
  const { document } = parseHTML(await readFile(path, 'utf8'));
  const features = { fragments: 0, interactive: 0 };
  const slides = htmlSlides(document).map((section) => {
    const notesNode = section.querySelector('aside.notes');
    const texts = []; let title = null;
    for (const node of section.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption')) {
      if (node.closest('aside.notes') || node.closest('table')) continue;
      if (node.matches('li') && node.querySelector('p')) continue;
      const text = clean(node.textContent); if (!text) continue;
      if (!title && /^H[1-6]$/u.test(node.tagName)) title = text;
      texts.push(text);
    }
    const tables = [...section.querySelectorAll('table')].map((table) => [...table.querySelectorAll('tr')]
      .map((row) => [...row.querySelectorAll('th,td')].map((cell) => clean(cell.textContent))));
    const images = [...section.querySelectorAll('img')].flatMap((image) => {
      const match = /^data:([^;,]+);base64,(.+)$/u.exec(image.getAttribute('src') ?? ''); if (!match) return [];
      const bytes = Buffer.from(match[2], 'base64'); return [{ sha256: sha256(bytes), bytes, type: match[1] }];
    });
    features.fragments += section.querySelectorAll('.fragment').length;
    features.interactive += section.querySelectorAll('canvas, script, iframe, video, [data-chart]').length;
    return { title, texts, notes: clean(notesNode?.textContent), tables, images };
  });
  return { format: 'html', slides, features };
}

export async function deckOutline(path) {
  const kind = extname(String(path)).toLowerCase();
  const outline = kind === '.pptx' ? await pptxOutline(path) : ['.html', '.htm'].includes(kind) ? await htmlOutline(path) : null;
  if (!outline) throw new Error('deck must be .pptx or .html');
  return { ...outline, slides: outline.slides.map(({ images, ...slide }) => ({ ...slide, images: images.map((image) => image.sha256) })) };
}

// ---------- 대조: 원본의 모든 글·메모·표 칸·그림이 같은 장에 있는가, 장 순서가 같은가 ----------
export function compareOutlines(source, target) {
  const differences = [];
  if (source.slides.length !== target.slides.length) differences.push({ kind: 'slide_count', source: source.slides.length, target: target.slides.length });
  source.slides.forEach((slide, index) => {
    const other = target.slides[index]; const at = index + 1;
    if (!other) return;
    const have = new Map(); for (const text of other.texts) have.set(text, (have.get(text) ?? 0) + 1);
    for (const text of slide.texts) { if (have.get(text)) have.set(text, have.get(text) - 1); else differences.push({ kind: 'text', slide: at, text }); }
    if (slide.notes !== other.notes) differences.push({ kind: 'notes', slide: at, source: slide.notes, target: other.notes });
    if (JSON.stringify(slide.tables) !== JSON.stringify(other.tables)) differences.push({ kind: 'table', slide: at });
    if (JSON.stringify([...slide.images].sort()) !== JSON.stringify([...other.images].sort())) differences.push({ kind: 'image', slide: at });
  });
  const titles = (outline) => outline.slides.map((slide) => slide.title ?? slide.texts[0] ?? '');
  if (source.slides.length === target.slides.length && JSON.stringify(titles(source)) !== JSON.stringify(titles(target))
    && !differences.length) differences.push({ kind: 'slide_order' });
  return { preserved: differences.length === 0, differences };
}

function notCarriedFrom(outline) {
  if (outline.format === 'pptx') return [
    ...(outline.features.animations ? [`PowerPoint 애니메이션 ${outline.features.animations}개(HTML 에는 장 넘김만)`] : []),
    '도형의 정확한 위치·크기와 장 배경(HTML 은 같은 차례로 다시 배치)', '테마 글꼴(한글 기본 글꼴로)'];
  return [
    ...(outline.features.fragments ? [`한 단계씩 보이기 ${outline.features.fragments}곳(PowerPoint 에는 한 번에 보임)`] : []),
    ...(outline.features.interactive ? [`움직이는 차트·데모 ${outline.features.interactive}개(PowerPoint 에는 옮겨지지 않음)`] : []),
    '글자 크기·색과 정확한 위치(PowerPoint 기본 배치로)'];
}

// ---------- 쓰기 ----------
const escapeHtml = (text) => String(text).replace(/[&<>"]/gu, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export async function pptxToHtml({ from, to }) {
  const source = await pptxOutline(from);
  const slidesHtml = source.slides.map((slide) => {
    const [first, ...rest] = slide.title ? [slide.title, ...slide.texts.filter((text, index) => !(text === slide.title && index === slide.texts.indexOf(slide.title)))] : slide.texts;
    const parts = [first ? `<h2>${escapeHtml(first)}</h2>` : '', ...rest.map((text) => `<p>${escapeHtml(text)}</p>`),
      ...slide.tables.map((table) => `<table>${table.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</table>`),
      ...slide.images.map((image) => `<img src="data:${image.type};base64,${Buffer.from(image.bytes).toString('base64')}" alt="">`),
      slide.notes ? `<aside class="notes">${escapeHtml(slide.notes)}</aside>` : ''];
    return `<section>${parts.filter(Boolean).join('\n')}</section>`;
  }).join('\n');
  const built = await buildDeck({ slidesHtml, title: source.slides[0]?.title ?? source.slides[0]?.texts[0] ?? '발표' });
  const output = resolve(String(to)); await writeFile(output, built.html);
  return { output, slides: source.slides.length, notCarried: notCarriedFrom(source) };
}

export async function htmlToPptx({ from, to }) {
  const source = await htmlOutline(from);
  const deck = new PptxGenJS(); deck.layout = 'LAYOUT_WIDE'; deck.lang = 'ko-KR';
  for (const [slideIndex, slide] of source.slides.entries()) {
    const page = deck.addSlide();
    const [first, ...rest] = slide.title ? [slide.title, ...slide.texts.filter((text, index) => !(text === slide.title && index === slide.texts.indexOf(slide.title)))] : slide.texts;
    if (first) page.addText(first, { x: 0.6, y: 0.35, w: 12.1, h: 0.9, fontSize: 30, bold: true, fit: 'shrink' });
    let y = 1.4;
    if (rest.length) { page.addText(rest.map((text, index) => ({ text, options: { breakLine: index < rest.length - 1 } })), { x: 0.6, y, w: 12.1, h: 2.2, fontSize: 18, valign: 'top', fit: 'shrink' }); y += 2.3; }
    for (const table of slide.tables) { page.addTable(table.map((row) => row.map((cell) => ({ text: cell }))), { x: 0.6, y, w: 7.5, fontSize: 14 }); y += 0.4 * table.length + 0.3; }
    slide.images.forEach((image, index) => page.addImage({ data: `${image.type};base64,${Buffer.from(image.bytes).toString('base64')}`, x: 8.4 + (index % 2) * 2.3, y: 1.4 + Math.floor(index / 2) * 1.9, w: 2.1, h: 1.6 }));
    if (slide.notes) page.addNotes(slide.notes);
    // 고정 부품은 표 ID를 장 번호로 계산하고 addImage의 sId 인수는 버린다. 방금 만든 개체의
    // 직렬화 옵션에 ID를 배정해 두 규칙을 맞춘다. 부품 원본·기존 문서·그리기 순서는 바꾸지 않는다.
    let shapeId = slide.tables.length * (slideIndex + 1) + 2, tableNumber = 0;
    for (const object of page._slideObjects) {
      object.options ??= {};
      object.options.sId = object._type === 'table' ? ++tableNumber * (slideIndex + 1) + 1 : shapeId++;
    }
  }
  const output = resolve(String(to)); await deck.writeFile({ fileName: output });
  return { output, slides: source.slides.length, notCarried: notCarriedFrom(source) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flag = (name) => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; };
  try {
    if (flag('--compare')) {
      process.stdout.write(`${JSON.stringify(compareOutlines(await deckOutline(flag('--compare')), await deckOutline(flag('--with'))))}\n`);
    } else {
      const from = flag('--from'); const to = flag('--to');
      if (!from || !to) throw new Error('Usage: deck-convert.mjs --from DECK.pptx|DECK.html --to DECK.html|DECK.pptx (or --compare A --with B)');
      const toHtml = ['.html', '.htm'].includes(extname(to).toLowerCase());
      const result = toHtml ? await pptxToHtml({ from, to }) : await htmlToPptx({ from, to });
      const check = compareOutlines(await deckOutline(from), await deckOutline(result.output));
      process.stdout.write(`${JSON.stringify({ ...result, preserved: check.preserved, differences: check.differences })}\n`);
    }
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exit(1); }
}
