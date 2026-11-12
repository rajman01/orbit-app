/**
 * Momentum projection (Apple, "Designing Fluid Interfaces").
 * Returns how far a flick will travel (px) given release velocity in px/s.
 */
export function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Pick the snap point nearest to where the gesture is heading. */
export function nearestSnap(current: number, velocity: number, snapPoints: number[]): number {
  const projected = current + project(velocity);
  return snapPoints.reduce((best, p) => (Math.abs(p - projected) < Math.abs(best - projected) ? p : best));
}
