---
name: site-google-sheets
description: Google Sheets (구글 시트) site knowledge — the grid is drawn on a canvas, so cells are read through the sheet's own data address and written through the name box, then read back before anything is called saved.
metadata:
  t5Web:
    hosts: [docs.google.com]
    keywords: [구글 시트, 구글시트, 구글 스프레드시트, google sheets, google sheet]
    tools: [browser_run_code]
    handFunctions:
      - { name: readCells, paths: [/spreadsheets/], effect: observe, description: "시트 칸 값을 읽는다(args range 'A1:J50', sheet 탭 이름 또는 gid). 문서 응답 상태와 함께" }
      - { name: writeCells, paths: [/spreadsheets/], effect: external_change, description: "칸에 값·링크를 쓰고 저장을 기다려 다시 읽어 맞는지 돌려준다(args cells [{cell,value,link}])" }
      - { name: readFormulas, paths: [/spreadsheets/], effect: observe, description: "칸마다 수식 입력줄 글(링크 수식 포함)을 읽는다(args cells ['C5'])" }
---

# Google Sheets

Applies to `docs.google.com/spreadsheets/d/<id>/edit…` (`gid` = the tab).

## Reading and writing
- The grid is a canvas: the snapshot shows menus, the name box and the formula bar, not cell values.
- Read with `site.readCells({ range: 'A1:J50' })` returns the rows, the header row and `documentResponse` from the sheet's own CSV export (signed in).
- Write with `site.writeCells({ cells: [{ cell: 'C5', value: '채널 이름', link: 'https://…' }] })` (effect external_change). A cell with `link` becomes `=HYPERLINK("link","value")`. It waits for the save status, reads every cell back with confirmWritten and returns `state: 'saved'` only when each read-back matches.
- Write only the cells asked for; read the header row first to match columns.
- Whole tables and tabs: site-google-sheets-edit (pasteRows, addTab).

## Sign-in and permission
- Judge sign-in from the sheet document itself: `documentResponse` of readCells and the page address. A 401 or a sign-in address in auxiliary Google frames or background requests (signInEvidence) is not the document's state.
- `writeCells` returns `not_editable` with the control that showed it (a view-only badge) when the person cannot edit. Say exactly that, with the evidence, not "not signed in".
- A "window too small" notice is about the page's viewport, not sign-in or permission.

## When writing is blocked
- Keep what you gathered: save the rows (the same columns, with source links) to a local xlsx in the work folder with document_data, tell the person where it is and what blocked the sheet, and continue into the sheet when it is editable.

```js t5-hand:readCells
async (page, args = {}) => {
  const at = new URL(page.url());
  const id = (at.pathname.match(/\/spreadsheets\/(?:u\/\d+\/)?d\/([^/]+)/) || [])[1];
  if (!id) return { state: 'not_a_sheet', url: page.url() };
  const gid = String(args.gid ?? (at.hash.match(/gid=(\d+)/) || at.search.match(/gid=(\d+)/) || [])[1] ?? '0');
  const range = String(args.range || 'A1:Z100');
  const q = '&range=' + encodeURIComponent(range), base = '/spreadsheets/d/' + id;
  const get = async (a) => { try { const r = await fetch(a, { cache: 'no-store' }); return { status: r.status, type: r.headers.get('content-type') || '', text: (await r.text()).slice(0, 300000) }; } catch { return { status: 0, type: '', text: '' }; } };
  // 정확한 값은 CSV 내보내기(같은 로그인), 탭 이름만 받았으면 gviz(숫자 열의 글자 칸을 비울 수 있음).
  let source = args.sheet ? 'gviz' : 'export', got = args.sheet ? { type: '' } : await get(base + '/export?format=csv&gid=' + gid + q);
  if (!/csv/.test(got.type)) { source = 'gviz'; got = await get(base + '/gviz/tq?tqx=out:csv&headers=0&' + (args.sheet ? 'sheet=' + encodeURIComponent(String(args.sheet)) : 'gid=' + gid) + q); }
  const documentResponse = { status: got.status, contentType: got.type.split(';')[0], source };
  if (!/csv/.test(got.type)) return { state: got.status === 401 || /accounts\.google|ServiceLogin/.test(got.text.slice(0, 3000)) ? 'sign_in_required' : 'not_readable', documentResponse };
  const rows = []; let row = [], cell = '', quoted = false; const s = got.text;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) { if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch; }
    else if (ch === '"') quoted = true; else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const start = range.match(/^([A-Z]+)(\d+)/i) || [null, 'A', '1'];
  const col0 = [...start[1].toUpperCase()].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  const letter = (n) => { let t = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) t = String.fromCharCode(65 + (n - 1) % 26) + t; return t; };
  const out = rows.map((r, k) => ({ row: Number(start[2]) + k, cells: Object.fromEntries(r.map((v, j) => [letter(col0 + j), v]).filter(([, v]) => v !== '')) }));
  return { state: 'read', sheetUrl: page.url(), gid, range, documentResponse, header: out[0] ?? null, rows: out, note: 'Values as the sheet shows them; a link cell shows its label (readFormulas gives the link).' };
}
```

```js t5-hand:readFormulas
async (page, args = {}) => {
  const box = page.locator('#t-name-box'), bar = page.locator('#t-formula-bar-input');
  const out = [];
  for (const cell of (args.cells || []).slice(0, 100)) {
    await box.click(); await box.fill(String(cell)); await box.press('Enter'); await page.waitForTimeout(200);
    out.push({ cell, formula: (await bar.innerText().catch(() => '')).replace(/\n$/, '') });
  }
  return { state: 'read', cells: out };
}
```

```js t5-hand:writeCells
async (page, args = {}) => {
  const cells = (args.cells || []).slice(0, 200);
  const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const textOf = (c) => c.link ? '=HYPERLINK(' + q(c.link) + ',' + q(c.value ?? c.link) + ')' : /^[=+\-@]/.test(String(c.value ?? '')) ? "'" + c.value : String(c.value ?? '');
  const badge = await page.evaluate(() => String((document.querySelector('.docs-titlebar-badges') || {}).innerText || '').replace(/\s+/g, ' ').trim()).catch(() => '');
  if (/보기 전용|댓글|View only|Comment/i.test(badge)) return { state: 'not_editable', evidence: { control: 'title bar badge', text: badge.slice(0, 80) }, cells: [] };
  const box = page.locator('#t-name-box'), bar = page.locator('#t-formula-bar-input');
  const go = async (cell) => { await box.click(); await box.fill(String(cell)); await box.press('Enter'); await page.waitForTimeout(150); };
  for (const c of cells) {
    await go(c.cell);
    await page.keyboard.press('Enter'); await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.insertText(textOf(c)); await page.keyboard.press('Enter');
  }
  const status = page.getByRole('button', { name: /문서 상태|Document status/ }).first();
  const saved = await confirmWritten(async () => (await status.getAttribute('aria-label').catch(() => '')) || (await status.innerText().catch(() => '')), (v) => /저장됨|Saved/i.test(v) && !/저장 중|Saving/i.test(v), { timeoutMs: 20000 });
  const back = [];
  for (const c of cells) {
    const want = textOf(c).replace(/^'/, '');
    const same = (v) => String(v).replace(/\s/g, '').toLowerCase() === want.replace(/\s/g, '').toLowerCase();
    const r = await confirmWritten(async () => { await go(c.cell); return (await bar.innerText().catch(() => '')).replace(/\n$/, ''); }, same, { timeoutMs: 3000 });
    back.push({ cell: c.cell, expected: want, formula: r.observed, ok: r.state === 'confirmed' });
  }
  const saveStatus = String(saved.observed || '');
  const ok = back.length > 0 && back.every((b) => b.ok) && saved.state === 'confirmed';
  return { state: ok ? 'saved' : 'not_saved', saveStatus: saveStatus.slice(0, 80), sheetUrl: page.url(), cells: back,
    ...(ok ? {} : { note: 'Some cells did not read back as written or the save status did not say saved; read them again before telling the person.' }) };
}
```
