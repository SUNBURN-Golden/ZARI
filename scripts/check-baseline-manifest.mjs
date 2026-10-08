#!/usr/bin/env node
// Draft baseline index check. Confirms files, hashes, and that approval stayed at zero.
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const MANIFEST_PATH = join(ROOT, 'design/baselines/manifest.json');
const BASE = '29370e23a082c49aa4d8d7943b0e6e71c7884b4c';
const ZARI011_BASE = '6f1c5c696d964487f8b52cdec428ae6cd0aba596';
const ZARI016_BASE = '37d2831bbcf696e01d72fb66398b68a4bad14c46';

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

const MC_BOTH = [
  'fresh',
  'nominal-bounds',
  'unknown',
  'missing-bound',
  'conflicting-evidence',
  'staging-support',
  'load-unknown',
  'catalog-source',
  'next-fact',
  'stale',
  'conflict',
];
const MC_REQUIRED = [
  ...MC_BOTH.flatMap((state) => [`zari011-${state}-1440`, `zari011-${state}-390`]),
  'zari011-a11y-focus-1440',
  'zari011-a11y-forced-colors-1440',
  'zari011-a11y-forced-colors-390',
  'zari011-a11y-zoom-200-1440',
];

const PC_BOTH = [
  'blocked-unknown',
  'no-purchase',
  'reuse',
  'mixed-purchase',
  'stale',
  'historical',
  'save-cas',
  'interrupted',
];
const PC_REQUIRED = [
  ...PC_BOTH.flatMap((state) => [`zari016-${state}-1440`, `zari016-${state}-390`]),
  'zari016-a11y-keyboard-1440',
  'zari016-a11y-ime-1440',
  'zari016-a11y-zoom-200-1440',
  'zari016-a11y-forced-colors-1440',
  'zari016-a11y-forced-colors-390',
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
  const zari011 = manifest.baselines.filter((entry) => entry.id.startsWith('zari011-'));
  const mcIds = new Set(zari011.map((entry) => entry.id));
  for (const id of MC_REQUIRED) {
    if (!mcIds.has(id)) fail(`missing required capture ${id}`);
  }
  for (const entry of zari011) {
    for (const field of REQUIRED_FIELDS) {
      if (entry[field] == null || entry[field] === '') fail(`${entry.id} missing ${field}`);
    }
    if (entry.gpu == null || typeof entry.gpu.note !== 'string' || !entry.gpu.note.includes('Not a discrete GPU')) {
      fail(`${entry.id} missing GPU note`);
    }
    if (entry.sourceCommit !== ZARI011_BASE) fail(`${entry.id} sourceCommit ${entry.sourceCommit}`);
    if (entry.fixtureId !== 'fresh-ordinary-project') fail(`${entry.id} fixture`);
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
    if (entry.status !== 'draft') fail(`${entry.id} is not draft`);
  }
  const draft011 = manifest.spatialDraft011;
  if (!draft011) fail('missing spatialDraft011');
  if (draft011.approved !== false || draft011.notPhysicalValidation !== true) fail('spatialDraft011 approval flags');
  if (draft011.sourceCommit !== ZARI011_BASE) fail('spatialDraft011 sourceCommit');
  if (draft011.acceptanceState !== 'PENDING' || draft011.releaseState !== 'NOT_AUTHORIZED') {
    fail('spatialDraft011 state axes');
  }
  if (draft011.nodeState === 'DONE') fail('spatialDraft011 cannot be DONE before merge');
  if (!Array.isArray(draft011.missingOrUnverified) || draft011.missingOrUnverified.length === 0) {
    fail('missing 011 limitations');
  }
  const limits011 = draft011.missingOrUnverified.join('\n');
  if (!limits011.includes('phone') || !limits011.toLowerCase().includes('gpu')) fail('011 hardware limits not named');
  const proposed011 = new Set(draft011.proposedApprovalSet ?? []);
  for (const entry of zari011) {
    if (!proposed011.has(entry.id)) fail(`011 proposed set missing ${entry.id}`);
  }
  if (proposed011.size !== zari011.length) fail('011 proposed set does not match zari011 entries');
  for (const file of draft011.scenarioFiles ?? []) {
    const digest = sha256(join(ROOT, file.path));
    if (digest !== file.sha256) fail(`scenario ${file.path} hash drift`);
  }
  const snapshot011 = draft011.a11ySnapshot;
  if (!snapshot011?.file || !snapshot011.sha256) fail('missing 011 a11y snapshot');
  const snapshot011Path = join(ROOT, 'design/baselines', snapshot011.file);
  if (sha256(snapshot011Path) !== snapshot011.sha256) fail('011 a11y snapshot hash');
  const zari016 = manifest.baselines.filter((entry) => entry.id.startsWith('zari016-'));
  const pcIds = new Set(zari016.map((entry) => entry.id));
  for (const id of PC_REQUIRED) {
    if (!pcIds.has(id)) fail(`missing required capture ${id}`);
  }
  for (const entry of zari016) {
    for (const field of REQUIRED_FIELDS) {
      if (entry[field] == null || entry[field] === '') fail(`${entry.id} missing ${field}`);
    }
    if (entry.gpu == null || typeof entry.gpu.note !== 'string' || !entry.gpu.note.includes('Not a discrete GPU')) {
      fail(`${entry.id} missing GPU note`);
    }
    if (entry.sourceCommit !== ZARI016_BASE) fail(`${entry.id} sourceCommit ${entry.sourceCommit}`);
    if (entry.fixtureId !== 'sample-plus-reuse-bin') fail(`${entry.id} fixture`);
    if (entry.locale !== 'ko-KR' || entry.theme !== 'light' || entry.reducedMotion !== 'reduce') {
      fail(`${entry.id} environment`);
    }
    if (entry.fullPage !== false) fail(`${entry.id} is not a viewport capture`);
    if (entry.deviceScaleFactor !== 1) fail(`${entry.id} deviceScaleFactor`);
    if (!String(entry.browserAndVersion).startsWith('Chromium ')) fail(`${entry.id} browser`);
    if (!String(entry.productTree).includes('apps/web/src')) fail(`${entry.id} product tree note`);
    if (!Array.isArray(entry.scenarioFiles) || entry.scenarioFiles.length < 3) fail(`${entry.id} scenario files`);
    if (!/^0(ms|s)$/.test(entry.durationFast ?? '')) fail(`${entry.id} durationFast`);
    const width = entry.id.endsWith('-390') ? 390 : entry.id.includes('1440') ? 1440 : null;
    if (width != null && entry.viewport?.width !== width) fail(`${entry.id} viewport width`);
    if (entry.viewport?.height == null) fail(`${entry.id} viewport height`);
    if (entry.status !== 'draft') fail(`${entry.id} is not draft`);
  }
  const draft016 = manifest.spatialDraft016;
  if (!draft016) fail('missing spatialDraft016');
  if (draft016.approved !== false || draft016.notPhysicalValidation !== true) fail('spatialDraft016 approval flags');
  if (!Array.isArray(draft016.doesNotInheritAcceptance) || draft016.doesNotInheritAcceptance.join(',') !== 'zari007,zari011') {
    fail('spatialDraft016 inherits an older capture set');
  }
  if (draft016.sourceCommit !== ZARI016_BASE) fail('spatialDraft016 sourceCommit');
  if (draft016.acceptanceState !== 'PENDING' || draft016.releaseState !== 'NOT_AUTHORIZED') {
    fail('spatialDraft016 state axes');
  }
  if (draft016.nodeState === 'DONE') fail('spatialDraft016 cannot be DONE before merge');
  if (draft016.qualificationState !== 'PARTIAL') fail('spatialDraft016 qualification');
  if (!Array.isArray(draft016.missingOrUnverified) || draft016.missingOrUnverified.length === 0) {
    fail('missing 016 limitations');
  }
  const limits016 = draft016.missingOrUnverified.join('\n');
  if (!limits016.includes('phone') || !limits016.toLowerCase().includes('gpu')) fail('016 hardware limits not named');
  const proposed016 = new Set(draft016.proposedApprovalSet ?? []);
  for (const entry of zari016) {
    if (!proposed016.has(entry.id)) fail(`016 proposed set missing ${entry.id}`);
  }
  if (proposed016.size !== zari016.length) fail('016 proposed set does not match zari016 entries');
  for (const file of draft016.scenarioFiles ?? []) {
    const digest = sha256(join(ROOT, file.path));
    if (digest !== file.sha256) fail(`scenario ${file.path} hash drift`);
  }
  const snapshot016 = draft016.a11ySnapshot;
  if (!snapshot016?.file || !snapshot016.sha256) fail('missing 016 a11y snapshot');
  const snapshot016Path = join(ROOT, 'design/baselines', snapshot016.file);
  if (sha256(snapshot016Path) !== snapshot016.sha256) fail('016 a11y snapshot hash');
  console.log(
    `approved 0; drafts ${draftCount}; zari007 ${zari007.length}; zari011 ${zari011.length}; zari016 ${zari016.length}; bytes ${draftBytes}; required ${REQUIRED.length + MC_REQUIRED.length + PC_REQUIRED.length}`,
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
