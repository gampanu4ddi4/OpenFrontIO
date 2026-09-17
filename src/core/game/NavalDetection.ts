import { applyBasisPoints, ControlRelation } from "./StrategicControl";

export function squaredDistance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** Submarine visibility is based on real distance, never sector membership. */
export function canDetectSubmarine(
  observer: { x: number; y: number; radius: number },
  submarine: { x: number; y: number },
  airControl: ControlRelation,
  maximumDetectionBasisPoints = 12_500,
): boolean {
  const radius = airControl === "hostile"
    ? applyBasisPoints(observer.radius, maximumDetectionBasisPoints)
    : observer.radius;
  return squaredDistance(observer.x, observer.y, submarine.x, submarine.y) <= radius * radius;
}

/** Fighter interception also uses real distance around the patrol center. */
export function canInterceptAircraft(
  patrol: { x: number; y: number; radius: number },
  target: { x: number; y: number },
): boolean {
  return squaredDistance(patrol.x, patrol.y, target.x, target.y) <= patrol.radius * patrol.radius;
}
