// Serve a dashboard exactly as the T5 workbench preview does (same CSP, preview bridge, sandboxed iframe)
// and measure what a person would see. Shared by the model-facing checker and the hidden A/B oracle.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';

import {
  injectArtifactPreviewBridge, readWebBundleEntry, renderAttachmentPreview, webPreviewContentSecurityPolicy,
} from '../../../../src/areas/document/artifact-preview.js';

const ATTACHMENT_ID = '00000000-0000-4000-8000-00000000da5b';
const SESSION_ID = '00000000-0000-4000-8000-0000000005e5';

export function findChrome(env = process.env) {
  const candidates = [env.T5_DASHBOARD_CHROME, env.T5_DASHBOARD_ORACLE_CHROME,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    `${env.HOME ?? ''}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean);
  return candidates.find((path) => existsSync(path)) ?? null;
}

// ---------- serving exactly like the workbench ----------
export async function servedDashboard(path) {
  const bytes = await readFile(path);
  const zip = extname(path).toLowerCase() === '.zip';
  if (zip) readWebBundleEntry(bytes, 'index.html');
  else if (!['.html', '.htm'].includes(extname(path).toLowerCase())) throw new Error('dashboard must be .html or a web bundle .zip');
  const preview = zip ? null : await renderAttachmentPreview({
    record: { attachmentId: ATTACHMENT_ID, sessionId: SESSION_ID, originalName: basename(path), kind: 'web', mimeType: 'text/html' }, bytes,
  });
  const entry = zip ? `/attachments/${ATTACHMENT_ID}/web/${SESSION_ID}/index.html` : `/attachments/${ATTACHMENT_ID}/preview`;
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;overflow:hidden}iframe{border:0;width:100vw;height:100vh;display:block}</style></head><body><iframe title="dashboard" sandbox="allow-scripts" src="${entry}"></iframe><script>window.__t5Logs=[];addEventListener('message',e=>{if(e.data&&e.data.type==='t5-artifact-log')window.__t5Logs.push(e.data)})</script></body></html>`);
      return;
    }
    try {
      if (!zip && url.pathname === entry) {
        res.writeHead(200, { 'content-type': preview.contentType, 'content-security-policy': preview.contentSecurityPolicy });
        res.end(preview.body); return;
      }
      const prefix = `/attachments/${ATTACHMENT_ID}/web/${SESSION_ID}/`;
      if (zip && url.pathname.startsWith(prefix)) {
        const file = readWebBundleEntry(bytes, url.pathname.slice(prefix.length));
        res.writeHead(200, { 'content-type': file.contentType, 'content-security-policy': webPreviewContentSecurityPolicy(),
          'cross-origin-resource-policy': 'cross-origin', 'x-content-type-options': 'nosniff' });
        res.end(file.contentType.startsWith('text/html') ? injectArtifactPreviewBridge(file.body.toString('utf8'), ATTACHMENT_ID) : file.body);
        return;
      }
    } catch (error) { res.writeHead(error.status ?? 500); res.end(String(error.message)); return; }
    res.writeHead(404); res.end();
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  return { server, origin: `http://127.0.0.1:${server.address().port}`, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, kind: zip ? 'web_app' : 'web' };
}

// ---------- in-frame measurements ----------
export const measureInFrame = (contrast) => {
  const parse = (value) => {
    const match = String(value).match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const parts = match[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };
  const luminance = ({ r, g, b }) => {
    const channel = (value) => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const blend = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
  const background = (element) => {
    const layers = [];
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage && style.backgroundImage !== 'none') return null;
      const color = parse(style.backgroundColor);
      if (color && color.a > 0) { layers.push(color); if (color.a >= 1) break; }
    }
    let result = { r: 255, g: 255, b: 255, a: 1 };
    for (const layer of layers.reverse()) result = blend(layer, result);
    return result;
  };
  const visible = (element) => {
    const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
  };
  let measured = 0; let unmeasured = 0; const violations = [];
  for (const element of document.body.querySelectorAll('*')) {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'CANVAS'].includes(element.tagName.toUpperCase())) continue;
    if (element.closest('svg')) continue;
    const ownText = [...element.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent).join('').trim();
    if (!ownText || !visible(element)) continue;
    const style = getComputedStyle(element); const fg = parse(style.color); const bg = background(element);
    if (!fg || !bg) { unmeasured++; continue; }
    const text = blend(fg, bg); const lighter = Math.max(luminance(text), luminance(bg)); const darker = Math.min(luminance(text), luminance(bg));
    const ratio = (lighter + 0.05) / (darker + 0.05); const size = parseFloat(style.fontSize); const bold = Number(style.fontWeight) >= 700;
    const required = size >= 24 || (bold && size >= 18.66) ? contrast.largeText : contrast.normalText;
    measured++;
    if (ratio + 1e-9 < required) violations.push({ text: ownText.slice(0, 40), ratio: Number(ratio.toFixed(2)), required, fontSize: size });
  }
  const canvases = [...document.querySelectorAll('canvas')].filter(visible).map((canvas) => {
    try {
      const context = canvas.getContext('2d'); if (!context || !canvas.width || !canvas.height) return { drawn: false };
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data; let painted = 0;
      for (let index = 3; index < data.length; index += 16) if (data[index] > 0) painted++;
      return { drawn: painted > 50, width: canvas.width, height: canvas.height };
    } catch (error) { return { drawn: false, error: String(error?.message ?? error) }; }
  });
  const svgCharts = [...document.querySelectorAll('svg')].filter(visible).filter((svg) => svg.querySelectorAll('path,rect,circle,line,polyline').length >= 5).length;
  const root = document.documentElement;
  const bodyFont = getComputedStyle(document.body).fontFamily;
  const faces = [...document.fonts].map((face) => ({ family: face.family.replace(/["']/g, ''), status: face.status }));
  return {
    text: document.body.innerText,
    horizontalOverflowPx: Math.max(0, root.scrollWidth - root.clientWidth),
    contrast: { measured, unmeasured, violations: violations.slice(0, 20), violationCount: violations.length },
    charts: { canvases, canvasDrawn: canvases.filter((item) => item.drawn).length, svgCharts },
    fonts: { bodyFont, faces },
  };
};

export async function dashboardFrame(page) {
  await page.waitForFunction(() => document.querySelector('iframe')?.contentWindow != null);
  for (let attempt = 0; attempt < 50; attempt++) {
    const frame = page.frames().find((candidate) => candidate !== page.mainFrame());
    if (frame) { await frame.waitForLoadState('load'); return frame; }
    await page.waitForTimeout(100);
  }
  throw new Error('dashboard frame did not load');
}

