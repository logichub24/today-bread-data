// 홈플러스 마트전단에서 베이커리 브랜드 상품을 읽어온다.
//
// 몽블랑제는 홈플러스 입점 베이커리라 공식 홈페이지가 따로 없고 행사가 전단에 실린다.
// 전단은 주 단위로 바뀐다.
//
// robots.txt 확인(2026-08-16): /leaflet 허용, Disallow는 /favorite·/mypage뿐이고
// `Content-Signal: ai-input=yes`로 AI 입력 사용을 명시적으로 허용한다.
// 그래도 주 1회만, 요청 간격을 두고 부른다.

const BASE = 'https://mfront.homeplus.co.kr';
const LEAFLET_URL = `${BASE}/leaflet?categoryId=406&sort=RANK`;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
/** 전단 "전체" 카테고리. 신선·냉장 등으로 나눠 봐도 합집합은 여기에 다 들어 있다. */
const CATEGORY_ID = 406;
/** 브라우저가 쓰는 값과 맞춘다. 더 크게 요청하면 응답이 비어 온다. */
const PAGE_SIZE = 20;
const MAX_PAGES = 40;
const GAP_MS = 350;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const headers = {
  'User-Agent': USER_AGENT,
  Referer: LEAFLET_URL,
  Accept: 'application/json',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

/**
 * 이번 주 전단 정보를 찾는다. 전단 번호와 행사 기간이 함께 온다.
 *
 * 전단 페이지 HTML에 `/leaf/getLeafletCache.json` 응답이 통째로 심어져 있다.
 * 번호와 기간 모두 주마다 바뀌므로 코드에 박아 두면 다음 주에 낡은 값을 쓴다.
 */
export async function fetchLeafletInfo() {
  const res = await fetch(LEAFLET_URL, { headers, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`전단 페이지 응답 ${res.status}`);
  const html = await res.text();

  const block = html.match(/id="\/leaf\/getLeafletCache\.json"[^>]*>([\s\S]*?)<\/script>/);
  if (!block) throw new Error('전단 정보를 찾지 못했습니다. 페이지 구조가 바뀌었을 수 있습니다.');

  const data = JSON.parse(block[1]).data;
  const { leafletNo, dispStartDt: start, dispEndDt: end } = data ?? {};
  if (!leafletNo || !start || !end) throw new Error('전단 번호나 기간이 비어 있습니다.');
  return { leafletNo: Number(leafletNo), period: { start, end } };
}

/** 전단 상품을 모두 읽는다. */
export async function fetchLeafletItems(leafletNo) {
  const items = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url =
      `${BASE}/leaf/item.json?categoryId=${CATEGORY_ID}&leafletNo=${leafletNo}` +
      `&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}&sort=RANK`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`전단 API 응답 ${res.status}`);
    const body = await res.json();
    const list = body?.data?.dataList ?? [];
    items.push(...list);
    if (list.length < PAGE_SIZE) break;
    await sleep(GAP_MS);
  }
  return items;
}

/**
 * 브랜드 상품만 골라 앱의 행사 형태로 바꾼다.
 *
 * 브랜드는 상품명이 아니라 `brandNm` 필드에 있다. 화면에는 "[몽블랑제]…"로 붙여
 * 보여주지만 API 응답의 itemNm에는 브랜드가 없다. 이름으로 거르면 하나도 못 찾는다.
 */
export function toEvents(items, { brandId, brandName, period, collectedAt }) {
  return items
    .filter((it) => it.brandNm === brandName)
    // 할인가와 할인율이 둘 다 있어야 쓴다. 없으면 할인이라고 단정할 수 없다 (§15).
    .filter((it) => Number(it.dcPrice) > 0 && Number(it.dcRate) > 0)
    .map((it) => {
      const sale = Number(it.dcPrice);
      const original = Number(it.salePrice) > sale ? Number(it.salePrice) : null;
      const soldOut = it.soldOutYn === 'Y' || it.itemSoldOutYn === 'Y';
      const name = String(it.itemNm).trim();
      return {
        id: `HP-${period.start.replace(/-/g, '').slice(2)}-${it.itemNo}`,
        brandId,
        title: original ? `${name} ${original.toLocaleString('ko-KR')}원 → ${sale.toLocaleString('ko-KR')}원` : name,
        summary: `${name} ${it.dcRate}% 할인`,
        description:
          `홈플러스 전단 행사. ${brandName} ${name}을(를) ${it.dcRate}% 할인합니다.` +
          (soldOut ? ' 수집 시점에 일시 품절이었습니다.' : ''),
        type: 'DISCOUNT',
        startDate: period.start,
        endDate: period.end,
        createdAt: collectedAt,
        originalPrice: original,
        salePrice: sale,
        // 전단에 적힌 문구를 그대로 옮긴다. 가격을 단정하면 §91 위반이다.
        conditions:
          '홈플러스 전단 행사. 점포별로 가격과 취급 상품이 다를 수 있습니다.' +
          (soldOut ? ' 수집 시점 일시 품절 상태였습니다.' : ''),
        couponRequired: false,
        membershipRequired: false,
        paymentCondition: null,
        onlineOnly: false,
        offlineOnly: false,
        applicableStores: 'ALL_STORES',
        relatedBreadIds: [],
        tags: [brandName, '홈플러스', '전단'],
        sourceName: '홈플러스 마트전단',
        sourceUrl: LEAFLET_URL,
        verifiedAt: collectedAt,
        verificationStatus: 'VERIFIED',
        editorPick: false,
      };
    });
}
