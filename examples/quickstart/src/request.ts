import { validateRequest, type SceneRequest } from '@machinal/scenes/runtime';
import config from '../scene.config.json';

export const request = (window.__sceneRequest ?? config) as SceneRequest;
validateRequest(request);
