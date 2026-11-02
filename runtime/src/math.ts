export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function interpolate(value: number, input: readonly [number, number], output: readonly [number, number]): number {
  if (input[1] <= input[0]) throw new Error('Interpolation input must be increasing');
  const progress = clamp((value - input[0]) / (input[1] - input[0]));
  return output[0] + (output[1] - output[0]) * progress;
}

export function easeOutCubic(progress: number): number {
  return 1 - (1 - clamp(progress)) ** 3;
}

export function seededRandom(seed: string, key: string): number {
  let hash = 2166136261;
  const input = `${seed}\0${key}`;
  for (let index = 0; index < input.length; index++) {
    hash = Math.imul(hash ^ input.charCodeAt(index), 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  return (hash >>> 0) / 4294967296;
}
