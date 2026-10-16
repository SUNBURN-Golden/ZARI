import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PlanSnapshot, SpatialProjection } from '../../src/contracts/generated/dto';
import { csvToBatch } from '../../src/features/catalog/provenance';
import { csvToEntries, parseCsv } from '../../src/features/catalog/import';
import { csvCell } from '../../src/features/plan/csv';
import { packageCsvRows, packageCsvText } from '../../src/features/print/csv';
import {
  buildPrintPackage,
  packageDigest,
  safeLinkText,
  verifyPackage,
  type PrintInput,
  type PrintPackage,
} from '../../src/features/print/package';
import { PrintPackageView } from '../../src/features/print/PrintPackageView';
import {
  DEFAULT_PRINT_SCOPE,
  EXCLUDED_CELL_TEXT,
  FULL_SCOPE,
  HIDDEN_PROJECT_TEXT,
  SHARE_SCOPE,
  makeLabeler,
} from '../../src/features/print/scope';
import { realPlan, type RealPlan } from './printFixture';

const CONDITIONAL = 'fixtures/domain/candidate-contained-conditional.json';
const BOUNDED = 'fixtures/domain/candidate-bounded-confirmed.json';

const conditional = realPlan(CONDITIONAL);
const bounded = realPlan(BOUNDED);

function inputOf(plan: RealPlan, extra: Partial<PrintInput> = {}): PrintInput {
  return {
    snapshot: plan.snapshot,
    projection: plan.projection,
    projectionStatus: 'ready',
    projectionFailure: null,
    catalog: plan.catalog,
    projectName: '우리집 안방',
    stage: 'alternative',
    current: true,
    progress: null,
    scope: FULL_SCOPE,
    ...extra,
  };
}

function ready(input: PrintInput): PrintPackage {
  const result = buildPrintPackage(input);
  if (result.status !== 'ready') throw new Error(JSON.stringify(result));
  return result.pkg;
}

function withLabels(plan: RealPlan): RealPlan {
  const snapshot = structuredClone(plan.snapshot) as PlanSnapshot;
  snapshot.content.inputFacts.items[0]!.label = '비밀약상자SENTINEL';
  return { ...plan, snapshot };
}

describe('one revision for drawing, purchase list and guide', () => {
  it('stamps every section with the snapshot id and keeps real Rust counts', () => {
    const pkg = ready(inputOf(conditional));
    const content = conditional.snapshot.content;
    expect(pkg.revision).toBe(conditional.snapshot.planSnapshotId);
    expect(pkg.bomRevision).toBe(pkg.revision);
    expect(pkg.guideRevision).toBe(pkg.revision);
    expect(pkg.drawings.map((d) => d.revision)).toEqual([pkg.revision, pkg.revision]);
    expect(pkg.unit).toBe('mm');
    expect(pkg.bom).toHaveLength(content.bom.length);
    expect(pkg.checks).toHaveLength(content.validation.checks.length);
    expect(pkg.steps).toHaveLength(content.actions.length);
    expect(pkg.drawings.map((d) => d.view)).toEqual(['top', 'front']);
    expect(verifyPackage(pkg, content, conditional.projection)).toEqual([]);
  });

  it('blocks a drawing that was projected from another plan', () => {
    const result = buildPrintPackage(
      inputOf(conditional, { projection: bounded.projection }),
    );
    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') return;
    expect(result.blocks.map((b) => b.code)).toEqual(['revision_mismatch']);
  });

  it('blocks a projection whose input or catalog stamp differs', () => {
    const tamper = (patch: Record<string, string>): SpatialProjection => {
      const projection = structuredClone(conditional.projection);
      Object.assign(projection.source, patch);
      return projection;
    };
    const input = buildPrintPackage(inputOf(conditional, { projection: tamper({ inputDigest: '0'.repeat(64) }) }));
    const catalog = buildPrintPackage(inputOf(conditional, { projection: tamper({ catalogDigest: '1'.repeat(64) }) }));
    expect(input.status === 'blocked' && input.blocks.map((b) => b.code)).toEqual(['input_mismatch']);
    expect(catalog.status === 'blocked' && catalog.blocks.map((b) => b.code)).toEqual(['catalog_mismatch']);
  });

  it('blocks while the drawing is loading, failed, or the session rejected its source', () => {
    const code = (extra: Partial<PrintInput>) => {
      const result = buildPrintPackage(inputOf(conditional, extra));
      return result.status === 'blocked' ? result.blocks.map((b) => b.code) : result.status;
    };
    expect(code({ projection: null, projectionStatus: 'loading' })).toEqual(['drawing_loading']);
    expect(code({ projection: null, projectionStatus: 'absent' })).toEqual(['drawing_loading']);
    expect(
      code({ projection: null, projectionStatus: 'failed', projectionFailure: 'worker_timeout' }),
    ).toEqual(['drawing_unavailable']);
    expect(
      code({
        projection: null,
        projectionStatus: 'failed',
        projectionFailure: 'projection_source_mismatch',
      }),
    ).toEqual(['revision_mismatch']);
  });

  it('refuses a package whose section carries another revision', () => {
    const pkg = ready(inputOf(conditional));
    const skewed = { ...pkg, bomRevision: 'f'.repeat(64) };
    expect(verifyPackage(skewed, conditional.snapshot.content, conditional.projection).map((b) => b.code)).toEqual([
      'section_revision',
    ]);
    const drawing = { ...pkg, drawings: [{ ...pkg.drawings[0]!, revision: 'e'.repeat(64) }, pkg.drawings[1]!] };
    expect(verifyPackage(drawing, conditional.snapshot.content, conditional.projection).map((b) => b.code)).toEqual([
      'section_revision',
    ]);
  });
});

describe('unknown and unassigned stay on the sheet', () => {
  it('lists every unassigned item and every unknown check', () => {
    const content = conditional.snapshot.content;
    const pkg = ready(inputOf(conditional));
    expect(content.unassigned.length).toBeGreaterThan(0);
    expect(pkg.unassigned.map((row) => row.label)).toEqual(
      content.unassigned.map((row) => content.inputFacts.items.find((i) => i.id === row.itemId)!.label),
    );
    const unknown = content.validation.checks.filter((c) => c.status === 'unknown');
    expect(unknown.length).toBeGreaterThan(0);
    expect(pkg.checks.filter((c) => c.status === 'unknown')).toHaveLength(unknown.length);
    for (const row of pkg.checks.filter((c) => c.status === 'unknown')) {
      expect(row.statusText).toBe('미확인');
      expect(row.reason).not.toBe('');
    }
    const html = renderToStaticMarkup(createElement(PrintPackageView, { pkg }));
    expect(html).toContain(`미확인 검사 ${unknown.length}건`);
    for (const row of pkg.unassigned) expect(html).toContain(row.label);
    expect(pkg.steps.some((step) => step.conditions.some((c) => c.includes('미확인')))).toBe(true);
  });

  it('refuses a package from which an unassigned row or a check was dropped', () => {
    const pkg = ready(inputOf(conditional));
    const content = conditional.snapshot.content;
    const lostRow = verifyPackage({ ...pkg, unassigned: pkg.unassigned.slice(1) }, content, conditional.projection);
    const lostCheck = verifyPackage({ ...pkg, checks: pkg.checks.slice(1) }, content, conditional.projection);
    const lostDrawn = verifyPackage(
      { ...pkg, drawings: [{ ...pkg.drawings[0]!, rects: [] }, pkg.drawings[1]!] },
      content,
      conditional.projection,
    );
    for (const blocks of [lostRow, lostCheck, lostDrawn]) {
      expect(blocks.map((b) => b.code)).toEqual(['omitted_rows']);
    }
  });

  it('keeps an unknown quantity and an unknown price as words, never 0', () => {
    const snapshot = structuredClone(conditional.snapshot) as PlanSnapshot;
    snapshot.content.unassigned[0]!.instances = { kind: 'unknownQuantity' };
    snapshot.content.bom[0]!.productSubtotal = {
      state: 'unknown',
      reason: 'notProvided',
    };
    snapshot.content.bom[0]!.packsToOrder = { state: 'unknown', reason: 'notProvided' };
    const pkg = ready(inputOf({ ...conditional, snapshot }));
    expect(pkg.unassigned[0]!.quantity).toBe('수량 미확인');
    expect(pkg.bom[0]!.subtotal).toBe('미확인');
    expect(pkg.bom[0]!.packs).toBe('미확인');
    const rows = packageCsvRows(pkg, 'bom');
    const line = rows.find((row) => row[1] === '구매 목록' && row[2] === pkg.bom[0]!.label)!;
    expect(line.slice(5, 7)).toEqual(['미확인', '미확인']);
    expect(line.join(',')).not.toContain('₩0');
  });

  it('prints a space measure that Rust left unknown as 미확인', () => {
    const snapshot = structuredClone(conditional.snapshot) as PlanSnapshot;
    snapshot.content.inputFacts.space.interior.depth = { state: 'unknown', reason: 'notMeasured' };
    const pkg = ready(inputOf({ ...conditional, snapshot }));
    expect(pkg.space.find((row) => row.axis === '깊이')!.text).toBe('미확인');
  });

  it('draws what is available and lists what Rust could not place', () => {
    const projection = structuredClone(conditional.projection);
    const drawn = projection.elements.find((e) => e.role === 'containedItem')!;
    drawn.topRect = { kind: 'unavailable', fieldRefs: [], reasonCode: 'offset_unknown' };
    const pkg = ready(inputOf(conditional, { projection }));
    const top = pkg.drawings[0]!;
    expect(top.missing).toHaveLength(1);
    expect(top.missing[0]!.text).toContain('수납함 안의 위치를 몰라');
    expect(top.rects.length + top.missing.length).toBe(top.elementCount);
    expect(pkg.drawings[1]!.missing).toHaveLength(0);
  });
});

describe('what a person chooses to include', () => {
  it('starts from the safest scope', () => {
    expect(DEFAULT_PRINT_SCOPE).toEqual(SHARE_SCOPE);
    expect(Object.values(SHARE_SCOPE).every((value) => value === false)).toBe(true);
  });

  it('leaves names, project, links and progress out of print and both CSVs when off', () => {
    const plan = withLabels(conditional);
    const off = ready(
      inputOf(plan, { scope: SHARE_SCOPE, stage: 'accepted', progress: { x: 'done' } }),
    );
    const on = ready(
      inputOf(plan, { scope: FULL_SCOPE, stage: 'accepted', progress: {} }),
    );
    const html = renderToStaticMarkup(createElement(PrintPackageView, { pkg: off }));
    const texts = [
      JSON.stringify(off),
      html,
      packageCsvText(off, 'plan'),
      packageCsvText(off, 'bom'),
    ];
    for (const text of texts) {
      expect(text).not.toContain('비밀약상자SENTINEL');
      expect(text).not.toContain('우리집 안방');
      expect(text).not.toContain('https://shop.example');
      expect(text).not.toContain('Winter coats');
    }
    expect(off.projectName).toBe(HIDDEN_PROJECT_TEXT);
    expect(off.bom[0]!.link).toBe(EXCLUDED_CELL_TEXT);
    expect(off.steps.every((step) => step.progress === EXCLUDED_CELL_TEXT)).toBe(true);
    expect(off.scopeText).toBe('프로젝트 이름 제외 · 물건 이름 제외 · 구매 링크 제외 · 진행 기록 제외');
    // Catalog product names and every count survive the redaction.
    expect(off.bom[0]!.label).toBe(on.bom[0]!.label);
    expect(off.unassigned).toHaveLength(on.unassigned.length);
    expect(off.unassigned[0]!.label).toMatch(/^물건 \d+$/);

    const onText = [JSON.stringify(on), packageCsvText(on, 'plan')].join('\n');
    expect(onText).toContain('비밀약상자SENTINEL');
    expect(onText).toContain('우리집 안방');
    expect(onText).toContain('https://shop.example/var-1');
    expect(on.steps.every((step) => step.progress === '미완료')).toBe(true);
  });

  it('never turns unreadable progress into an all-todo list', () => {
    const pkg = ready(inputOf(conditional, { stage: 'accepted', progress: null }));
    expect(pkg.steps.every((step) => step.progress === '진행 기록을 읽지 못함')).toBe(true);
    const before = ready(inputOf(conditional, { stage: 'alternative', progress: { a: 'done' } }));
    expect(before.steps.every((step) => step.progress === '채택 전')).toBe(true);
  });

  it('numbers hidden names by their place in the saved input, even without a label', () => {
    const labels = makeLabeler(conditional.snapshot.content, SHARE_SCOPE);
    const items = conditional.snapshot.content.inputFacts.items;
    expect(labels.item(items[1]!.id)).toBe('물건 2');
    expect(labels.item('no-such-item')).toBe('물건 ?');
    expect(labels.subject('no-such-id')).toBe('(대상)');
    const shown = makeLabeler(conditional.snapshot.content, FULL_SCOPE);
    expect(shown.item(items[1]!.id)).toBe(items[1]!.label);
  });

  it('prints only plain http(s) addresses and only as text', () => {
    const offer = structuredClone(conditional.snapshot.content.referencedCatalog.offers[0]!);
    const url = (value: string) => {
      offer.url = { state: 'known', value, provenance: offer.url.state === 'known' ? offer.url.provenance : (undefined as never) };
      return safeLinkText(offer, FULL_SCOPE);
    };
    expect(url('https://shop.example/a?b=1')).toBe('https://shop.example/a?b=1');
    expect(url('javascript:alert(1)')).toBe('주소 형식 확인 불가');
    expect(url('=HYPERLINK("http://evil.example")')).toBe('주소 형식 확인 불가');
    expect(url('https://shop.example/a b')).toBe('주소 형식 확인 불가');
    expect(url('https://shop.example/a\nb')).toBe('주소 형식 확인 불가');
    const html = renderToStaticMarkup(createElement(PrintPackageView, { pkg: ready(inputOf(conditional)) }));
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('href=');
  });
});

describe('CSV is text, never an instruction', () => {
  it('quotes formulas, and a row cut from the file still names its plan', () => {
    const snapshot = structuredClone(conditional.snapshot) as PlanSnapshot;
    snapshot.content.inputFacts.items[0]!.label = '=HYPERLINK("http://evil.example","x")';
    snapshot.content.inputFacts.items[1]!.label = '\t@SUM(1+1)';
    const pkg = ready(inputOf({ ...conditional, snapshot }));
    const text = packageCsvText(pkg, 'plan');
    const rows = parseCsv(text)!;
    for (const row of rows) {
      for (const cell of row) {
        const first = cell.replace(/^[\s\p{Cc}\p{Cf}]+/u, '').charAt(0);
        // Either harmless text, or kept visible behind the leading apostrophe.
        expect(['=', '+', '-', '@']).not.toContain(cell.charAt(0));
        if (['=', '+', '-', '@'].includes(first)) expect(cell.charAt(0)).toBe("'");
      }
    }
    expect(text).toContain(`"'=HYPERLINK(""http://evil.example"",""x"")"`);
    expect(text).toContain(`"'\t@SUM(1+1)"`);
    for (const row of rows) expect(row[0]).toMatch(/^(계획 ID|[0-9a-f]{64})$/);
    expect(rows.filter((row) => row.length === 1 && row[0] === pkg.revision)).not.toHaveLength(0);
    expect(csvCell('+1')).toBe(`"'+1"`);
  });

  it('is not a format ZARI reads: the catalog and provenance importers refuse it', () => {
    const pkg = ready(inputOf(conditional));
    for (const kind of ['bom', 'plan'] as const) {
      const text = packageCsvText(pkg, kind);
      const rows = parseCsv(text)!;
      expect(rows).not.toBeNull();
      expect(csvToEntries(rows)).toBeNull();
      expect('issues' in csvToBatch(text, null)).toBe(true);
    }
  });

  it('prints an empty section as an explicit row, not as nothing', () => {
    const pkg = ready(inputOf(bounded));
    expect(pkg.bom).toHaveLength(0);
    expect(pkg.noPurchase).toBe(true);
    const rows = packageCsvRows(pkg, 'plan');
    const bomRow = rows.find((row) => row[1] === '구매 목록' && row[0] === pkg.revision && row[2] === '구매 없이 정리됩니다');
    expect(bomRow).toBeDefined();
    const bomOnly = packageCsvRows(pkg, 'bom');
    expect(bomOnly.some((row) => row[1] === '미배치')).toBe(false);
  });
});

describe('the export reproduces', () => {
  const fixtures = [
    { name: 'conditional', plan: conditional },
    { name: 'bounded', plan: bounded },
  ];
  it('gives the same package, markup, CSV and digest for the same snapshot and scope', async () => {
    for (const { plan } of fixtures) {
      const a = ready(inputOf(plan, { scope: SHARE_SCOPE }));
      const b = ready(inputOf(realPlan(plan === conditional ? CONDITIONAL : BOUNDED), { scope: SHARE_SCOPE }));
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(renderToStaticMarkup(createElement(PrintPackageView, { pkg: a }))).toBe(
        renderToStaticMarkup(createElement(PrintPackageView, { pkg: b })),
      );
      expect(packageCsvText(a, 'plan')).toBe(packageCsvText(b, 'plan'));
      expect(await packageDigest(a)).toBe(await packageDigest(b));
      const wider = ready(inputOf(plan, { scope: FULL_SCOPE }));
      expect(await packageDigest(wider)).not.toBe(await packageDigest(a));
    }
  });

  it('matches the stored export fixtures byte for byte', async () => {
    const { readFileSync, writeFileSync } = await import('node:fs');
    const dir = new URL('../fixtures/print-share/', import.meta.url);
    const update = process.env['ZARI_UPDATE_PRINT_FIXTURES'] === '1';
    const index: Record<string, { planSnapshotId: string; digest: string }> = {};
    for (const { name, plan } of fixtures) {
      for (const [scopeName, scope] of [['share', SHARE_SCOPE], ['full', FULL_SCOPE]] as const) {
        const pkg = ready(inputOf(plan, { scope }));
        const key = `${name}.${scopeName}`;
        const files: [string, string][] = [
          [`${key}.html`, renderToStaticMarkup(createElement(PrintPackageView, { pkg }))],
          [`${key}.plan.csv`, packageCsvText(pkg, 'plan')],
          [`${key}.bom.csv`, packageCsvText(pkg, 'bom')],
        ];
        index[key] = { planSnapshotId: pkg.revision, digest: await packageDigest(pkg) };
        for (const [file, body] of files) {
          if (update) writeFileSync(new URL(file, dir), body);
          else expect(readFileSync(new URL(file, dir), 'utf8'), file).toBe(body);
        }
      }
    }
    const indexText = `${JSON.stringify(index, null, 2)}\n`;
    if (update) writeFileSync(new URL('index.json', dir), indexText);
    else expect(readFileSync(new URL('index.json', dir), 'utf8')).toBe(indexText);
  });
});
