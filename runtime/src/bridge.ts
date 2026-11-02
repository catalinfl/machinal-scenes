import type { SceneController, SceneManifest } from './types.js';

const COMMAND = 'scene-engine:command';
const RESPONSE = 'scene-engine:response';

interface Command {
  type: typeof COMMAND;
  id: string;
  method: 'seek' | 'ready';
  frame?: number;
}

export function exposeScene(controller: SceneController, view: Window = window): () => void {
  view.__scene = controller;

  const receive = async (event: MessageEvent) => {
    const command = event.data as Command;
    if (event.source !== view.parent || event.origin !== view.location.origin) return;
    if (command?.type !== COMMAND || typeof command.id !== 'string') return;
    try {
      if (command.method === 'seek') await controller.seek(command.frame as number);
      else if (command.method === 'ready') await controller.ready();
      else throw new Error('Unknown scene command');
      view.parent.postMessage({ type: RESPONSE, id: command.id, manifest: controller.manifest }, event.origin);
    } catch (error) {
      view.parent.postMessage({ type: RESPONSE, id: command.id, error: error instanceof Error ? error.message : String(error) }, event.origin);
    }
  };

  view.addEventListener('message', receive);
  return () => {
    view.removeEventListener('message', receive);
    if (view.__scene === controller) delete view.__scene;
  };
}

export interface SceneConnection {
  ready: () => Promise<SceneManifest>;
  seek: (frame: number) => Promise<SceneManifest>;
  dispose: () => void;
}

export function connectScene(iframe: HTMLIFrameElement, timeoutMs = 30_000): SceneConnection {
  const view = iframe.ownerDocument.defaultView!;
  const origin = new URL(iframe.src, view.location.href).origin;
  const pending = new Map<string, { resolve: (manifest: SceneManifest) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  let disposed = false;

  const receive = (event: MessageEvent) => {
    if (event.source !== iframe.contentWindow || event.origin !== origin || event.data?.type !== RESPONSE) return;
    const entry = pending.get(event.data.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(event.data.id);
    if (event.data.error) entry.reject(new Error(event.data.error));
    else entry.resolve(event.data.manifest);
  };

  const send = (method: Command['method'], frame?: number): Promise<SceneManifest> => {
    if (disposed) return Promise.reject(new Error('Scene connection disposed'));
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Scene ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      iframe.contentWindow!.postMessage({ type: COMMAND, id, method, frame }, origin);
    });
  };

  view.addEventListener('message', receive);
  return {
    ready: () => send('ready'),
    seek: (frame) => send('seek', frame),
    dispose() {
      disposed = true;
      view.removeEventListener('message', receive);
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(new Error('Scene connection disposed'));
      }
      pending.clear();
    },
  };
}
