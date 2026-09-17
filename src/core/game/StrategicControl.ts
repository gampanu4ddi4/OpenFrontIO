export type ControlDomain = "sea" | "air";
export type ControlStatus = "controlled" | "contested" | "neutral";

export interface ControlContributor {
  readonly playerID: number;
  readonly domain: ControlDomain;
  readonly x: number;
  readonly y: number;
  readonly score: number;
  readonly radiusSectors?: number;
}

export interface SectorControl {
  readonly sectorIndex: number;
  readonly domain: ControlDomain;
  readonly leaderSmallID: number;
  readonly runnerUpSmallID: number;
  readonly leaderScore: number;
  readonly margin: number;
  readonly status: ControlStatus;
}

export type ControlRelation = "friendly" | "hostile" | "contested" | "neutral";

export function applyBasisPoints(value: number, basisPoints: number): number {
  return Math.floor((value * basisPoints) / 10_000);
}
