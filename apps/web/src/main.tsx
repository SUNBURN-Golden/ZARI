import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { warmProjectWorker } from './app/sessionRegistry';
import { registerShell } from './features/shell/offline';
import './styles/tokens.css';
import './styles/app.css';
import './styles/project.css';
import './styles/print.css';

const root = document.getElementById('root');
if (!root) throw new Error('ZARI root element is missing.');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

warmProjectWorker();

// Versioned same-origin app-shell caching (offline revisit); skipped in dev.
registerShell();
