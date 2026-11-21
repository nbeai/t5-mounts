---
name: site-google-sheets-format
description: Google Sheets (구글 시트) formatting hand — bold a range, freeze rows, add a filter, each read back through the sheet's own menus.
metadata:
  t5Web:
    hosts: [docs.google.com]
    keywords: [구글 시트 서식, 행 고정, 필터 만들기]
    tools: [browser_run_code]
    handFunctions:
      - { name: formatRange, paths: [/spreadsheets/], effect: external_change, description: "범위 굵게·행 고정·필터를 넣고 메뉴로 다시 읽어 확인(args range, bold, freezeRows, filter)" }
---

# Google Sheets formatting

`site.formatRange({ range: 'A1:F1', bold: true, freezeRows: 1, filter: true })` on the tab that is open (site.openSheetTab first).
- bold: the toolbar 굵게 button state is read back.
- freezeRows: 보기 › 고정 › N행, read back from the sheet's own xlsx export (pane frozen, ySplit) for the open tab.
- filter: 데이터 › 필터 만들기 for the selected range (select the whole table, e.g. A1:F4), read back as 필터 삭제 in the 데이터 menu.
- The xlsx export (pane state="frozen", autoFilter) shows freeze and filter as well.

```js t5-hand:formatRange
async (page, args = {}) => {
  const done = [];
  const box = page.locator('#t-name-box');
  const menu = async (top, ...items) => { await page.getByRole('menuitem', { name: top, exact: true }).first().click(); for (const name of items) await page.getByRole('menuitem', { name }).first().click(); };
  if (args.range) { await box.click(); await box.fill(String(args.range)); await box.press('Enter'); await page.waitForTimeout(150); }
  if (args.bold) {
    const bold = page.getByRole('button', { name: /^굵게|^Bold/ }).first();
    if ((await bold.getAttribute('aria-pressed')) !== 'true') await page.keyboard.press('ControlOrMeta+B');
    const r = await confirmWritten(async () => bold.getAttribute('aria-pressed'), 'true'); done.push({ bold: r.state });
  }
  // 다시 읽기는 그 페이지 자신의 메뉴로: 보기 › 고정 의 체크, 데이터 메뉴의 「필터 삭제」.
  const rowItem = new RegExp('^' + Number(args.freezeRows || 1) + '행');
  // 고정 다시 읽기: 같은 로그인으로 xlsx 를 내보내 지금 탭 시트의 pane state="frozen"·ySplit 을 읽는다(메뉴 체크 표시는 읽히지 않는다).
  const frozenNow = async () => {
    const id = (new URL(page.url()).pathname.match(/\/d\/([^/]+)/) || [])[1];
    const tab = await page.evaluate(() => String((document.querySelector('.docs-sheet-active-tab .docs-sheet-tab-name') || {}).innerText || '').trim());
    const b = new Uint8Array(await (await fetch('/spreadsheets/d/' + id + '/export?format=xlsx', { cache: 'no-store' })).arrayBuffer());
    const dv = new DataView(b.buffer, b.byteOffset); let e = b.length - 22; while (e > 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    const files = {}; let p = dv.getUint32(e + 16, true);
    for (let k = dv.getUint16(e + 10, true); k > 0; k--) {
      const m = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), off = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nl)); p += 46 + nl + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
      if (!/^xl\/(workbook\.xml|worksheets\/sheet\d+\.xml)$/.test(name)) continue;
      const at = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), data = b.subarray(at, at + size);
      files[name] = m === 0 ? new TextDecoder().decode(data) : await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    }
    const order = [...String(files['xl/workbook.xml'] || '').matchAll(/<sheet [^>]*name="([^"]*)"/g)].map((x) => x[1].replace(/&amp;/g, '&'));
    const sheet = String(files['xl/worksheets/sheet' + (order.indexOf(tab) + 1) + '.xml'] || '');
    const pane = sheet.match(/<pane [^>]*ySplit="([\d.]+)"[^>]*state="frozen"/);
    return pane ? Math.round(Number(pane[1])) : 0;
  };
  const filterNow = async () => { await page.getByRole('menuitem', { name: '데이터', exact: true }).first().click(); const n = await page.getByRole('menuitem', { name: /^필터 삭제|^Remove filter/ }).count(); await page.keyboard.press('Escape'); return n; };
  if (args.freezeRows) { await menu('보기', /^고정/, rowItem); const r = await confirmWritten(frozenNow, (n) => n === Number(args.freezeRows), { timeoutMs: 20000, intervalMs: 2500 }); done.push({ freezeRows: Number(args.freezeRows), readBack: r.state, read: r.observed, ...(r.lastError ? { error: r.lastError } : {}) }); }
  if (args.filter) {
    await menu('데이터', /^필터 만들기/);
    const r = await confirmWritten(filterNow, (n) => n > 0, { timeoutMs: 4000 });
    done.push({ filter: r.state });
  }
  return { state: done.every((d) => !Object.values(d).includes('not_confirmed')) ? 'applied' : 'partly', done, ...(done.some((d) => Object.values(d).includes('not_confirmed')) ? { note: 'The xlsx export (pane state="frozen", autoFilter) shows freeze and filter too.' } : {}) };
}
```
