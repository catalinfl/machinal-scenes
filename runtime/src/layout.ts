import { anchorPoint, type Anchor, type Bounds, type Point } from './geometry.js';

export interface LabelPlacement {
  bounds: Bounds;
  side: Anchor;
  anchor: Point;
  fits: boolean;
  collisions: number;
}

function intersects(a: Bounds, b: Bounds): boolean {
  return a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y;
}

function validateBounds(bounds: Bounds): void {
  if (![bounds.x,bounds.y,bounds.width,bounds.height].every(Number.isFinite) || bounds.width < 0 || bounds.height < 0) throw new Error('Layout needs finite nonnegative bounds');
}

/** Deterministic candidate placement, not a DOM/physics solver or caption reflow. */
export function placeAnchoredLabel(subject: Bounds, size: { width:number; height:number }, stage: Bounds, options: { sides?: readonly Anchor[]; gap?:number; obstacles?:readonly Bounds[] } = {}): LabelPlacement {
  validateBounds(subject); validateBounds(stage); validateBounds({x:0,y:0,width:size.width,height:size.height});
  const gap = options.gap ?? 16;
  const sides = options.sides ?? ['right','left','top','bottom'];
  const obstacles = options.obstacles ?? [];
  if (!Number.isFinite(gap) || gap < 0 || !sides.length || sides.length > 5 || obstacles.length > 64) throw new Error('Invalid anchored-layout limits');
  if (sides.some(side => !['center','top','right','bottom','left'].includes(side))) throw new Error('Invalid anchored-layout side');
  obstacles.forEach(validateBounds);
  let best: LabelPlacement | undefined;
  let bestScore = Infinity;
  for (const side of sides) {
    const anchor = anchorPoint(subject,side);
    let x = anchor.x-size.width/2, y = anchor.y-size.height/2;
    if (side === 'right') x = anchor.x+gap;
    if (side === 'left') x = anchor.x-gap-size.width;
    if (side === 'top') y = anchor.y-gap-size.height;
    if (side === 'bottom') y = anchor.y+gap;
    const bounds = {x,y,width:size.width,height:size.height};
    const inside = x >= stage.x && y >= stage.y && x+size.width <= stage.x+stage.width && y+size.height <= stage.y+stage.height;
    const collisions = obstacles.filter(obstacle => intersects(bounds,obstacle)).length + Number(side !== 'center' && intersects(bounds,subject));
    const candidate = { bounds,side,anchor,fits:inside && collisions === 0,collisions };
    const score = collisions+(inside ? 0 : 1000);
    if (score < bestScore) { best = candidate; bestScore = score; }
    if (candidate.fits) break;
  }
  return best!;
}
