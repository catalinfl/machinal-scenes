import { clamp } from './math.js';

export type Easing = (progress: number) => number;

export const easing = {
  linear: (p: number) => clamp(p),
  inOutCubic: (p: number) => { const t = clamp(p); return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2; },
  outQuint: (p: number) => 1 - (1 - clamp(p)) ** 5,
  smooth: (p: number) => { const t = clamp(p); return t * t * (3 - 2 * t); },
} satisfies Record<string, Easing>;

export interface Cue { id: string; start: number; duration: number }
export interface CueState { start: number; end: number; progress: number; active: boolean }

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
  return value;
}

export function progressAt(time: number, start: number, duration: number, curve: Easing = easing.linear): number {
  finite(time, 'time'); finite(start, 'start'); finite(duration, 'duration');
  if (duration < 0) throw new Error('duration must not be negative');
  return curve(duration === 0 ? Number(time >= start) : clamp((time - start) / duration));
}

export function stagger(index: number, interval: number, start = 0): number {
  if (!Number.isSafeInteger(index) || index < 0) throw new Error('index must be a nonnegative integer');
  finite(interval, 'interval'); finite(start, 'start');
  if (interval < 0) throw new Error('interval must not be negative');
  return finite(start + index * interval, 'stagger result');
}

/** Times are scene-local seconds; evaluation never depends on previous seeks. */
export function createChoreography(cues: readonly Cue[]) {
  const events = new Map<string, Readonly<Cue>>();
  for (const cue of cues) {
    if (!cue.id.trim() || events.has(cue.id)) throw new Error('Cue IDs must be nonempty and unique');
    finite(cue.start, 'start'); finite(cue.duration, 'duration');
    if (cue.start < 0 || cue.duration < 0) throw new Error('Cue times must not be negative');
    finite(cue.start + cue.duration, 'cue end');
    events.set(cue.id, Object.freeze({ ...cue }));
  }
  const get = (id: string) => {
    const cue = events.get(id);
    if (!cue) throw new Error(`Unknown cue: ${id}`);
    return cue;
  };
  return Object.freeze({
    marker(id: string, edge: 'start' | 'end' = 'start'): number {
      const cue = get(id);
      return cue.start + (edge === 'end' ? cue.duration : 0);
    },
    at(id: string, time: number, curve: Easing = easing.linear): CueState {
      const cue = get(id);
      return { start: cue.start, end: cue.start + cue.duration, progress: progressAt(time, cue.start, cue.duration, curve), active: time >= cue.start && time < cue.start + cue.duration };
    },
  });
}

export interface SpringOptions { stiffness?: number; damping?: number; mass?: number }

/** Analytic unit-step response: safe for backward/out-of-order frame evaluation. */
export function springAt(time: number, { stiffness = 170, damping = 26, mass = 1 }: SpringOptions = {}): number {
  finite(time, 'time');
  for (const [name, value] of Object.entries({ stiffness, damping, mass })) {
    if (finite(value, name) <= 0) throw new Error(`${name} must be positive`);
  }
  if (time <= 0) return 0;
  const omega = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  if (Math.abs(zeta - 1) < 1e-6) return 1 - Math.exp(-omega * time) * (1 + omega * time);
  if (zeta < 1) {
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * omega * time) * (Math.cos(wd * time) + zeta * omega / wd * Math.sin(wd * time));
  }
  const root = Math.sqrt(zeta * zeta - 1);
  const r1 = -omega / (zeta + root);
  const r2 = -omega * (zeta + root);
  return 1 - (r2 * Math.exp(r1 * time) - r1 * Math.exp(r2 * time)) / (r2 - r1);
}
