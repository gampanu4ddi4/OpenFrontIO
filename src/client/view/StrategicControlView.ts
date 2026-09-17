import { ControlDomain, SectorControl } from "../../core/game/StrategicControl";

const DOMAINS: ControlDomain[] = ["sea", "air"];
const STATUSES: SectorControl["status"][] = ["neutral", "contested", "controlled"];

/** Client-side cache; unknown/missing lanes safely resolve to neutral. */
export class StrategicControlView {
  private sectors = new Map<string, SectorControl>();

  applyPacked(packed: Uint32Array | undefined): void {
    if (packed === undefined) return;
    for (let i = 0; i + 6 < packed.length; i += 7) {
      const domain = DOMAINS[packed[i + 1]];
      const status = STATUSES[packed[i + 6]];
      if (domain === undefined || status === undefined) continue;
      const control: SectorControl = {
        sectorIndex: packed[i],
        domain,
        leaderSmallID: packed[i + 2],
        runnerUpSmallID: packed[i + 3],
        leaderScore: packed[i + 4],
        margin: packed[i + 5],
        status,
      };
      this.sectors.set(`${domain}:${control.sectorIndex}`, control);
    }
  }

  at(sectorIndex: number, domain: ControlDomain): SectorControl | undefined {
    return this.sectors.get(`${domain}:${sectorIndex}`);
  }
}
