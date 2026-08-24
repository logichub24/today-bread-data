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
  ID_PREFIX,
  PARISCROISSANT_URL,
  TLJ_URL,
  fetchBreadncoEvents,
  fetchDcakeEvents,
  fetchDunkinEvents,
  fetchParisCroissantEvents,
  fetchTljEvents,
  toEvents as toBrandEvents,
} from './lib/brand-events.mjs';
import { readHealth, record, writeHealth } from './lib/source-health.mjs';

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
/**
 * 수집에 실패한 출처의 id 접두사.
 *
 * 이 스크립트는 소유 접두사를 전부 지우고 다시 넣는다. 그래서 한 브랜드가 실패하면
 * 그 브랜드 행사가 조용히 사라진다. 실패는 "행사가 없어졌다"가 아니라 "확인할 수 없다"이므로,
 * 실패한 접두사는 기존 것을 그대로 남긴다.
 */
const failedPrefixes = new Set();
/**
 * 출처가 멀쩡한데 결과가 정말 0건인 경우.
 *
 * 홈플러스 전단은 상품이 175건 돌아왔는데 그중 몽블랑제가 없을 수 있다. 그건 차단이 아니라
 * "이번 주엔 그 브랜드 행사가 없다"이므로, 지난주 행사를 붙잡고 있으면 안 된다.
 * 아래 '조용한 0건' 판정에서 빼 준다.
 */
const verifiedEmpty = new Set();
/** 출처별 이번 실행 결과. 실패해도 기존 데이터를 지키므로 낡는 것을 여기로 알린다. */
const health = await readHealth();

// --- 홈플러스 전단 (몽블랑제) ---
try {
  const info = await fetchLeafletInfo();
  console.log(`홈플러스 전단 ${info.leafletNo}호 · ${info.period.start} ~ ${info.period.end}`);
  const items = await fetchLeafletItems(info.leafletNo, info.categoryId);
  const events = TARGETS.flatMap((t) => toEvents(items, { ...t, period: info.period, collectedAt }));
  console.log(`  상품 ${items.length.toLocaleString('ko-KR')}건 → 행사 ${events.length}건`);
  for (const e of events) console.log(`    ${e.title}`);
  collected.push(...events);
  // 상품을 실제로 받아 왔다면 전단은 멀쩡하다. 그 안에 몽블랑제가 없는 것은 사실이다.
  if (items.length > 0) verifiedEmpty.add('HP-');
  record(health, 'HP-', { name: '몽블랑제(홈플러스 전단)', ok: true, today: collectedAt });
} catch (err) {
  // 한 출처가 막혀도 다른 출처는 진행한다. 실패한 것은 기존 데이터를 남긴다.
  console.error(`  홈플러스 전단 실패: ${err.message}`);
  failedPrefixes.add('HP-');
  record(health, 'HP-', { name: '몽블랑제(홈플러스 전단)', ok: false, error: err.message, today: collectedAt });
}

// --- 파리바게뜨 공식 프로모션 ---
try {
  const events = await collectParisEvents({ brandId: 'B001', collectedAt, today: collectedAt });
  console.log(`파리바게뜨 공식 → 진행 중 ${events.length}건`);
  for (const e of events) console.log(`    ${e.startDate}~${e.endDate}  ${e.title.slice(0, 40)}`);
  collected.push(...events);
  record(health, 'PB-', { name: '파리바게뜨 공식', ok: true, today: collectedAt });
} catch (err) {
  console.error(`  파리바게뜨 실패: ${err.message}`);
  failedPrefixes.add('PB-');
  record(health, 'PB-', { name: '파리바게뜨 공식', ok: false, error: err.message, today: collectedAt });
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
    record(health, `${ID_PREFIX[src.brandId]}-`, { name: `${src.brandName} 공식`, ok: true, today: collectedAt });
  } catch (err) {
    console.error(`  ${src.brandName} 실패: ${err.message}`);
    failedPrefixes.add(`${ID_PREFIX[src.brandId]}-`);
    record(health, `${ID_PREFIX[src.brandId]}-`, {
      name: `${src.brandName} 공식`,
      ok: false,
      error: err.message,
      today: collectedAt,
    });
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

// 오류 없이 0건을 준 출처도 실패로 본다.
//
// 파리크라상은 GitHub 러너에서 예외 없이 빈 목록을 준다(집 IP에서는 1건 나온다).
// 차단인지 정말 행사가 없는 건지 응답만으로는 구분할 수 없다. 어제 있던 행사가
// 오늘 통째로 0건이 되는 쪽이 훨씬 드문 일이므로, 그때는 지우지 않고 남긴다.
// 기간이 지난 것은 check-events.mjs가 EXPIRED로 표시하니 낡은 채 노출되지는 않는다.
const countBy = (list, prefix) => list.filter((e) => e.id.startsWith(prefix)).length;
for (const prefix of OWNED_PREFIXES) {
  if (failedPrefixes.has(prefix)) continue;
  // 출처가 멀쩡한데 0건이면 지난 행사를 붙잡지 않는다. 기간이 끝난 것은 떠나야 한다.
  if (verifiedEmpty.has(prefix)) continue;
  if (countBy(collected, prefix) === 0 && countBy(existing, prefix) > 0) {
    console.error(`  ${prefix} 수집 0건 — 어제는 있었습니다. 차단일 수 있어 기존 것을 남깁니다.`);
    failedPrefixes.add(prefix);
    record(health, prefix, {
      name: health[prefix]?.name ?? prefix,
      ok: false,
      error: '오류 없이 0건',
      today: collectedAt,
    });
  }
}

// 수집에 실패한 출처는 기존 행사를 그대로 살린다. 실패는 "행사가 끝났다"가 아니라
// "확인할 수 없다"이므로, 지워 버리면 앱에서 진행 중인 행사가 사라진다.
const kept = existing.filter(
  (e) => isOwned(e.id) && [...failedPrefixes].some((p) => e.id.startsWith(p)),
);

// 이미 알던 행사는 처음 본 날짜를 지킨다.
//
// 매번 collectedAt으로 덮어쓰면 어제도 있던 행사가 오늘 또 '새 행사'가 된다.
// 실제로 첫 수집일에 40건이 한꺼번에 들어와 전부 새 행사로 표시됐다.
// createdAt은 "우리가 처음 본 날"이어야지 "마지막으로 확인한 날"이 아니다.
const firstSeen = new Map(existing.map((e) => [e.id, e.createdAt]));
const withFirstSeen = collected.map((e) =>
  firstSeen.has(e.id) ? { ...e, createdAt: firstSeen.get(e.id) } : e,
);
const freshCount = withFirstSeen.filter((e) => !firstSeen.has(e.id)).length;

const next = [...manual, ...kept, ...withFirstSeen];
await writeFile(EVENTS_PATH, `${JSON.stringify(next, null, 2)}\n`);
if (kept.length > 0) {
  console.log('');
  console.log(`수집 실패로 기존 행사를 유지한 출처 ${failedPrefixes.size}곳 — ${kept.length}건`);
  console.log(`    접두사 ${[...failedPrefixes].join(', ')}`);
}
if (needsReview.length > 0) {
  console.log('');
  console.log(`⚠ 판단이 필요한 행사 ${needsReview.length}건 — 날짜가 없어 상시인지 알 수 없습니다.`);
  for (const t of needsReview) console.log(`    ${t}`);
  console.log('  상시가 맞으면 scripts/lib/brand-events.mjs의 목록에 제목을 추가하세요.');
  console.log('');
}

console.log(
  `반영 완료 — 직접 등록 ${manual.length}건 + 유지 ${kept.length}건 + 수집 ${collected.length}건 = ${next.length}건`,
);
console.log(`이번에 처음 본 행사 ${freshCount}건 (나머지는 처음 본 날짜를 유지했습니다)`);
console.log(`(이전 수집분 ${previous}건 중 ${previous - kept.length}건을 교체했습니다)`);

await writeHealth(health);
