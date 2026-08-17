// 공식 출처에서 브랜드 행사를 수집해 events.json을 갱신한다.
//
//   npm run data:events
//
//   홈플러스 전단  → 몽블랑제 (주 단위로 바뀐다)      id 접두사 HP-
//   파리바게뜨 공식 → 파리바게뜨                      id 접두사 PB-
//   뚜레쥬르 공식   → 뚜레쥬르                        id 접두사 TL-
//   던킨 공식       → 던킨                            id 접두사 DK-
//   브레댄코 공식   → 브레댄코                        id 접두사 BN-
//   파리크라상 공식 → 파리크라상                      id 접두사 PC-
//   떡보의하루 공식 → 떡보의하루                      id 접두사 DC-
//
// 날짜가 없어 상시인지 판단이 필요한 건은 등록하지 않고 "확인 필요"로 출력한다.
//
// **손으로 등록한 행사는 건드리지 않는다.** 이 스크립트가 소유한 접두사만
// 지우고 다시 넣는다. 관리자 페이지로 넣은 행사와 섞이면 안 된다.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fetchLeafletInfo, fetchLeafletItems, toEvents } from './lib/homeplus-leaflet.mjs';
import { collectParisEvents } from './lib/paris-promotion.mjs';
import {
  BREADNCO_URL,
  DCAKE_URL,
  DUNKIN_URL,
  PARISCROISSANT_URL,
  TLJ_URL,
  fetchBreadncoEvents,
  fetchDcakeEvents,
  fetchDunkinEvents,
  fetchParisCroissantEvents,
  fetchTljEvents,
  toEvents as toBrandEvents,
} from './lib/brand-events.mjs';

const EVENTS_PATH = fileURLToPath(new URL('../data/events.json', import.meta.url));
/** 이 스크립트가 소유하는 행사의 id 접두사. 나머지는 손으로 등록한 것이다. */
const OWNED_PREFIXES = ['HP-', 'PB-', 'TL-', 'DK-', 'BN-', 'PC-', 'DC-', 'BR-'];
const isOwned = (id) => OWNED_PREFIXES.some((p) => id.startsWith(p));

/** 전단에서 찾을 브랜드. 다른 마트 입점 브랜드가 생기면 여기에 추가한다. */
const TARGETS = [{ brandId: 'B008', brandName: '몽블랑제' }];

const collectedAt = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

const collected = [];
/** 날짜가 없어 상시인지 사람이 판단해야 하는 건. 등록하지 않고 보고만 한다. */
const needsReview = [];

// --- 홈플러스 전단 (몽블랑제) ---
try {
  const info = await fetchLeafletInfo();
  console.log(`홈플러스 전단 ${info.leafletNo}호 · ${info.period.start} ~ ${info.period.end}`);
  const items = await fetchLeafletItems(info.leafletNo);
  const events = TARGETS.flatMap((t) => toEvents(items, { ...t, period: info.period, collectedAt }));
  console.log(`  상품 ${items.length.toLocaleString('ko-KR')}건 → 행사 ${events.length}건`);
  for (const e of events) console.log(`    ${e.title}`);
  collected.push(...events);
} catch (err) {
  // 한 출처가 막혀도 다른 출처는 진행한다. 전부 실패했을 때만 반영을 멈춘다.
  console.error(`  홈플러스 전단 실패: ${err.message}`);
}

// --- 파리바게뜨 공식 프로모션 ---
try {
  const events = await collectParisEvents({ brandId: 'B001', collectedAt, today: collectedAt });
  console.log(`파리바게뜨 공식 → 진행 중 ${events.length}건`);
  for (const e of events) console.log(`    ${e.startDate}~${e.endDate}  ${e.title.slice(0, 40)}`);
  collected.push(...events);
} catch (err) {
  console.error(`  파리바게뜨 실패: ${err.message}`);
}

// --- 뚜레쥬르·던킨 공식 이벤트 ---
for (const src of [
  { brandId: 'B002', brandName: '뚜레쥬르', fetch: fetchTljEvents, url: TLJ_URL, name: '뚜레쥬르 공식 이벤트' },
  { brandId: 'B003', brandName: '던킨', fetch: fetchDunkinEvents, url: DUNKIN_URL, name: '던킨 공식 이벤트' },
  { brandId: 'B005', brandName: '브레댄코', fetch: fetchBreadncoEvents, url: BREADNCO_URL, name: '브레댄코 공식 이벤트' },
  { brandId: 'B006', brandName: '파리크라상', fetch: fetchParisCroissantEvents, url: PARISCROISSANT_URL, name: '파리크라상 공식' },
  { brandId: 'B009', brandName: '떡보의하루', fetch: fetchDcakeEvents, url: DCAKE_URL, name: '떡보의하루 공식 이벤트' },
]) {
  try {
    const raw = await src.fetch();
    const events = toBrandEvents(raw, {
      brandId: src.brandId,
      brandName: src.brandName,
      sourceName: src.name,
      sourceUrl: src.url,
      collectedAt,
      today: collectedAt,
    });
    console.log(`${src.brandName} 공식 → 진행 중 ${events.length}건 (수집 ${raw.length}건)`);
    for (const e of events) {
      console.log(`    ${e.startDate ?? '상시'}~${e.endDate ?? '상시'}  ${e.title.slice(0, 40)}`);
    }
    const review = raw.filter((e) => e.needsReview);
    for (const e of review) needsReview.push(`${src.brandName} · ${e.title}`);
    collected.push(...events);
  } catch (err) {
    console.error(`  ${src.brandName} 실패: ${err.message}`);
  }
}

const existing = JSON.parse(await readFile(EVENTS_PATH, 'utf8'));
const manual = existing.filter((e) => !isOwned(e.id));
const previous = existing.length - manual.length;

// 전단에서 한 건도 못 찾으면 이번 주에 해당 브랜드 상품이 없다는 뜻일 수도 있고
// 응답 구조가 바뀐 것일 수도 있다. 구분이 안 되므로 기존 것을 지우지 않는다.
if (collected.length === 0 && previous > 0) {
  console.error('수집 결과가 0건입니다. 기존 수집분을 지우지 않고 그대로 둡니다.');
  process.exit(1);
}

const next = [...manual, ...collected];
await writeFile(EVENTS_PATH, `${JSON.stringify(next, null, 2)}\n`);
if (needsReview.length > 0) {
  console.log('');
  console.log(`⚠ 판단이 필요한 행사 ${needsReview.length}건 — 날짜가 없어 상시인지 알 수 없습니다.`);
  for (const t of needsReview) console.log(`    ${t}`);
  console.log('  상시가 맞으면 scripts/lib/brand-events.mjs의 목록에 제목을 추가하세요.');
  console.log('');
}

console.log(`반영 완료 — 직접 등록 ${manual.length}건 + 수집 ${collected.length}건 = ${next.length}건`);
console.log(`(이전 수집분 ${previous}건은 교체했습니다)`);
