// 지방행정 인허가데이터(식품 제과점영업) 레코드를 앱의 Store 형태로 바꾼다.
//
// CSV 파일과 조회 API가 같은 필드 이름을 쓰므로 변환 로직을 한곳에 둔다.
// 출처: 행정안전부 지방행정 인허가데이터 (LOCALDATA) — 제1유형(출처표시)

import { tmToWgs84 } from './coords.mjs';
import { BRANDS } from './brand-map.mjs';

/**
 * 기본 수집 범위. null이면 전국이다.
 *
 * 예전에는 서울만 담았다. 파일이 커지는 게 이유였는데, 시도별로 쪼개고
 * 앱이 주변 지역만 받아가도록 바꾸면서 전국을 담을 수 있게 됐다.
 */
export const DEFAULT_REGION = null;

/** 매장명에서 브랜드 id를 추론한다. 못 찾으면 null(동네빵집). */
export function inferBrandId(name) {
  const normalized = name.toLowerCase().replace(/\s+/g, '');
  for (const [brandId, patterns] of Object.entries(BRANDS)) {
    if (patterns.some((p) => normalized.includes(p))) return brandId;
  }
  return null;
}

/**
 * 같은 브랜드인데 상호 표기가 갈리는 것을 공식 명칭으로 맞춘다.
 *
 * 인허가 데이터에 "파리바게뜨" 2,657곳과 "파리바게트" 717곳이 섞여 있다.
 * 같은 브랜드인데 목록에서 다른 가게처럼 보이고 검색도 갈린다.
 * 주소나 지점명은 건드리지 않고 브랜드 부분만 바꾼다.
 */
const NAME_FIXES = [[/파리바게트/g, '파리바게뜨']];

function normalizeBrandName(name) {
  return NAME_FIXES.reduce((acc, [from, to]) => acc.replace(from, to), name);
}

/** "20180215" → "2018-02-15". 형식이 아니면 null. */
function toDate(raw) {
  const s = String(raw ?? '').trim();
  if (!/^\d{8}$/.test(s)) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/**
 * 도로명주소에서 상세(층·호)를 덜어내 읽기 쉽게 만든다.
 *   "서울특별시 종로구 북촌로 25, 1층 (재동)"        → "서울특별시 종로구 북촌로 25 (재동)"
 *   "서울특별시 서초구 서초중앙로24길 43 (서초동,103호)" → "서울특별시 서초구 서초중앙로24길 43 (서초동)"
 *
 * 괄호를 먼저 떼어내고 자른다. 괄호 안에도 쉼표가 들어 있어서
 * 문자열 전체를 쉼표로 자르면 괄호가 반쪽만 남아 깨진다.
 */
function tidyAddress(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';

  // 끝에 붙은 괄호 그룹을 분리한다.
  const paren = s.match(/\(([^()]*)\)\s*$/);
  const head = paren ? s.slice(0, paren.index).trim() : s;

  // 괄호 안은 "법정동,상세" 형태가 많다. 법정동만 남긴다.
  const dong = paren ? paren[1].split(',')[0].trim() : '';

  // 괄호 밖 상세(", 1층")를 덜어낸다.
  const base = head.split(',')[0].trim();
  if (!base) return dong ? `(${dong})` : s;
  if (!dong) return base;
  return `${base} (${dong})`;
}

function tidyPhone(raw) {
  const s = String(raw ?? '').trim();
  return /\d/.test(s) ? s : null;
}

/**
 * 레코드 하나를 Store로 바꾼다. 영업 중이 아니거나 좌표·이름이 없으면 null.
 *
 * 영업시간은 이 데이터에 없다. null로 두어 앱이 "영업시간 정보 없음"을 밝히게 한다.
 * 임의 기본값을 넣으면 열려 있는 가게를 "영업 종료"로 보여주게 된다 (§91).
 */
export function toStore(row, collectedAt, geocodeCache = {}) {
  const status = String(row['영업상태명'] ?? '').trim();
  // "영업/정상"만 통과. 폐업·휴업·취소는 지도에 올리지 않는다.
  if (!status.startsWith('영업')) return null;

  const rawName = String(row['사업장명'] ?? '').trim();
  if (!rawName) return null;
  const name = normalizeBrandName(rawName);

  const licenseNo0 = String(row['관리번호'] ?? '').trim();
  // 원본 좌표가 우선이다. 없을 때만 주소로 변환해 둔 캐시를 본다
  // (scripts/geocode-missing.mjs). 관청이 좌표를 올리면 자동으로 원본으로 돌아간다.
  const coords = tmToWgs84(row['좌표정보(X)'], row['좌표정보(Y)']) ?? geocodeCache[licenseNo0] ?? null;
  if (!coords) return null;

  const road = tidyAddress(row['도로명주소']);
  const jibun = tidyAddress(row['지번주소']);
  if (!road && !jibun) return null;

  const licenseNo = licenseNo0;

  return {
    storeId: `LD${licenseNo || `${row['개방자치단체코드']}-${name}`}`,
    brandId: inferBrandId(name),
    storeName: name,
    roadAddress: road || jibun,
    jibunAddress: jibun || road,
    latitude: coords.lat,
    longitude: coords.lng,
    phone: tidyPhone(row['전화번호']),
    // 인허가 데이터에는 영업시간이 없다.
    openTime: null,
    closeTime: null,
    businessStatus: '영업',
    // 영업 허가일. 동네빵집을 구분하는 거의 유일한 공개 정보라 반드시 살린다.
    licensedAt: toDate(String(row['인허가일자'] ?? '').replace(/-/g, '').slice(0, 8)),
    source: 'LOCALDATA',
    // 데이터 자체의 최종 수정일이 있으면 그걸 쓰고, 없으면 수집일을 쓴다.
    verifiedAt: toDate(row['최종수정시점']?.slice(0, 8)) ?? collectedAt,
  };
}

/**
 * 같은 이름이 여럿이면 구·동을 붙여 구분한다.
 * "파리바게뜨"만 수십 개면 목록에서 고를 수가 없다.
 */
export function disambiguate(stores) {
  const counts = new Map();
  for (const s of stores) counts.set(s.storeName, (counts.get(s.storeName) ?? 0) + 1);

  const used = new Set();
  return stores.map((store) => {
    if (counts.get(store.storeName) === 1) return store;

    // 구·군을 우선한다. "서울특별시"는 서울 데이터에서 전부 같아 구분에 도움이 안 된다.
    const gu =
      store.roadAddress.match(/(\S+[구군])\s/)?.[1] ??
      store.roadAddress.match(/(\S+시)\s/)?.[1] ??
      '';
    const dong = store.roadAddress.match(/\(([^()]+)\)/)?.[1] ?? '';
    // 구와 동이 둘 다 있으면 동만으로 충분하다. 이름이 길어지면 목록에서 읽기 어렵다.
    const hint = dong || gu || store.storeId.slice(-4);

    let name = `${store.storeName} (${hint})`;
    let n = 2;
    while (used.has(name)) {
      name = `${store.storeName} (${hint} ${n})`;
      n += 1;
    }
    used.add(name);
    return { ...store, storeName: name };
  });
}

/** 레코드 배열을 Store 배열로. 지역 필터(선택)와 중복 제거까지 한다. */
export function buildStores(rows, { region = DEFAULT_REGION, collectedAt, geocodeCache = {} } = {}) {
  const byId = new Map();

  for (const row of rows) {
    const store = toStore(row, collectedAt, geocodeCache);
    if (!store) continue;
    if (region && !store.roadAddress.startsWith(region) && !store.jibunAddress.startsWith(region)) {
      continue;
    }
    if (!byId.has(store.storeId)) byId.set(store.storeId, store);
  }

  return disambiguate([...byId.values()]).sort((a, b) =>
    a.storeName.localeCompare(b.storeName, 'ko'),
  );
}
