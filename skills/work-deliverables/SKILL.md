---
name: work-deliverables
description: Choose and produce an audience-appropriate business deliverable from source material, including internal decisions, customer proposals, reports and client communication. Use for substantive work products or changing an existing result's purpose; not greetings or simple factual questions.
when_to_use: "what a report or proposal (보고서·제안서) must say for its reader"
metadata:
  t5Hands:
    keywords: [음성 파일, 음성파일, 음성으로, 낭독, mp3, 읽어 주는, 읽어주는, 오디오 파일]
    tools: [media_editor, attachment]
---
# Work the reader can use

Use the current request and its sources to decide who the result is for, what they need to understand or decide, which facts must be present, which information must stay out, the usable format, and the stopping point. Make these choices inside the existing work plan; do not start another classification agent or ask the user to fill in a briefing form. Resolve only ambiguity that materially changes the result. The examples below illustrate different purposes, not a closed list of supported jobs.

## Match the work to its reader

An internal decision needs the relevant comparison, calculations, assumptions, risks and a reasoned recommendation. Distinguish observed constraints from possibilities. Keep sensitive internal reasoning in that result, not in an external copy. A customer-facing proposal needs the customer's requirement, precise scope, source-backed price, timing and prerequisites, exclusions, and a clear next step. Internal costs, margin, negotiation limits and private risk notes do not become customer copy. A report needs defined metrics, comparable periods, exceptions and implications; a raw table alone may not answer the question. Adapt other jobs by the same reader-and-purpose reasoning.

Use the owner's existing rate card, accepted examples and template before inventing structure or figures. Preserve named requirements and the strength of commitments. If a figure is missing, distinguish that gap from zero and continue the parts that have evidence. Never assume that an unavailable connector makes supplied files unusable.

An explicitly selected existing result is a working baseline for this customer/project, not an invitation to redesign every section. Inspect its actual file and render when supplied. Preserve what already serves the same brief, and make only changes you can tie to a concrete reading or use problem. If the user gave a choice but no reason, retain the choice without inventing a preference explanation. Use paragraphs for explanation, native lists for separate actions, and tables for comparisons; do not turn every section into another table or merge several next steps into one numbered paragraph.

## Build with the existing production hand

Read the applicable format procedure and use the existing authoring tools. For appearance, use visual-deliverables; with no user or brand colors, start from the T5 color system (`${CLAUDE_SKILL_DIR}/../color-system/`; HTML pages include its `assets/tokens.css`). Do not produce every possible format: deliver the requested working file and only a useful companion format. Keep draft scripts and intermediate files out of selected outputs.

For a focused revision, use the server-bound open artifact as the exact base. Reopen it before editing. Turn the user's correction into an exact change and a preservation list: prices, names, dates, formulas, sections or styling that must stay as they are. Keep the same artifact family when registering the revised file. A different format is a companion result, not automatically the same version lineage.

## Evidence and finish

분량을 지정한 글은 같은 마무리 검토에서 실제 읽는 글자 수를 재고 요청한 길이에 맞춘다. 바이트 수나 대략적인 추정으로 대신하지 않는다. Markdown 문법과 링크 주소는 빼고, 사용자가 전체 분량을 말했다면 제목·표의 문장도 포함한다. 공백 포함 여부를 구분해 확인하고 필요한 부분만 다듬는다.

Check source facts and usable output separately: reconcile figures and scope with the inputs, then check the usable output the way its format procedure says. A command that writes a result file, or registering it, returns `deliverable` facts read from that exact file (each page's text position, placeholders, formula errors, a page contact sheet). It is your render check; inspect again only what it lists as unmeasured or a page it names. Review whether the audience can find the point without knowing this conversation. Repair concrete defects and recheck the affected content and layout; respect existing format tools' required checks. Do not add a second review loop to a pipeline that already reviewed the same facts and render. Stop when the agreed content, format and readability requirements are met. Remaining preferences are not permission to redesign forever.

When the person asks for this work's own model or token usage in the result, read the current figures with `run_usage` and write its placeholders (such as `{{T5_RUN_TOTAL_TOKENS}}`) where the final values belong; the runtime fills the exact final values when the answer is published. Never present a mid-run figure as the total.

In that same review, check whether repeated figures, conclusions, labels or decorative containers add a distinct purpose. Keep a useful headline total beside its detailed table, but remove redundant summaries that compete with it. Put detailed derivations and technical provenance in their supporting place rather than restating them throughout the main result. Do not make a report longer solely by adding cards, repeated caveats or a second conclusion.

Use the existing memory and recurring-work procedures for accepted reusable preferences and methods. A one-off correction stays with this work; customer A's voice, brand and confidential details must not become customer B's defaults. Never silently promote a speculative profile or a successful example into a universal rule.
