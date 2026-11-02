export type ToolReport = {
  ready: boolean;
  renderer: { available: boolean; error?: string };
  browser: { available: boolean; error?: string };
  ffmpeg: { available: boolean; error?: string };
};

export type ExportJob =
  | { phase: 'idle' }
  | { phase: 'installing' | 'building' | 'rendering'; message: string }
  | { phase: 'done'; filename: string; download: string; localFile: string }
  | { phase: 'error'; message: string };

export type ExportStatus = { tools: ToolReport; job: ExportJob };

export async function exportRequest(action: 'status' | 'setup' | 'render', signal: AbortSignal): Promise<ExportStatus> {
  const response = await fetch(`/__machinal/export/${action}`, {
    method: action === 'status' ? 'GET' : 'POST',
    headers: { 'X-Machinal-Export': '1' },
    signal,
  });

  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Local export is unavailable. Open this project with npm run dev. You can also use npm run setup and npm run render in the terminal.');
  }

  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `Local export failed (${response.status}). Please retry.`);
  return result;
}
