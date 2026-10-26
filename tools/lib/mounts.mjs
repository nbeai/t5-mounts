// 티파이브 장착 저장소의 공용 검사·목록·서명 함수. 의존성 0(Node 내장만).
// 검사기(validate), 목록 만들기(build-index), 서명(sign-index), 검증(verify), 시험이 모두 이 파일만 쓴다.
import { createHash, createPrivateKey, createPublicKey, sign as edSign, verify as edVerify } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

export const KIND_DIRS = { skill: 'skills', mcp: 'mcp', cli: 'cli', plugin: 'plugins', hook: 'hooks' };
export const INDEX_SCHEMA = 't5.mount-index.v1';
export const PUBLIC_KEY_PATH = 'keys/t5-mounts-public.pem';

// 티파이브 본선 managed-skill-store.js 의 비밀값 모양 규칙과 같게 둔다(본선이 받아들이지 않는 것을 우리가 먼저 거른다).
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/u,
  /\b(?:sk|xox[baprs]|gh[pousr])[-_][A-Za-z0-9_-]{16,}\b/u,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\bAIza[0-9A-Za-z_-]{35}\b/u,
  /\bAuthorization\s*:\s*Bearer\s+\S+/iu,
];
const MAX_SKILL_BYTES = 64 * 1024; // 본선 MAX_METHOD_BYTES 와 같다.
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export class MountError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/** 키를 정렬해 늘 같은 바이트가 나오게 쓴다. 서명은 이 바이트 위에 한다. */
export function canonicalJson(value) {
  const sort = (v) => Array.isArray(v) ? v.map(sort)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])])) : v;
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}

// ── 스키마 검사: schema/mount.schema.json 을 그대로 읽어 쓴다(지원 키워드는 그 파일 description 에 적힘).
export function schemaErrors(schema, value, root = schema, at = '$') {
  if (schema.$ref) {
    const target = schema.$ref.replace(/^#\//u, '').split('/').reduce((node, key) => node?.[key], root);
    if (!target) return [`${at}: 스키마 참조 ${schema.$ref} 를 찾지 못함`];
    return schemaErrors(target, value, root, at);
  }
  const errors = [];
  const typeOf = (v) => v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v;
  if (schema.type) {
    const allowed = [].concat(schema.type); const actual = typeOf(value);
    if (!allowed.includes(actual) && !(actual === 'integer' && allowed.includes('number'))) return [`${at}: ${allowed.join('|')} 이어야 함(지금 ${actual})`];
  }
  if ('const' in schema && value !== schema.const) errors.push(`${at}: ${JSON.stringify(schema.const)} 이어야 함`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${at}: ${schema.enum.join('|')} 중 하나여야 함`);
  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) errors.push(`${at}: 너무 짧음`);
    if (schema.maxLength != null && value.length > schema.maxLength) errors.push(`${at}: ${schema.maxLength}자 넘음`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) errors.push(`${at}: 모양이 틀림(${schema.pattern})`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) errors.push(`${at}: 최소 ${schema.minItems}개`);
    if (schema.items) value.forEach((item, i) => errors.push(...schemaErrors(schema.items, item, root, `${at}[${i}]`)));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required ?? []) if (!(key in value)) errors.push(`${at}.${key}: 빠짐`);
    for (const [key, child] of Object.entries(value)) {
      if (schema.properties?.[key]) errors.push(...schemaErrors(schema.properties[key], child, root, `${at}.${key}`));
      else if (schema.additionalProperties === false) errors.push(`${at}.${key}: 스키마에 없는 칸`);
    }
  }
  return errors;
}

/** 항목 폴더 안 보통 파일 전부(mount.json 제외)를 상대 경로 순으로. 링크·숨은 파일은 그 자체로 오류다. */
export function itemFiles(folder) {
  const out = []; const problems = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const full = join(dir, entry.name); const rel = relative(folder, full).split(sep).join('/');
      if (entry.name.startsWith('.')) { problems.push(`${rel}: 숨은 파일은 넣지 않음`); continue; }
      const info = lstatSync(full);
      if (info.isSymbolicLink()) { problems.push(`${rel}: 바로가기(링크)는 넣지 않음`); continue; }
      if (info.isDirectory()) walk(full);
      else if (info.isFile() && rel !== 'mount.json') out.push(rel);
    }
  };
  walk(folder);
  return { files: out, problems };
}

export function fileFacts(folder) {
  const { files, problems } = itemFiles(folder);
  return { problems, files: files.map((path) => { const bytes = readFileSync(join(folder, path)); return { path, bytes: bytes.length, sha256: sha256(bytes) }; }) };
}

/** 항목 폴더 하나를 검사한다. 오류 문장 목록을 돌려준다(빈 목록 = 통과). */
export function checkItem(repoRoot, kindDir, id, schema) {
  const folder = join(repoRoot, kindDir, id); const where = `${kindDir}/${id}`;
  let raw; let mount;
  try { raw = readFileSync(join(folder, 'mount.json'), 'utf8'); } catch { return { mount: null, errors: [`${where}: mount.json 이 없음`] }; }
  try { mount = JSON.parse(raw); } catch { return { mount: null, errors: [`${where}/mount.json: JSON 이 깨짐`] }; }
  const errors = schemaErrors(schema, mount).map((e) => `${where}/mount.json ${e}`);
  if (errors.length) return { mount, errors };

  if (mount.id !== id) errors.push(`${where}: id(${mount.id})가 폴더 이름과 다름`);
  if (KIND_DIRS[mount.kind] !== kindDir) errors.push(`${where}: 종류 ${mount.kind} 는 ${KIND_DIRS[mount.kind]}/ 에 있어야 함`);

  // 지문: 적힌 목록과 실제 파일이 하나도 빠짐·더함·바뀜 없이 같아야 한다.
  const actual = fileFacts(folder);
  errors.push(...actual.problems.map((p) => `${where}/${p}`));
  const declared = new Map(mount.files.map((f) => [f.path, f]));
  for (const file of actual.files) {
    const d = declared.get(file.path);
    if (!d) errors.push(`${where}/${file.path}: mount.json 의 files 에 없는 파일`);
    else if (d.sha256 !== file.sha256 || d.bytes !== file.bytes) errors.push(`${where}/${file.path}: 지문이 다름(파일이 바뀜)`);
    declared.delete(file.path);
  }
  for (const path of declared.keys()) errors.push(`${where}/${path}: 적혀 있는데 파일이 없음`);

  // 비밀값 0: 모든 파일과 명세 자체.
  for (const path of [...actual.files.map((f) => f.path), 'mount.json']) {
    const text = readFileSync(join(folder, path), 'utf8');
    if (SECRET_PATTERNS.some((p) => p.test(text))) errors.push(`${where}/${path}: 비밀값 모양이 들어 있음`);
  }

  // 출처 규칙: 외부 원형은 링크·고정 커밋·원 라이선스가 반드시 있다. 우리 제작물은 원형 칸이 비어 있다.
  if (mount.origin.type === 'external') {
    if (!mount.origin.upstream) errors.push(`${where}: 외부 원형은 origin.upstream(주소·태그·커밋)이 있어야 함`);
    if (!mount.license.upstreamLicense) errors.push(`${where}: 외부 원형은 license.upstreamLicense 가 있어야 함`);
    if (mount.license.redistribution === 'allowed' && !mount.license.decided) errors.push(`${where}: 외부 원형 사본은 오너 결정(license.decided) 없이 둘 수 없음`);
  } else if (mount.origin.upstream) errors.push(`${where}: 우리 제작물에는 origin.upstream 을 두지 않음`);

  // 진열 조건: 라이선스가 정해졌고 검수가 통과(pass)여야 listed.
  if (mount.status === 'listed') {
    if (!mount.license.decided) errors.push(`${where}: 라이선스 미정 항목은 listed 가 될 수 없음`);
    if (mount.review.result !== 'pass') errors.push(`${where}: 검수 결과가 pass 가 아니면 listed 가 될 수 없음`);
    if (mount.review.checks.some((c) => c.result === 'fail' || c.result === 'not_checked')) errors.push(`${where}: 떨어졌거나 안 본 검수 칸이 있으면 listed 가 될 수 없음`);
  }
  if (mount.kind === 'hook' && mount.status !== 'draft') errors.push(`${where}: 훅은 티파이브 훅 기능(2.3) 전에는 draft 만`);

  // 스킬: 티파이브 들이기(claude-package-source.js readSkill)와 같은 머리말 규칙.
  if (mount.kind === 'skill') {
    let text = null; try { text = readFileSync(join(folder, 'SKILL.md'), 'utf8'); } catch { errors.push(`${where}: SKILL.md 가 없음`); }
    if (text != null) {
      const body = text.replace(/\r\n/gu, '\n');
      const end = body.startsWith('---\n') ? body.indexOf('\n---', 4) : -1;
      const head = end > 0 ? body.slice(4, end) : null;
      const field = (k) => head?.match(new RegExp(`^${k}:\\s*(.+)$`, 'mu'))?.[1].trim().replace(/^["']|["']$/gu, '') ?? null;
      if (!head) errors.push(`${where}/SKILL.md: 머리말(---)이 없음`);
      else {
        if (field('name') !== mount.id || !SKILL_NAME.test(field('name') ?? '')) errors.push(`${where}/SKILL.md: name 이 id 와 다름`);
        if (!field('description')) errors.push(`${where}/SKILL.md: description 이 없음`);
      }
      if (Buffer.byteLength(text, 'utf8') > MAX_SKILL_BYTES) errors.push(`${where}/SKILL.md: 64KB 넘음`);
    }
  }
  return { mount, errors };
}

/** 저장소 안 모든 항목을 찾아 검사한다. */
export function checkRepo(repoRoot) {
  const schema = JSON.parse(readFileSync(join(repoRoot, 'schema', 'mount.schema.json'), 'utf8'));
  const items = []; const errors = [];
  for (const kindDir of Object.values(KIND_DIRS)) {
    let children = [];
    try { children = readdirSync(join(repoRoot, kindDir), { withFileTypes: true }); } catch { continue; }
    for (const child of children.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      if (!child.isDirectory()) continue; // 종류 폴더의 README.md 같은 안내 파일은 항목이 아니다.
      const result = checkItem(repoRoot, kindDir, child.name, schema);
      errors.push(...result.errors);
      if (result.mount) items.push({ path: `${kindDir}/${child.name}`, mount: result.mount,
        mountSha256: sha256(readFileSync(join(repoRoot, kindDir, child.name, 'mount.json'))) });
    }
  }
  return { items, errors };
}

// ── 열쇠와 서명
export const keyIdOf = (publicKeyPem) => sha256(createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' })).slice(0, 16);

/** 비밀 열쇠는 저장소 밖에만 둔다. 저장소 안 경로면 거절한다. */
export function assertOutsideRepo(repoRoot, path) {
  const repo = realpathSync(repoRoot);
  // 아직 없는 경로는 가장 가까운 있는 상위 폴더의 실제 경로에 나머지를 붙인다(바로가기 걸린 폴더 아래도 저장소 안으로 알아본다).
  let existing = resolve(path); const rest = [];
  for (;;) { try { existing = realpathSync(existing); break; } catch { rest.unshift(basename(existing)); const up = dirname(existing); if (up === existing) break; existing = up; } }
  const target = join(existing, ...rest);
  if (target === repo || target.startsWith(repo + sep)) throw new MountError('key_inside_repo', '비밀 열쇠는 저장소 밖에 두어야 해요.');
}

export function buildIndex(repoRoot, { publicKeyPem, builtAt }) {
  const { items, errors } = checkRepo(repoRoot);
  if (errors.length) throw Object.assign(new MountError('items_invalid', '항목 검사가 떨어져 목록을 만들지 않았어요.'), { errors });
  return canonicalJson({ schema: INDEX_SCHEMA, builtAt, keyId: keyIdOf(publicKeyPem),
    items: items.map(({ path, mount, mountSha256 }) => ({ path, mountSha256, mount })) });
}

export function signIndex(indexBytes, privateKeyPem) {
  return `${edSign(null, Buffer.from(indexBytes), createPrivateKey(privateKeyPem)).toString('base64')}\n`;
}

/**
 * 저장소 전체를 검증한다: 항목 검사 → index.json 이 지금 항목으로 다시 만든 것과 바이트까지 같은가 → 서명.
 * 돌려주는 것: { ok, errors: [{ code, message }] }.
 */
export function verifyRepo(repoRoot, { publicKeyPem = null } = {}) {
  const errors = []; const fail = (code, message) => errors.push({ code, message });
  const pem = publicKeyPem ?? (() => { try { return readFileSync(join(repoRoot, PUBLIC_KEY_PATH), 'utf8'); } catch { return null; } })();
  if (!pem) { fail('public_key_missing', `${PUBLIC_KEY_PATH} 가 없음`); return { ok: false, errors }; }
  const checked = checkRepo(repoRoot);
  for (const message of checked.errors) fail(/지문|파일이 없음|files 에 없는/u.test(message) ? 'digest_mismatch' : 'item_invalid', message);

  let indexText; let sig;
  try { indexText = readFileSync(join(repoRoot, 'index.json'), 'utf8'); } catch { fail('index_missing', 'index.json 이 없음'); return { ok: false, errors }; }
  try { sig = readFileSync(join(repoRoot, 'index.sig'), 'utf8').trim(); } catch { fail('signature_missing', 'index.sig 가 없음'); }
  if (sig != null) {
    let good = false;
    try { good = edVerify(null, Buffer.from(indexText), createPublicKey(pem), Buffer.from(sig, 'base64')); } catch { good = false; }
    if (!good) fail('signature_invalid', '서명이 맞지 않음(목록이 바뀌었거나 다른 열쇠로 서명됨)');
  }
  let index; try { index = JSON.parse(indexText); } catch { fail('index_invalid', 'index.json 이 깨짐'); return { ok: false, errors }; }
  if (index.schema !== INDEX_SCHEMA) fail('index_invalid', `index.json schema 가 ${INDEX_SCHEMA} 가 아님`);
  if (index.keyId !== keyIdOf(pem)) fail('key_mismatch', '목록에 적힌 열쇠 번호가 공개 열쇠와 다름');

  const listed = new Map((index.items ?? []).map((item) => [item.path, item]));
  for (const { path, mount, mountSha256 } of checked.items) {
    const entry = listed.get(path);
    if (!entry) fail('item_not_in_index', `${path}: 저장소에 있는데 목록에 없음`);
    else if (entry.mountSha256 !== mountSha256 || canonicalJson(entry.mount) !== canonicalJson(mount)) fail('index_stale', `${path}: 목록의 명세가 지금 mount.json 과 다름`);
    listed.delete(path);
  }
  for (const path of listed.keys()) fail('index_extra_item', `${path}: 목록에 있는데 저장소에 없음`);
  if (!errors.length && indexText !== canonicalJson(index)) fail('index_not_canonical', 'index.json 이 정해진 꼴로 쓰이지 않음(손으로 고침?)');
  return { ok: errors.length === 0, errors };
}
