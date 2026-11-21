---
name: file-discovery
description: Find the local file or folder the user means when they provide a title, filename, extension, file kind, approximate location, or recency clue. Use for requests to locate, identify, compare, open, or show (in Finder or File Explorer) a user file or folder, especially when exact filename matching is slow or fails, the extension may be mistaken or omitted, visually identical Unicode names differ, multiple copies exist, or the user asks for the newest or most recently changed match.
when_to_use: "find which local file the user means"
---

# File discovery

Use the existing terminal. Treat the request as evidence about identity, not as one literal search string.

## Interpret the target

Separate these clues when present:

- title or stem
- stated extension or file kind
- explicit or implied location
- whether “recent” means creation, modification, download, or last use
- whether the user wants one best match or all matches

Keep the original wording. Normalize both the requested name and candidate names for comparison, including Unicode normalization and appropriate case folding. Treat a trailing extension as a strong constraint, not as part of the semantic title.

## Search progressively

1. Start with the narrowest relevant scope supported by the request and conversation. Do not pre-scan unrelated locations.
2. Try the fastest available filename index or targeted directory search for the normalized full basename.
3. If an exact full-name search fails, stalls, or produces no useful candidate, search the normalized stem without the extension. Then compare the candidate extension or file kind separately.
4. If an index is unavailable or stale, switch to a targeted filesystem traversal. Avoid an unbounded whole-computer walk when a smaller relevant scope remains.
5. Filter or aggregate near the data so a large listing does not consume the observation window.

Choose commands and platform facilities from the computer that is actually available. The procedure matters; no particular command is mandatory.

## Rank and verify

Rank candidates using the clues the user actually supplied. Prefer, in order of relevance:

- normalized basename equality
- normalized stem equality plus matching extension or file kind
- explicit location match
- requested creation or modification ordering
- weaker partial-title or token similarity

Before answering, observe the winning path again and verify that it exists, has the expected type, and has the metadata used to distinguish it. Do not call a file “newest” from modification time when the user asked for creation time. If creation time is unavailable on the current filesystem, state that limitation rather than substituting silently.

## Ambiguity and stopping

Return one file when the evidence produces a unique best match. If materially different candidates remain tied and the request contains no discriminator, show the small candidate set and ask one minimal question.

Do not keep repeating equivalent searches; when the relevant scope has none, the person's other usual places are also only reads.

Never claim a match from a command string or model guess alone. Base the answer on the final filesystem observation.

## Things T5 made

When the person asks for something T5 made ("지난주에 만든 카드뉴스", "아까 만든 영상", a carousel, reel, photo or ebook), read T5's own making list first: `carousel_editor`, `media_editor` or `photo_editor` with `action: "list"`. It lists every project of that kind across conversations, newest first, with `createdAt` (when it was made) and the last exported files. Count from that list, then confirm the files on disk. A folder on the desktop may hold only some of them. Projects from other conversations are marked `thisConversation: false`.

A folder whose items are folders (one folder per carousel) is not empty: `file_reality` `inspect` on that folder reports its `subfolders`. Read them as candidates instead of concluding there is nothing there.

## Inside the conversation work folder

For files below the current work folder, `file_reality` with `action: "search"` and `scope: "workspace"` searches recursively and returns handles the other hands accept. The top-level listing shown at the start of a request is a bounded summary: a name missing from it is not evidence that the file is absent.

## Show it to the person

"찾아 줘" (find it) asks for the answer, not for a window: answer with what was found and where, and do not open Finder or File Explorer. Open the file manager only when the person asks to open or show it there.

When the person asks to open, show, or locate a file or folder in the computer's file manager ("파인더에서 열어줘", "탐색기로 보여줘"), first verify the exact path as above, then reveal it with the platform's own file manager through `exec`:

- macOS: `open -R "<path>"` selects the file or folder in Finder; `open "<folder>"` opens the folder itself.
- Windows: `explorer /select,"<path>"` selects the item in File Explorer; `explorer "<folder>"` opens the folder.

This only shows the item. It does not read, change, or move it. A result file T5 made also has its own show button on the result card in the app.
