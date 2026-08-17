// 매일 데이터 상태를 점검해 STATUS.md를 갱신한다 (§103, §104 운영 루틴)
//
// data/*.json이 원본이다. 수집기가 갱신하는 바로 그 파일을 읽어야
// 보고 내용이 실제 배포 데이터와 일치한다.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readAllStores } from './lib/read-stores.mjs';

const DATA_DIR = fileURLToPath(new URL('../data', import.meta.url));
const STORE_DIR = fileURLToPath(new URL('../data/stores', import.meta.url));
const STATUS_PATH = fileURLToPath(new URL('../STATUS.md', import.meta.url));

const read = async (name) => JSON.parse(await readFile(`${DATA_DIR}/${name}.json`, 'utf8'));

const [brands, stores, events, breads, recipes] = await Promise.all([
  read('brands'),
  // 매장은 시도별 파일로 나뉘어 있다. 점검은 전국을 합쳐서 한다.
  readAllStores(STORE_DIR),
  read('events'),
  read('breads'),
  read('recipes'),
]);

const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

const counts = {
  브랜드: brands.length,
  매장: stores.length,
  행사: events.length,
  빵백과: breads.length,
  레시피: recipes.length,
};

/**
 * 콘텐츠 볼륨 기준 (§103).
 *
 * 행사는 여기 없다. 행사가 0건인 것은 데이터 결함이 아니라 운영 상태다.
 * 운영자가 공식 출처를 확인해 등록하기 전까지는 비어 있는 게 정상이고 (§90, §91),
 * 이걸 실패로 처리하면 매장 수집 결과 커밋까지 막힌다. 아래 '운영 알림'으로만 알린다.
 *
 * 브랜드는 지침서 권장이 4~6개지만 기준을 3으로 뒀다.
 * 실제 매장이 확인된 브랜드만 두기로 했고, 채우려고 확인 안 된 브랜드를 넣는 건 §91 위반이다.
 */
const MINIMUM = { 브랜드: 3, 매장: 50, 빵백과: 20, 레시피: 10 };

const rows = Object.entries(counts).map(([key, value]) => {
  const min = MINIMUM[key];
  if (min === undefined) return `| ${key} | ${value} | — | 운영 항목 |`;
  return `| ${key} | ${value} | ${min} | ${value >= min ? '✅' : '⚠️ 부족'} |`;
});

const shortfalls = Object.entries(counts).filter(
  ([k, v]) => MINIMUM[k] !== undefined && v < MINIMUM[k],
);

const airfryer = breads.filter((b) => b.heating?.AIRFRYER).length;
const microwave = breads.filter((b) => b.heating?.MICROWAVE).length;

// 매장 출처 구성. 실제 수집분과 시드가 섞여 있을 수 있어 나눠 보여준다.
const realStores = stores.filter((s) => s.source === 'OSM').length;
const seedStores = stores.filter((s) => s.source === 'SEED').length;
const brandedStores = stores.filter((s) => s.brandId).length;

// 행사 상태.
const activeEvents = events.filter((e) => e.endDate >= today).length;
const needCheck = events.filter((e) => e.verificationStatus === 'CHECK_NEEDED').length;
const endingToday = events.filter((e) => e.endDate === today).length;

const ok = shortfalls.length === 0 && airfryer >= 15 && microwave >= 15;

const body = `# 데이터 상태

마지막 점검: **${today}** (KST) · 자동 생성

## 콘텐츠 볼륨 (개발지침서 §103)

| 항목 | 현재 | 최소 권장 | 상태 |
| --- | ---: | ---: | :---: |
${rows.join('\n')}
| 에어프라이어 가이드 | ${airfryer} | 15 | ${airfryer >= 15 ? '✅' : '⚠️ 부족'} |
| 전자레인지 가이드 | ${microwave} | 15 | ${microwave >= 15 ? '✅' : '⚠️ 부족'} |

## 매장 출처

| 출처 | 수 | 설명 |
| --- | ---: | --- |
| OSM | ${realStores} | OpenStreetMap 실제 수집 데이터 (ODbL) |
| SEED | ${seedStores} | 개발용 시드. 출시 전 교체 대상 |

브랜드 매장 ${brandedStores}곳 · 동네빵집 ${stores.length - brandedStores}곳

## 행사 상태

| 항목 | 수 |
| --- | ---: |
| 진행 가능 | ${activeEvents} |
| 오늘 마감 | ${endingToday} |
| 확인 필요 | ${needCheck} |

${needCheck > 0 ? `> ⚠️ 확인이 필요한 행사가 ${needCheck}건 있습니다. 관리자 페이지에서 출처를 재확인해 주세요.` : ''}
${activeEvents === 0 ? '> 📌 **등록된 행사가 없습니다.** `npm run admin`에서 공식 출처를 확인해 등록해 주세요.\n> 확인되지 않은 할인 정보는 자동으로 채우지 않습니다 (§91).' : ''}
${seedStores > 0 ? `> ⚠️ 시드 매장이 ${seedStores}곳 남아 있습니다. 실제 데이터로 교체해야 출시할 수 있습니다.` : ''}

## 점검 결과

${ok ? '콘텐츠 볼륨은 모두 기준을 충족합니다.' : shortfalls.map(([k, v]) => `- ⚠️ **${k}** ${v}개 — ${MINIMUM[k]}개 이상 필요합니다.`).join('\n')}

행사는 볼륨 기준에 넣지 않습니다. 운영자가 공식 출처를 확인해 등록하는 항목이라
비어 있는 것이 결함이 아니라 등록 대기 상태입니다 (§90, §91).

## 운영 루틴 (§104)

- **매일 (자동)** — 매장 수집, 행사 만료 처리, 검증 기한 점검, 건강성 검사
- **주 1회 (수동)** — 브랜드 행사 전수 점검, 링크 오류, 확인 필요 행사 처리
- **월 1회 (수동)** — 빵생활 콘텐츠 업데이트, 통계 분석, 사용량 낮은 메뉴 검토

> 이 파일은 \`scripts/daily-status.mjs\`가 생성합니다. 직접 수정하지 마세요.
`;

const previous = await readFile(STATUS_PATH, 'utf8').catch(() => '');
await writeFile(STATUS_PATH, body);

console.log(`STATUS.md 갱신 완료 (${today})`);
console.log(Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · '));
if (previous === body) console.log('내용 변경 없음.');

if (shortfalls.length > 0) {
  console.error('최소 권장량 미달:', shortfalls.map(([k]) => k).join(', '));
  process.exitCode = 1;
}
