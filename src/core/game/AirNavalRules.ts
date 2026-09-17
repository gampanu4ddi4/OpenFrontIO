import { applyBasisPoints, ControlRelation } from "./StrategicControl";

export const AIR_PLATFORM_CAPACITY = 4;
export const AIR_PLATFORM_CONCURRENT_SORTIES = 2;

export function bomberTroopDamage(troops: number, fixedCap: number): number {
  return Math.min(Math.floor((troops * 2) / 100), fixedCap);
}

export function bombingDamage(baseDamage: number, relation: ControlRelation): number {
  if (relation === "friendly") return applyBasisPoints(baseDamage, 10_500);
  if (relation === "hostile") return applyBasisPoints(baseDamage, 9_000);
  return baseDamage;
}

export function fighterRearmTicks(baseTicks: number, relation: ControlRelation): number {
  return relation === "friendly" ? applyBasisPoints(baseTicks, 9_500) : baseTicks;
}

export function transportMoveProgress(relation: ControlRelation): number {
  return relation === "friendly" ? 10_800 : 10_000;
}
