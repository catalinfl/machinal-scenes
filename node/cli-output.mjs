export function formatToolchainStatus(status) {
  const heading = status.ready ? 'Rendering tools are ready.' : 'Rendering tools are not ready.';
  const tools = [['Renderer', status.renderer], ['Chrome Headless Shell', status.browser], ['FFmpeg', status.ffmpeg]];
  const lines = tools.map(([name, tool]) => `  ${name}: ${tool.available ? 'ready' : tool.error ?? 'not available'}`);
  return [heading, ...lines].join('\n');
}

export function formatRenderResult(asset) {
  return `Rendered ${asset.file}\n${asset.width} × ${asset.height} · ${asset.fps} fps · ${asset.duration} s`;
}
