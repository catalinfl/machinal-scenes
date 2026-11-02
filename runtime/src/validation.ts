import { PROTOCOL_VERSION, type SceneConfig, type SceneRequest } from './types.js';

export function validateConfig(config: SceneConfig): void {
  for (const key of ['width', 'height', 'durationInFrames'] as const) {
    if (!Number.isSafeInteger(config?.[key]) || config[key] <= 0) {
      throw new Error(`${key} must be a positive safe integer`);
    }
  }
  if (!Number.isFinite(config.fps) || config.fps <= 0 || config.fps > 240) {
    throw new Error('fps must be between 0 and 240');
  }
  if (config.transparent !== undefined && typeof config.transparent !== 'boolean') {
    throw new Error('transparent must be a boolean');
  }
  if (config.captionSafeBottom !== undefined && (!Number.isFinite(config.captionSafeBottom) || config.captionSafeBottom < 0 || config.captionSafeBottom > 0.5)) {
    throw new Error('captionSafeBottom must be between 0 and 0.5');
  }
  const duration = config.durationInFrames / config.fps;
  if (!Number.isFinite(duration) || duration > 24 * 60 * 60) throw new Error('Scene duration must not exceed 24 hours');
}

export function validateRequest(request: SceneRequest): void {
  if (request?.version !== PROTOCOL_VERSION) throw new Error('Unsupported scene protocol version');
  if (typeof request.sceneId !== 'string' || !request.sceneId.trim()) throw new Error('sceneId is required');
  if (request.seed !== undefined && typeof request.seed !== 'string') throw new Error('seed must be a string');
  if (request.props !== undefined && (!request.props || Array.isArray(request.props) || typeof request.props !== 'object')) {
    throw new Error('props must be an object');
  }
  validateConfig(request.config);
}

export function validateFrame(frame: number, config: SceneConfig): void {
  if (!Number.isSafeInteger(frame) || frame < 0 || frame >= config.durationInFrames) {
    throw new Error(`Frame must be an integer between 0 and ${config.durationInFrames - 1}`);
  }
}
