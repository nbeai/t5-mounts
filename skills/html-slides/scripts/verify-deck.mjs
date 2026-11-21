#!/usr/bin/env node
// Observes an HTML deck in a real headless browser under the exact surfaces a user sees:
//   1. the T5 workbench preview (same body and Content-Security-Policy, iframe sandbox="allow-scripts"),
//   2. the shared-link copy (same files and CSP as share_preview) printed to PDF with ?print-pdf.
// It reports facts. It does not judge whether the deck's content or design serves the user's purpose.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const refoundationRoot = resolve(skillRoot, '..', '..');
const source = (path) => pathToFileURL(join(refoundationRoot, path)).href;

const CHROME_CANDIDATES = {
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
  win32: [`${process.env['ProgramFiles'] ?? 'C:\\Program Files'}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'}\\Microsoft\\Edge\\Application\\msedge.exe`],
  linux: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
};

export function findChrome(explicit = process.env.T5_CHROME ?? null) {
  if (explicit) return existsSync(explicit) ? explicit : null;
  return (CHROME_CANDIDATES[process.platform] ?? []).find((path) => existsSync(path)) ?? null;
}

const pdfPageCount = (bytes) => (Buffer.from(bytes).toString('latin1').match(/\/Type\s*\/Page(?![s\w])/gu) ?? []).length;

async function serve(routes) {
  const server = createServer((req, res) => {
    const route = routes[new URL(req.url, 'http://127.0.0.1').pathname];
    if (!route) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': route.type, ...(route.csp ? { 'content-security-policy': route.csp } : {}) });
    res.end(route.body);
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

async function waitReady(frame, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await frame.evaluate(() => typeof Reveal !== 'undefined' && Reveal.isReady?.() === true).catch(() => false);
    if (ready) return true;
    await new Promise((done) => setTimeout(done, 100));
  }
  return false;
}

const position = (frame) => frame.evaluate(() => ({ ...Reveal.getIndices(), last: Reveal.isLastSlide(),
  fragmentsLeft: Reveal.availableFragments().next }));

async function deckContrast(page, frame) {
  const { measureRenderedContrast, CONTRAST_STANDARD_TEXT, deckViewScale } = await import(source('src/areas/making/rendered-contrast.js'));
  const { measureRenderedColor, summarizeRenderedColor } = await import(source('src/areas/making/rendered-color.js'));
  const { DEFAULT_STRONG_AREA } = await import(source('src/axes/artifact/default-palette.js'));
  // 큰 글 판정은 덱이 노트북 화면에 꽉 차게 보이는 크기로(덱 설정 크기에서 계산, 기본 960×700).
  const viewScale = await frame.evaluate(() => { const c = Reveal.getConfig(); return [c.width, c.height]; }).then(([w, h]) => deckViewScale(w, h));
  const slides = await frame.evaluate(() => {
    const config = Reveal.getConfig(); window.__t5DeckTransition = { transition: config.transition, backgroundTransition: config.backgroundTransition };
    Reveal.configure({ transition: 'none', backgroundTransition: 'none' });
    return Reveal.getSlides().map((slide) => Reveal.getIndices(slide));
  });
  const lowContrast = []; let measured = 0; let unmeasured = 0; const colors = [];
  try {
    for (const [index, at] of slides.entries()) {
      await frame.evaluate(({ h, v }) => Reveal.slide(h, v ?? 0, Number.MAX_SAFE_INTEGER), at);
      await page.waitForTimeout(350); // 조각이 나타나는 전환을 기다린다
      const result = await measureRenderedContrast({ page, frame, root: '.reveal .slides', leafSection: true, viewScale });
      measured += result.measured; unmeasured += result.failed ? 1 : result.unmeasured;
      for (const row of result.lowContrast) lowContrast.push({ slide: index + 1, ...row });
      // 색 사실(바탕·강조·진한 색 면적·AI 티 짝과의 거리, 그림 빼고): 캐러셀과 같은 방법. 사실일 뿐 실패가 아니다.
      colors.push(await measureRenderedColor({ page, frame, root: '.reveal' }));
    }
  } finally {
    await frame.evaluate(() => { Reveal.configure(window.__t5DeckTransition); Reveal.slide(0, 0, -1); }).catch(() => {});
  }
  const color = summarizeRenderedColor(colors, { strongGuide: DEFAULT_STRONG_AREA });
  return { standard: CONTRAST_STANDARD_TEXT, viewScale: Math.round(viewScale * 1000) / 1000, measured, unmeasured, lowContrast, ...(color ? { color } : {}) };
}

/** Verify one deck's actual behavior. `html` is the exact file content that would be registered and shared. */
export async function verifyDeck({ html, name = 'deck.html', expectNotes = false, chromePath = findChrome(), timeoutMs = 8000, pdfPath = null } = {}) {
  if (typeof html !== 'string' || !html) throw new TypeError('deck html is required');
  if (!chromePath) return { state: 'unavailable', reason: 'no Chrome, Edge or Chromium executable was found for headless rendering' };
  const [{ renderAttachmentPreview }, { addWorkbenchBridge }, { artifactShareFiles, SHARING_CSP }, { chromium }] = await Promise.all([
    import(source('src/areas/document/artifact-preview.js')), import(source('src/areas/document/artifact-work-context.js')),
    import(source('src/areas/web/web-sharing.js')), import('playwright-core'),
  ]);
  const record = { attachmentId: '00000000-0000-4000-8000-000000000001', sessionId: '00000000-0000-4000-8000-000000000002',
    originalName: name, mimeType: 'text/html', sha256: null };
  const bytes = Buffer.from(html, 'utf8');
  const preview = addWorkbenchBridge(await renderAttachmentPreview({ record, bytes }), record);
  const shared = await artifactShareFiles(record, bytes);
  const { server, origin } = await serve({
    '/': { type: 'text/html; charset=utf-8', body: '<!doctype html><html><body style="margin:0"><iframe id="preview" sandbox="allow-scripts" src="/preview" style="border:0;width:1280px;height:720px"></iframe></body></html>' },
    '/favicon.ico': { type: 'image/x-icon', body: '' },
    '/preview': { type: preview.contentType, csp: preview.contentSecurityPolicy, body: preview.body },
    '/shared': { type: shared['index.html'].type, csp: SHARING_CSP, body: Buffer.from(shared['index.html'].data, 'base64') },
  });
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const facts = { previewKind: preview.kind, previewCsp: preview.contentSecurityPolicy, externalRequests: [], consoleErrors: [] };
  const failures = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: true });
    const page = await context.newPage();
    const watch = (target) => {
      target.on('request', (request) => {
        const url = request.url();
        if (!url.startsWith(origin) && !/^(?:data|blob|about):/u.test(url)) facts.externalRequests.push(url);
      });
      target.on('console', (message) => { if (message.type() === 'error') facts.consoleErrors.push(message.text().slice(0, 300)); });
      target.on('pageerror', (error) => facts.consoleErrors.push(String(error?.message ?? error).slice(0, 300)));
    };
    watch(page);
    await page.goto(`${origin}/`);
    const frame = await (await page.waitForSelector('#preview')).contentFrame();
    facts.ready = await waitReady(frame, timeoutMs);
    if (!facts.ready) {
      failures.push('engine_not_running_in_preview');
    } else {
      Object.assign(facts, await frame.evaluate(() => {
        const slides = Reveal.getSlides();
        const reveal = document.querySelector('.reveal');
        return {
          totalSlides: Reveal.getTotalSlides(),
          fragments: document.querySelectorAll('.slides .fragment').length,
          slidesWithNotes: slides.filter((slide) => (Reveal.getSlideNotes(slide) ?? '').trim()).length,
          notesPlugin: Boolean(Reveal.getPlugin?.('notes')),
          mainFontFamily: getComputedStyle(reveal).fontFamily,
          language: document.documentElement.lang,
        };
      }));
      // Keyboard: the user clicks the deck; ArrowRight moves; PageDown (what presentation clickers send) walks every
      // slide, vertical ones included, and every fragment to the end; Home returns to the start.
      await page.mouse.click(640, 360);
      await frame.evaluate(() => Reveal.slide(0, 0, -1));
      await page.keyboard.press('ArrowRight');
      await frame.waitForFunction(() => { const { h, v, f } = Reveal.getIndices(); return h > 0 || v > 0 || f >= 0; },
        null, { timeout: 1000 }).catch(() => {});
      { const moved = await position(frame); facts.arrowRightMoves = moved.h > 0 || moved.v > 0 || (moved.f ?? -1) > -1; }
      await frame.evaluate(() => Reveal.slide(0, 0, -1));
      const steps = []; let before = await position(frame);
      for (let index = 0; index < 400; index++) {
        if (before.last && !before.fragmentsLeft) break;
        await page.keyboard.press('PageDown');
        await frame.waitForFunction(({ h, v, f }) => { const next = Reveal.getIndices();
          return next.h !== h || next.v !== v || next.f !== f; }, before, { timeout: 1000 }).catch(() => {});
        const after = await position(frame);
        if (after.h === before.h && after.v === before.v && after.f === before.f) break;
        steps.push(after.h !== before.h || after.v !== before.v ? 'slide' : 'fragment');
        before = after;
      }
      facts.keyboard = { slideSteps: steps.filter((kind) => kind === 'slide').length,
        fragmentSteps: steps.filter((kind) => kind === 'fragment').length, reachedEnd: before.last && !before.fragmentsLeft };
      await page.keyboard.press('Home');
      await frame.waitForFunction(() => { const { h, v } = Reveal.getIndices(); return h === 0 && v === 0; },
        null, { timeout: 1000 }).catch(() => {});
      facts.keyboard.homeReturnsToStart = (await position(frame)).h === 0;
      if (facts.totalSlides < 1) failures.push('no_slides');
      if (!facts.keyboard.reachedEnd) failures.push('keyboard_navigation_did_not_reach_the_end');
      if (facts.totalSlides > 1 && !facts.arrowRightMoves) failures.push('arrow_key_did_not_move');
      if (facts.keyboard.slideSteps + 1 !== facts.totalSlides) failures.push('not_every_slide_reached');
      if (facts.fragments > 0 && facts.keyboard.fragmentSteps < 1) failures.push('fragments_did_not_step');
      // Touch: one left swipe on the slide area moves forward.
      if (facts.totalSlides > 1) {
        await frame.evaluate(() => Reveal.slide(0, 0, Number.MAX_SAFE_INTEGER));
        const start = await position(frame);
        const session = await context.newCDPSession(page);
        const touch = (type, x) => session.send('Input.dispatchTouchEvent', { type,
          touchPoints: type === 'touchEnd' ? [] : [{ x, y: 360 }] });
        await touch('touchStart', 1000); for (const x of [900, 700, 500, 300]) await touch('touchMove', x); await touch('touchEnd', 300);
        await page.waitForTimeout(300);
        const after = await position(frame);
        facts.touch = { advanced: after.h > start.h || after.v > start.v };
        if (!facts.touch.advanced) failures.push('touch_swipe_did_not_move');
      }
      // Notes: N shows the current slide's notes on the slide (the S speaker window needs a normal browser tab).
      if (facts.slidesWithNotes > 0) {
        await frame.evaluate(() => { const slide = Reveal.getSlides().find((item) => (Reveal.getSlideNotes(item) ?? '').trim());
          const indices = Reveal.getIndices(slide); Reveal.slide(indices.h, indices.v); });
        await page.mouse.click(640, 360);
        await page.keyboard.press('n');
        facts.notes = await frame.evaluate(() => ({ shownOnSlide: document.querySelector('.reveal').classList.contains('show-notes'),
          text: (document.querySelector('.reveal .speaker-notes')?.innerText ?? '').trim().slice(0, 200) }));
        if (!facts.notes.shownOnSlide || !facts.notes.text) failures.push('notes_toggle_did_not_show_notes');
      }
      if (expectNotes && !facts.slidesWithNotes) failures.push('requested_notes_missing');
    }
    // 대비(S35 4단계): 장마다 조각(fragment)을 다 보인 채, 캐러셀·웹 검사와 같은 기준·방법(src/areas/making/rendered-contrast.js)으로
    // 그려진 미리보기에서 잰다. 키보드·터치 검사와 덱 상태가 얽히지 않게 따로 연 새 미리보기 화면에서 잰다(같은 화면에서 재면
    // 부하가 높을 때 뒤 키보드 검사가 실패했다). 모델에게 주는 사실이지 실패가 아니다(고칠지는 모델이 정한다).
    if (facts.ready) {
      const contrastPage = await context.newPage();
      try {
        await contrastPage.goto(`${origin}/`);
        const contrastFrame = await (await contrastPage.waitForSelector('#preview')).contentFrame();
        if (await waitReady(contrastFrame, timeoutMs)) facts.contrast = await deckContrast(contrastPage, contrastFrame);
      } finally { await contrastPage.close().catch(() => {}); }
    }
    // 폭(휴대폰 390·PC 1440): 장마다 모든 단계를 보인 채 내용이 장 크기(설정 너비·높이)를 넘는지, 글 칸이 한글을 낱말 안에서 끊지 않는지(keep-all).
    if (facts.ready) {
      facts.layout = {};
      for (const [label, viewport] of [['phone', { width: 390, height: 844 }], ['pc', { width: 1440, height: 900 }]]) {
        const layoutPage = await context.newPage();
        try {
          await layoutPage.setViewportSize(viewport); await layoutPage.goto(`${origin}/preview`);
          if (!await waitReady(layoutPage.mainFrame(), timeoutMs)) { failures.push(`layout_not_measured_${label}`); continue; }
          await layoutPage.evaluate(() => document.fonts.ready);
          const measured = await layoutPage.evaluate(() => {
            const { width, height } = Reveal.getConfig(); const overflowSlides = [];
            for (const slide of Reveal.getSlides()) {
              const at = Reveal.getIndices(slide); Reveal.slide(at.h, at.v, Number.MAX_SAFE_INTEGER);
              if (slide.scrollHeight > height + 4 || slide.scrollWidth > width + 4) overflowSlides.push(`${at.h + 1}${at.v ? `.${at.v + 1}` : ''}`);
            }
            const textNodes = [...document.querySelectorAll('.reveal .slides :is(h1,h2,h3,h4,p,li,td,th,blockquote,figcaption)')];
            return { overflowSlides, koreanWordBreak: textNodes.every((node) => getComputedStyle(node).wordBreak === 'keep-all') };
          });
          facts.layout[label] = { viewport, overflowSlides: measured.overflowSlides };
          facts.layout.koreanWordBreak = (facts.layout.koreanWordBreak ?? true) && measured.koreanWordBreak;
          if (measured.overflowSlides.length) failures.push(`slide_overflow_${label}`);
        } finally { await layoutPage.close().catch(() => {}); }
      }
      if (facts.layout.koreanWordBreak === false) failures.push('korean_word_break');
    }
    // Shared link copy, printed to PDF exactly as a viewer would with ?print-pdf.
    const printPage = await context.newPage(); watch(printPage);
    await printPage.goto(`${origin}/shared?print-pdf`);
    facts.shared = { ready: await waitReady(printPage.mainFrame(), timeoutMs) };
    if (facts.shared.ready) {
      await printPage.waitForFunction(() => document.documentElement.classList.contains('reveal-print') || Reveal.isPrintView?.(), null, { timeout: timeoutMs }).catch(() => {});
      await printPage.evaluate(() => document.fonts.ready);
      await printPage.waitForTimeout(300);
      let pdf = await printPage.pdf({ preferCSSPageSize: true, printBackground: true });
      if (facts.totalSlides && pdfPageCount(pdf) !== facts.totalSlides) {
        await printPage.waitForTimeout(700);
        pdf = await printPage.pdf({ preferCSSPageSize: true, printBackground: true });
      }
      facts.print = { pages: pdfPageCount(pdf), bytes: pdf.length };
      if (pdfPath) { await writeFile(pdfPath, pdf, { flag: 'wx' }); facts.print.written = pdfPath; }
      if (facts.totalSlides && facts.print.pages !== facts.totalSlides) failures.push('print_pages_do_not_match_slides');
    } else failures.push('engine_not_running_in_shared_copy');
    if (facts.externalRequests.length) failures.push('external_requests');
    if (facts.consoleErrors.length) failures.push('console_errors');
  } finally {
    await browser.close().catch(() => {});
    await new Promise((done) => server.close(done));
  }
  return { state: failures.length ? 'failed' : 'verified', failures, facts, chrome: chromePath };
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help')) {
    console.log('Usage: verify-deck.mjs ABSOLUTE_DECK.html [--expect-notes] [--pdf ABSOLUTE_NEW.pdf] [--chrome PATH]\n--pdf also writes the printed handout (one page per slide) to a new file.\nRenders the deck headless in the T5 preview CSP and the shared-link CSP; reports navigation, fragments, notes, touch, print pages, text contrast per slide, external requests and errors.');
    return;
  }
  const valueOf = (flag) => (args.indexOf(flag) >= 0 ? args[args.indexOf(flag) + 1] : null);
  const path = args.find((arg, index) => !arg.startsWith('--') && !['--chrome', '--pdf'].includes(args[index - 1]));
  if (!path || !isAbsolute(path)) throw new Error('deck path must be absolute');
  const pdfPath = valueOf('--pdf');
  if (pdfPath && !isAbsolute(pdfPath)) throw new Error('--pdf path must be absolute');
  const chromeIndex = args.indexOf('--chrome');
  const result = await verifyDeck({ html: await readFile(path, 'utf8'), name: path.split(/[\\/]/u).at(-1),
    expectNotes: args.includes('--expect-notes'), pdfPath, chromePath: chromeIndex >= 0 ? findChrome(args[chromeIndex + 1]) : findChrome() });
  console.log(JSON.stringify(result, null, 2));
  if (result.state === 'failed') process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(JSON.stringify({ state: 'error', reason: error.message })); process.exitCode = 1; });
}
