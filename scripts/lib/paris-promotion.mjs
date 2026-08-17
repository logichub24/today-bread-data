// 파리바게뜨 공식 프로모션 페이지에서 진행 중 행사를 읽어온다.
//
// 출처: https://www.paris.co.kr/promotion/
// robots.txt 확인(2026-08-16): Disallow는 /wp-admin/ 뿐이고 /promotion/은 허용이다.
//
// 워드프레스라 REST API(`/wp-json/wp/v2/promotion`)가 열려 있다. 목록은 이걸로 받고,
// **기간은 목록에 없어서** 상세 페이지를 한 번 더 읽는다.

const BASE = 'https://www.paris.co.kr';
const LIST_URL = `${BASE}/wp-json/wp/v2/promotion`;
export const PROMOTION_URL = `${BASE}/promotion/`;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const headers = { 'User-Agent': USER_AGENT, 'Accept-Language': 'ko-KR,ko;q=0.9' };
/** 상세 페이지를 연달아 부르므로 간격을 둔다. */
const GAP_MS = 450;
/**
 * 최근 것부터 이만큼 본다.
 * "지난 프로모션"을 뺀 현재 목록이 29건이라 20으로는 놓치는 게 생겼다.
 */
const LOOK_BACK = 40;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 워드프레스가 이스케이프한 문자를 되돌린다. 제목에 이모지와 &가 섞여 있다. */
function decode(text) {
  return String(text ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;/g, '’')
    .replace(/&#8216;/g, '‘')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export async function fetchPromotionList() {
  const url = `${LIST_URL}?per_page=${LOOK_BACK}&orderby=date&order=desc`;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`프로모션 목록 응답 ${res.status}`);
  const list = await res.json();
  if (!Array.isArray(list)) throw new Error('프로모션 목록 형식이 예상과 다릅니다.');
  return list.map((p) => ({
    slug: p.slug,
    title: decode(p.title?.rendered),
    link: p.link,
    categories: p.promotion_category ?? [],
  }));
}

/**
 * 상세 페이지에서 행사 기간을 읽는다.
 *
 * 페이지 아래 "YOU MAY ALSO LIKE"에 다른 프로모션과 그 기간이 함께 실려 있다.
 * 거기까지 훑으면 남의 기간을 가져오므로 그 앞에서만 찾는다.
 */
export async function fetchPeriod(link) {
  const res = await fetch(link, { headers, signal: AbortSignal.timeout(30000) });
  if (!res.ok) return null;
  const html = await res.text();
  const cut = html.indexOf('YOU MAY ALSO LIKE');
  const head = cut > 0 ? html.slice(0, cut) : html;
  const text = head
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
  const hit = text.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
  return hit ? { start: hit[1], end: hit[2] } : null;
}

/** PAYMENT 분류(357)는 카드·간편결제 혜택이다. */
const CATEGORY_PAYMENT = 357;

/**
 * 제목만 보고 유형을 정한다. 본문이 이미지라 글로 읽을 수 있는 건 제목뿐이다.
 * 애매하면 DISCOUNT로 두지 않고 SEASON으로 둔다 — 할인이 아닌 걸 할인이라 하면 안 된다 (§91).
 */
function inferType(title, categories) {
  if (/증정|무료|드려요/.test(title)) return 'GIFT';
  if (/1\s*\+\s*1|원\s*플러스\s*원/.test(title)) return 'ONE_PLUS_ONE';
  if (/쿠폰/.test(title)) return 'COUPON';
  if (categories.includes(CATEGORY_PAYMENT) || /카드|페이|결제|Npay|네이버페이|신한|현대|삼성/i.test(title)) {
    return 'CARD';
  }
  if (/멤버십|해피포인트|앱\s*회원/.test(title)) return 'MEMBERSHIP';
  if (/할인|%|원\s*→/.test(title)) return 'DISCOUNT';
  return 'SEASON';
}

/**
 * 제목에 "3,200원 → 1,600원"처럼 적힌 가격만 읽는다.
 * 글로 명시된 것만 쓰고 계산하지 않는다 (§15).
 */
function parsePrices(title) {
  const hit = title.match(/([\d,]+)\s*원\s*(?:→|->|~>)\s*([\d,]+)\s*원/);
  if (!hit) return { originalPrice: null, salePrice: null };
  const original = Number(hit[1].replace(/,/g, ''));
  const sale = Number(hit[2].replace(/,/g, ''));
  if (!Number.isFinite(original) || !Number.isFinite(sale) || sale >= original) {
    return { originalPrice: null, salePrice: null };
  }
  return { originalPrice: original, salePrice: sale };
}

/** 프로모션 하나를 앱의 행사 형태로. 기간을 못 읽으면 null(등록하지 않는다). */
export function toEvent(promo, period, { brandId, collectedAt }) {
  if (!period) return null;
  const title = promo.title;
  return {
    id: `PB-${promo.slug}`.slice(0, 60),
    brandId,
    title,
    summary: title,
    description: `파리바게뜨 공식 프로모션 페이지에 게시된 행사입니다. 자세한 내용은 출처 링크에서 확인하세요.`,
    type: inferType(title, promo.categories),
    startDate: period.start,
    endDate: period.end,
    createdAt: collectedAt,
    ...parsePrices(title),
    // 상세 내용이 이미지라 조건을 글로 옮길 수 없다. 확인 경로를 안내한다 (§91).
    conditions: '자세한 조건은 파리바게뜨 공식 프로모션 페이지에서 확인해 주세요.',
    couponRequired: /쿠폰/.test(title),
    membershipRequired: /멤버십|해피포인트/.test(title),
    paymentCondition: null,
    onlineOnly: false,
    offlineOnly: false,
    applicableStores: 'ALL_STORES',
    relatedBreadIds: [],
    tags: ['파리바게뜨', '공식'],
    sourceName: '파리바게뜨 공식 프로모션',
    sourceUrl: promo.link,
    verifiedAt: collectedAt,
    verificationStatus: 'VERIFIED',
    editorPick: false,
  };
}

// 기간으로 거르지 않는다. 공식 페이지에 진행 중이면 사용자에게도 진행 중이다.
// 신제품 소개까지 함께 올라오지만, 유형을 SEASON으로 두면 앱이 "시즌"으로 표시하고
// 피드가 "상시 혜택"으로 접어 준다. 감추는 대신 제대로 분류한다.

/** 목록을 훑어 진행 중인 것만 행사로 만든다. */
export async function collectParisEvents({ brandId, collectedAt, today }) {
  const list = await fetchPromotionList();
  const events = [];
  for (const promo of list) {
    const period = await fetchPeriod(promo.link);
    await sleep(GAP_MS);
    if (!period) continue;
    // 이미 끝난 행사는 등록하지 않는다. 시작 전인 것은 앱이 SCHEDULED로 다룬다.
    if (period.end < today) continue;
    // 혜택 유형이 아니면서 연 단위로 걸린 것은 상품 홍보다.
    const event = toEvent(promo, period, { brandId, collectedAt });
    if (event) events.push(event);
  }
  return events;
}
