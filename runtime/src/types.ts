import type { SceneObjectRegistry } from './objects.js';
import type { SceneParameters } from './parameters.js';

export const PROTOCOL_VERSION = 1 as const;

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type SceneProps = Record<string, JsonValue>;

export interface SceneConfig {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  transparent?: boolean;
  captionSafeBottom?: number;
}

export interface SceneRequest {
  version: typeof PROTOCOL_VERSION;
  sceneId: string;
  props?: SceneProps;
  seed?: string;
  config: SceneConfig;
}

export interface SceneManifest extends SceneRequest {
  props: SceneProps;
  seed: string;
}

export interface SceneRenderOptions {
  renderScale?: number;
  capture?: boolean;
}

export interface FrameContext extends SceneRenderOptions {
  frame: number;
  time: number;
  progress: number;
  config: Readonly<SceneConfig>;
  random: (key: string) => number;
}

export interface SceneInstance {
  update: (context: FrameContext) => void | Promise<void>;
  dispose: () => void | Promise<void>;
}

export interface ResourceScope {
  track: <T>(resource: Promise<T>) => Promise<T>;
  wait: () => Promise<void>;
  readonly signal: AbortSignal;
}

export interface SceneMountContext<P extends SceneProps = SceneProps> {
  target: HTMLElement;
  props: P;
  config: Readonly<SceneConfig>;
  resources: ResourceScope;
  objects: SceneObjectRegistry;
}

export interface SceneDefinition<P extends SceneProps = SceneProps> {
  id: string;
  defaults: P;
  create: (context: SceneMountContext<P>) => SceneInstance | Promise<SceneInstance>;
}

export interface SceneController {
  readonly version: typeof PROTOCOL_VERSION;
  readonly manifest: SceneManifest;
  ready: () => Promise<void>;
  seek: (frame: number, options?: SceneRenderOptions & { realtime?: boolean; playbackRate?: number }) => Promise<void>;
  dispose: () => Promise<void>;
  snapshotObjects?: () => SceneParameters;
}

declare global {
  interface Window {
    __scene?: SceneController;
    __sceneRequest?: SceneRequest;
    __sceneError?: string;
  }
}
