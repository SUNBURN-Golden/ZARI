import { useEffect, useState, type ReactNode } from 'react';
import { CatalogScreen } from './CatalogScreen';
import { DataScreen } from './DataScreen';
import { PlanScreen } from './PlanScreen';
import { ProbeScreen } from './ProbeScreen';
import { ProjectScreen } from './ProjectScreen';
import { ProjectsScreen } from './ProjectsScreen';
import { useHashRoute } from './router';
import { repository } from './sessionRegistry';
import type { StorageFenceCause } from '../persistence/repository';

export function App() {
  const hash = useHashRoute();
  /**
   * PERSISTENCE §6: another tab holding a newer build asks this connection
   * to close so its upgrade can proceed, or this tab itself finds a stored
   * database newer than this build at open. The repository closes the
   * IndexedDB connection itself; this notice is the reload prompt that
   * contract also requires. Stored rows are untouched — nothing is deleted
   * or rewritten.
   */
  const [storageMoved, setStorageMoved] = useState<StorageFenceCause | null>(null);
  useEffect(() => {
    repository.onVersionChange = (cause) => setStorageMoved(cause);
    return () => {
      repository.onVersionChange = null;
    };
  }, []);
  let screen: ReactNode;
  if (hash === '#/catalog') screen = <CatalogScreen />;
  else if (hash === '#/data') screen = <DataScreen />;
  else if (hash === '#/probe') screen = <ProbeScreen />;
  else {
    const plan = /^#\/project\/([0-9a-fA-F-]+)\/plan$/.exec(hash);
    if (plan?.[1]) screen = <PlanScreen key={plan[1]} projectId={plan[1]} />;
    else {
      const match = /^#\/project\/([0-9a-fA-F-]+)$/.exec(hash);
      screen = match?.[1] ? (
        <ProjectScreen key={match[1]} projectId={match[1]} />
      ) : (
        <ProjectsScreen />
      );
    }
  }
  return (
    <>
      {storageMoved === 'peer_upgrade' && (
        <p role="alert" className="notice notice-error" data-testid="db-version-notice">
          다른 탭에서 더 새로운 저장 형식으로 열었습니다. 이 탭의 저장 연결은 닫혔고 저장된
          데이터는 지워지지 않았습니다. 이 탭을 새로고침해 최신 앱으로 여세요.
        </p>
      )}
      {storageMoved === 'stored_newer' && (
        <p role="alert" className="notice notice-error" data-testid="db-version-notice">
          이 기기에 이 앱보다 새로운 저장 형식의 데이터가 있습니다. 이 앱은 그 저장소를 열지
          않았고 데이터는 지우지 않았습니다. 이 탭을 새로고침해 최신 앱으로 여세요.
        </p>
      )}
      {screen}
    </>
  );
}
