#!/usr/bin/env node
// 모든 항목 명세(mount.json)를 스키마와 실제 파일 지문으로 검사한다. 끝 코드 0 = 통과.
// 쓰는 법: node tools/validate.mjs
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRepo } from './lib/mounts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { items, errors } = checkRepo(root);
for (const e of errors) console.error(`✗ ${e}`);
console.log(errors.length ? `검사 실패: 오류 ${errors.length}개` : `검사 통과: 항목 ${items.length}개`);
process.exit(errors.length ? 1 : 0);
