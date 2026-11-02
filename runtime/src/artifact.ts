import { validateRequest } from './validation.js';
import type { SceneManifest } from './types.js';

export interface RenderedSceneAsset {
  version: 1;
  file: string;
  sha256: string;
  size: number;
  duration: number;
  width: number;
  height: number;
  fps: number;
  frames: number;
  hasAudio: boolean;
  transparent: boolean;
  codec: 'h264' | 'vp9';
  scene: SceneManifest;
  elapsedNanoseconds: number;
}

export function parseRenderedSceneAsset(value: unknown): RenderedSceneAsset {
  if (!value || typeof value !== 'object') throw new Error('Scene asset manifest must be an object');
  const asset = value as RenderedSceneAsset;
  if (asset.version !== 1 || typeof asset.file !== 'string' || !asset.file.trim()) throw new Error('Invalid scene asset identity');
  if (typeof asset.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error('Invalid scene asset SHA-256');
  if (!Number.isSafeInteger(asset.size) || asset.size <= 0) throw new Error('Invalid scene asset size');
  if (asset.codec !== 'h264' && asset.codec !== 'vp9') throw new Error('Unsupported scene asset codec');
  if (typeof asset.hasAudio !== 'boolean' || typeof asset.transparent !== 'boolean') throw new Error('Invalid scene asset media flags');
  validateRequest(asset.scene);
  const config = asset.scene.config;
  if (asset.width !== config.width || asset.height !== config.height || asset.fps !== config.fps || asset.frames !== config.durationInFrames || asset.transparent !== Boolean(config.transparent)) {
    throw new Error('Scene asset dimensions or timing do not match its scene');
  }
  if (!Number.isFinite(asset.duration) || Math.abs(asset.duration - asset.frames / asset.fps) > 0.000001) throw new Error('Invalid scene asset duration');
  if (asset.transparent && asset.codec !== 'vp9') throw new Error('Transparent scenes require VP9');
  return structuredClone(asset);
}
