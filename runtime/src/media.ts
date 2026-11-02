const MEDIA_TIMEOUT_MS = 10000;
const PLAYBACK_DRIFT_SECONDS = 0.15;
const pendingPlayback = new WeakSet<HTMLVideoElement>();

export function presentSceneVideos(target: HTMLElement, time: number, playbackRate: number): void {
  for (const video of target.querySelectorAll('video')) {
    if ((!video.src && !video.currentSrc) || video.readyState < 2) continue;
    video.muted = true;
    const desired = Number(video.dataset.sceneVideoTime ?? time);
    const rate = Number(video.dataset.sceneVideoRate ?? 1) * playbackRate;
    if (!Number.isFinite(desired) || !Number.isFinite(rate)) continue;
    const position = Math.max(0, Math.min(video.duration - 0.000001, desired));
    const tolerance = rate > 0 ? PLAYBACK_DRIFT_SECONDS : 0.000001;
    if (!video.seeking && Math.abs(video.currentTime - position) > tolerance) video.currentTime = position;
    if (rate <= 0 || rate > 16) { video.pause(); continue; }
    if (video.playbackRate !== rate) video.playbackRate = rate;
    if (video.paused && !pendingPlayback.has(video)) {
      pendingPlayback.add(video);
      void video.play().catch(() => {}).finally(() => pendingPlayback.delete(video));
    }
  }
}

function waitForMedia(video: HTMLVideoElement, event: string, ready: () => boolean, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  if (video.error) return Promise.reject(new Error(`Scene video could not decode: ${video.error.message}`));
  if (ready()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(event, complete);
      video.removeEventListener('error', failed);
      signal.removeEventListener('abort', aborted);
    };
    const complete = () => { if (ready()) { cleanup(); resolve(); } };
    const failed = () => { cleanup(); reject(new Error('Scene video could not decode. Choose H.264 MP4 or VP8/VP9 WebM.')); };
    const aborted = () => { cleanup(); reject(signal.reason); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Scene video frame timed out.')); }, MEDIA_TIMEOUT_MS);
    video.addEventListener(event, complete);
    video.addEventListener('error', failed);
    signal.addEventListener('abort', aborted, { once: true });
  });
}

export async function seekSceneVideos(target: HTMLElement, time: number, signal: AbortSignal): Promise<void> {
  await Promise.all([...target.querySelectorAll('video')].map(async video => {
    if (!video.src && !video.currentSrc) return;
    video.pause();
    video.muted = true;
    await waitForMedia(video, 'loadeddata', () => video.readyState >= 2, signal);
    const desired = Number(video.dataset.sceneVideoTime ?? time);
    if (!Number.isFinite(desired)) throw new Error('Scene video time must be finite');
    const position = Math.max(0, Math.min(video.duration - 0.000001, desired));
    if (Math.abs(video.currentTime - position) > 0.000001) video.currentTime = position;
    await waitForMedia(video, 'seeked', () => !video.seeking && video.readyState >= 2, signal);
  }));
}
