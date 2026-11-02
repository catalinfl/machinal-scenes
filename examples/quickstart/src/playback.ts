import type { SceneConfig } from '@machinal/scenes/runtime';

export function playbackFrame(timestamp: number, startedAt: number, startFrame: number, config: SceneConfig): number {
  const elapsed = Math.max(0, timestamp - startedAt);
  return Math.min(config.durationInFrames - 1, startFrame + Math.floor(elapsed * config.fps / 1000));
}
