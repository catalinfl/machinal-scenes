import { describe, expect, it } from 'vitest';
import { playbackFrame } from '../examples/quickstart/src/playback';

const config = { width: 1280, height: 720, fps: 30, durationInFrames: 180 };

describe('quickstart playback clock', () => {
  it('keeps frame zero when the first RAF timestamp precedes the click', () => {
    expect(playbackFrame(900, 1000, 0, config)).toBe(0);
    expect(playbackFrame(999.9, 1000, 0, config)).toBe(0);
  });

  it('does not jump backwards when resuming on an early RAF timestamp', () => {
    expect(playbackFrame(900, 1000, 60, config)).toBe(60);
    expect(playbackFrame(1000, 1000, 60, config)).toBe(60);
    expect(playbackFrame(1100, 1000, 60, config)).toBe(63);
  });

  it('advances at the configured frame rate and stops at the last frame', () => {
    expect(playbackFrame(2000, 1000, 0, config)).toBe(30);
    expect(playbackFrame(8000, 1000, 0, config)).toBe(179);
    expect(playbackFrame(8000, 1000, 60, config)).toBe(179);
  });

  it('only produces valid integer frames across supported durations and clocks', () => {
    for (const durationInFrames of [1, 2, 180, 1000]) {
      for (const fps of [24, 29.97, 30, 60]) {
        for (const startFrame of [0, durationInFrames - 1]) {
          for (const timestamp of [0, 999.9, 1000, 1001, 1234.56, 100_000]) {
            const frame = playbackFrame(timestamp, 1000, startFrame, { ...config, fps, durationInFrames });
            expect(Number.isInteger(frame)).toBe(true);
            expect(frame).toBeGreaterThanOrEqual(startFrame);
            expect(frame).toBeLessThan(durationInFrames);
          }
        }
      }
    }
  });
});
