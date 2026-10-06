#!/usr/bin/env node
// Draft baseline index check. Confirms files, hashes, and that approval stayed at zero.
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const MANIFEST_PATH = join(ROOT, 'design/baselines/manifest.json');
const BASE = '29370e23a082c49aa4d8d7943b0e6e71c7884b4c';

const ZARI001 = {
  'zari001-desktop-pass': {
    file: 'draft/zari001/desktop-pass.png',
    sha256: '65b8525655d1c5ec1bd4e15fe982146b201c589d8466fe2b87e7fc58444b5d68',
    sourceCommit: '79b6b7395d94eac18d15add4709edf3f1c188223',
  },
  'zari001-desktop-fail': {
    file: 'draft/zari001/desktop-fail.png',
    sha256: '31e9a94bb5496fe1c13bff4b00a9a259a23ce44b42155f0153f034540016b620',
    sourceCommit: '79b6b7395d94eac18d15add4709edf3f1c188223',
  },
  'zari001-desktop-unknown': {
    file: 'draft/zari001/desktop-unknown.png',
    sha256: 'b24d12a7a8db7ee45732d2963f17359b6affe7d36eed49d7b49e897642dfeef3',
    sourceCommit: '79b6b7395d94eac18d15add4709edf3f1c188223',
  },
  'zari001-desktop-focus': {
    file: 'draft/zari001/desktop-focus.png',
    sha256: '69397f17ff533f19b970f3ef8c72584512f3391f7da5f4bc3ec8cf32c087d1c9',
    sourceCommit: '79b6b7395d94eac18d15add4709edf3f1c188223',
  },
  'zari001-mobile-pass': {
    file: 'draft/zari001/mobile-pass.png',
    sha256: '7e0c6e0be48ca9c75d90bcfa430ea63f6ae98922ff01cf968e27721b88d78dad',
    sourceCommit: '79b6b7395d94eac18d15add4709edf3f1c188223',
  },
};

const BOTH = [
  'measurement-known',
  'unknown',
  'historical',
  'success',
  'drag-preview',
  'drag-committed',
  'drag-rejected',
  'drag-save-failed',
  'spatial-ready',
  'spatial-cutaway',
  'fallback-webgl',
  'fallback-chunk',
  'guide-focus',
  'progress-unavailable',
  'conflict',
  'conflict-progress',
  'stale',
  'stale-progress',
];
const REQUIRED = [
  ...BOTH.flatMap((state) => [`zari007-${state}-1440`, `zari007-${state}-390`]),
  'zari007-a11y-focus-1440',
  'zari007-a11y-forced-colors-1440',
  'zari007-a11y-forced-colors-390',
  'zari007-a11y-zoom-200-1440',
];

const REQUIRED_FIELDS = [
  'id',
  'status',
  'file',
  'sha256',
  'sourceCommit',
  'screenOrStory',
  'state',
  'fixtureId',
  'viewport',
  'deviceScaleFactor',
  'browserAndVersion',
  'os',
  'fontEnvironment',
  'locale',
  'theme',
  'reducedMotion',
  'captureCommand',
  'capturedAt',
];

function fail(message) {
  throw new Error(message);
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  if (!Array.isArray(manifest.baselines)) fail('baselines is not an array');
  const approved = manifest.baselines.filter((entry) => entry.status === 'approved');
  if (approved.length !== 0) fail(`approved count ${approved.length}`);
  const seen = new Set();
  let draftBytes = 0;
  let draftCount = 0;
  for (const entry of manifest.baselines) {
    if (seen.has(entry.id)) fail(`duplicate id ${entry.id}`);
    seen.add(entry.id);
    if (entry.status !== 'draft') fail(`${entry.id} status ${entry.status}`);
    if (typeof entry.file !== 'string' || entry.file.includes('..') || !entry.file.startsWith('draft/')) {
      fail(`${entry.id} file path ${entry.file}`);
    }
    const path = join(ROOT, 'design/baselines', entry.file);
    const digest = sha256(path);
    if (digest !== entry.sha256) fail(`${entry.id} sha256 ${digest} != ${entry.sha256}`);
    draftBytes += statSync(path).size;
    draftCount += 1;
  }
  for (const [id, expected] of Object.entries(ZARI001)) {
    const entry = manifest.baselines.find((item) => item.id === id);
    if (!entry) fail(`missing ${id}`);
    if (entry.file !== expected.file) fail(`${id} file changed`);
    if (entry.sha256 !== expected.sha256) fail(`${id} hash changed`);
    if (entry.sourceCommit !== expected.sourceCommit) fail(`${id} sourceCommit changed`);
    if (entry.status !== 'draft') fail(`${id} is not draft`);
  }
  const zari007 = manifest.baselines.filter((entry) => entry.id.startsWith('zari007-'));
  const ids = new Set(zari007.map((entry) => entry.id));
  for (const id of REQUIRED) {
    if (!ids.has(id)) fail(`missing required capture ${id}`);
  }
  for (const entry of zari007) {
    for (const field of REQUIRED_FIELDS) {
      if (entry[field] == null || entry[field] === '') fail(`${entry.id} missing ${field}`);
    }
    if (entry.gpu == null || typeof entry.gpu.note !== 'string' || !entry.gpu.note.includes('Not a discrete GPU')) {
      fail(`${entry.id} missing GPU note`);
    }
    if (entry.sourceCommit !== BASE) fail(`${entry.id} sourceCommit ${entry.sourceCommit}`);
    if (entry.fixtureId !== 'sample-project-form') fail(`${entry.id} fixture`);
    if (entry.locale !== 'ko-KR' || entry.theme !== 'light' || entry.reducedMotion !== 'reduce') {
      fail(`${entry.id} environment`);
    }
    if (entry.fullPage !== false) fail(`${entry.id} is not a viewport capture`);
    if (entry.deviceScaleFactor !== 1) fail(`${entry.id} deviceScaleFactor`);
    if (!String(entry.browserAndVersion).startsWith('Chromium ')) fail(`${entry.id} browser`);
    if (!String(entry.productTree).includes('apps/web/src')) fail(`${entry.id} product tree note`);
    if (!Array.isArray(entry.scenarioFiles) || entry.scenarioFiles.length < 2) fail(`${entry.id} scenario files`);
    if (!/^0(ms|s)$/.test(entry.durationFast ?? '')) fail(`${entry.id} durationFast`);
    const width = entry.id.endsWith('-390') ? 390 : entry.id.includes('1440') ? 1440 : null;
    if (width != null && entry.viewport?.width !== width) fail(`${entry.id} viewport width`);
    if (entry.viewport?.height == null) fail(`${entry.id} viewport height`);
  }
  const draft = manifest.spatialDraft007;
  if (!draft) fail('missing spatialDraft007');
  if (draft.approved !== false || draft.notPhysicalValidation !== true) fail('spatialDraft007 approval flags');
  if (draft.sourceCommit !== BASE) fail('spatialDraft007 sourceCommit');
  if (!Array.isArray(draft.missingOrUnverified) || draft.missingOrUnverified.length === 0) {
    fail('missing limitations');
  }
  const limits = draft.missingOrUnverified.join('\n');
  if (!limits.includes('phone') || !limits.toLowerCase().includes('gpu')) fail('hardware limits not named');
  const proposed = new Set(draft.proposedApprovalSet ?? []);
  for (const entry of zari007) {
    if (!proposed.has(entry.id)) fail(`proposed set missing ${entry.id}`);
  }
  if (proposed.size !== zari007.length) fail('proposed set does not match zari007 entries');
  for (const file of draft.scenarioFiles ?? []) {
    const digest = sha256(join(ROOT, file.path));
    if (digest !== file.sha256) fail(`scenario ${file.path} hash drift`);
  }
  const snapshot = draft.a11ySnapshot;
  if (!snapshot?.file || !snapshot.sha256) fail('missing a11y snapshot');
  const snapshotPath = join(ROOT, 'design/baselines', snapshot.file);
  if (sha256(snapshotPath) !== snapshot.sha256) fail('a11y snapshot hash');
  console.log(
    `approved 0; drafts ${draftCount}; zari007 ${zari007.length}; bytes ${draftBytes}; required ${REQUIRED.length}`,
  );
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invoked) {
  try {
    main();
  } catch (error) {
    console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

export { main };
