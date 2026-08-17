// 시도명 ↔ 파일 이름(슬러그) 매핑.
//
// 전국 2만 곳을 한 파일로 내려주면 서울 사용자도 전국을 다 받는다.
// 시도별로 쪼개 두고 앱이 주변 지역만 가져가게 하려고 슬러그가 필요하다.

/** 시도명 → 파일 슬러그. 원본 데이터의 표기를 그대로 키로 쓴다. */
export const REGION_SLUGS = {
  서울특별시: 'seoul',
  경기도: 'gyeonggi',
  인천광역시: 'incheon',
  부산광역시: 'busan',
  대구광역시: 'daegu',
  대전광역시: 'daejeon',
  울산광역시: 'ulsan',
  세종특별자치시: 'sejong',
  강원특별자치도: 'gangwon',
  충청북도: 'chungbuk',
  충청남도: 'chungnam',
  전북특별자치도: 'jeonbuk',
  // 원본 데이터의 표기다. 임의로 "광주광역시"나 "전라남도"로 바꾸지 않는다 (§91).
  전남광주통합특별시: 'jeonnam-gwangju',
  경상북도: 'gyeongbuk',
  경상남도: 'gyeongnam',
  제주특별자치도: 'jeju',
};

/**
 * 주소에서 시도명을 뽑는다. 모르는 이름이면 예외를 던진다.
 *
 * 조용히 '기타'로 몰면 그 지역 매장이 앱에서 영영 안 보인다.
 * 행정구역 이름이 바뀌면 여기에 한 줄 추가하는 편이 낫다.
 */
export function regionOf(address) {
  const sido = String(address ?? '').trim().split(/\s+/)[0] ?? '';
  const slug = REGION_SLUGS[sido];
  if (!slug) throw new Error(`모르는 시도명: "${sido}" — scripts/lib/regions.mjs에 추가해 주세요.`);
  return { name: sido, slug };
}
