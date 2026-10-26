#!/usr/bin/env node
// Ed25519 열쇠 한 쌍을 저장소 밖 폴더에 만든다. 비밀 열쇠 값은 화면에 내지 않고, 열쇠 번호만 알린다.
// 쓰는 법: node tools/keygen.mjs --out <저장소 밖 폴더> [--install-public]
//   --install-public: 만든 공개 열쇠를 keys/t5-mounts-public.pem 에 넣는다(열쇠 바꾸기).
import { generateKeyPairSync } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_KEY_PATH, assertOutsideRepo, keyIdOf } from './lib/mounts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const at = process.argv.indexOf('--out');
const out = at > 0 ? process.argv[at + 1] : null;
if (!out) { console.error('열쇠를 둘 저장소 밖 폴더를 --out 으로 알려 주세요.'); process.exit(1); }
try { assertOutsideRepo(root, out); } catch (error) { console.error(error.message); process.exit(1); }
mkdirSync(out, { recursive: true, mode: 0o700 });
const privatePath = join(out, 't5-mounts-private.pem'); const publicPath = join(out, 't5-mounts-public.pem');
if (existsSync(privatePath)) { console.error('그 폴더에 이미 비밀 열쇠가 있어요. 덮어쓰지 않아요.'); process.exit(1); }
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
writeFileSync(privatePath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
writeFileSync(publicPath, publicPem);
if (process.argv.includes('--install-public')) copyFileSync(publicPath, join(root, PUBLIC_KEY_PATH));
console.log(`열쇠를 만들었어요(열쇠 번호 ${keyIdOf(publicPem)}). 비밀 열쇠 파일은 저장소에 넣지 마세요.`);
