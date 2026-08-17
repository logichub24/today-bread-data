// 뚜레쥬르·던킨 공식 이벤트 페이지에서 진행 중 행사를 읽어온다.
//
// 두 곳 다 목록 페이지 한 장에 제목과 기간이 함께 나온다.
// 파리바게뜨(워드프레스 REST)와 달리 API가 없어 HTML을 읽는다.
//
// robots.txt 확인(2026-08-16)
//   tlj.co.kr        — /community 허용
//   dunkindonuts.co.kr — 전체 허용

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const headers = { 'User-Agent': USER_AGENT, 'Accept-Language': 'ko-KR,ko;q=0.9' };

export const TLJ_URL = 'https://www.tlj.co.kr:7008/community/event_tpl/list.asp';
/** 프로모션(A)과 제휴혜택(B)이 다른 탭이다. 둘 다 봐야 한다. */
export const DUNKIN_URL = 'https://www.dunkindonuts.co.kr/event?flag=A';
export const DUNKIN_PARTNER_URL = 'https://www.dunkindonuts.co.kr/event?flag=B';

/** 태그를 구분자로 바꿔 "제목 | 기간" 순서를 살린 채 글만 남긴다. */
function toSegments(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, '|')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .split('|')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/**
 * "제목 바로 뒤에 기간" 구조에서 행사를 뽑는다.
 *
 * 기간 조각을 먼저 찾고 **그 앞쪽**에서 제목을 되짚는다.
 * 목록 화면이라 제목과 기간이 붙어 있고, 사이에 빈 칸이나 배지가 끼기도 한다.
 */
function pairTitlesWithPeriods(segments, periodRe) {
  const found = [];
  for (let i = 0; i < segments.length; i += 1) {
    const hit = segments[i].match(periodRe);
    if (!hit) continue;
    // 기간 바로 앞에서 제목다운 조각을 찾는다. 너무 짧거나 안내 문구면 건너뛴다.
    let title = '';
    for (let back = 1; back <= 4 && i - back >= 0; back += 1) {
      const cand = segments[i - back];
      if (cand.length < 4 || cand.length > 80) continue;
      if (/^(MORE|이벤트|진행중|더보기|EVENT)$/i.test(cand)) continue;
      if (periodRe.test(cand)) continue;
      title = cand;
      break;
    }
    if (!title) continue;
    found.push({ title, start: hit[1], end: hit[2] });
  }
  return found;
}

const normalizeDate = (s) => s.replace(/\s/g, '').replace(/\./g, '-').replace(/-$/, '');

export async function fetchTljEvents() {
  const res = await fetch(TLJ_URL, { headers, signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`뚜레쥬르 응답 ${res.status}`);
  // 이 페이지는 EUC-KR이다. UTF-8로 읽으면 전부 깨진다.
  const html = new TextDecoder('euc-kr').decode(Buffer.from(await res.arrayBuffer()));
  const re = /(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/;
  return pairTitlesWithPeriods(toSegments(html), re);
}

export async function fetchDunkinEvents() {
  const out = [];
  for (const url of [DUNKIN_URL, DUNKIN_PARTNER_URL]) {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(45000) });
    if (!res.ok) throw new Error(`던킨 응답 ${res.status}`);
    const html = await res.text();
    // "2026. 08. 07 ~ 2026. 12. 25" 형태다.
    const re = /(\d{4}\.\s*\d{2}\.\s*\d{2})\s*~\s*(\d{4}\.\s*\d{2}\.\s*\d{2})/;
    out.push(
      ...pairTitlesWithPeriods(toSegments(html), re).map((e) => ({
        ...e,
        start: normalizeDate(e.start),
        end: normalizeDate(e.end),
        // 탭마다 주소가 다르다. 눌렀을 때 실제로 그 행사가 있는 쪽으로 가야 한다 (§17).
        sourceUrl: url,
      })),
    );
  }
  return out;
}

/**
 * 브랜드별 행사 id 접두사.
 *
 * 수집이 실패한 브랜드의 기존 행사만 남기려면 부르는 쪽도 접두사를 알아야 해서 내보낸다.
 * 매핑을 두 곳에 두면 갈라진다.
 */
export const ID_PREFIX = { B002: 'TL', B003: 'DK', B005: 'BN', B006: 'PC', B009: 'DC' };

/** 제목 전체로 짧고 안정적인 식별자를 만든다. */
function titleHash(title) {
  let h = 5381;
  for (const ch of title) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0;
  return h.toString(36).padStart(7, '0');
}

/** 제목만 보고 유형을 정한다. 애매하면 할인이라 하지 않는다 (§91). */
function inferType(title) {
  if (/증정|무료|드려요|드립니다/.test(title)) return 'GIFT';
  if (/1\s*\+\s*1/.test(title)) return 'ONE_PLUS_ONE';
  if (/쿠폰/.test(title)) return 'COUPON';
  if (/카드|페이|결제|네이버페이|현대카드|신한|국민|삼성/.test(title)) return 'CARD';
  if (/멤버십|해피앱|해피오더|CJ\s*ONE|앱\s*회원/i.test(title)) return 'MEMBERSHIP';
  if (/할인|OFF|%|원\s*→/i.test(title)) return 'DISCOUNT';
  return 'SEASON';
}

// 기간으로 거르지 않는다.
//
// 처음에는 200일 넘는 것을 상품 홍보로 보고 잘랐는데, 그 바람에 던킨 제휴혜택 7건과
// 뚜레쥬르 현대카드 M50처럼 진짜 혜택이 통째로 빠졌다. 공식 페이지에 진행 중으로
// 올라와 있으면 사용자에게도 진행 중이다. 임의로 판단해 감추지 않는다.
//
// 목록이 길어지는 문제는 피드가 "상시 혜택"으로 접어서 해결한다 (D-61).

/** 수집한 {title,start,end}를 앱의 행사 형태로 바꾼다. */
export function toEvents(raw, { brandId, brandName, sourceName, sourceUrl, collectedAt, today }) {
  const seen = new Set();
  return raw
    // 사람 판단이 필요한 건은 등록하지 않는다. 호출부가 따로 보고한다.
    .filter((e) => !e.needsReview)
    // 종료일이 없으면 상시라 만료되지 않는다.
    .filter((e) => e.end == null || e.end >= today)
    .filter((e) => {
      // 같은 제목이 목록에 두 번 나오는 경우가 있다(배너와 목록).
      const key = `${e.title}|${e.start}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((e) => ({
      // 제목 전체를 해시한다. 앞 12자만 쓰다가 "T멤버십 …" 두 건이 같은 id가 됐다.
      // 시작일이 없는 상시 행사는 날짜 자리에 'ALW'를 쓴다.
      id: `${ID_PREFIX[brandId] ?? 'BR'}-${e.start ? e.start.replace(/-/g, '').slice(2) : 'ALW'}-${titleHash(e.title)}`,
      brandId,
      title: e.title,
      summary: e.title,
      description: `${brandName} 공식 이벤트 페이지에 게시된 행사입니다. 자세한 내용은 출처 링크에서 확인하세요.`,
      type: inferType(e.title),
      startDate: e.start ?? null,
      endDate: e.end ?? null,
      createdAt: collectedAt,
      // 목록에는 금액이 문장 속에만 있어 정가·할인가를 단정할 수 없다 (§15).
      originalPrice: null,
      salePrice: null,
      conditions: `자세한 조건은 ${brandName} 공식 이벤트 페이지에서 확인해 주세요.`,
      couponRequired: /쿠폰/.test(e.title),
      membershipRequired: /멤버십|해피앱|해피오더|CJ\s*ONE/i.test(e.title),
      paymentCondition: null,
      onlineOnly: false,
      offlineOnly: false,
      applicableStores: 'ALL_STORES',
      relatedBreadIds: [],
      tags: [brandName, '공식'],
      sourceName,
      // 항목이 자기 출처를 들고 있으면 그것을 쓴다(던킨은 탭이 둘이다).
      sourceUrl: e.sourceUrl ?? sourceUrl,
      verifiedAt: collectedAt,
      verificationStatus: 'VERIFIED',
      editorPick: false,
    }));
}

// --- 브레댄코 ---
//
// 워드프레스다. "진행중인 이벤트" 카테고리(38)가 따로 있어 그것만 읽으면 된다.
// 기간은 본문에 "2026년 8월 13일(목) ~ 9월 1일(화)" 형태로 적혀 있다.

export const BREADNCO_URL = 'https://www.breadnco.kr/event-news/event/';
const BREADNCO_API = 'https://www.breadnco.kr/wp-json/wp/v2/posts?categories=38&per_page=20';

/** "2026년 8월 13일 ~ 9월 1일" → 시작·종료. 종료 연도가 빠지면 시작 연도를 쓴다. */
function parseKoreanRange(text, fallbackYear) {
  const hit = text.match(
    /(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일[^~]*~\s*(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일/,
  );
  if (!hit) return null;
  const pad = (n) => String(n).padStart(2, '0');
  const startYear = hit[1];
  const endYear = hit[4] ?? (Number(hit[5]) < Number(hit[2]) ? String(Number(startYear) + 1) : startYear);
  return {
    start: `${startYear}-${pad(hit[2])}-${pad(hit[3])}`,
    end: `${endYear}-${pad(hit[5])}-${pad(hit[6])}`,
  };
}

export async function fetchBreadncoEvents() {
  const res = await fetch(BREADNCO_API, { headers, signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`브레댄코 응답 ${res.status}`);
  const posts = await res.json();
  if (!Array.isArray(posts)) throw new Error('브레댄코 응답 형식이 예상과 다릅니다.');

  return posts
    .map((p) => {
      const title = String(p.title?.rendered ?? '')
        .replace(/&#\d+;/g, '')
        .replace(/&amp;/g, '&')
        .trim();
      const body = String(p.content?.rendered ?? '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ');
      const period = parseKoreanRange(body, p.date?.slice(0, 4));
      // 기간을 못 읽으면 등록하지 않는다. 언제까지인지 모르는 행사는 쓸 수 없다 (§91).
      return period ? { title, start: period.start, end: period.end, sourceUrl: p.link } : null;
    })
    .filter(Boolean);
}

// --- 떡보의하루 ---
//
// 정적 ASP 페이지다. 종료된 이벤트에는 종료 딱지 이미지(event_list_end.png)가 붙는다.
//
// **날짜가 없다고 상시로 단정하지 않는다.** 상시인지 아닌지는 행사의 성격이 정한다 —
// 신규 가입 혜택은 늘 열려 있지만, 날짜만 안 적힌 한시 행사일 수도 있다.
// 판단이 필요한 건은 ALWAYS_ON에 사람이 직접 등록해야 수집된다.

/**
 * 상시로 확인된 행사 제목. 사람이 판단해서 넣는다.
 * 여기 없는데 날짜도 없으면 수집하지 않고 "확인 필요"로 보고한다.
 */
const DCAKE_ALWAYS_ON = new Set(['신규 가입 이벤트']);

export const DCAKE_URL = 'https://www.dcake.co.kr/mania_event.asp';

export async function fetchDcakeEvents() {
  const res = await fetch(DCAKE_URL, { headers, signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`떡보의하루 응답 ${res.status}`);
  const html = new TextDecoder('euc-kr').decode(Buffer.from(await res.arrayBuffer()));

  const items = [];
  for (const block of html.split(/<li[^>]*>/).slice(1)) {
    const body = block.split('</li>')[0];
    // 종료 딱지가 있으면 지난 이벤트다.
    if (/event_list_end/.test(body)) continue;
    const title = body.match(/class=["']tit["'][^>]*>([^<]+)</)?.[1]?.trim();
    if (!title) continue;
    const texts = [...body.matchAll(/class=["']txt["'][^>]*>([^<]+)</g)].map((m) => m[1].trim());
    // 기간이 적혀 있으면 그것을 쓰고, 없으면 상시로 둔다.
    const range = texts.join(' ').match(/(\d{4})[.\-](\d{1,2})(?:[.\-](\d{1,2}))?\s*~\s*(\d{4})[.\-](\d{1,2})(?:[.\-](\d{1,2}))?/);
    const pad = (n) => String(n).padStart(2, '0');

    if (range) {
      items.push({
        title,
        start: `${range[1]}-${pad(range[2])}-${pad(range[3] ?? 1)}`,
        end: `${range[4]}-${pad(range[5])}-${pad(range[6] ?? 28)}`,
      });
      continue;
    }
    if (DCAKE_ALWAYS_ON.has(title)) {
      items.push({ title, start: null, end: null });
      continue;
    }
    // 날짜가 없고 상시로 확인되지도 않았다. 사람이 판단할 몫이다.
    items.push({ title, needsReview: true });
  }
  return items;
}

// --- 파리크라상 ---
//
// 게시판 목록에 "진행중 : 2026.08.01 ~"처럼 시작일만 적힌다. 종료일은 없다.
// "판매중"은 상품 안내라 행사가 아니다.

export const PARISCROISSANT_URL =
  'https://pariscroissantorder.com/board/gallery/list.html?board_no=8';

export async function fetchParisCroissantEvents() {
  const res = await fetch(PARISCROISSANT_URL, { headers, signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`파리크라상 응답 ${res.status}`);
  const html = await res.text();
  const seg = toSegments(html);

  const out = [];
  seg.forEach((s, i) => {
    const hit = s.match(/진행중\s*:\s*(\d{4})[.\-](\d{1,2})[.\-](\d{1,2})/);
    if (!hit) return;
    const title = seg[i - 1];
    if (!title || title.length < 3) return;
    const pad = (n) => String(n).padStart(2, '0');
    out.push({
      title,
      start: `${hit[1]}-${pad(hit[2])}-${pad(hit[3])}`,
      // 목록에 종료일이 없다. 상시로 둔다.
      end: null,
    });
  });
  return out;
}
