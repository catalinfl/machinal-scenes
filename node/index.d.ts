import type { RenderedSceneAsset, SceneRequest } from '../dist/runtime/index.js';

export interface ToolOptions {
  cacheDirectory?: string;
  browserExecutable?: string;
  ffmpegExecutable?: string;
}

export interface ToolStatus {
  path?: string;
  available: boolean;
  version?: string;
  error?: string;
}

export interface ToolchainStatus {
  ready: boolean;
  cacheDirectory: string;
  renderer: ToolStatus;
  browser: ToolStatus;
  ffmpeg: ToolStatus;
}

export interface AudioTrack {
  file: string;
  start: number;
  from?: number;
  duration: number;
  volume?: number;
}

export interface RenderRequest extends SceneRequest {
  url: string;
  audio?: AudioTrack[];
}

export interface RenderOptions extends ToolOptions {
  request: string | RenderRequest;
  serveDirectory?: string;
  output?: string;
  workers?: number;
  noSandbox?: boolean;
  lossless?: boolean;
  gpu?: boolean;
  onProgress?: (message: string) => void;
}

export function setup(options?: ToolOptions & { onProgress?: (message: string) => void }): Promise<ToolchainStatus>;
export function doctor(options?: ToolOptions): Promise<ToolchainStatus>;
export function renderVideo(options: RenderOptions): Promise<RenderedSceneAsset>;
