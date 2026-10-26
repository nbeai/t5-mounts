// 검사기·서명 시험. 저장소를 임시 폴더에 복사하고 그때그때 만든 시험 열쇠로 서명한 뒤 하나씩 망가뜨려 잡는지 본다.
// 열쇠는 임시 폴더에만 있고 시험이 끝나면 지운다. 쓰는 법: node --test test/
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PUBLIC_KEY_PATH, assertOutsideRepo, buildIndex, canonicalJson, checkRepo, signIndex, verifyRepo } from '../tools/lib/mounts.mjs';

const source = join(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = mkdtempSync(join(tmpdir(), 't5-mounts-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

let repo; let keys;
const pair = () => { const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return { privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }), publicPem: publicKey.export({ type: 'spki', format: 'pem' }) }; };
const signAll = () => {
  const text = buildIndex(repo, { publicKeyPem: keys.publicPem, builtAt: '2026-10-26' });
  writeFileSync(join(repo, 'index.json'), text);
  writeFileSync(join(repo, 'index.sig'), signIndex(text, keys.privatePem));
};
const codes = () => verifyRepo(repo).errors.map((e) => e.code);
const mountPath = () => join(repo, 'skills', 'promo-image-set', 'mount.json');
const editMount = (fn) => { const m = JSON.parse(readFileSync(mountPath(), 'utf8')); fn(m); writeFileSync(mountPath(), JSON.stringify(m, null, 2)); };

beforeEach(() => {
  repo = mkdtempSync(join(scratch, 'repo-'));
  for (const part of ['schema', 'skills', 'mcp', 'cli', 'plugins', 'hooks', 'keys']) cpSync(join(source, part), join(repo, part), { recursive: true });
  keys = pair();
  writeFileSync(join(repo, PUBLIC_KEY_PATH), keys.publicPem);
  signAll();
});

test('지금 저장소 그대로면 통과한다', () => {
  assert.deepEqual(verifyRepo(repo).errors, []);
});

test('실제 저장소의 index.json·index.sig 가 지금 항목·공개 열쇠와 맞는다', () => {
  assert.deepEqual(verifyRepo(source).errors, []);
});

test('서명 틀림: 서명 한 글자를 바꾸면 잡는다', () => {
  const sig = readFileSync(join(repo, 'index.sig'), 'utf8');
  writeFileSync(join(repo, 'index.sig'), (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1));
  assert.ok(codes().includes('signature_invalid'));
});

test('서명 틀림: 다른 열쇠로 서명하면 잡는다', () => {
  writeFileSync(join(repo, 'index.sig'), signIndex(readFileSync(join(repo, 'index.json')), pair().privatePem));
  assert.ok(codes().includes('signature_invalid'));
});

test('서명 틀림: 서명 뒤에 목록을 고치면 잡는다', () => {
  const index = JSON.parse(readFileSync(join(repo, 'index.json'), 'utf8'));
  index.items[0].mount.permissions.money.uses = true;
  writeFileSync(join(repo, 'index.json'), canonicalJson(index));
  const found = codes();
  assert.ok(found.includes('signature_invalid'));
  assert.ok(found.includes('index_stale'));
});

test('서명 없음을 잡는다', () => {
  rmSync(join(repo, 'index.sig'));
  assert.ok(codes().includes('signature_missing'));
});

test('공개 열쇠를 바꿔 끼우면 열쇠 번호가 달라 잡는다', () => {
  writeFileSync(join(repo, PUBLIC_KEY_PATH), pair().publicPem);
  const found = codes();
  assert.ok(found.includes('key_mismatch'));
  assert.ok(found.includes('signature_invalid'));
});

test('지문 틀림: 항목 파일 한 바이트를 바꾸면 잡는다', () => {
  appendFileSync(join(repo, 'skills', 'promo-image-set', 'scripts', 'render.mjs'), '\n');
  assert.ok(codes().includes('digest_mismatch'));
});

test('지문 틀림: 적히지 않은 파일이 더 있으면 잡는다', () => {
  writeFileSync(join(repo, 'skills', 'promo-image-set', 'extra.sh'), 'echo hi\n');
  assert.ok(codes().includes('digest_mismatch'));
});

test('지문 틀림: 적힌 파일이 사라지면 잡는다', () => {
  rmSync(join(repo, 'skills', 'promo-image-set', 'templates', 'base.css'));
  assert.ok(codes().includes('digest_mismatch'));
});

test('항목 빠짐: 목록에서 항목 하나를 빼고 다시 서명해도 잡는다', () => {
  const index = JSON.parse(readFileSync(join(repo, 'index.json'), 'utf8'));
  index.items = [];
  const text = canonicalJson(index);
  writeFileSync(join(repo, 'index.json'), text);
  writeFileSync(join(repo, 'index.sig'), signIndex(text, keys.privatePem));
  assert.deepEqual(codes(), ['item_not_in_index']);
});

test('항목 빠짐: 목록에는 있는데 저장소에서 폴더가 사라지면 잡는다', () => {
  rmSync(join(repo, 'skills', 'promo-image-set'), { recursive: true });
  assert.ok(codes().includes('index_extra_item'));
});

test('새 항목을 넣고 목록을 다시 만들지 않으면 잡는다', () => {
  cpSync(join(repo, 'skills', 'promo-image-set'), join(repo, 'skills', 'promo-image-copy'), { recursive: true });
  const m = join(repo, 'skills', 'promo-image-copy', 'mount.json');
  writeFileSync(m, readFileSync(m, 'utf8').replace('"id": "promo-image-set"', '"id": "promo-image-copy"'));
  const found = codes();
  assert.ok(found.includes('item_not_in_index'));
  assert.ok(found.includes('item_invalid'), 'SKILL.md name 이 id 와 달라 항목 검사도 떨어진다');
});

test('스키마: 필수 칸이 빠지면 잡는다', () => {
  editMount((m) => { delete m.permissions.money; });
  assert.ok(checkRepo(repo).errors.some((e) => e.includes('money: 빠짐')));
});

test('외부 원형은 고정 커밋 없이 들어갈 수 없다', () => {
  editMount((m) => { m.origin.type = 'external'; });
  const errors = checkRepo(repo).errors.join('\n');
  assert.match(errors, /origin\.upstream/u);
  assert.match(errors, /upstreamLicense/u);
});

test('라이선스 미정·검수 미통과 항목은 listed 가 될 수 없다', () => {
  editMount((m) => { m.status = 'listed'; m.license.decided = false; m.review.result = 'pending'; });
  const errors = checkRepo(repo).errors.join('\n');
  assert.match(errors, /라이선스 미정/u);
  assert.match(errors, /pass 가 아니면/u);
});

test('맥·Windows 칸만 안 봤고 그 운영체제가 verified:false 로 적혀 있으면 진열할 수 있다', () => {
  editMount((m) => {
    m.status = 'listed'; m.license.decided = true; m.review.result = 'pass';
    m.platforms.windows.verified = false;
    m.review.checks = m.review.checks.map((c) => ({ ...c, result: c.item.startsWith('3.') ? 'not_checked' : 'pass' }));
  });
  assert.deepEqual(checkRepo(repo).errors, []);
});

test('운영체제를 모두 확인했다고 적고 맥·Windows 칸을 안 봤으면 진열을 막는다', () => {
  editMount((m) => {
    m.status = 'listed'; m.license.decided = true; m.review.result = 'pass';
    m.platforms.windows.verified = true;
    m.review.checks = m.review.checks.map((c) => ({ ...c, result: c.item.startsWith('3.') ? 'not_checked' : 'pass' }));
  });
  assert.ok(checkRepo(repo).errors.some((e) => e.includes('안 본 검수 칸')));
});

test('맥·Windows 밖의 칸을 안 봤으면 진열을 막는다', () => {
  editMount((m) => {
    m.status = 'listed'; m.license.decided = true; m.review.result = 'pass';
    m.review.checks = m.review.checks.map((c) => ({ ...c, result: c.item.startsWith('2.') ? 'not_checked' : 'pass' }));
  });
  assert.ok(checkRepo(repo).errors.some((e) => e.includes('2. 권한')));
});

test('비밀값 모양이 든 파일을 잡는다', () => {
  writeFileSync(join(repo, 'skills', 'promo-image-set', 'references', 'critique.md'), `토큰 ghp_${'a'.repeat(36)}\n`);
  assert.ok(checkRepo(repo).errors.some((e) => e.includes('비밀값')));
});

test('비밀 열쇠를 저장소 안에 두려 하면 거절한다', () => {
  assert.throws(() => assertOutsideRepo(repo, join(repo, 'keys', 'private.pem')), { code: 'key_inside_repo' });
  const outside = join(scratch, 'outside-key'); mkdirSync(outside, { recursive: true });
  assert.doesNotThrow(() => assertOutsideRepo(repo, outside));
});

test('검사가 떨어진 저장소로는 목록을 만들지 않는다', () => {
  appendFileSync(join(repo, 'skills', 'promo-image-set', 'SKILL.md'), '\n');
  assert.throws(() => buildIndex(repo, { publicKeyPem: keys.publicPem, builtAt: '2026-10-26' }), { code: 'items_invalid' });
});
