// 최소 CSV 파서 (RFC 4180).
//
// 공공데이터 CSV는 주소에 쉼표가 들어가 따옴표로 감싸인 필드가 흔하다.
// `split(',')`로 자르면 열이 통째로 어긋난다.
// 파서 하나 때문에 의존성을 늘리기보다 필요한 규칙만 직접 처리한다.

/**
 * CSV 텍스트를 문자열 배열의 배열로 만든다.
 * 따옴표 안의 쉼표·줄바꿈과 이스케이프된 따옴표("")를 처리한다.
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  // BOM 제거.
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];

    if (inQuotes) {
      if (c === '"') {
        // 연속된 따옴표는 리터럴 따옴표 하나를 뜻한다.
        if (s[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }

  // 마지막 줄이 개행 없이 끝나는 경우.
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/** 첫 줄을 헤더로 보고 객체 배열로 만든다. */
export function parseCsvToObjects(text) {
  const rows = parseCsv(text);
  const header = (rows.shift() ?? []).map((h) => h.trim());
  return rows
    .filter((r) => r.length >= header.length - 2)
    .map((r) => {
      const o = {};
      header.forEach((h, i) => {
        o[h] = (r[i] ?? '').trim();
      });
      return o;
    });
}
