---
name: site-instagram
description: Instagram (인스타그램) site knowledge — post, reel and profile addresses, the 새 게시물 만들기 flow where two dialogs, two file inputs and two 다음 buttons exist at once, and how to confirm a published post.
metadata:
  t5Web:
    hosts: [www.instagram.com, instagram.com, m.instagram.com]
    keywords: [인스타그램, 인스타, instagram]
    handFunctions:
      - { name: openNewPost, effect: observe, description: 새 게시물 만들기 대화상자를 열고 그 대화상자·파일 칸을 돌려준다 }
      - { name: waitShared, effect: observe, description: 공유 완료 글(릴스·게시물)을 한 번만 기다려 확인한다 }
---

# Instagram

## URLs
- Post: `https://www.instagram.com/p/<code>/`. Reel: `https://www.instagram.com/reel/<code>/`. Profile: `https://www.instagram.com/<username>/`.
- A carousel post opened from the feed may show `?img_index=<n>` (the slide in view). It is the same post, but the published address is the bare `/p/<code>/`.
- To confirm a post was published, open its exact `/p/<code>/` (or `/reel/<code>/`) address in this Run and read it there. A profile grid that shows a new tile is not the post itself.

## New post flow (새 게시물 만들기)
Observed 2026-10-17 ~ 2026-10-23 in the person's everyday Chrome (sites change; the page in front of you is the current fact). Most locator failures on Instagram were one name matching two elements:
- Two `[role="dialog"]` with `aria-modal="true"` are open together. The flow is the one named 새 게시물 만들기. Scope everything to it: `page.getByRole('dialog', { name: '새 게시물 만들기' })`. A bare `[role=dialog]` or `[role=dialog]:last-of-type` matched both.
- Two `input[type=file]` exist. The one outside the dialog accepts only `image/jpeg`. The flow's input is inside the dialog, has `multiple`, and accepts images and video (`image/jpeg, image/png, image/heic … video/mp4`). Use the dialog-scoped input for setInputFiles; it takes all carousel files in one call, in order.
- Buttons named 다음 and 미디어 갤러리 열기 each matched two elements: one is a `div role="button"` that may be `disabled`. Inside the dialog, take the enabled one.
- A step's buttons appear after the previous step settles. Wait for the dialog's step text or button to be visible instead of clicking a name that may also exist on the page behind the dialog.
- The caption box is a textbox inside the dialog; `getByRole('textbox')` without the dialog scope matched three elements.

## Boundaries
- Publishing (공유하기) sends to the site. Do it when the person asked to post. It spends no money.
- If an action stopped with an error, the page may have sent requests already. Look at the profile or the post before trying the same publish again, so one carousel is not posted twice.

## 공개 캡션과 작업 안내

게시할 본문에는 작업 설명·완료 보고·음원 추가 방법을 넣지 않는다. 이 안내는 사용자에게 하는 답에 따로 둔다. 실제로 사용한 자료의 필수 저작자 표시는 내부 안내가 아니다. CC BY 4.0 등 이용 조건에 맞는 저작자·작품명·출처·라이선스·변경 표시를 유지한다. 사용자가 출처까지 지우라고 하면 그 조건을 한 줄로 알리고, 표기 의무가 없는 자료로 바꾸거나 해당 자료를 빼는 방법을 제안한다. 확인되지 않은 출처를 지어내지 않는다.

```js t5-hand:openNewPost
async (page) => {
  await page.getByRole('link', { name: /새로운 게시물|만들기/u }).first().click();
  const dialog = page.getByRole('dialog', { name: '새 게시물 만들기' });
  await dialog.waitFor();
  return { dialog, fileInput: dialog.locator('input[type=file][multiple]') };
}
```

```js t5-hand:waitShared
async (page, { timeout = 60000 } = {}) => {
  const done = page.getByRole('heading', { name: /(?:릴스가|게시물이) 공유되었습니다/u }).first();
  await done.waitFor({ timeout });
  return { shared: true, text: await done.innerText() };
}
```
