import { toCsv } from '../plan/csv';
import type { PrintPackage } from './package';

/**
 * CSV for the same package (z-print-share). Every row starts with the plan
 * id, so a row cut from the sheet still names its plan. Every cell goes
 * through the formula-safe `csvCell`; nothing here is a spreadsheet formula, a
 * hyperlink function, or an import format ZARI reads back: the header is
 * not one of the catalog CSV columns, so the file cannot be turned into
 * catalog input.
 *
 * An empty section prints an explicit row (`없음`), so an empty list and a
 * dropped list never look the same.
 */

export type CsvKind = 'bom' | 'plan';

export const PLAN_ID_HEADER = '계획 ID';

export function csvFileName(pkg: PrintPackage, kind: CsvKind): string {
  return `zari-${kind}-${pkg.revision.slice(0, 12)}.csv`;
}

export function packageCsvRows(pkg: PrintPackage, kind: CsvKind): string[][] {
  const id = pkg.revision;
  const rows: string[][] = [];
  const table = (name: string, header: string[], body: string[][], empty: string) => {
    if (rows.length > 0) rows.push([id]);
    rows.push([PLAN_ID_HEADER, '구분', ...header]);
    if (body.length === 0) rows.push([id, name, empty, ...header.slice(1).map(() => '')]);
    for (const row of body) rows.push([id, name, ...row]);
  };

  table(
    '계획',
    ['항목', '내용'],
    [
      ['단위', pkg.unit],
      ['프로젝트', pkg.projectName],
      ['계획 상태', pkg.stageText],
      ['입력 시점', pkg.currentText],
      ['입력 기준', pkg.inputDigest],
      ['카탈로그', `${pkg.catalogVersion} · ${pkg.catalogSource}`],
      ['규칙 버전', pkg.ruleVersion],
      ['물리 검토', pkg.assuranceText],
      ['구매 조건', pkg.commerceText],
      ['포함 범위', pkg.scopeText],
      ...pkg.purchaseNotes.map((note): string[] => ['구매 안내', note]),
    ],
    '',
  );

  table(
    '구매 목록',
    [
      '품목',
      '필요(개)',
      '재사용(개)',
      '주문 팩',
      '상품 소계',
      '재고',
      '배송',
      '가격 확인 시각',
      '링크',
    ],
    [
      ...(pkg.bom.length === 0
        ? [[pkg.noPurchase ? '구매 없이 정리됩니다' : '없음', '', '', '', '', '', '', '', '']]
        : pkg.bom.map((line): string[] => [
            line.label,
            line.needed,
            line.reused,
            line.packs,
            line.subtotal,
            line.inventory,
            line.shipping,
            line.observed,
            line.link,
          ])),
      ...pkg.cost.map((line): string[] => [line.label, '', '', '', line.value, '', '', '', '']),
    ],
    '없음',
  );
  if (kind === 'bom') return rows;

  table(
    '미배치',
    ['물건', '수량', '이유'],
    pkg.unassigned.map((row): string[] => [row.label, row.quantity, row.reason]),
    '없음',
  );
  table(
    '검사',
    ['검사', '필수', '상태', '사유 코드'],
    pkg.checks.map((check): string[] => [
      check.kind,
      check.blocking ? '필수' : '',
      check.statusText,
      check.reason,
    ]),
    '없음',
  );
  table(
    '배치',
    ['이름', 'x(mm)', 'y(mm)', 'z(mm)', '방향'],
    pkg.placements.map((row): string[] => [
      row.label,
      String(row.x),
      String(row.y),
      String(row.z),
      row.orientation,
    ]),
    '없음',
  );
  table(
    '물건별 위치',
    ['물건', '위치'],
    pkg.assignments.map((row): string[] => [row.label, row.location]),
    '없음',
  );
  table(
    '실행 순서',
    ['번호', '단계', '대상', '선행', '조건', '확인 절차', '진행'],
    pkg.steps.map((step): string[] => [
      String(step.n),
      step.title,
      step.subjects.join(' / '),
      step.prerequisites.join(', '),
      step.conditions.join(' / '),
      step.confirmation ? '필요' : '',
      step.progress,
    ]),
    '없음',
  );
  return rows;
}

/** The file body. The download adds a UTF-8 BOM so spreadsheet apps read Korean text. */
export function packageCsvText(pkg: PrintPackage, kind: CsvKind): string {
  return toCsv(packageCsvRows(pkg, kind));
}
