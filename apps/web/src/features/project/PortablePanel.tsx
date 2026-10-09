import { useState } from 'react';
import { Button } from 'react-aria-components';
import { libraryController, repository } from '../../app/sessionRegistry';
import { WORKER_BUILD_ID } from '../../worker/client';
import {
  DEFAULT_PORTABLE_INCLUSION,
  buildPortableBundle,
  portableMemberJson,
  type PortableInclusion,
} from './portable';

const CHOICES: { key: keyof PortableInclusion; id: string; label: string }[] = [
  { key: 'project', id: 'portable-include-project', label: '프로젝트 (초안과 진행)' },
  { key: 'observations', id: 'portable-include-observations', label: '관측 (측정 입력과 보유 이력)' },
  { key: 'catalog', id: 'portable-include-catalog', label: '카탈로그' },
  {
    key: 'snapshotAttachments',
    id: 'portable-include-snapshots',
    label: '스냅샷 첨부 (계획과 사진 이름)',
  },
];

/**
 * Export a checked zip. The library worker runs the Rust check so the open
 * project's activation is left alone. Nothing is uploaded.
 */
export function PortablePanel({ projectId }: { projectId: string }) {
  const [inclusion, setInclusion] = useState<PortableInclusion>(DEFAULT_PORTABLE_INCLUSION);
  const [state, setState] = useState<'idle' | 'working' | 'ready' | 'rejected'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setState('working');
    setError(null);
    try {
      const members = await portableMemberJson(
        repository,
        projectId,
        WORKER_BUILD_ID,
        inclusion,
      );
      if (members.status === 'rejected') {
        setState('rejected');
        setError(members.issues.map((item) => item.code).join(', '));
        return;
      }
      const client = await libraryController.ensure();
      const built = await buildPortableBundle(client, members.command);
      if (built.status === 'rejected') {
        setState('rejected');
        setError(built.issues.map((item) => `${item.code}`).join(', '));
        return;
      }
      if (built.status === 'unavailable') {
        setState('rejected');
        setError(built.error);
        return;
      }
      const blob = new Blob([new Uint8Array(built.zip).buffer], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `zari-${projectId}-portable.zip`;
      link.click();
      URL.revokeObjectURL(url);
      setState('ready');
    } catch (caught) {
      setState('rejected');
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <fieldset
      className="portable-panel"
      data-testid="portable-panel"
      data-state={state}
      aria-busy={state === 'working' ? true : undefined}
    >
      <legend>이식 묶음</legend>
      <p className="session-note" data-testid="portable-policy">
        사진 바이트는 포함하지 않습니다. 포함 여부는 항상 제외이고, 사진 동의는 별도
        결정입니다. 위치정보(위도, 경도, GPS, EXIF)는 넣지 않으며, 파일에 있으면
        가져오기를 거절합니다. 이메일, 전화, 비밀번호, 토큰은 묶음에서 빼며, 있으면
        거절합니다. 이 기기의 원본은 지우지 않습니다. 실패한 가져오기는 기존 프로젝트를
        덮어쓰지 않고, 공유 보유 수납함은 묶음에 넣지 않습니다. 프로젝트를 빼면 다른
        기기에서 열 수 없습니다.
      </p>
      <div className="portable-choices">
        {CHOICES.map((choice) => (
          <label key={choice.key}>
            <input
              type="checkbox"
              data-testid={choice.id}
              checked={inclusion[choice.key]}
              onChange={(event) =>
                setInclusion((current) => ({ ...current, [choice.key]: event.target.checked }))
              }
            />
            <span>{choice.label}</span>
          </label>
        ))}
      </div>
      <div className="form-actions">
        <Button
          className="button button-secondary"
          data-testid="portable-export"
          isDisabled={state === 'working'}
          onPress={() => void download()}
        >
          이식 묶음 받기
        </Button>
      </div>
      {state === 'working' && (
        <p role="status" data-testid="portable-state">
          묶음의 해시와 범위를 확인하고 있습니다.
        </p>
      )}
      {state === 'ready' && (
        <p role="status" data-testid="portable-ready">
          이식 묶음을 저장했습니다. 사진 바이트는 들어 있지 않습니다.
        </p>
      )}
      {error && (
        <p role="alert" className="notice notice-error" data-testid="portable-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}
