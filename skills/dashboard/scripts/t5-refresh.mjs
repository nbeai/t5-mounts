// 티파이브가 이 스킬의 대시보드를 원천에서 다시 만들 때 부르는 계약(SKILL.md metadata.t5Refresh). 모델 호출 없음.
// describe: 등록할 때 재료(derivedFrom: 경로·지문) 가운데 설정(spec)과 그 원본을 찾는다. rebuild: 같은 설정을 지금 시각으로 다시 만든다.
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildDashboard, PREVIEW_LIMIT } from './build-dashboard.mjs';

export async function describe({ derivedFrom = [] } = {}) {
  for (const item of derivedFrom) {
    if (!item?.sha256 || !String(item.path ?? '').endsWith('.json')) continue;
    let spec; try { spec = JSON.parse(await readFile(item.path, 'utf8')); } catch { continue; }
    if (typeof spec?.source?.path !== 'string') continue;
    return { spec: item.path, sources: [resolve(dirname(item.path), spec.source.path)] };
  }
  return null;
}

export async function rebuild({ spec } = {}) {
  const value = JSON.parse(await readFile(spec, 'utf8'));
  value.asOf = new Date().toISOString();
  const result = await buildDashboard(value, { specDirectory: dirname(spec) });
  if (result.bytes > PREVIEW_LIMIT) throw new Error(`dashboard is ${result.bytes} bytes, above the preview limit`);
  return { html: result.html, asOf: value.asOf, summary: result.summary };
}
