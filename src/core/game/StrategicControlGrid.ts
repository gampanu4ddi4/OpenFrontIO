import {
  ControlContributor,
  ControlDomain,
  ControlRelation,
  SectorControl,
} from "./StrategicControl";

const DOMAIN_LANE: Record<ControlDomain, number> = { sea: 0, air: 1 };
const STATUS_LANE = { neutral: 0, contested: 1, controlled: 2 } as const;

/** Deterministic, integer-only strategic sector calculator. */
export class StrategicControlGrid {
  private controls = new Map<string, SectorControl>();
  private scores = new Map<string, Map<number, number>>();

  constructor(
    readonly mapWidth: number,
    readonly mapHeight: number,
    readonly sectorSize = 32,
    readonly minimumControlScore = 20,
    readonly requiredLeadBasisPoints = 12_000,
    readonly seaEligibleSectors?: ReadonlySet<number>,
  ) {}

  columns(): number {
    return Math.ceil(this.mapWidth / this.sectorSize);
  }

  rows(): number {
    return Math.ceil(this.mapHeight / this.sectorSize);
  }

  sectorIndex(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.mapWidth || y >= this.mapHeight) {
      throw new Error(`coordinate outside map: ${x},${y}`);
    }
    return Math.floor(y / this.sectorSize) * this.columns() + Math.floor(x / this.sectorSize);
  }

  recompute(contributors: readonly ControlContributor[]): SectorControl[] {
    const scores = new Map<string, Map<number, number>>();
    const ordered = [...contributors].sort(
      (a, b) => a.playerID - b.playerID || a.y - b.y || a.x - b.x || a.domain.localeCompare(b.domain),
    );
    for (const c of ordered) {
      if (!Number.isInteger(c.score) || c.score <= 0) continue;
      const centerX = Math.floor(c.x / this.sectorSize);
      const centerY = Math.floor(c.y / this.sectorSize);
      const radius = Math.max(0, Math.floor(c.radiusSectors ?? 0));
      for (let sy = Math.max(0, centerY - radius); sy <= Math.min(this.rows() - 1, centerY + radius); sy++) {
        for (let sx = Math.max(0, centerX - radius); sx <= Math.min(this.columns() - 1, centerX + radius); sx++) {
          const index = sy * this.columns() + sx;
          if (
            c.domain === "sea" &&
            this.seaEligibleSectors !== undefined &&
            !this.seaEligibleSectors.has(index)
          ) {
            continue;
          }
          const key = `${c.domain}:${index}`;
          const byPlayer = scores.get(key) ?? new Map<number, number>();
          byPlayer.set(c.playerID, (byPlayer.get(c.playerID) ?? 0) + c.score);
          scores.set(key, byPlayer);
        }
      }
    }

    const next = new Map<string, SectorControl>();
    for (const [key, byPlayer] of [...scores].sort(([a], [b]) => a.localeCompare(b))) {
      const [domain, indexText] = key.split(":") as [ControlDomain, string];
      const ranked = [...byPlayer].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
      const leader = ranked[0] ?? [0, 0];
      const runner = ranked[1] ?? [0, 0];
      let status: SectorControl["status"] = "controlled";
      if (leader[1] < this.minimumControlScore) status = "neutral";
      else if (leader[1] * 10_000 < runner[1] * this.requiredLeadBasisPoints) status = "contested";
      const control: SectorControl = {
        sectorIndex: Number(indexText),
        domain,
        leaderSmallID: leader[0],
        runnerUpSmallID: runner[0],
        leaderScore: leader[1],
        margin: leader[1] - runner[1],
        status,
      };
      next.set(key, control);
    }
    this.controls = next;
    this.scores = scores;
    return [...next.values()];
  }

  controlAt(x: number, y: number, domain: ControlDomain): SectorControl {
    const index = this.sectorIndex(x, y);
    return this.controls.get(`${domain}:${index}`) ?? {
      sectorIndex: index,
      domain,
      leaderSmallID: 0,
      runnerUpSmallID: 0,
      leaderScore: 0,
      margin: 0,
      status: "neutral",
    };
  }

  relationAt(
    x: number,
    y: number,
    domain: ControlDomain,
    viewerSmallID: number,
    isFriendly: (otherSmallID: number) => boolean,
  ): ControlRelation {
    const control = this.controlAt(x, y, domain);
    const byPlayer = this.scores.get(`${domain}:${control.sectorIndex}`);
    if (byPlayer === undefined || byPlayer.size === 0) return "neutral";

    let friendlyScore = 0;
    const hostileScores: number[] = [];
    for (const [playerID, score] of byPlayer) {
      if (playerID === viewerSmallID || isFriendly(playerID)) {
        friendlyScore += score;
      } else {
        hostileScores.push(score);
      }
    }
    hostileScores.sort((a, b) => b - a);
    const strongestHostile = hostileScores[0] ?? 0;
    if (
      friendlyScore >= this.minimumControlScore &&
      friendlyScore * 10_000 >=
        strongestHostile * this.requiredLeadBasisPoints
    ) {
      return "friendly";
    }
    const hostileRunnerUp = Math.max(friendlyScore, hostileScores[1] ?? 0);
    if (
      strongestHostile >= this.minimumControlScore &&
      strongestHostile * 10_000 >=
        hostileRunnerUp * this.requiredLeadBasisPoints
    ) {
      return "hostile";
    }
    return "contested";
  }

  pack(): Uint32Array | undefined {
    if (this.controls.size === 0) return undefined;
    const lanes: number[] = [];
    for (const c of [...this.controls.values()].sort((a, b) => a.sectorIndex - b.sectorIndex || DOMAIN_LANE[a.domain] - DOMAIN_LANE[b.domain])) {
      lanes.push(c.sectorIndex, DOMAIN_LANE[c.domain], c.leaderSmallID, c.runnerUpSmallID, c.leaderScore, c.margin, STATUS_LANE[c.status]);
    }
    return Uint32Array.from(lanes);
  }
}
