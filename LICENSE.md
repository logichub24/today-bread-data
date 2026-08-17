# 라이선스와 출처

## 데이터

### 매장 (`data/stores/`)

행정안전부 **지방행정 인허가데이터(LOCALDATA)** — 식품 제과점영업.
공공누리 **제1유형(출처표시)**. 출처를 표시하면 상업적 이용과 변형이 가능하다.

- 원본: https://www.data.go.kr/data/15044973/fileData.do
- 이 저장소가 한 변형: 폐업·휴업 제외, EPSG:5174 좌표를 WGS84로 변환, 주소 상세(층·호) 정리,
  동일 상호 구분용 동 이름 부기, 시도별 파일 분할.
- 좌표가 비어 있던 일부 매장은 주소를 지오코딩해 채웠다(`scripts/data/geocode-cache.json`).
  브이월드 지오코더 2.0과 OpenStreetMap Nominatim을 썼고, **건물 단위로 확정된 결과만** 받아들였다.

### 행사 (`data/events.json`)

각 브랜드 **공식 페이지**와 **홈플러스 마트전단**에 공개된 내용을 수집했다.
항목마다 `sourceName`·`sourceUrl`·`verifiedAt`을 담아 원문을 확인할 수 있게 했다.

브랜드 상표와 로고는 각 권리자의 것이다. 이 저장소는 상표나 이미지를 담지 않고
공개된 행사명·기간·조건 문구와 원문 링크만 담는다.

### 빵 백과와 레시피 (`data/breads.json`, `data/recipes.json`)

직접 작성했다. **CC BY 4.0** — 출처를 표시하면 자유롭게 쓸 수 있다.

## 코드 (`scripts/`)

MIT License.

Copyright (c) 2026 logichub24

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## 면책

행사 정보는 수집 시점 기준이며 점포별로 다를 수 있다. 실제 가격과 조건은
반드시 매장이나 브랜드 공식 안내로 확인해야 한다.
