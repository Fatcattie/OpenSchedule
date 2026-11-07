/**
 * CSV 工具：RFC4180 解析（引号/逗号/换行转义）+ 序列化。
 * 零依赖实现（package.json 无 csv 库），供 import-export 模块使用。
 */

/** 解析 CSV 文本 → 二维字符串数组（支持 BOM、CRLF、引号包裹字段内的逗号/换行/双引号转义） */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, ''); // 去 BOM（Excel 导出的 CSV 常见）
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'; // 转义双引号
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r') {
      // 兼容 CRLF 与旧 Mac CR
      i += 1;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  // 收尾：无末尾换行的最后一行
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // 去掉纯空行（CSV 结尾常见空行）
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
}

/** 以这些字符开头的单元格会被 Excel/WPS/Sheets 当作公式执行 */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
/** 纯数值（含负数/小数）不是公式，原样保留 */
const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/;

/**
 * CSV 公式注入防护（安全问题 M-4，OWASP CSV Injection）：公式触发字符开头的单元格加 `'` 前缀，
 * 表格软件会把它当作文本显示，而不是执行 `=HYPERLINK(...)`、`=cmd|...` 等公式。
 */
export function neutralizeCsvFormula(value: string): string {
  return FORMULA_TRIGGER.test(value) && !PLAIN_NUMBER.test(value) ? `'${value}` : value;
}

/** neutralizeCsvFormula 的逆操作（导入时用）：去掉导出时加的 `'` 前缀，保证导出→导入往返不变 */
export function restoreCsvFormula(value: string): string {
  return value.startsWith("'") && FORMULA_TRIGGER.test(value.slice(1)) ? value.slice(1) : value;
}

/** 序列化二维数组 → CSV 文本（含逗号/引号/换行的字段加引号包裹；公式触发字符开头的加 ' 前缀） */
export function toCsv(rows: string[][]): string {
  return rows
    .map(r =>
      r
        .map(cell => {
          const s = neutralizeCsvFormula(cell ?? '');
          return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    )
    .join('\r\n');
}
