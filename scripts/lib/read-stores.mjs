// 시도별로 나뉜 매장 파일을 하나로 합쳐 읽는다.
//
// 앱은 주변 시도만 받지만, 점검·갱신 스크립트는 전국을 통째로 봐야 한다.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function readAllStores(storeDir) {
  const files = (await readdir(storeDir)).filter((f) => f.endsWith('.json') && f !== 'index.json');
  const lists = await Promise.all(
    files.map(async (f) => JSON.parse(await readFile(join(storeDir, f), 'utf8'))),
  );
  return lists.flat();
}

export async function readStoreIndex(storeDir) {
  return JSON.parse(await readFile(join(storeDir, 'index.json'), 'utf8'));
}
