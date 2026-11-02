import { clamp } from './math.js';

export interface Point { x: number; y: number }
export interface Bounds extends Point { width: number; height: number }
export interface Pose2D extends Point { rotation: number; scaleX: number; scaleY: number }
export type Anchor = 'center' | 'top' | 'right' | 'bottom' | 'left';

export function anchorPoint(bounds: Bounds, anchor: Anchor = 'center'): Point {
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  switch (anchor) {
    case 'top': return { x, y: bounds.y };
    case 'right': return { x: bounds.x + bounds.width, y };
    case 'bottom': return { x, y: bounds.y + bounds.height };
    case 'left': return { x: bounds.x, y };
    default: return { x, y };
  }
}

/** Rotation is in radians, around the subject's local origin. */
export function transformPoint(point: Point, pose: Pose2D): Point {
  const x = point.x * pose.scaleX;
  const y = point.y * pose.scaleY;
  const cos = Math.cos(pose.rotation), sin = Math.sin(pose.rotation);
  return { x: pose.x + x * cos - y * sin, y: pose.y + x * sin + y * cos };
}

export function bezierPoint(points: readonly [Point, Point, Point, Point], progress: number): Point {
  const t = clamp(progress), u = 1 - t;
  const [a, b, c, d] = points;
  const sample = (key: keyof Point) => u ** 3 * a[key] + 3 * u * u * t * b[key] + 3 * u * t * t * c[key] + t ** 3 * d[key];
  return { x: sample('x'), y: sample('y') };
}

export function connectorPath(from: Point, to: Point, bend = 0.5): string {
  const middle = from.x + (to.x - from.x) * clamp(bend);
  return `M ${from.x} ${from.y} C ${middle} ${from.y}, ${middle} ${to.y}, ${to.x} ${to.y}`;
}

export function interpolatePose(from: Pose2D, to: Pose2D, progress: number): Pose2D {
  const t = clamp(progress);
  const mix = (a: number, b: number) => a + (b - a) * t;
  return { x: mix(from.x, to.x), y: mix(from.y, to.y), rotation: mix(from.rotation, to.rotation), scaleX: mix(from.scaleX, to.scaleX), scaleY: mix(from.scaleY, to.scaleY) };
}
