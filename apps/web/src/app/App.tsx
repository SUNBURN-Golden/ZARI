import { CatalogScreen } from './CatalogScreen';
import { PlanScreen } from './PlanScreen';
import { ProbeScreen } from './ProbeScreen';
import { ProjectScreen } from './ProjectScreen';
import { ProjectsScreen } from './ProjectsScreen';
import { useHashRoute } from './router';

export function App() {
  const hash = useHashRoute();
  if (hash === '#/catalog') return <CatalogScreen />;
  if (hash === '#/probe') return <ProbeScreen />;
  const plan = /^#\/project\/([0-9a-fA-F-]+)\/plan$/.exec(hash);
  if (plan?.[1]) return <PlanScreen key={plan[1]} projectId={plan[1]} />;
  const match = /^#\/project\/([0-9a-fA-F-]+)$/.exec(hash);
  if (match?.[1]) return <ProjectScreen key={match[1]} projectId={match[1]} />;
  return <ProjectsScreen />;
}
