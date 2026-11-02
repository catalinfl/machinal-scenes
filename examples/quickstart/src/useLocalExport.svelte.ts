import { exportRequest, type ExportStatus } from './export-api';

type Connection =
  | { phase: 'checking' }
  | { phase: 'connected'; status: ExportStatus }
  | { phase: 'error'; message: string };

export function useLocalExport() {
  let connection = $state<Connection>({ phase: 'checking' });
  let submitting = $state(false);
  let request: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function dispose() {
    request?.abort();
    clearTimeout(timer);
  }

  async function refresh(action: 'status' | 'setup' | 'render' = 'status') {
    dispose();
    const controller = new AbortController();
    request = controller;
    submitting = true;
    try {
      const status = await exportRequest(action, controller.signal);
      if (controller.signal.aborted) return;
      connection = { phase: 'connected', status };
      if (['installing', 'building', 'rendering'].includes(status.job.phase)) {
        timer = setTimeout(() => { void refresh(); }, 800);
      }
    } catch (error) {
      if (!controller.signal.aborted) connection = { phase: 'error', message: error instanceof Error ? error.message : String(error) };
    } finally {
      if (!controller.signal.aborted) submitting = false;
    }
  }

  return {
    refresh,
    dispose,
    get connection() { return connection; },
    get busy() {
      return submitting || connection.phase === 'checking' || connection.phase === 'connected' && ['installing', 'building', 'rendering'].includes(connection.status.job.phase);
    },
  };
}
