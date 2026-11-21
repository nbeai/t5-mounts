---
name: nano-pdf
description: Make a simple new PDF, or read, split, merge, reorder, rotate or fill an existing PDF, with T5's bundled document tools, then reopen the result. Use when the requested result is a PDF and the final file must be checked, not merely written.
when_to_use: "a simple new PDF as the result"
---

# PDF work

## When to use

Use when the user asks for a simple PDF (a notice, a one-page summary, a printed list) or asks to read, assemble, alter, or verify a local PDF. Designed pages (posters, slides, book layouts) belong to their own skills.

## Make a simple new PDF

1. Write the content as a Word file with `"$T5_DOCUMENT_CLI" create-docx --spec SPEC --output ABSOLUTE.docx` (spec: `title`, optional `cover`, ordered `blocks` of paragraphs and tables; document-data has the full spec). A Korean official-document form is `create-hwpx --markdown - --output ABSOLUTE.hwpx` instead.
2. Turn it into the PDF with the `attachment` tool `convert_to_pdf` by `filePath` (pass `outputName` for the PDF name or place). It prints with the bundled browser engine and registers the PDF as the result.
3. Reopen the PDF with `attachment` `inspect` by `filePath` and check the page count and text.

## Change an existing PDF

Each is one `"$T5_DOCUMENT_CLI"` command (`--help` gives the contract): `merge-pdf A.pdf B.pdf --output OUT.pdf`, `pdf-pages FILE --pages "1-3,5" --output OUT.pdf` (keeps exactly those pages in that order), `split-pdf FILE --output-dir DIR`, `rotate-pdf FILE --degrees 90`, `read-pdf-form FILE`, `fill-pdf FILE --values '{"field":"value"}'`. Without `--output` the file is changed in place: declare it as the `local_change` target so it can be undone. The command returns the reopened result.

## Read a PDF

`attachment` `inspect` reads its page text; for a long PDF, `attachment` `search_document` with purpose terms returns page handles and `reopen_document_pages` reads them. A page with `requiresOcrOrVision: true` has no text layer: read its rendered image instead.

## Verification

Report the reopened output path, page count, and the checks that passed. Render pages only when layout, images, or placement matter to the request.

## Failure

An encrypted PDF is reported, not opened. Do not call a PDF valid just because a command exited successfully.
