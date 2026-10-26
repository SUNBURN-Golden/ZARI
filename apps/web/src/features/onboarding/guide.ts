import type { RawProjectInputDto } from '../../contracts/generated/dto';
import {
  CATALOG_PIN,
  getMeasurement,
  MEASUREMENT_FIELDS,
  type MeasurementField,
} from '../project/draft';
import { DIAGNOSTIC_TEXT } from '../project/detailFacts';
import { nextFactDestination, type NextFactsView } from '../project/nextFacts';

/**
 * First-use guidance. Everything here is host text and navigation: it never
 * decides fit, quantity or pass/fail, and it never writes the draft. Which
 * fact is needed next comes from the Rust next-facts list when one exists.
 */

/** Example projects carry this prefix; the real "내 공간" start never does. */
export const EXAMPLE_IDENTITY = {
  title: '예제',
  disclosure: '합성 데이터 (실제 상품 아님)',
} as const;
export const EXAMPLE_NAME = `${EXAMPLE_IDENTITY.title} · ${EXAMPLE_IDENTITY.disclosure}`;

export function isExampleName(name: string | null | undefined): boolean {
  return typeof name === 'string' && name.startsWith(EXAMPLE_NAME);
}

/** True when the draft pins the bundled synthetic catalog (not real products). */
export function usesSyntheticCatalog(
  form: Pick<RawProjectInputDto, 'catalogPin'> | null | undefined,
): boolean {
  return form?.catalogPin.catalogDigest === CATALOG_PIN.catalogDigest;
}

export const SYNTHETIC_NOTICE =
  '이 화면의 상품·판매처·가격·재고는 합성 예제 자료입니다. 실제로 판매되는 상품이 아니며 구매할 수 없습니다.';

export const FIELD_LABELS: Record<MeasurementField, string> = {
  'space.interior.width': '공간 안쪽 폭',
  'space.interior.depth': '공간 안쪽 깊이',
  'space.interior.height': '공간 안쪽 높이',
  'space.opening.width': '개구부 폭',
  'space.opening.height': '개구부 높이',
  'items.item-a.dimensions.envelope.width': '물건 A 폭',
  'items.item-a.dimensions.envelope.depth': '물건 A 깊이',
  'items.item-a.dimensions.envelope.height': '물건 A 높이',
  'items.item-b.dimensions.envelope.width': '물건 B 폭',
  'items.item-b.dimensions.envelope.depth': '물건 B 깊이',
  'items.item-b.dimensions.envelope.height': '물건 B 높이',
};

export interface FieldHelp {
  how: string;
  example: string;
}

const INTERIOR = '벽 안쪽 면에서 반대쪽 안쪽 면까지 줄자로 잽니다. 가장 좁은 곳을 기준으로 합니다.';
const OPENING = '물건이 실제로 지나가는 입구의 가장 좁은 곳을 잽니다. 문틀이나 경첩은 뺍니다.';
const ITEM = '물건을 가장 크게 잡은 바깥 치수를 잽니다. 손잡이·튀어나온 부분도 포함합니다.';

export const FIELD_HELP: Record<MeasurementField, FieldHelp> = {
  'space.interior.width': { how: `${INTERIOR} 왼쪽 벽에서 오른쪽 벽까지입니다.`, example: '600 (mm) 또는 60 (cm)' },
  'space.interior.depth': { how: `${INTERIOR} 앞쪽에서 뒤쪽 벽까지입니다.`, example: '450 (mm) 또는 45 (cm)' },
  'space.interior.height': { how: `${INTERIOR} 바닥에서 천장 또는 위쪽 선반까지입니다.`, example: '1800 (mm) 또는 180 (cm)' },
  'space.opening.width': { how: `${OPENING} 좌우 폭입니다.`, example: '550 (mm) 또는 55 (cm)' },
  'space.opening.height': { how: `${OPENING} 위아래 높이입니다.`, example: '1700 (mm) 또는 170 (cm)' },
  'items.item-a.dimensions.envelope.width': { how: `${ITEM} 좌우 폭입니다.`, example: '300 (mm) 또는 30 (cm)' },
  'items.item-a.dimensions.envelope.depth': { how: `${ITEM} 앞뒤 깊이입니다.`, example: '200 (mm) 또는 20 (cm)' },
  'items.item-a.dimensions.envelope.height': { how: `${ITEM} 위아래 높이입니다.`, example: '250 (mm) 또는 25 (cm)' },
  'items.item-b.dimensions.envelope.width': { how: `${ITEM} 좌우 폭입니다.`, example: '280 (mm) 또는 28 (cm)' },
  'items.item-b.dimensions.envelope.depth': { how: `${ITEM} 앞뒤 깊이입니다.`, example: '180 (mm) 또는 18 (cm)' },
  'items.item-b.dimensions.envelope.height': { how: `${ITEM} 위아래 높이입니다.`, example: '220 (mm) 또는 22 (cm)' },
};

/** Concrete correction for a diagnostic code; the code text itself stays Rust's. */
export const ERROR_FIX: Record<string, string> = {
  invalid_number: '숫자만 입력합니다. 예: 600 또는 60.5. 단위 글자(mm, cm)는 오른쪽 단위 선택에서 고릅니다.',
  submillimeter_precision: 'mm 단위로는 정수로, cm 단위로는 소수 첫째 자리까지 입력합니다. 예: 60.5 cm.',
  out_of_range: '단위가 맞는지 확인합니다. 60 cm를 60 mm로 넣으면 범위를 벗어납니다.',
  scalar_out_of_range: '단위가 맞는지 확인합니다. 60 cm를 60 mm로 넣으면 범위를 벗어납니다.',
  numeric_overflow: '자릿수를 확인합니다. 600 mm를 6000000처럼 넣지 않았는지 봅니다.',
  numeric_field_too_long: '숫자만 남기고 나머지 글자를 지웁니다.',
  required_text_missing: '이 칸에는 값이 필요합니다. 아직 재지 않았다면 먼저 재서 입력합니다.',
};

export function errorFix(code: string): string {
  return ERROR_FIX[code] ?? (DIAGNOSTIC_TEXT[code] ? '위 안내대로 고쳐 다시 저장합니다.' : '이 값을 다시 재서 입력합니다.');
}

export interface GuideStep {
  id: 'space' | 'opening' | 'items' | 'save' | 'plan';
  title: string;
  /** Measurement fields this step covers; empty for the action steps. */
  fields: readonly MeasurementField[];
  summary: string;
  optional: boolean;
}

export const GUIDE_STEPS: readonly GuideStep[] = [
  {
    id: 'space',
    title: '1. 공간 안쪽 크기',
    fields: ['space.interior.width', 'space.interior.depth', 'space.interior.height'],
    summary: '정리할 공간의 안쪽 폭·깊이·높이부터 잽니다. 이 세 값이면 시작할 수 있습니다.',
    optional: false,
  },
  {
    id: 'opening',
    title: '2. 개구부',
    fields: ['space.opening.width', 'space.opening.height'],
    summary: '물건이 드나드는 입구 크기입니다. 입구가 따로 없으면 비워 둡니다.',
    optional: true,
  },
  {
    id: 'items',
    title: '3. 넣을 물건',
    fields: [
      'items.item-a.dimensions.envelope.width',
      'items.item-a.dimensions.envelope.depth',
      'items.item-a.dimensions.envelope.height',
      'items.item-b.dimensions.envelope.width',
      'items.item-b.dimensions.envelope.depth',
      'items.item-b.dimensions.envelope.height',
    ],
    summary: '정리할 물건이 있을 때만 잽니다. 물건 B가 없으면 비워 둡니다.',
    optional: true,
  },
  {
    id: 'save',
    title: '4. 확인 · 저장',
    fields: [],
    summary: '“측정값 확인 · 저장”을 누르면 계산기가 값을 확인하고 필요한 사실 목록을 새로 만듭니다.',
    optional: false,
  },
  {
    id: 'plan',
    title: '5. 계획 검토',
    fields: [],
    summary: '저장한 값으로 계획을 계산합니다. 비워 둔 값은 통과로 계산되지 않고 “미확인”으로 남습니다.',
    optional: false,
  },
];

export const SCOPE_LINES: readonly string[] = [
  '넣고 꺼내는 동작 검사는 같은 높이의 앞쪽 지지면을 따라 움직이는 경우만 다룹니다. 들어 옮기는 동작은 검사하지 않습니다.',
  '공간과 물건은 폭·깊이·높이 세 치수의 직육면체로 입력합니다.',
  '사진은 이 기기에만 저장되며 계산에는 쓰이지 않습니다.',
  '비워 둔 칸은 0이나 통과가 아니라 “미측정”입니다. 모든 칸을 먼저 채울 필요는 없습니다.',
  '구매 링크는 판매처로 이동할 뿐이며 이 앱은 구매·결제를 하지 않습니다.',
];

export function hasAnyMeasurement(form: RawProjectInputDto | null): boolean {
  if (!form) return false;
  return MEASUREMENT_FIELDS.some((field) => getMeasurement(form, field).text.trim() !== '');
}

/**
 * The field to point at now. Prefers the first row of Rust's next-facts list
 * that opens a measurement field; before that list exists, falls back to the
 * first blank field in guide order and says so.
 */
export function suggestedField(
  form: RawProjectInputDto | null,
  facts: NextFactsView,
): { field: MeasurementField; source: 'rust' | 'order' } | null {
  if (facts.status === 'ready') {
    for (const row of facts.rows) {
      const destination = nextFactDestination(row);
      if (
        destination.kind === 'field' &&
        (MEASUREMENT_FIELDS as readonly string[]).includes(destination.path)
      ) {
        return { field: destination.path as MeasurementField, source: 'rust' };
      }
    }
  }
  if (!form) return null;
  for (const step of GUIDE_STEPS) {
    if (step.optional) continue;
    for (const field of step.fields) {
      if (getMeasurement(form, field).text.trim() === '') return { field, source: 'order' };
    }
  }
  return null;
}

/** Move focus to the real input for a field. Never edits the draft. */
export function focusMeasurementInput(field: MeasurementField): boolean {
  const element = document.getElementById(field);
  if (!(element instanceof HTMLElement)) return false;
  element.scrollIntoView({ block: 'center' });
  element.focus();
  return true;
}
