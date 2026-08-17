// 좌표가 빠진 매장의 주소를 좌표로 바꿔 캐시에 쌓는다.
//
//   node scripts/geocode-missing.mjs <csv경로> [--limit 200]
//
// 인허가 데이터에는 주소만 있고 좌표가 없는 매장이 있다(2026-08 기준 782곳).
// 대부분 인천 신설 구(서해·검단·영종·제물포)처럼 관청이 좌표를 아직 안 올린 곳이다.
// 좌표가 없으면 지도에 못 올리므로 주소를 직접 좌표로 바꾼다.
//
// 두 갈래로 동작한다.
//   VWORLD_KEY 있음 → 브이월드 지오코더. 도로명주소 DB 기반이라 적중률이 높다.
//   키 없음        → OpenStreetMap Nominatim. 키가 필요 없지만 한국 건물번호 수록이
//                    고르지 않아 실측 적중률이 35% 수준이다(표본 20건 중 7건).
//
// 어느 쪽이든 **건물 단위로 확정된 결과만** 받아들인다. 도로 중심선으로 떨어진 결과는
// 실측에서 0.5~1.2km까지 빗나갔다. 그런 좌표를 지도에 찍으면 없는 자리에 빵집이 생긴다.

import { readFile } from 'node:fs/promises';
import { parseCsvToObjects } from './lib/csv.mjs';
import { CACHE_PATH, loadGeocodeCache, saveGeocodeCache } from './lib/geocode-cache.mjs';

const API_KEY = process.env.VWORLD_KEY ?? '';
/** 초당 호출 간격(ms). 공공 API에 부담을 주지 않도록 여유를 둔다. */
const INTERVAL_MS = 120;
const ENDPOINT = 'https://api.vworld.kr/req/address';

const args = process.argv.slice(2);
const csvPath = args.find((a) => !a.startsWith('--'));
const limitArg = args.indexOf('--limit');
const LIMIT = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;

if (!csvPath) {
  console.error('사용법: node scripts/geocode-missing.mjs <csv경로> [--limit 200]');
  process.exit(1);
}
const PROVIDER = API_KEY ? 'vworld' : 'nominatim';
if (PROVIDER === 'nominatim') {
  console.log('VWORLD_KEY가 없어 OpenStreetMap Nominatim으로 진행합니다.');
  console.log('적중률이 낮습니다(약 35%). 키를 넣으면 대부분 채울 수 있습니다:');
  console.log('  https://www.vworld.kr → 오픈API → 인증키 발급 (지오코더 2.0)');
}

/** Nominatim 이용 규약상 초당 1회를 넘기지 않는다. 연락처가 있는 User-Agent도 필수다. */
const NOMINATIM_UA = 'today-bread-sale/1.0 (+bakery dataset coordinate repair)';
const NOMINATIM_INTERVAL_MS = 1200;

/** 결과가 요청한 시도와 다른 지역이면 버린다. "중앙대로"는 여러 도시에 있다. */
function sameSido(address, found) {
  const want = address.trim().split(/\s+/)[0];
  return !want || !found || found.includes(want.slice(0, 2));
}

async function geocodeViaNominatim(road, jibun) {
  for (const address of [road, jibun]) {
    if (!address) continue;
    const url =
      'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1' +
      `&countrycodes=kr&q=${encodeURIComponent(address)}`;
    let hit;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': NOMINATIM_UA },
        signal: AbortSignal.timeout(20000),
      });
      hit = (await res.json())[0];
    } catch {
      return { error: 'NETWORK' };
    } finally {
      await sleep(NOMINATIM_INTERVAL_MS);
    }
    // 건물번호가 없으면 도로 중심선이다. 최대 1.2km까지 빗나가므로 쓰지 않는다.
    if (!hit?.address?.house_number) continue;
    if (!sameSido(address, hit.display_name)) continue;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat > 33 && lat < 39 && lng > 124 && lng < 132) {
      return { lat, lng, via: 'osm' };
    }
  }
  return { error: 'NOT_FOUND' };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 지오코더에 보낼 주소를 다듬는다.
 * "인천광역시 영종구 용유서로 402-11, 2동 1,2,3층 (을왕동)" → "인천광역시 영종구 용유서로 402-11"
 * 층·호·건물명이 붙어 있으면 어떤 지오코더든 못 찾는다.
 */
function tidyForGeocode(raw) {
  return String(raw ?? '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .split(',')[0]
    .trim();
}

/**
 * 주소 하나를 좌표로. 도로명으로 먼저 묻고 실패하면 지번으로 다시 묻는다.
 * 좌표를 못 얻으면 null. 지어내지 않는다.
 */
async function geocode(road, jibun) {
  if (PROVIDER === 'nominatim') return geocodeViaNominatim(road, jibun);
  for (const [type, address] of [
    ['road', road],
    ['parcel', jibun],
  ]) {
    if (!address) continue;
    const url =
      `${ENDPOINT}?service=address&request=getcoord&version=2.0&crs=epsg:4326` +
      `&type=${type}&key=${API_KEY}&address=${encodeURIComponent(address)}`;
    let body;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      body = await res.json();
    } catch {
      return { error: 'NETWORK' };
    }
    const r = body?.response;
    if (r?.status === 'OK') {
      const lat = Number(r.result?.point?.y);
      const lng = Number(r.result?.point?.x);
      // 한반도 밖 좌표가 나오면 잘못 붙은 것이다. 버린다.
      if (Number.isFinite(lat) && Number.isFinite(lng) && lat > 33 && lat < 39 && lng > 124 && lng < 132) {
        return { lat, lng, via: type };
      }
      return { error: 'OUT_OF_RANGE' };
    }
    // 키 문제는 주소를 바꿔 봐야 소용없다. 즉시 멈춘다.
    if (r?.error?.code === 'INVALID_KEY') return { error: 'INVALID_KEY', text: r.error.text };
    // NOT_FOUND면 다음 주소 형식으로 넘어간다.
  }
  return { error: 'NOT_FOUND' };
}

const raw = await readFile(csvPath);
const rows = parseCsvToObjects(new TextDecoder('euc-kr').decode(raw));

const targets = rows.filter((r) => {
  if (!String(r['영업상태명'] ?? '').startsWith('영업')) return false;
  if (!String(r['사업장명'] ?? '').trim()) return false;
  const hasCoords = String(r['좌표정보(X)'] ?? '').trim() && String(r['좌표정보(Y)'] ?? '').trim();
  if (hasCoords) return false;
  return String(r['도로명주소'] ?? '').trim() || String(r['지번주소'] ?? '').trim();
});

const cache = await loadGeocodeCache();
const todo = targets.filter((r) => !cache[String(r['관리번호'] ?? '').trim()]).slice(0, LIMIT);

console.log(`좌표 없는 매장 ${targets.length.toLocaleString('ko-KR')}곳 · 캐시에 없는 ${todo.length.toLocaleString('ko-KR')}곳을 조회합니다.`);

let ok = 0;
const failed = { NOT_FOUND: 0, OUT_OF_RANGE: 0, NETWORK: 0 };

for (const [i, row] of todo.entries()) {
  const id = String(row['관리번호'] ?? '').trim();
  if (!id) continue;

  const result = await geocode(
    tidyForGeocode(row['도로명주소']),
    tidyForGeocode(row['지번주소']),
  );

  if (result.error === 'INVALID_KEY') {
    console.error(`\n인증키 오류: ${result.text ?? ''}`);
    console.error('VWorld에서 발급한 키인지, 지오코더 서비스가 켜져 있는지 확인해 주세요.');
    break;
  }
  if (result.error) {
    failed[result.error] = (failed[result.error] ?? 0) + 1;
  } else {
    cache[id] = { lat: result.lat, lng: result.lng, via: result.via };
    ok += 1;
  }

  if ((i + 1) % 50 === 0) {
    process.stdout.write(`\r  ${i + 1}/${todo.length} 처리 · 성공 ${ok}`);
    await saveGeocodeCache(cache);
  }
  if (PROVIDER === 'vworld') await sleep(INTERVAL_MS);
}

await saveGeocodeCache(cache);
console.log(`\n좌표 확보 ${ok}곳 · 실패 ${Object.entries(failed).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', ') || '없음'}`);
console.log(`캐시: ${CACHE_PATH} (누적 ${Object.keys(cache).length}곳)`);
console.log('반영: npm run data:import -- <csv경로>');
