#!/usr/bin/env node
// 저장소 전체 검증: 항목 검사 + index.json 이 지금 항목과 같은가 + 서명. 끝 코드 0 = 통과.
// 쓰는 법: node tools/verify.mjs [--public-key <공개 열쇠 파일>]
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyRepo } from './lib/mounts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const at = process.argv.indexOf('--public-key');
const result = verifyRepo(root, { publicKeyPem: at > 0 ? readFileSync(process.argv[at + 1], 'utf8') : null });
for (const e of result.errors) console.error(`✗ [${e.code}] ${e.message}`);
console.log(result.ok ? '검증 통과: 서명·목록·지문이 모두 맞아요.' : `검증 실패: 오류 ${result.errors.length}개`);
process.exit(result.ok ? 0 : 1);
