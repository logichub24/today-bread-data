// 출처가 며칠째 낡았는지 확인하고, 한계를 넘으면 실패로 끝낸다.
//
//   npm run data:sources
//
// 이 저장소는 수집이 실패해도 기존 데이터를 지운다는 선택을 하지 않는다. 옳은 판단이지만
// 대신 **아무도 모르게 낡는다**. 실제로 브레댄코는 러너에서 계속 막혀 있었고
// 매장 내려받기도 7일 중 2일 끊겼는데, 워크플로는 매번 초록불이었다.
//
// 그래서 마지막 성공일을 기준으로 판단해 여기서 빨간불을 켠다.
// 수집 단계는 continue-on-error로 두고 이 단계만 실패시키므로,
// 갱신된 데이터는 이미 커밋된 뒤다 — 알림 때문에 데이터를 잃지 않는다.

import { ageDays, alertAfter, readHealth } from './lib/source-health.mjs';
import { daysBetween } from './lib/days.mjs';

const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
const health = await readHealth();

const entries = Object.entries(health);
if (entries.length === 0) {
  console.log('아직 수집 기록이 없습니다. 점검할 것이 없습니다.');
  process.exit(0);
}

const rows = entries.map(([key, e]) => {
  const age = ageDays(e, today, daysBetween);
  const limit = alertAfter(key);
  return { key, e, age, limit, overdue: age === null || age > limit };
});

for (const r of rows) {
  const 경과 = r.age === null ? '성공 기록 없음' : r.age === 0 ? '오늘' : `${r.age}일 전`;
  const 표시 = r.overdue ? '⚠️' : '✅';
  console.log(`${표시} ${r.e.name} — 마지막 성공 ${경과} (한계 ${r.limit}일, 연속 실패 ${r.e.failStreak})`);
}

const overdue = rows.filter((r) => r.overdue);
if (overdue.length === 0) {
  console.log('');
  console.log('모든 출처가 기한 안에 갱신됐습니다.');
  process.exit(0);
}

console.log('');
for (const r of overdue) {
  // GitHub Actions가 이 문구를 실행 요약에 오류로 올려 준다.
  console.log(
    `::error title=${r.e.name} 갱신 지연::마지막 성공 ${r.e.lastSuccessAt ?? '없음'} · ` +
      `연속 실패 ${r.e.failStreak}회 · 원인 ${r.e.lastError ?? '미상'}`,
  );
}

console.error('');
console.error(`갱신이 밀린 출처 ${overdue.length}곳: ${overdue.map((r) => r.e.name).join(', ')}`);
console.error('집 IP에서 해당 수집 명령을 직접 돌리면 대부분 받아집니다. 러너 IP가 막히는 출처가 있습니다.');
process.exit(1);
