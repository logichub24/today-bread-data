// 매장명 → 브랜드 id 추론 규칙.
// 매장명 표기가 제각각이라(한글·영문·띄어쓰기 없음) 패턴을 넉넉히 둔다.
// 여기 없는 이름은 전부 동네빵집(brandId: null)으로 남는다.
//
// 편의점(세븐일레븐·GS25)은 제과점영업 인허가 대상이 아니라 이 데이터에 없다.
// 실제 매장이 잡히지 않는 브랜드는 두지 않는다 (§91).

export const BRANDS = {
  B001: ['파리바게뜨', '파리바게트', 'parisbaguette', 'paris_baguette', 'parisbaguett'],
  B002: ['뚜레쥬르', '뚜레주르', 'touslesjours', 'tous_les_jours'],
  B003: ['던킨', 'dunkin'],
  B005: ['브레댄코', 'breadnco', 'bread&co'],
  B007: ['베이커리팩토리', 'bakeryfactory'],
  // 홈플러스 입점 베이커리. 매장명이 "몽블랑제 ○○점" 형태로 통일돼 있다.
  B008: ['몽블랑제', 'montblanger', 'mont_blanger'],
  // 파리바게뜨(B001)보다 뒤에 두면 "랩오브파리바게뜨"가 B001로 잡힌다. 그게 맞다.
  B006: ['파리크라상', 'pariscroissant'],
  B009: ['떡보의하루'],
};
