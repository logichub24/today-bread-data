// 공공 파일 서버·브랜드 사이트를 부를 때 쓰는 재시도 fetch.
//
// LOCALDATA 전국 CSV 내려받기가 7일 중 2일 "fetch failed"로 끊겼다. 집 IP에서는
// 0.9초에 받아지는 파일이라 서버 문제가 아니라 GitHub 러너와의 연결이 간헐적으로
// 끊기는 것이다. 한 번 실패했다고 그날 갱신을 통째로 건너뛸 이유가 없다.
//
// 재시도해도 안 되는 것은 여기서 해결할 수 없다(브레댄코처럼 IP 자체가 막힌 경우).
// 그때는 호출하는 쪽이 기존 데이터를 지키고 출처 건강 기록에 남긴다.

/** 재시도 사이 간격. 곧바로 다시 부르면 같은 이유로 또 끊긴다. */
const GAP_MS = 5000;

/**
 * 실패하면 잠시 쉬었다가 다시 부른다.
 *
 * 4xx는 다시 불러도 같은 답이 오므로 바로 포기한다. 연결 오류와 5xx만 재시도한다.
 */
export async function fetchWithRetry(url, { headers, timeoutMs = 180000, attempts = 3, label } = {}) {
  const name = label ?? url;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) {
        if (attempt > 1) console.log(`  ${name} ${attempt}차 시도에서 성공했습니다.`);
        return res;
      }
      // 400대는 우리 요청이 잘못된 것이다. 다시 불러도 달라지지 않는다.
      if (res.status >= 400 && res.status < 500) throw new Error(`응답 ${res.status}`);
      lastError = new Error(`응답 ${res.status}`);
    } catch (err) {
      lastError = err;
      // AbortSignal.timeout이 아닌 진짜 4xx면 즉시 중단한다.
      if (/응답 4\d\d/.test(err.message)) throw err;
    }

    if (attempt < attempts) {
      const wait = GAP_MS * attempt;
      console.error(`  ${name} ${attempt}차 실패: ${lastError.message}. ${wait / 1000}초 후 재시도합니다.`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  throw lastError;
}
