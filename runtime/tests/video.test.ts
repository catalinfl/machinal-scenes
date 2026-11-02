import { describe, expect, it } from 'vitest';
import { resolveVideoEffects, videoFilter, videoLooks, videoTime } from '../src/video.js';

describe('frame-driven video', () => {
  it('maps trim, delay, speed, looping, reverse and freeze without accumulated time', () => {
    expect(videoTime(3, 10, {start:2,end:6,offset:1,playbackRate:0.5})).toBe(3);
    expect(videoTime(0, 10, {start:2,offset:1})).toBe(2);
    expect(videoTime(9, 10, {start:2,end:6,loop:true})).toBe(3);
    expect(videoTime(2, 10, {start:2,end:6,playbackRate:-1})).toBe(4);
    expect(videoTime(8, 10, {start:2,end:6,playbackRate:-1})).toBe(2);
    expect(videoTime(0, 10, {start:2,end:6,playbackRate:-1,loop:true})).toBeCloseTo(6);
    expect(videoTime(1, 10, {start:2,end:6,playbackRate:-1,loop:true})).toBe(5);
    expect(videoTime(8, 10, {start:2,playbackRate:0})).toBe(2);
    expect(videoTime(50, 10)).toBeLessThan(10);
    expect(videoTime(5, 0, {loop:true})).toBe(0);
  });

  it('allows animated overrides and clamps invalid filters without mutating presets', () => {
    expect(resolveVideoEffects('noir', {contrast:2})).toMatchObject({grayscale:1,contrast:2});
    expect(videoLooks.noir.contrast).toBe(1.45);
    const filter = videoFilter({brightness:NaN,contrast:-5,blur:Infinity,saturation:99,hue:-20});
    expect(filter).toContain('brightness(1)');
    expect(filter).toContain('contrast(0)');
    expect(filter).toContain('saturate(4)');
    expect(filter).toContain('blur(0px)');
    expect(filter).not.toMatch(/NaN|Infinity/);
  });
});
