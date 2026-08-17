# 오늘 빵 할인 — 공개 데이터

「오늘 빵 할인」 앱이 쓰는 데이터를 매일 수집해 공개한다.
앱 코드는 별도 저장소에 있고, 이 저장소는 **데이터와 수집기만** 담는다.

배포 주소 — https://logichub24.github.io/today-bread-data/

## 무엇이 들어 있나

| 파일 | 내용 |
| --- | --- |
| `data/stores/index.json` | 시도 목록과 각 시도의 경계상자·매장 수 |
| `data/stores/{시도}.json` | 해당 시도 매장 (앱은 주변 시도만 받아간다) |
| `data/events.json` | 브랜드 행사. 항목마다 `sourceUrl`로 원문 확인 가능 |
| `data/brands.json` | 브랜드 |
| `data/breads.json` | 빵 백과 100종 |
| `data/recipes.json` | 활용 레시피 |
| `data/meta.json` | 갱신 시점 |
| `STATUS.md` | 매일 자동 갱신되는 데이터 상태 보고 |

## 어떻게 갱신되나

매일 **05:00 KST**에 GitHub Actions가 돈다.

1. **매장** — LOCALDATA 전국 전체분 CSV를 내려받아 변환한다. 인증키가 필요 없다.
   이 자료는 OpenAPI가 아니라 파일 데이터이고 LOCALDATA가 상시 공개한다(2일 전 기준).
2. **행사** — 브랜드 공식 페이지와 홈플러스 마트전단에서 진행 중인 행사를 읽는다.
3. **만료 점검** — 끝난 행사는 지우지 않고 `EXPIRED`로 표시한다. 검증이 오래된 건은
   `CHECK_NEEDED`로 남겨 사람이 확인하게 한다.
4. **커밋 후 Pages 배포**.

수집이 실패하면 **기존 데이터를 그대로 둔다.** 원본이 잠깐 막힌 것과 구조가 바뀐 것을
구분할 수 없으므로, 실패를 "데이터가 없음"으로 해석해 지워버리지 않는다.

### 사람 판단이 필요한 경우

시작일·종료일이 없는 행사는 자동으로 상시로 분류하지 **않는다.** 날짜가 없다는 것만으로는
상시인지 알 수 없기 때문이다. 그런 건은 등록하지 않고 실행 로그의 `⚠ 판단이 필요한 행사`에
남긴다. 확인 후 상시가 맞으면 `scripts/lib/brand-events.mjs`의 허용 목록에 제목을 추가한다.

## 직접 돌려보기

```bash
npm ci
npm run data:stores   # 매장 (인증키 없이 동작, 21MB CSV를 내려받는다)
npm run data:events   # 브랜드 행사
npm run data:check    # 만료 행사 점검
npm run data:status   # STATUS.md 갱신
```

좌표가 빠진 매장을 보강할 때만 인증키가 필요하다. `.env.example`을 `.env`로 복사해
`VWORLD_KEY`를 채우고 아래를 실행한다. 매일 도는 자동 수집에는 필요 없다.

```bash
npm run data:geocode -- <내려받은CSV경로> --limit 200
```

## 앱에서 쓰기

앱은 `VITE_DATA_BASE_URL`로 이 주소를 가리킨다.

```
VITE_DATA_BASE_URL=https://logichub24.github.io/today-bread-data/data/
```

## 출처와 라이선스

매장 데이터는 행정안전부 지방행정 인허가데이터(제1유형 출처표시), 코드는 MIT,
직접 작성한 빵 백과·레시피는 CC BY 4.0이다. 자세한 내용은 [LICENSE.md](LICENSE.md).
