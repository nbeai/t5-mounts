#!/usr/bin/env node
// 모든 항목 명세를 모아 index.json 을 만든다(검사가 떨어지면 만들지 않음). 서명은 sign-index.mjs 가 따로 한다.
// 쓰는 법: node tools/build-index.mjs [--date YYYY-MM-DD]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_KEY_PATH, buildIndex } from './lib/mounts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const at = process.argv.indexOf('--date');
const builtAt = at > 0 ? process.argv[at + 1] : new Date().toISOString().slice(0, 10);
try {
  const text = buildIndex(root, { publicKeyPem: readFileSync(join(root, PUBLIC_KEY_PATH), 'utf8'), builtAt });
  writeFileSync(join(root, 'index.json'), text);
  console.log(`index.json 을 만들었어요(항목 ${JSON.parse(text).items.length}개). 이어서 sign-index.mjs 로 서명하세요.`);
} catch (error) {
  for (const e of error.errors ?? []) console.error(`✗ ${e}`);
  console.error(error.message); process.exit(1);
}
