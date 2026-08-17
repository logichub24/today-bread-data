// 만료된 행사를 자동 처리한다 (§57).
//
// 중요: 종료된 행사를 데이터에서 삭제하지 않는다. status만 EXPIRED로 바꾼다.
// 그리고 검증이 오래된 행사는 CHECK_NEEDED로 표시해 운영자가 확인하도록 남긴다 (§59, §90).
// 새 행사를 자동으로 만들어내지는 않는다. 확인되지 않은 할인 정보 자동 게시는 §91 금지사항이다.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const EVENTS_PATH = fileURLToPath(new URL('../data/events.json', import.meta.url));

/** 이 일수를 넘게 재확인되지 않은 진행 중 행사는 검증 필요로 표시한다. */
const STALE_VERIFY_DAYS = 14;

const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

const daysBetween = (from, to) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

const events = JSON.parse(await readFile(EVENTS_PATH, 'utf8'));

let expired = 0;
let flagged = 0;

const updated = events.map((e) => {
  const next = { ...e };

  if (e.endDate < today) {
    if (e.verificationStatus !== 'EXPIRED') {
      next.verificationStatus = 'EXPIRED';
      expired += 1;
    }
    return next;
  }

  // 진행 중인데 확인일이 오래된 행사는 운영자 확인 대상으로 올린다.
  if (e.verificationStatus === 'VERIFIED' && daysBetween(e.verifiedAt, today) > STALE_VERIFY_DAYS) {
    next.verificationStatus = 'CHECK_NEEDED';
    flagged += 1;
  }
  return next;
});

const active = updated.filter((e) => e.endDate >= today).length;
const needCheck = updated.filter((e) => e.verificationStatus === 'CHECK_NEEDED').length;

console.log(`오늘 ${today} 기준`);
console.log(`  진행 가능 ${active}건 / 전체 ${updated.length}건`);
console.log(`  신규 만료 처리 ${expired}건`);
console.log(`  확인 필요로 전환 ${flagged}건 (누적 ${needCheck}건)`);

if (JSON.stringify(events) !== JSON.stringify(updated)) {
  await writeFile(EVENTS_PATH, `${JSON.stringify(updated, null, 2)}\n`);
  console.log('events.json 갱신됨');
} else {
  console.log('변경 없음');
}

if (active === 0) {
  console.log('::warning::진행 중인 행사가 없습니다. 관리자 페이지에서 새 행사를 등록해 주세요.');
}
if (needCheck > 0) {
  console.log(`::warning::확인이 필요한 행사가 ${needCheck}건 있습니다.`);
}
