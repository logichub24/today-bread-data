// 날짜 문자열 사이의 일수. 스크립트 여러 곳이 같은 계산을 하고 있어 한곳에 뒀다.
// 앱의 utils/date.ts와 같은 규칙이지만 이 저장소는 TS를 쓰지 않아 따로 둔다.

/** "2026-08-17"에서 "2026-08-24"까지 → 7. 시간대 영향을 받지 않도록 UTC 자정으로 맞춘다. */
export function daysBetween(from, to) {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}
