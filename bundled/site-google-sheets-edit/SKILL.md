---
name: site-google-sheets-edit
description: Google Sheets (구글 시트) editing hands — tabs (list, add, rename, open) and pasting a whole table, each change read back.
metadata:
  t5Web:
    hosts: [docs.google.com]
    keywords: [구글 시트 탭, 시트 탭, 스프레드시트 만들어]
    tools: [browser_run_code]
    handFunctions:
      - { name: listTabs, paths: [/spreadsheets/], effect: observe, description: "탭 이름·지금 탭" }
      - { name: openSheetTab, paths: [/spreadsheets/], effect: observe, description: "이름으로 탭을 연다(args name)" }
      - { name: addTab, paths: [/spreadsheets/], effect: external_change, description: "탭을 더하고 이름을 붙여 다시 읽어 확인(args name)" }
      - { name: renameTab, paths: [/spreadsheets/], effect: external_change, description: "탭 이름 바꾸기(args from, to)" }
      - { name: pasteRows, paths: [/spreadsheets/], effect: external_change, description: "지금 탭의 칸부터 표 전체를 붙여넣고 다시 읽어 확인(args at 'A1', rows [[...]])" }
---

# Google Sheets editing

Works on `docs.google.com/spreadsheets/d/<id>/edit`. The reading and cell-writing hands are in site-google-sheets (readCells takes `sheet: '<tab name>'`).

## A sheet with several tabs (e.g. 후보 비교·우선순위·회신·운영)
- New spreadsheet: open `https://docs.google.com/spreadsheets/create`, then set the title in the 이름 바꾸기 box and press Enter.
- The first tab exists: `site.renameTab({ from: '시트1', to: '후보 비교' })`; then `site.addTab({ name: '우선순위' })` for each next tab.
- Fill a tab: `site.openSheetTab({ name })`, then `site.pasteRows({ at: 'A1', rows })` with the header row first. Cells starting with `=` stay formulas; `=HYPERLINK("url","label")` makes a link.
- Format: `site.formatRange(...)` (site-google-sheets-format).
- Each hand reads its change back (tabs by name, pasted values through the sheet's data address) and returns `confirmed` or `not_confirmed` with what it read.
- The link to give is the address in the bar without `#gid` (people the person shares with can open it; access stays as the person set it).
- xlsx: `fetch('/spreadsheets/d/<id>/export?format=xlsx')` returns the file (write it with fs into workspace). To bring an xlsx in: 파일 → 가져오기 → 업로드.

```js t5-hand:listTabs
async (page) => {
  const tabs = await page.evaluate(() => [...document.querySelectorAll('.docs-sheet-tab')].map((t) => ({ name: String((t.querySelector('.docs-sheet-tab-name') || t).innerText || '').trim(), active: t.classList.contains('docs-sheet-active-tab') })));
  return { state: 'read', tabs, active: (tabs.find((t) => t.active) || {}).name || null };
}
```

```js t5-hand:openSheetTab
async (page, args = {}) => {
  await page.locator('.docs-sheet-tab').filter({ has: page.locator('.docs-sheet-tab-name', { hasText: String(args.name) }) }).first().click();
  const r = await confirmWritten(async () => page.evaluate(() => String((document.querySelector('.docs-sheet-active-tab .docs-sheet-tab-name') || {}).innerText || '').trim()), String(args.name));
  return { state: r.state === 'confirmed' ? 'opened' : 'not_opened', active: r.observed };
}
```

```js t5-hand:renameTab
async (page, args = {}) => {
  const names = async () => page.evaluate(() => [...document.querySelectorAll('.docs-sheet-tab-name')].map((n) => String(n.innerText || '').trim()));
  if (args.from) await page.locator('.docs-sheet-tab-name', { hasText: String(args.from) }).first().click();
  await page.locator('.docs-sheet-active-tab .docs-sheet-tab-name').first().dblclick();
  await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.insertText(String(args.to)); await page.keyboard.press('Enter');
  const r = await confirmWritten(names, (v) => v.includes(String(args.to)));
  return { state: r.state, tabs: r.observed };
}
```

```js t5-hand:addTab
async (page, args = {}) => {
  const names = async () => page.evaluate(() => [...document.querySelectorAll('.docs-sheet-tab-name')].map((n) => String(n.innerText || '').trim()));
  const before = (await names()).length;
  await page.getByRole('button', { name: /시트 추가|Add Sheet/ }).first().click();
  const added = await confirmWritten(names, (v) => v.length === before + 1);
  if (added.state !== 'confirmed' || !args.name) return { state: added.state, tabs: added.observed };
  await page.locator('.docs-sheet-active-tab .docs-sheet-tab-name').first().dblclick();
  await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.insertText(String(args.name)); await page.keyboard.press('Enter');
  const r = await confirmWritten(names, (v) => v.includes(String(args.name)));
  return { state: r.state, tabs: r.observed };
}
```

```js t5-hand:pasteRows
async (page, args = {}) => {
  const rows = (args.rows || []).map((r) => r.map((v) => String(v ?? '').replace(/[\t\n]/g, ' ')));
  const at = String(args.at || 'A1').toUpperCase();
  const box = page.locator('#t-name-box');
  await box.click(); await box.fill(at); await box.press('Enter'); await page.waitForTimeout(150);
  await pasteText(page, rows.map((r) => r.join('\t')).join('\n'));
  const tab = await page.evaluate(() => String((document.querySelector('.docs-sheet-active-tab .docs-sheet-tab-name') || {}).innerText || '').trim());
  const id = (new URL(page.url()).pathname.match(/\/d\/([^/]+)/) || [])[1];
  const c0 = [...at.replace(/\d+/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0), r0 = Number(at.replace(/[A-Z]/g, ''));
  const col = (n) => { let t = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) t = String.fromCharCode(65 + (n - 1) % 26) + t; return t; };
  const width = Math.max(...rows.map((r) => r.length));
  const range = at + ':' + col(c0 + width - 1) + (r0 + rows.length - 1);
  const gid = (page.url().match(/gid=(\d+)/) || [])[1];
  const csv = (t) => { const out = []; let row = [], cell = '', qd = false; for (let i = 0; i < t.length; i++) { const ch = t[i];
    if (qd) { if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') qd = false; else cell += ch; }
    else if (ch === '"') qd = true; else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n') { row.push(cell); out.push(row); row = []; cell = ''; } else if (ch !== '\r') cell += ch; }
    if (cell || row.length) { row.push(cell); out.push(row); } return out; };
  // 정확한 값은 그 탭의 CSV 내보내기(같은 로그인), 안 되면 gviz(숫자 열의 글자 칸을 비울 수 있음).
  const read = async () => { let r = gid ? await fetch('/spreadsheets/d/' + id + '/export?format=csv&gid=' + gid + '&range=' + range, { cache: 'no-store' }).catch(() => null) : null;
    if (!r || !/csv/.test(r.headers.get('content-type') || '')) r = await fetch('/spreadsheets/d/' + id + '/gviz/tq?tqx=out:csv&headers=0&sheet=' + encodeURIComponent(tab) + '&range=' + range, { cache: 'no-store' });
    return csv(await r.text()); };
  const plain = (v) => !/^=/.test(v);
  const r = await confirmWritten(read, (got) => rows.every((row, i) => row.every((v, j) => !plain(v) || v === '' || (got[i] || [])[j] === v)), { timeoutMs: 15000 });
  return { state: r.state, tab, range, rows: rows.length, ...(r.state === 'confirmed' ? {} : { read: r.observed }) };
}
```
