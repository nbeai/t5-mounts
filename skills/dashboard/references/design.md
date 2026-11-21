# Dashboard design reference

Read this only when the request is open-ended (no stated rules or KPIs), when the builder cannot express the requested screen, or when the user asks for a custom look. The default flow is in SKILL.md.

## Learn before asking

Inspect the user's actual files first: sheets, columns, statuses and their spelling, blanks, known zeros, duplicate keys, date ranges, owners, units. Then ask only what the data cannot show, in one short conversational message, and scale it to the request. A quick "show me this sheet as a chart" needs no questions; an operating board someone will use every day usually needs a few. Never send a questionnaire, and do not ask what you already observed.

Useful topics, chosen by judgment rather than as a checklist:

- Problem: who uses it, and one real recent case where something was missed or late. That case shows the bottleneck better than a general description.
- Target and KPI: what "done" means, the target, and when something counts as late or needs an alert.
- Boundary: what stays manual and what T5 should refresh, remind or check automatically.
- Data: where new records arrive, which file or system is the source of truth, exceptions in the workflow, and statuses in two layers (the few stages people act on, and detailed reasons beneath them).
- Look: one or two short choices only when the user cares; otherwise use a restrained default.

Summarize the understanding in one or two sentences inside the same message or the build reply, state assumptions you made, and build. Unresolved non-blocking facts stay visible in the dashboard instead of stopping the work.

## Decide the screens

- Operating dashboards open on action: "오늘 할 일" first — overdue and due-today items with the reason and the next step, then counts, then trends. Keep a number only if it changes what someone does.
- Give each screen one goal. Group per-status actions with the status they change.
- Choose components from data shape: a few headline numbers → KPI tiles with comparison or target; items to act on → list or cards with badges; time → line or column; ranking → sorted bar; part-to-whole with few parts → stacked bar; distribution → histogram; relationship → scatter. Follow the FT Visual Vocabulary question type and Stephen Few's rules: no gauges or 3D, no decorative color, no false precision, context next to each number.
- Mobile first: single column at 390px, no horizontal page scroll, touch targets at least 40px, tables become cards on narrow screens, filters stay reachable.
- Show the as-of time and the source name. Distinguish known values, known zero, blank and invalid; never fill blanks with zero.

## Custom HTML (only when the builder cannot express the screen)

The workbench preview allows inline scripts and styles, `data:` fonts and images, and nothing from the network. CDN scripts and web fonts fail there.

1. Write a draft HTML file with the data computed from the observed source (or embedded source rows with the calculation in script, so filters recompute from the same records). Use these placeholders:
   - `<style data-t5-asset="pretendard"></style>` for Pretendard 400/700;
   - `<script data-t5-asset="echarts"></script>` for Apache ECharts 6.1.0, and optionally `<script data-t5-asset="echarts-ko"></script>` after it for Korean chart UI text.
2. Run `node "$T5_DASHBOARD_DIR/scripts/inline-assets.mjs" --input DRAFT.html --output DASHBOARD.html` (use the runtime Node executable from the terminal execution environment when `node` is not on PATH). It checks pinned digests, inlines the bytes and reports size against the 5 MB preview limit.
3. Style: `font-family: "Pretendard", system-ui, sans-serif; font-variant-numeric: tabular-nums;`. Text contrast at least 4.5:1 (3:1 for large text and chart marks). Never rely on color alone: pair status color with a label or icon. Use a native `<select>` or buttons with visible names for filters.
4. ECharts: `echarts.init(element)` then `setOption`; resize on `resize`; set `textStyle.fontFamily` to Pretendard; give the chart container an `aria-label` and show the key values as text nearby.

For a multi-file web app, a ZIP with `index.html` plus copied files from `$T5_DASHBOARD_DIR/assets/` may reference them by relative path instead.

## Verify a custom page

Run `check-dashboard.mjs` on it as in SKILL.md; without embedded builder data it checks rendering only, so also compare the headline numbers with `profile-data.mjs` facts and exercise each filter in the browser.

## Changes, edits and refresh

- A new version is regenerated from the source; do not hand-edit numbers inside the HTML.
- When the user asks to change a record (status, owner, next contact), change the source with the existing spreadsheet tools (`edit-xlsx` for selected cells on the observed SHA), keep the previous version, then regenerate and re-verify the dashboard as a new version. The HTML preview itself cannot save changes.
- For a recurring refresh or alert ("매일 아침 갱신", "지연되면 알려줘"), use the existing `automation` tool with a prompt that re-reads the source, regenerates and verifies.

## Stop conditions

Stop and state the exact boundary when the source cannot be read, a required business rule is truly ambiguous after inspection, or a requested behavior (saving from the page, live connection to an external system) is not available in the current T5. Offer the nearest working route rather than a non-working control.
