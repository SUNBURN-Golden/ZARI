export function MeasureIcon({ field }: { field: string }) {
  const axis = field.split('.').at(-1);
  const edge = axis === 'height' ? 'M17 4V16M15 6l2-2 2 2M15 14l2 2 2-2'
    : axis === 'depth' ? 'M5 15L14 6M5 12v3h3M11 6h3v3' : 'M3 17H17M5 15l-2 2 2 2M15 15l2 2-2 2';
  return <svg className="measure-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor"><path d={field.includes('opening') ? 'M5 14V3H14V14' : 'M3 13V3H13V13Z'} opacity="0.5" /><path d={edge} /></svg>;
}
