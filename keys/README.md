# 공개 열쇠 자리

`t5-mounts-public.pem` — `index.json` 서명(`index.sig`)을 확인하는 Ed25519 공개 열쇠입니다.

**지금 들어 있는 것은 시험 열쇠입니다**(열쇠 번호 `132ced345b8f7f47`, 2026-10-26 저장소 밖 임시 폴더에서 만듦). 진짜 열쇠는 오너가 만들고, 새 판 알림(H60)과 같은 열쇠를 함께 씁니다. 비밀 열쇠는 이 저장소에 절대 넣지 않습니다(`.gitignore` 와 도구가 저장소 안 경로를 거절합니다).

## 오너 열쇠로 다시 서명하는 법

```bash
node tools/keygen.mjs --out <저장소 밖 안전한 폴더> --install-public && node tools/build-index.mjs && node tools/sign-index.mjs --key <그 폴더>/t5-mounts-private.pem && node tools/verify.mjs
```

H60 열쇠를 이미 만들었다면 `keygen` 대신 그 공개 열쇠(PEM, SPKI)를 이 파일에 덮어쓰고 `build-index` → `sign-index --key <그 비밀 열쇠>` → `verify` 를 돌립니다. 열쇠 번호는 공개 열쇠 DER 의 sha256 앞 16자이며 `index.json` 의 `keyId` 에 적힙니다.
