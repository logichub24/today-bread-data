// 전국 매장을 시도별 파일로 쪼개 쓰고 색인을 만든다.
//
// 한 파일로 두면 서울 사용자도 전국 2만 곳을 다 받는다(gzip 1.2MB).
// 시도별로 나누면 보통 한두 파일(서울 250KB)만 받으면 된다.

import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { regionOf } from './regions.mjs';

/**
 * @param {string} outDir  public/data/stores 디렉터리
 * @param {Array}  stores  전국 Store 배열
 * @param {string} generatedAt
 */
export async function writeRegionFiles(outDir, stores, generatedAt) {
  const groups = new Map();
  for (const store of stores) {
    const { name, slug } = regionOf(store.roadAddress || store.jibunAddress);
    if (!groups.has(slug)) groups.set(slug, { slug, name, list: [] });
    groups.get(slug).list.push(store);
  }

  await mkdir(outDir, { recursive: true });

  // 지역이 사라졌을 때 옛 파일이 남아 있으면 앱이 낡은 데이터를 받는다.
  const keep = new Set([...groups.keys()].map((s) => `${s}.json`).concat('index.json'));
  for (const f of await readdir(outDir).catch(() => [])) {
    if (f.endsWith('.json') && !keep.has(f)) await unlink(join(outDir, f));
  }

  const regions = [];
  for (const { slug, name, list } of [...groups.values()].sort((a, b) => b.list.length - a.list.length)) {
    await writeFile(join(outDir, `${slug}.json`), `${JSON.stringify(list)}\n`);
    regions.push({
      slug,
      name,
      count: list.length,
      // 앱이 "내 위치에서 가까운 지역"만 고르는 데 쓴다.
      minLat: Math.min(...list.map((s) => s.latitude)),
      maxLat: Math.max(...list.map((s) => s.latitude)),
      minLng: Math.min(...list.map((s) => s.longitude)),
      maxLng: Math.max(...list.map((s) => s.longitude)),
    });
  }

  const index = { generatedAt, total: stores.length, regions };
  await writeFile(join(outDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  return index;
}
