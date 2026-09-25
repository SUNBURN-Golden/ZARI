import type { SnapshotContent } from '../../contracts/generated/dto';
import { moneyText, qtyText } from './view';

/**
 * Formula-safe CSV output (PERFORMANCE_SECURITY_FAILURES §3). Cells are
 * always quoted; when a cell's first character — after stripping leading
 * whitespace and control characters — is a spreadsheet formula trigger
 * (`=`, `+`, `-`, `@`), or the raw cell begins with whitespace/control
 * characters that a spreadsheet may strip to reveal one, the cell is
 * prefixed with `'`. The JSON export keeps the original string verbatim.
 */

const FORMULA_CHARS = new Set(['=', '+', '-', '@']);

export function csvCell(raw: string): string {
  // Leading whitespace/C0/CF characters are invisible to spreadsheet
  // formula detection — the cell is dangerous when they precede a trigger.
  const normalized = raw.replace(/^[\s\p{Cc}\p{Cf}]+/u, '');
  const dangerous = FORMULA_CHARS.has(normalized.charAt(0)) || normalized !== raw;
  const value = dangerous ? `'${raw}` : raw;
  return `"${value.replace(/"/g, '""')}"`;
}

export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export const BOM_CSV_HEADER = [
  '품목',
  '필요',
  '주문 팩',
  '상품 소계',
  '재고',
  '배송',
  '링크',
] as const;

/**
 * The BOM table as CSV rows — the same text the screen renders, so unknown
 * offer facts stay `미확인` rather than becoming 0/available in a spreadsheet.
 */
export function bomCsvRows(content: SnapshotContent): string[][] {
  const rows: string[][] = [[...BOM_CSV_HEADER]];
  for (const line of content.bom) {
    const label = line.variantId
      ? (content.referencedCatalog.variants.find((v) => v.id === line.variantId)
          ?.optionLabel ?? line.variantId)
      : (line.ownedId ?? '—');
    const offer =
      line.offerId === null
        ? null
        : (content.referencedCatalog.offers.find((o) => o.id === line.offerId) ?? null);
    const inventory =
      offer === null
        ? '미확인'
        : offer.inventory.state === 'known'
          ? offer.inventory.value === 'inStock'
            ? '재고 있음'
            : '품절'
          : '미확인';
    const shipping =
      offer === null
        ? '미확인'
        : offer.shipping.state === 'known'
          ? offer.shipping.value.kind === 'free'
            ? '무료 배송'
            : offer.shipping.value.kind === 'fixedPerSeller'
              ? `배송비 ${moneyText(offer.shipping.value.fee)}`
              : '배송비 조건부'
          : '미확인';
    const url = offer?.url.state === 'known' ? offer.url.value : '';
    rows.push([
      label,
      String(line.physicalNeeded),
      qtyText(line.packsToOrder),
      moneyText(line.productSubtotal),
      inventory,
      shipping,
      url,
    ]);
  }
  rows.push([
    '상품 소계',
    '',
    '',
    moneyText(content.costSummary.productSubtotal),
    '',
    '',
    '',
  ]);
  rows.push([
    '배송비 합계',
    '',
    '',
    moneyText(content.costSummary.shippingTotal),
    '',
    '',
    '',
  ]);
  rows.push([
    '합계',
    '',
    '',
    moneyText(content.costSummary.grandTotal),
    '',
    '',
    '',
  ]);
  return rows;
}
