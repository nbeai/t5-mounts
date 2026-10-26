#!/usr/bin/env node
// 장 HTML을 헤드리스 크롬으로 PNG로 찍고, 대조판과 휴대폰 크기 점검판을 만든다. Node(22+)만 쓰고 외부 패키지·프로그램은 없다.
// 사용: node render.mjs --src <장 HTML 폴더> --out <PNG 폴더> [--only 03,05] [--sizes P=1080x1350,L=1920x1080] [--timeout 30]
// 장 HTML 이름은 sNN-이름.html. 각 장은 ?m=P(세로)·?m=L(가로)를 받아 <html class>로 판을 바꾼다(templates/slide.html 참고).
// 크롬 DevTools 프로토콜로 화면 크기를 정확히 지정해 찍는다 — 창 크기와 실제 화면 높이가 달라 아래가 잘리는 일이 없다.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const src = resolve(arg('src', '.'));
const out = resolve(arg('out', join(src, '..')));
const only = arg('only', '').split(',').filter(Boolean).map((n) => n.padStart(2, '0'));
const timeoutMs = Number(arg('timeout', '30')) * 1000; // 크롬 한 번(장 한 판) 찍기의 상한
const sizes = Object.fromEntries(arg('sizes', 'P=1080x1350,L=1920x1080').split(',').map((s) => {
  const [m, wh] = s.split('='); const [w, h] = wh.split('x').map(Number); return [m, { w, h }];
}));

// 티파이브 기본 스킬(전자책 PDF·발표 점검)과 같은 순서: T5_CHROME → 운영체제별 크롬·엣지·크로뮴.
const CHROME_CANDIDATES = {
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    `${process.env.HOME ?? ''}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
  win32: [`${process.env.ProgramFiles ?? 'C:\\Program Files'}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'}\\Microsoft\\Edge\\Application\\msedge.exe`],
  linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
};
function findChrome(explicit = process.env.T5_CHROME ?? process.env.CHROME ?? null) {
  if (explicit) return existsSync(explicit) ? explicit : null;
  return (CHROME_CANDIDATES[process.platform] ?? []).find((p) => existsSync(p)) ?? null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function withTimeout(promise, ms, what) {
  let timer;
  const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${what}: ${ms / 1000}초 안에 끝나지 않음`)), ms); });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

// ---------- 크롬 한 개를 띄우고 DevTools 프로토콜로 다룬다 ----------
let launches = 0;
async function launch(chromePath, profileRoot) {
  // 띄울 때마다 새 하위 프로필을 쓴다 — 앞서 멈춘 크롬이 남긴 포트 파일을 잘못 읽지 않게.
  const profile = join(profileRoot, `p${++launches}`);
  const proc = spawn(chromePath, ['--headless=new', `--user-data-dir=${profile}`, '--remote-debugging-port=0',
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-extensions', '--hide-scrollbars',
    '--force-device-scale-factor=1', 'about:blank'], { stdio: 'ignore' });
  const kill = async () => {
    if (proc.exitCode != null || proc.signalCode != null) return;
    const exited = new Promise((r) => proc.once('exit', r));
    try { proc.kill(); } catch {}
    await withTimeout(exited, 5000, '크롬 끄기').catch(() => {});
    if (proc.exitCode == null && proc.signalCode == null) { try { proc.kill('SIGKILL'); } catch {} await withTimeout(exited, 2000, '크롬 끄기').catch(() => {}); }
  };
  let ws = null;
  try {
    const portFile = join(profile, 'DevToolsActivePort');
    const started = Date.now();
    while (!existsSync(portFile)) {
      if (proc.exitCode != null) throw new Error('크롬이 바로 꺼졌어요.');
      if (Date.now() - started > timeoutMs) throw new Error('크롬이 시간 안에 뜨지 않았어요.');
      await sleep(100);
    }
    await sleep(50);
    const port = readFileSync(portFile, 'utf8').split('\n')[0].trim();
    const targets = await withTimeout(fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()), timeoutMs, '크롬 연결');
    const page = targets.find((t) => t.type === 'page');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await withTimeout(new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = () => bad(new Error('크롬 연결 실패')); }), timeoutMs, '크롬 연결');
  } catch (error) { try { ws?.close(); } catch {} await kill(); throw error; }
  let id = 0; const pending = new Map(); const waiters = [];
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, bad } = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? bad(new Error(msg.error.message)) : ok(msg.result);
    } else if (msg.method) waiters.filter((w) => w.method === msg.method).forEach((w) => { waiters.splice(waiters.indexOf(w), 1); w.ok(msg.params); });
  };
  const send = (method, params = {}) => new Promise((ok, bad) => { const n = ++id; pending.set(n, { ok, bad }); ws.send(JSON.stringify({ id: n, method, params })); });
  const once = (method) => new Promise((ok) => waiters.push({ method, ok }));
  await send('Page.enable');
  const close = async () => { try { ws.close(); } catch {} await kill(); };
  return { proc, send, once, close };
}

async function shot(browser, url, w, h, file, { fullHeight = false } = {}) {
  const t0 = Date.now(); const lap = (what) => process.env.PROMO_DEBUG && console.log(what, Date.now() - t0, 'ms');
  await browser.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const loaded = browser.once('Page.loadEventFired');
  await browser.send('Page.navigate', { url });
  await loaded; lap('load');
  // 글꼴과 그림이 다 들어올 때까지 기다린다.
  await browser.send('Runtime.evaluate', { awaitPromise: true, expression:
    'Promise.all([document.fonts.ready, ...[...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))]).then(() => 1)' });
  lap('fonts');
  if (fullHeight) {
    const { result } = await browser.send('Runtime.evaluate', { expression: 'document.documentElement.scrollHeight' });
    h = Math.ceil(result.value);
    await browser.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  }
  await sleep(150);
  const { data } = await browser.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
  writeFileSync(file, Buffer.from(data, 'base64'));
}

// ---------- 실행 ----------
const chromePath = findChrome();
if (!chromePath) { console.error('크롬·엣지·크로뮴을 찾지 못했어요. T5_CHROME=<실행 파일 경로> 로 알려 주세요.'); process.exit(1); }
mkdirSync(out, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'promo-render-'));   // 평소 크롬 프로필을 건드리지 않는 임시 프로필
const sheetDir = mkdtempSync(join(tmpdir(), 'promo-sheet-'));
let browser = null; const made = []; const failed = [];
const cleanup = async () => {
  const b = browser; browser = null; await b?.close();
  for (const dir of [profile, sheetDir]) { try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {} }
};
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup().finally(() => process.exit(130)); });

async function attempt(url, w, h, file, opts) {
  try {
    browser ??= await launch(chromePath, profile);
    await withTimeout(shot(browser, url, w, h, file, opts), timeoutMs, basename(file));
    return true;
  } catch (error) {
    failed.push(`${basename(file)} — ${error.message}`);
    const b = browser; browser = null; await b?.close(); // 멈춘 크롬은 버리고 다음 장은 새로 띄운다
    return false;
  }
}

try {
  const slides = readdirSync(src).filter((f) => /^s\d\d-.*\.html$/.test(f)).sort()
    .filter((f) => !only.length || only.includes(f.slice(1, 3)));
  for (const f of slides) {
    for (const [m, { w, h }] of Object.entries(sizes)) {
      const png = join(out, `${basename(f, '.html')}_${w}x${h}.png`);
      const url = `${pathToFileURL(join(src, f)).href}?m=${m}`;
      if (await attempt(url, w, h, png)) made.push(png);
    }
    console.log('찍음', f);
  }

  // 대조판(모든 장)과 휴대폰 점검판(세로를 폭 390px로) — 렌더된 PNG를 HTML 격자로 모아 다시 찍는다.
  const all = readdirSync(out).filter((f) => /^s\d\d-.*_\d+x\d+\.png$/.test(f)).sort();
  const byMode = (m) => all.filter((f) => f.endsWith(`_${sizes[m].w}x${sizes[m].h}.png`));
  const grid = (files, cell, cols) => `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:40px;background:#F2EFE8;font-family:'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif">
<div style="display:grid;grid-template-columns:repeat(${cols},${cell}px);gap:20px">${files.map((f) =>
    `<figure style="margin:0"><img src="${pathToFileURL(join(out, f)).href}" style="width:${cell}px;display:block;box-shadow:0 2px 10px rgba(0,0,0,.12)"><figcaption style="font-size:14px;color:#666;margin-top:6px">${f}</figcaption></figure>`).join('')}</div></body>`;
  const sheets = [['00-대조판.png', Object.keys(sizes).flatMap(byMode), 560]];
  if (sizes.P) sheets.push(['00-휴대폰점검.png', byMode('P'), 390]);
  for (const [name, files, cell] of sheets) {
    if (!files.length) continue;
    const html = join(sheetDir, `${name}.html`);
    writeFileSync(html, grid(files, cell, 5));
    await attempt(pathToFileURL(html).href, 80 + 5 * cell + 4 * 20, 600, join(out, name), { fullHeight: true });
  }
} finally {
  await cleanup();
}
console.log(`PNG ${made.length}장, 대조판·휴대폰 점검판 → ${out}`);
if (failed.length) { console.error(`실패 ${failed.length}건:\n${failed.join('\n')}`); process.exitCode = 2; }
