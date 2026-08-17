// 매장 데이터를 갱신한다 (§53).
//
// 출처: 행정안전부 지방행정 인허가데이터 — 식품 제과점영업
// https://www.data.go.kr/data/15044973/fileData.do
//
// **인증키가 필요 없다.** 이 자료는 OpenAPI가 아니라 파일 데이터이고,
// LOCALDATA가 전국 전체분 CSV를 상시 공개한다. 매일 갱신되며 2일 전 기준이다.
//
// 예전에는 apis.data.go.kr에서 조회 API를 찾으려 했는데 그런 오퍼레이션이 없었다.
// data.go.kr 상세 페이지의 "제공형태: 기관자체에서 다운로드"가 그 뜻이었다.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseCsvToObjects } from './lib/csv.mjs';
import { buildStores, DEFAULT_REGION } from './lib/localdata.mjs';
import { loadGeocodeCache } from './lib/geocode-cache.mjs';
import { readAllStores } from './lib/read-stores.mjs';
import { writeRegionFiles } from './lib/split-stores.mjs';

const STORE_DIR = fileURLToPath(new URL('../data/stores', import.meta.url));

/** 전국 전체분 CSV. 파일 목록 페이지의 "전국 파일 다운로드" 버튼이 이 주소를 부른다. */
const DOWNLOAD_URL = 'https://file.localdata.go.kr/file/download/bakeries/info';
const REFERER = 'https://file.localdata.go.kr/file/bakeries/info';
// 이 헤더가 없으면 403이 돌아온다. 브라우저에서 온 요청만 받는다.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

// 빈 문자열도 '지정 없음'으로 본다. .env에 `STORE_REGION=`만 있는 경우가 그렇다.
const REGION = process.env.STORE_REGION?.trim() || DEFAULT_REGION;
/** 결과가 이보다 적으면 이상으로 보고 반영하지 않는다. */
const MIN_ACCEPTABLE = 5000;

const collectedAt = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

console.log(`매장 갱신 시작 (${collectedAt} KST, ${REGION ?? '전국'})`);
console.log(`내려받는 중: ${DOWNLOAD_URL}`);

let text;
try {
  const res = await fetch(DOWNLOAD_URL, {
    headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) throw new Error(`응답 ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(`받음: ${(buf.length / 1024 / 1024).toFixed(1)}MB`);
  // 헤더는 UTF-8이라고 하지만 실제 내용은 EUC-KR이다. 그대로 믿으면 전부 깨진다.
  text = new TextDecoder('euc-kr').decode(buf);
} catch (err) {
  // 받지 못해도 기존 데이터는 그대로 둔다. 앱이 빈 지도가 되면 안 된다.
  console.error(`내려받기 실패: ${err.message}. 기존 데이터를 유지합니다.`);
  process.exit(1);
}

const rows = parseCsvToObjects(text);
console.log(`CSV 레코드 ${rows.length.toLocaleString('ko-KR')}건`);

const geocodeCache = await loadGeocodeCache();
const stores = buildStores(rows, { region: REGION, collectedAt, geocodeCache });
const existing = await readAllStores(STORE_DIR).catch(() => []);

// 안전장치: 부분 장애 결과를 커밋하면 앱에서 매장이 통째로 사라진다.
if (stores.length < MIN_ACCEPTABLE) {
  console.error(`결과 ${stores.length}곳으로 기준(${MIN_ACCEPTABLE}) 미달. 기존 데이터를 유지합니다.`);
  process.exit(1);
}
if (existing.length > 0 && stores.length < existing.length * 0.7) {
  console.error(`직전 ${existing.length}곳 대비 30% 이상 급감. 반영하지 않습니다.`);
  process.exit(1);
}

const index = await writeRegionFiles(STORE_DIR, stores, collectedAt);

const branded = stores.filter((s) => s.brandId).length;
console.log(`반영 완료 — 브랜드 매장 ${branded.toLocaleString('ko-KR')}곳, 동네빵집 ${(stores.length - branded).toLocaleString('ko-KR')}곳`);
console.log(`이전 ${existing.length.toLocaleString('ko-KR')}곳 → 현재 ${stores.length.toLocaleString('ko-KR')}곳 · 지역 ${index.regions.length}개`);
