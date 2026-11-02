import { describe, expect, it } from 'vitest';
import { createChoreography, easing, progressAt, springAt, stagger } from '../src/choreography.js';
import { anchorPoint, bezierPoint, connectorPath, interpolatePose, transformPoint } from '../src/geometry.js';

describe('absolute-time choreography', () => {
  it('supports measured cues, markers, holds and out-of-order seeks without mutating inputs', () => {
    const cue = { id: 'engage', start: 2.35, duration: 1.2 };
    const timeline = createChoreography([cue]);
    cue.start = 99;
    const before = timeline.at('engage', 2.95);
    timeline.at('engage', 15);
    expect(timeline.at('engage', 2.95)).toEqual(before);
    expect(before.progress).toBeCloseTo(0.5);
    expect(timeline.marker('engage', 'end')).toBeCloseTo(3.55);
    expect(timeline.at('engage', 0).progress).toBe(0);
    expect(timeline.at('engage', 8)).toMatchObject({ progress: 1, active: false });
    expect(stagger(3, 0.12, 2)).toBeCloseTo(2.36);
  });
  it('handles instantaneous cues and rejects ambiguous/nonfinite timing', () => {
    expect(progressAt(2, 2, 0)).toBe(1);
    expect(progressAt(1, 2, 0)).toBe(0);
    expect(() => createChoreography([{ id: 'a', start: 0, duration: 1 }, { id: 'a', start: 1, duration: 1 }])).toThrow();
    expect(() => progressAt(NaN, 0, 1)).toThrow();
    expect(() => progressAt(0, 0, -1)).toThrow();
    expect(() => stagger(-1, 0.1)).toThrow();
    expect(() => createChoreography([]).marker('missing')).toThrow();
    expect(easing.inOutCubic(0.5)).toBe(0.5);
    expect(easing.smooth(2)).toBe(1);
  });
  it.each([10, 20, 40])('evaluates damped springs deterministically (damping %s)', damping => {
    const options = { stiffness: 100, mass: 1, damping };
    expect(springAt(-1, options)).toBe(0);
    expect(springAt(0, options)).toBe(0);
    const sample = springAt(0.4, options);
    springAt(1.2, options);
    expect(springAt(0.4, options)).toBe(sample);
    expect(springAt(10, options)).toBeCloseTo(1, 5);
    expect(() => springAt(1, { mass: 0 })).toThrow();
  });
});

describe('subject-local geometry and handoff poses', () => {
  it('keeps a label attached through translation, rotation and scale', () => {
    const local = anchorPoint({ x: 0, y: 0, width: 100, height: 40 }, 'right');
    const pose = { x: 200, y: 100, rotation: Math.PI / 2, scaleX: 2, scaleY: 2 };
    const point = transformPoint(local, pose);
    expect(point.x).toBeCloseTo(160);
    expect(point.y).toBeCloseTo(300);
    expect(connectorPath(point, { x: 400, y: 300 })).toMatch(/^M /);
    expect(interpolatePose(pose, { ...pose, x: 400 }, 0.5).x).toBe(300);
  });
  it('samples curved paths by progress rather than accumulated deltas', () => {
    const points = [{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 0 }] as const;
    expect(bezierPoint(points, 0)).toEqual(points[0]);
    expect(bezierPoint(points, 0.5)).toEqual({ x: 50, y: 75 });
    expect(bezierPoint(points, 1)).toEqual(points[3]);
  });
});
