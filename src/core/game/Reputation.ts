export type ReputationReason = "alliance_break" | "non_hostile_nuke" | "support" | "recovery";

export interface ReputationEvent {
  readonly tick: number;
  readonly reason: ReputationReason;
  readonly delta: number;
  readonly targetSmallID?: number;
}

export interface SupportSnapshot {
  readonly recipientTroops: number;
  readonly recipientGold: bigint;
  readonly incomingAttack: boolean;
}

/** Public, deterministic reputation score and anti-farming ledger. */
export class ReputationLedger {
  private score = 0;
  private events: ReputationEvent[] = [];
  private lastRecoveryTick = 0;
  private positiveEarned = 0;
  private supportTicks = new Map<number, number>();
  private nukeTicks = new Map<number, number>();

  constructor(
    private readonly recoveryTicks = 600,
    private readonly badStateThreshold = -45,
    private readonly supportCooldownTicks = 600,
    private readonly supportCap = 20,
    private readonly minimumTroops = 10_000,
    private readonly minimumGold = 25_000n,
    private readonly allianceBreakDelta = -15,
    private readonly nonHostileNukeDelta = -10,
    private readonly nukeCooldownTicks = 1_200,
  ) {}

  value(): number { return this.score; }
  isBadState(): boolean { return this.score <= this.badStateThreshold; }
  canRequestAlliance(): boolean { return !this.isBadState(); }
  tradeBasisPoints(): number { return this.isBadState() ? 9_000 : this.score >= 50 ? 10_500 : 10_000; }
  recent(limit = 5): readonly ReputationEvent[] { return this.events.slice(-limit); }

  breakAlliance(tick: number, targetSmallID: number): boolean {
    return this.apply(tick, "alliance_break", this.allianceBreakDelta, targetSmallID);
  }

  nonHostileNuke(tick: number, targetSmallID: number): boolean {
    const last = this.nukeTicks.get(targetSmallID);
    if (last !== undefined && tick - last < this.nukeCooldownTicks) return false;
    this.nukeTicks.set(targetSmallID, tick);
    return this.apply(tick, "non_hostile_nuke", this.nonHostileNukeDelta, targetSmallID);
  }

  support(
    tick: number,
    targetSmallID: number,
    kind: "troops" | "gold",
    amount: number | bigint,
    before: SupportSnapshot,
  ): boolean {
    if (!before.incomingAttack || this.positiveEarned >= this.supportCap) return false;
    const last = this.supportTicks.get(targetSmallID);
    if (last !== undefined && tick - last < this.supportCooldownTicks) return false;
    const meaningful = kind === "troops"
      ? Number(amount) >= Math.max(Math.floor(before.recipientTroops / 200), this.minimumTroops)
      : BigInt(amount) >= maxBigInt(before.recipientGold / 100n, this.minimumGold);
    if (!meaningful) return false;
    const delta = Math.min(2, this.supportCap - this.positiveEarned);
    this.supportTicks.set(targetSmallID, tick);
    this.positiveEarned += delta;
    return this.apply(tick, "support", delta, targetSmallID);
  }

  recover(tick: number): void {
    while (tick - this.lastRecoveryTick >= this.recoveryTicks) {
      this.lastRecoveryTick += this.recoveryTicks;
      if (this.score !== 0) this.apply(this.lastRecoveryTick, "recovery", this.score < 0 ? 1 : -1);
    }
  }

  private apply(tick: number, reason: ReputationReason, delta: number, targetSmallID?: number): boolean {
    const previous = this.score;
    this.score = Math.max(-100, Math.min(100, this.score + delta));
    if (this.score === previous) return false;
    this.events.push({ tick, reason, delta: this.score - previous, targetSmallID });
    return true;
  }
}

function maxBigInt(a: bigint, b: bigint): bigint { return a > b ? a : b; }
