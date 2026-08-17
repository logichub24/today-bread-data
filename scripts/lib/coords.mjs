// 지방행정 인허가데이터 좌표(EPSG:5174) → WGS84 변환.
//
// LOCALDATA의 좌표정보(X)/(Y)는 중부원점 TM(Bessel 타원체) 기준이라 그대로 지도에 찍을 수 없다.
// 직접 구현하면 Bessel→WGS84 데이텀 변환에서 오차가 생기기 쉬워 proj4를 쓴다.
// 이 모듈은 수집 스크립트에서만 쓰이고 앱 번들에는 들어가지 않는다.

import proj4 from 'proj4';

/** Korean 1985 / Modified Central Belt. */
const EPSG5174 =
  '+proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000 ' +
  '+ellps=bessel +units=m +no_defs ' +
  '+towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43';

/** 한반도 범위. 변환이 잘못되면 여기서 걸러진다. */
const BOUNDS = { latMin: 33, latMax: 39, lngMin: 124, lngMax: 132 };

/**
 * TM 좌표를 위경도로 바꾼다. 값이 없거나 범위를 벗어나면 null.
 * 잘못된 좌표를 지도에 찍느니 그 매장을 빼는 편이 낫다.
 */
export function tmToWgs84(rawX, rawY) {
  const x = Number(String(rawX).trim());
  const y = Number(String(rawY).trim());
  if (!Number.isFinite(x) || !Number.isFinite(y) || x === 0 || y === 0) return null;

  try {
    const [lng, lat] = proj4(EPSG5174, 'WGS84', [x, y]);
    // 극단값을 넣으면 proj4가 NaN을 돌려준다. NaN은 모든 비교가 false라
    // 범위 검사만으로는 걸러지지 않으므로 먼저 확인한다.
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < BOUNDS.latMin || lat > BOUNDS.latMax) return null;
    if (lng < BOUNDS.lngMin || lng > BOUNDS.lngMax) return null;
    return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
  } catch {
    return null;
  }
}
