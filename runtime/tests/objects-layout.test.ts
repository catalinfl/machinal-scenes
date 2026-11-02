import { expect, it } from 'vitest';
import { createObjectRegistry } from '../src/objects.js';
import { placeAnchoredLabel } from '../src/layout.js';
import type { FrameContext } from '../src/types.js';

const frame = (time: number) => ({time,frame:Math.round(time*30)} as FrameContext);

it('samples explicitly registered states deterministically and returns detached copies', () => {
  const registry = createObjectRegistry();
  const remove = registry.register('signal',frame => ({x:100+frame.time*50,y:80,opacity:1}));
  expect(registry.snapshot(frame(2)).signal.x).toBe(200);
  const saved = registry.snapshot(frame(2)); saved.signal.x = -1;
  registry.snapshot(frame(8));
  expect(registry.snapshot(frame(2)).signal.x).toBe(200);
  expect(() => registry.register('signal',() => ({}))).toThrow();
  remove(); expect(registry.snapshot(frame(0))).toEqual({});
  registry.register('bad',() => ({x:Infinity}));
  expect(() => registry.snapshot(frame(0))).toThrow();
});

it('places anchored labels away from obstacles and preserves supplied rectangles', () => {
  const subject = {x:100,y:100,width:100,height:60};
  const stage = {x:0,y:0,width:500,height:300};
  const placement = placeAnchoredLabel(subject,{width:80,height:30},stage,{obstacles:[{x:210,y:90,width:100,height:100}]});
  expect(placement.side).toBe('left'); expect(placement.fits).toBe(true);
  expect(subject).toEqual({x:100,y:100,width:100,height:60});
  expect(placement.anchor).toEqual({x:100,y:130});
  const blocked = placeAnchoredLabel(subject,{width:800,height:400},stage);
  expect(blocked.fits).toBe(false);
});
