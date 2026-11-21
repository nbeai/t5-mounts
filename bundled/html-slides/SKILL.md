---
name: html-slides
description: Create an HTML presentation (웹 발표자료, 강의 슬라이드, 링크로 공유하는 발표, 휴대폰으로 보는 강의 자료) as one offline file with the pinned reveal.js engine — keyboard, clicker and touch navigation, speaker notes, step-by-step reveals, live interactive demos and charts, print to PDF, and share by link. Use for lecture or presentation slides meant for a browser, a link, phones or live demos; use ppt-master for an editable PowerPoint (.pptx).
when_to_use: "browser, link or phone slides (웹 발표)"
---

# HTML slides (reveal.js)

`$T5_HTML_SLIDES_DIR` holds the unmodified reveal.js 6.0.2 engine (`vendor/`, MIT, exact digests in
`vendor/reveal.lock.json`), a Korean font/line-break layer, an example deck and two scripts. The result is one
`.html` file that works offline, in the T5 preview, as a downloaded file, and through a share link.

## Choose PowerPoint or HTML

Choose from what the user said, attached and is doing. Do not ask "PPT or HTML?" by default.

- PowerPoint (`.pptx`, ppt-master): presenting or editing in PowerPoint on a company PC; colleagues or a client will
  edit it; a company template or an earlier `.pptx` is attached or named; the file must be submitted, uploaded or
  attached as a document.
- HTML (html-slides): sharing by link or messenger; attendees watch on phones; live interactive charts, calculators or
  demos during the lecture; publishing on a web page.
- A format the user named wins ("PPT로", "파워포인트", "HTML로", "링크로"). With mixed clues, follow the one that decides
  how the file is used; an attached company template means PowerPoint even if it will also be emailed.
- Only when nothing shows how it will be presented or shared, ask one plain sentence without file jargon, then continue
  from the answer: "파워포인트로 발표·수정하실 건가요, 링크로 공유해서 보여주실 건가요?"
- After delivering, offer the other form in one line and do not make both unless asked. After a PowerPoint:
  "링크로 휴대폰에서도 보시려면 웹 발표자료(HTML)로도 바꿔 드릴게요." After HTML: "파워포인트에서 수정하셔야 하면
  PPT 파일로도 만들어 드릴게요."

Converting between them (same deck, both directions) is deterministic, not rewritten by you:
- `node "$T5_HTML_SLIDES_DIR/scripts/deck-convert.mjs" --from 발표.pptx --to 발표.html` (or `--from 발표.html --to 발표.pptx`)
  keeps slide order, every paragraph, speaker notes, table cells and images (same bytes), and prints `preserved`,
  `differences` and `notCarried`. Tell the user the `notCarried` items (PowerPoint animations, exact positions and
  theme fonts; HTML step-by-step reveals and live charts/demos). `--compare A --with B` checks any two decks.
- HTML → PDF: html-slides `verify-deck.mjs --pdf`, one page per slide.
- A newly designed PowerPoint from an HTML deck (not the same deck converted): bind the HTML deck file as the source and
  create it with `presentation_master`. A screenshot or PDF is not an editable PowerPoint.

## Procedure

1. Plan the talk from the user's purpose, audience, duration and sources: one message per slide, a connected flow.
   The exact slide count, order, wording, notes and style the user gave are binding.
2. Write only the slide elements to a workspace file (read `$T5_HTML_SLIDES_DIR/assets/example-slides.html` once for
   the shape):
   - one `<section>` per slide; nest `<section>` inside a `<section>` for a vertical (drill-down) group;
   - `class="fragment"` on items that should appear one step at a time;
   - speaker notes in `<aside class="notes">…</aside>` inside the slide — write them whenever the user asked for a
     script, notes or talking points;
   - a live demo, calculator or chart is inline `<script>`, inline SVG or `<canvas>` code in the slide. No CDN,
     web font, remote image or fetch: every image is a `data:` URL. Links (`<a href>`) to references are fine.
3. Build: `"$T5_HTML_SLIDES_DIR/scripts/build-deck.mjs" --slides ABSOLUTE_SLIDES.html --output ABSOLUTE_DECK.html --title "제목"`
   (`--theme black` for a dark room, `--style ABSOLUTE.css` for the deck's own colors, `--config '{"transition":"fade"}'`
   for any other reveal.js option). It refuses external resources and reports the file's SHA-256. Both themes carry the
   T5 color system (`var(--t5-accent)`, `--t5-muted`, `--t5-line` for your CSS; other presets in `${CLAUDE_SKILL_DIR}/../color-system/assets/tokens.css`); user or brand colors win.
4. Verify: `"$T5_HTML_SLIDES_DIR/scripts/verify-deck.mjs" ABSOLUTE_DECK.html` (`--expect-notes` when notes were asked for).
   It opens the deck headless under the exact T5 preview and share-link security rules and reports whether it runs,
   every slide and step is reachable by keyboard and swipe, notes show, printing gives one page per slide, no slide
   overflows at phone (390) or PC (1440) width, Korean text is not broken inside words, and nothing is fetched from outside. Fix a reported failure and build again; `state: "unavailable"` means no Chrome/Edge was
   found, so say that navigation was not machine-checked.
5. `attachment` `register_output` the deck, then `open_preview` so the user sees it. Look at the slides yourself for
   overflowing text, cramped Korean line breaks or unreadable contrast and fix real defects.
6. Tell the user in plain words how to present: click the slide, then →/Space/PageDown or a clicker moves forward,
   swipe on a phone, **S** opens the speaker window with notes and a timer (in a normal browser tab), **N** shows the
   notes on the slide, **Esc** shows all slides, **F** is full screen.

## Share and print

- Link for phones or attendees: when the person asks for a link, `share_preview` `publish` with the registered
  attachment makes the public URL (their request is the go-ahead; `revoke` takes it down). `prepare` only makes a
  private preview, for when they want to look before sharing. The free share path has a 3 MiB
  compressed limit. 한도를 넘으면 원본은 그대로 두고 링크로 볼 사본만 작게 만든다.
- PDF handout: the user opens the deck (file or link) with `?print-pdf` at the end of the address and prints → Save
  as PDF; one page per slide. When the user wants T5 to make the PDF file, add `--pdf ABSOLUTE_NEW.pdf` to the
  verify command: it writes the same printed pages (one per slide), then register and inspect that PDF.

## Limits

- This is not an editable PowerPoint. Colleagues cannot open it in PowerPoint to edit; a slide screenshot or PDF is not
  a .pptx either.
- The speaker window (S) needs a normal browser tab; inside the T5 preview use N.
- Korean text uses the viewer's installed fonts (Pretendard if installed, otherwise Apple SD Gothic Neo, Malgun Gothic
  or Noto Sans KR). Nothing is downloaded.
