// 출처별로 마지막 성공 시각을 남긴다.
//
// 이 저장소는 수집이 실패해도 기존 데이터를 지운다는 선택을 하지 않는다. 옳은 판단이지만
// 대신 **조용히 낡아간다**. 실제로 브레댄코는 러너에서 계속 막혀 있었는데 앱에는
// 그대로 노출되고 있었고, 아무도 알아채지 못했다.
//
// 마지막 성공일을 기록해 두면 "며칠째 못 받고 있다"를 숫자로 말할 수 있다.
// 그 숫자가 한계를 넘으면 워크플로가 빨간불을 켠다.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const HEALTH_PATH = fileURLToPath(new URL('../../data/sources.json', import.meta.url));

/**
 * 며칠째 실패하면 알릴지. 출처마다 사정이 다르다.
 *
 * 매장은 하루만 걸러도 바로 알아야 한다 — 이 앱의 뼈대다.
 * 브랜드 행사는 원래 며칠씩 그대로인 것이 정상이라 여유를 둔다.
 */
export const ALERT_AFTER_DAYS = { stores: 2, default: 7 };

export const alertAfter = (key) => ALERT_AFTER_DAYS[key] ?? ALERT_AFTER_DAYS.default;

/** 파일이 없으면 빈 기록으로 시작한다. 첫 실행에서 넘어져서는 안 된다. */
export async function readHealth() {
  try {
    const raw = JSON.parse(await readFile(HEALTH_PATH, 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

export async function writeHealth(health) {
  await writeFile(HEALTH_PATH, `${JSON.stringify(health, null, 2)}\n`);
}

/**
 * 한 출처의 이번 실행 결과를 반영한다.
 *
 * 성공하면 마지막 성공일을 오늘로 올리고 연속 실패를 0으로 되돌린다.
 * 실패하면 마지막 성공일은 **건드리지 않는다** — 그 날짜가 곧 데이터의 나이다.
 */
export function record(health, key, { name, ok, error, today }) {
  const prev = health[key] ?? {};
  health[key] = {
    name,
    lastAttemptAt: today,
    lastSuccessAt: ok ? today : (prev.lastSuccessAt ?? null),
    failStreak: ok ? 0 : (prev.failStreak ?? 0) + 1,
    lastError: ok ? null : (error ?? '알 수 없는 오류'),
  };
  return health;
}

/** 마지막 성공으로부터 며칠 지났나. 한 번도 성공한 적 없으면 null. */
export function ageDays(entry, today, daysBetween) {
  if (!entry?.lastSuccessAt) return null;
  return daysBetween(entry.lastSuccessAt, today);
}

/** 한계를 넘긴 출처만 골라낸다. */
export function stale(health, today, daysBetween) {
  return Object.entries(health)
    .map(([key, entry]) => ({ key, entry, age: ageDays(entry, today, daysBetween) }))
    .filter(({ key, age }) => age === null || age > alertAfter(key));
}
