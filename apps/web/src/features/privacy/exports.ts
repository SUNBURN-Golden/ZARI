import type { LocationLogRow } from '../../persistence/db';

/**
 * Location-search export. A plain statement file for the user's own
 * records: it is not an exportVersion 1 project and the app does not import
 * it. Nothing is uploaded.
 */
export function locationLogExport(projectId: string, row: LocationLogRow, exportedAt: string) {
  return {
    exportKind: 'zari-location-log',
    exportKindVersion: 1,
    projectId,
    exportedAt,
    revision: row.revision,
    log: row.log,
  };
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(filename: string, value: unknown): void {
  downloadBlob(filename, new Blob([JSON.stringify(value, null, 1)], { type: 'application/json' }));
}

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Photo file name: the stored name without any path, with the real extension. */
export function photoFilename(name: string, mime: string, attachmentId: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const stem = base.replace(/\.[^.]*$/, '').replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 80);
  return `${stem || attachmentId}.${EXTENSION[mime] ?? 'bin'}`;
}
