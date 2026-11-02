import { clamp } from './math.js';

export interface VideoEffects {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  hue?: number;
  blur?: number;
  grayscale?: number;
  sepia?: number;
  invert?: number;
  vignette?: number;
  scanlines?: number;
}

export const videoLooks = {
  original: {},
  cinematic: { contrast: 1.2, saturation: 0.85, vignette: 0.35 },
  noir: { grayscale: 1, contrast: 1.45, vignette: 0.45 },
  vintage: { sepia: 0.5, saturation: 0.7, contrast: 0.9, vignette: 0.3 },
  warm: { sepia: 0.25, saturation: 1.15, brightness: 1.06 },
  cool: { hue: 20, saturation: 0.8, contrast: 1.1 },
  vivid: { saturation: 1.65, contrast: 1.15 },
  faded: { contrast: 0.75, brightness: 1.12, saturation: 0.65 },
  dreamy: { blur: 2, brightness: 1.12, saturation: 0.85 },
  dramatic: { contrast: 1.6, brightness: 0.85, vignette: 0.55 },
  sepia: { sepia: 1, contrast: 1.1 },
  negative: { invert: 1 },
  night: { brightness: 0.65, saturation: 0.55, hue: 25, vignette: 0.5 },
  retro: { saturation: 0.8, sepia: 0.2, contrast: 1.2, scanlines: 0.25, vignette: 0.3 },
} satisfies Record<string, VideoEffects>;

export type VideoLook = keyof typeof videoLooks;

export function resolveVideoEffects(look: VideoLook = 'original', effects: VideoEffects = {}): VideoEffects {
  return { ...videoLooks[look], ...effects };
}

function bounded(value: number | undefined, fallback: number, min: number, max: number): number {
  return clamp(value !== undefined && Number.isFinite(value) ? value : fallback, min, max);
}

export function videoFilter(effects: VideoEffects): string {
  return [
    `brightness(${bounded(effects.brightness, 1, 0, 4)})`,
    `contrast(${bounded(effects.contrast, 1, 0, 4)})`,
    `saturate(${bounded(effects.saturation, 1, 0, 4)})`,
    `hue-rotate(${bounded(effects.hue, 0, -360, 360)}deg)`,
    `blur(${bounded(effects.blur, 0, 0, 40)}px)`,
    `grayscale(${bounded(effects.grayscale, 0, 0, 1)})`,
    `sepia(${bounded(effects.sepia, 0, 0, 1)})`,
    `invert(${bounded(effects.invert, 0, 0, 1)})`,
  ].join(' ');
}

export function videoTime(time: number, duration: number, options: { start?: number; end?: number; offset?: number; playbackRate?: number; loop?: boolean } = {}): number {
  const start = bounded(options.start, 0, 0, duration);
  const end = bounded(options.end, duration, start, duration);
  const rate = bounded(options.playbackRate, 1, -8, 8);
  const offset = options.offset !== undefined && Number.isFinite(options.offset) ? options.offset : 0;
  const elapsed = Math.max(0, time - offset) * rate;
  const span = end - start;
  const position = rate < 0 ? span + elapsed : elapsed;
  const local = options.loop && span > 0 && !(rate < 0 && elapsed === 0) ? ((position % span) + span) % span : clamp(position, 0, span);
  return clamp(start + local, 0, Math.max(start, end - 0.000001));
}
