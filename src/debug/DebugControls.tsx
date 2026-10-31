import { useState, useSyncExternalStore } from 'react';
import type { DebugLogger } from './logger';

interface Props {
  logger: DebugLogger;
  getProjectState?: () => unknown;
}

export function DebugControls({ logger, getProjectState }: Props) {
  const enabled = useSyncExternalStore(logger.subscribe, () => logger.debugEnabled);
  const [includeProject, setIncludeProject] = useState(false);
  const [status, setStatus] = useState('');

  function download() {
    try {
      const json = logger.exportJson({
        projectState: includeProject ? getProjectState?.() : undefined,
      });
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `safety-debug-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.append(link);
      try { link.click(); } finally {
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setStatus('Export zum Download bereitgestellt.');
    } catch (error) {
      logger.logError('debug-export-failed', error);
      setStatus('Export fehlgeschlagen. Der Fehler wurde protokolliert.');
    }
  }

  return <section className={enabled ? 'debug-controls expanded' : 'debug-controls'} aria-label="Debugging">
    <label><input type="checkbox" checked={enabled}
      onChange={(event) => logger.setDebugEnabled(event.target.checked)} /> Debug-Modus</label>
    {enabled && <>
      {getProjectState && <label><input type="checkbox" checked={includeProject}
        onChange={(event) => setIncludeProject(event.target.checked)} /> Projektstand einschließen</label>}
      <button type="button" onClick={download}>Debug-Log exportieren</button>
      <p role="status">{status}</p>
    </>}
  </section>;
}
