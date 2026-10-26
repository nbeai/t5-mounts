#!/usr/bin/env node
// 항목 폴더의 파일을 바꾼 뒤 mount.json 의 files(경로·크기·sha256)를 지금 파일로 다시 쓴다. 다른 칸은 건드리지 않는다.
// 지문만 고치는 도구라 검수를 대신하지 않는다: 바꾼 뒤 review 칸을 다시 채우고 validate·build-index·sign-index 를 돌린다.
// 쓰는 법: node tools/refresh-files.mjs skills/promo-image-set
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileFacts } from './lib/mounts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];
if (!target) { console.error('항목 폴더(예: skills/promo-image-set)를 알려 주세요.'); process.exit(1); }
const folder = resolve(root, target); const mountPath = join(folder, 'mount.json');
const mount = JSON.parse(readFileSync(mountPath, 'utf8'));
const facts = fileFacts(folder);
if (facts.problems.length) { for (const p of facts.problems) console.error(`✗ ${p}`); process.exit(1); }
mount.files = facts.files;
writeFileSync(mountPath, `${JSON.stringify(mount, null, 2)}\n`);
console.log(`${target}: 파일 ${facts.files.length}개의 지문을 다시 적었어요.`);
