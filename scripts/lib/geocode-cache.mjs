// 주소 → 좌표 변환 결과를 모아 두는 캐시.
//
// 인허가 데이터에 좌표가 빠진 매장이 782곳 있다(주소는 다 있다).
// 매번 다시 물어보면 느리고 API 호출도 낭비라 결과를 파일에 쌓아 둔다.
// 키는 관리번호다. 다음 갱신 때 관청이 좌표를 올리면 캐시보다 원본이 우선한다.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CACHE_PATH = fileURLToPath(new URL('../data/geocode-cache.json', import.meta.url));

export async function loadGeocodeCache(path = CACHE_PATH) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    // 아직 한 번도 안 돌렸으면 빈 캐시로 시작한다. 오류가 아니다.
    return {};
  }
}

export async function saveGeocodeCache(cache, path = CACHE_PATH) {
  await mkdir(dirname(path), { recursive: true });
  const sorted = Object.fromEntries(Object.entries(cache).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(path, `${JSON.stringify(sorted, null, 2)}\n`);
}
