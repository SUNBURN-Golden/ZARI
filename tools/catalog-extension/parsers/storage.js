// Short specification clauses only; inner/packaging dimensions are excluded.
export function storageDimensionLines(snapshot) {
  const allowed = (s) => s.length <= 300 && !/포장|패키지|택배|배송|내경|내부|안쪽|후기|리뷰/.test(s);
  const rows = (snapshot.rows ?? []).map(([label, value]) => /^(외경|외형|제품\s*크기|상품\s*크기)$/.test(label.trim()) ? value : `${label}: ${value}`).filter(allowed);
  const specs = String(snapshot.text ?? '').split(/\n+/).filter((s) => /외경|외형|제품\s*크기|상품\s*크기|가로|너비|깊이|높이/.test(s)).filter(allowed);
  return rows.some((s) => /\d/.test(s)) ? rows : specs;
}
