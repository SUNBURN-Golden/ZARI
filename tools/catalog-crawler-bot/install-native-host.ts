// Run by the user (never by CI). Writes the native messaging host manifest into
// the bot's dedicated Chrome profile and a launcher script into the state dir.
// It touches nothing else: no system directories, no other Chrome profile.
import { chmodSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ensureDir } from './fsx.ts';
import { HOST_NAME } from './paths.ts';
import type { StatePaths } from './paths.ts';

export const EXTENSION_ID = /^[a-p]{32}$/;

export function installNativeHost(paths: StatePaths, extensionId: string, nodePath = process.execPath): { manifestPath: string; launcher: string } {
  if (!EXTENSION_ID.test(extensionId)) throw new Error('invalid_extension_id');
  const hostScript = resolve(import.meta.dirname, 'native-host.ts');
  ensureDir(paths.dir);
  const quote = (text: string): string => `'${text.replace(/'/g, `'\\''`)}'`;
  writeFileSync(
    paths.launcher,
    `#!/bin/sh\nexport ZARI_CRAWLER_STATE_DIR=${quote(paths.dir)}\nexec ${quote(nodePath)} ${quote(hostScript)}\n`,
    { mode: 0o700 },
  );
  chmodSync(paths.launcher, 0o700);
  const nhmDir = join(paths.profile, 'NativeMessagingHosts');
  ensureDir(nhmDir);
  const manifestPath = join(nhmDir, `${HOST_NAME}.json`);
  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        name: HOST_NAME,
        description: 'ZARI catalog collection bot (local control channel)',
        path: paths.launcher,
        type: 'stdio',
        allowed_origins: [`chrome-extension://${extensionId}/`],
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  return { manifestPath, launcher: paths.launcher };
}
