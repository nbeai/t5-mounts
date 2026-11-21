---
name: visual-deliverables
description: Create or improve visual reports, HTML dashboards, and diagrams; inspect static renders or interactive browser results, repair readability defects, and use document-data for source-value verification.
when_to_use: "check and fix how a report, page or diagram looks; not data dashboards"
---

# Visual Deliverables

## When to use

Use when readability, visual hierarchy, layout, chart or diagram quality, print appearance, or brand consistency is part of the requested result. Do not add visual complexity when plain prose or a small table is clearer. A dashboard built from a spreadsheet or CSV follows the `dashboard` skill, whose checker already covers rendering and source values; this skill is not needed alongside it.

## Choose the result surface

- Use HTML/CSS for screen-first reports, dashboards, onboarding, and fixed artboards with paragraphs.
- Use SVG, Mermaid, Graphviz, or another verified renderer for shapes, relationships, diagram labels, chart marks, and icons.
- Use the qualified DOCX or PPTX structure when the user needs an editable office file. A beautiful HTML or PDF is not an editable office result.
- Use PDF for fixed print or distribution only when the exact pages can be rendered and reopened.

Do not place paragraph-length text by raw SVG coordinates. Preserve semantic text and the source structure alongside raster or vector previews.

## Fit the purpose

For an operating report or internal decision, make comparison and exceptions easy to find with restrained hierarchy. For a customer proposal, make scope, price and timing clear and retain the owner's familiar template. For promotional or creative work, choose a visual direction specific to the subject and audience. These are starting points for judgment, not mandatory themes or fixed layouts.

Use one compact set of type sizes, spacing, colors and table treatments across a result. Reuse approved brand sources in their exact customer/project scope; a current explicit request wins over stored defaults. When no brand is supplied, start from the T5 color system (`${CLAUDE_SKILL_DIR}/../color-system/`: `SKILL.md` principles, `data/presets.json` roles; for HTML include `assets/tokens.css` and use its `var(--t5-…)` roles) without a new onboarding interview; pick the purpose palette that fits:
${T5_COLOR_PURPOSES}
 Preserve semantic status colors and readable labels. In Korean output, verify actual font availability and line wrapping, and use the user's units and currency. Avoid turning every paragraph into an identical card. Do not make a separate visual artifact for a one-line answer.

When the user explicitly praised a prior result, use existing memory and source lookup to recover that exact artifact/version and its rendered pages, together with what the user said worked. Reuse only those stated qualities within the relevant customer/project scope; inspect the reference rather than relying on its filename or a remembered summary. A model's own praise, a successful render, or an old output without explicit user evaluation does not establish a durable taste or brand preference. Keep any accepted preference in the existing scoped memory path; never turn one project's example into another customer's default.

An explicit A/B choice is also an approved reference even when no reason was supplied. Look at that chosen render and its usable source, keep the selection scoped to this task, and do not invent why it was chosen. Preserve its working information hierarchy and appropriate density unless a specific defect or changed purpose calls for a change. More tables, cards, type sizes or repeated summaries are not evidence of better design.

## Procedure

1. Extract the exact content facts, data values, units, required result form, audience, and delivery medium.
   Translate source field names and machine identifiers into audience language. Keep raw keys, paths, and internal labels out of the visible artifact unless the user needs them.
2. Reuse only user-approved brand sources: logo, font, color ramp, spacing, and tone. Do not infer a durable brand from old outputs.
3. Establish information hierarchy and geometry before decorative color. Use color, labels, shapes, and patterns together; never rely on color alone for meaning.
4. For static HTML artboards, mark the complete surface with `data-vd-artboard` and independent layout blocks with `data-vd-block`. The static renderer excludes scripts, forms, network resources, and external fonts. An interactive dashboard instead uses the existing browser route; retain its requested controls and follow `document-data` for source-derived filter and refresh verification.
5. Create the actual requested file; the `deliverable` facts and contact sheet returned with it are the static render check. Use attachment `inspect` only for an unmeasured part or a closer look; inspect an interactive result in the browser at the requested viewport.
6. Read the factual DesignReceipt and the actual rendered pixels against the original request. In this same final review, check the result's genre: a customer proposal makes customer value, price, scope and next action apparent; a report prioritizes important changes and exceptions; a presentation gives each slide a clear message and a connected flow; a dashboard makes the intended decisions and controls understandable. Review the actual images and requested behavior, not only the generated brief. Repair concrete comprehension defects as well as content overflow, declared-block overlap, unavailable fonts, missing text, low contrast, missing alternative text or captions, and incorrect source data. Do not add another review pass when the existing format pipeline already covers these criteria.
   Also check the native document's actual reading order: metadata must not collapse into a crowded line, separate next actions should remain separate list items, and each table or repeated figure must serve a distinct reading task. A key total may be highlighted next to a detailed table; a further copy of the same totals, dates and explanations usually adds noise. Keep runtime paths, source chunk labels and implementation provenance out of audience-facing copy; use notes or a meaningful citation only when the reader needs the source.
7. After a material correction, register the new version: its `deliverable` facts are the re-render. Stop when the requested purpose is satisfied, a precise capability boundary remains, or a repeated result adds no new evidence.
8. Register and deliver the verified artifact through the existing attachment result path. State any unmeasured medium such as editable PPTX or print output.

## Verification

Verify content and visual facts separately:

- source-value reconciliation follows `document-data`; labels, units, and text remain visible and readable;
- every required page or artboard was rendered;
- no required content is clipped, outside bounds, or unintentionally overlapped; inspect actual exported pages, including final lines, Korean word wrapping, diagram labels covered by shapes, table cell contents, headings at page breaks, footers and page numbers;
- a partial geometry measurement or zero detected overlaps is not visual clearance. Read every final page image. Preserve intended diagram intersections and edit only actual readability defects;
- requested fonts loaded or fallback is disclosed;
- contrast and color distinctions are usable with labels or shapes;
- semantic headings, tables, alt text, captions, and extractable text remain where required;
- the delivered medium is actually screen, print, vector, or editable as claimed.

DesignReceipt is not an aesthetic score. Use model judgment and, when material, human review for whether the result feels clear, appropriate, and on brand.

## Failure and stop conditions

Do not claim visual verification from source parsing alone. Do not replace editable DOCX or PPTX with HTML, SVG, PNG, or PDF. Do not retry the same render without a changed source or new evidence. Stop with the exact capability boundary when the current platform lacks a qualified renderer.

### 현재 결과판의 확인
사용자 목적과 현재 편집판/선택 레퍼런스의 원리를 필요한 범위만 적용한다. 이미 읽은 방법을 다시 열거나 국소 수정에 전체 조사를 반복하지 않는다. 기존 제작·내용·렌더 검사의 이름/범위/근거를 전달할 attachment/family/판/SHA와 결속한다(프로젝트·렌더판이 있으면 함께). 같은 바이트의 유효 검수는 재사용하고, 바뀐 부분은 확인을 갱신한다. 모델의 체크리스트·일반 파일 등록·기계 검사·사람의 품질 평가는 서로 대신하지 않는다. 원본과 승인된 부분은 보존하며 확인하지 못한 범위는 미측정으로 남긴다.
