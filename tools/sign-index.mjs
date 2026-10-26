#!/usr/bin/env node
// index.json 에 Ed25519 서명(index.sig)을 붙인다. 비밀 열쇠는 저장소 밖 파일에서만 읽고, 값은 어디에도 출력하지 않는다.
// 쓰는 법: node tools/sign-index.mjs --key <저장소 밖 비밀 열쇠 파일>
import { createPublicKey } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_KEY_PATH, assertOutsideRepo, keyIdOf, signIndex } from './lib/mounts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const at = process.argv.indexOf('--key');
const keyPath = at > 0 ? process.argv[at + 1] : process.env.T5_MOUNTS_SIGNING_KEY;
if (!keyPath) { console.error('비밀 열쇠 파일을 --key 로 알려 주세요.'); process.exit(1); }
try {
  assertOutsideRepo(root, keyPath);
  const privatePem = readFileSync(keyPath, 'utf8');
  const publicPem = readFileSync(join(root, PUBLIC_KEY_PATH), 'utf8');
  if (keyIdOf(createPublicKey(privatePem).export({ type: 'spki', format: 'pem' })) !== keyIdOf(publicPem)) {
    console.error(`이 비밀 열쇠는 ${PUBLIC_KEY_PATH} 와 짝이 아니에요. 공개 열쇠를 먼저 바꾸세요.`); process.exit(1);
  }
  writeFileSync(join(root, 'index.sig'), signIndex(readFileSync(join(root, 'index.json')), privatePem));
  console.log(`index.sig 를 썼어요(열쇠 번호 ${keyIdOf(publicPem)}).`);
} catch (error) { console.error(error.code === 'key_inside_repo' ? error.message : '서명하지 못했어요(열쇠 파일을 확인하세요).'); process.exit(1); }
