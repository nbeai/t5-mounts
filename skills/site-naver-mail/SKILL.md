---
name: site-naver-mail
description: Naver Mail (네이버 메일) site knowledge — mailbox list, search and read URLs, how list rows are named, and what to do on the sign-in page.
metadata:
  t5Web:
    hosts: [mail.naver.com]
    keywords: [네이버 메일, 네이버메일, naver mail]
    tools: [naver]
---

# Naver Mail

## First choice
When the `naver` hand is offered, its mail_list / mail_open / mail_search read the list and bodies directly with the managed sign-in. Use them for reading and self-drafts. For "the latest N mails" with their contents, one mail_list call with includeBodies=N returns the rows and those bodies together.

## URLs (managed Chrome, signed in)
- Mailbox: `https://mail.naver.com/` (opens 받은메일함).
- Search inside a folder: `https://mail.naver.com/v2/folders/<folderId>/search?body=<검색어>&bodyCond=0`.
- A message: the row's link goes to `https://mail.naver.com/v2/read/<folderId>/<mailSN>`; open that address directly instead of clicking.

## Landmarks
- Each list row's title is a link whose accessible name starts with `메일 제목 ` (Playwright: `page.getByRole('link', { name: /^메일 제목\s/ })`). Sender and time are in the same row.
- The list renders after the page's own script loads; wait for those title links (or an empty-mailbox message), not for the full page load.

## Boundaries
- Landing on `nid.naver.com` means the person is not signed in: sign in with the Naver login the person saved in T5 when one is offered (browser_run_code `savedLogin`), otherwise the browser tool's login_start so the person signs in once. A password goes in only as a saved login, never as a typed value.
- Opening a message marks it read; that is an external change in the account.
