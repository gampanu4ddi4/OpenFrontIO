import { Execution, Game, Player, Structures, Unit, UnitType } from "../game/Game";
import { TileRef } from "../game/GameMap";
import { bomberTroopDamage, bombingDamage, fighterRearmTicks } from "../game/AirNavalRules";
import { canInterceptAircraft } from "../game/NavalDetection";

/** Deterministic outbound, mission, return and rearm lifecycle for one aircraft. */
export class AircraftExecution implements Execution {
  private mg: Game;
  private lastFighterAttack = -1_000_000;
  private strikeApplied = false;
  private motionPlanId = 0;
  private motionPlanTarget: TileRef | undefined;

  constructor(private readonly aircraft: Unit) {}

  init(mg: Game): void {
    this.mg = mg;
    this.motionPlanId = mg.ticks();
    const target = this.aircraft.airUnitState().targetTile;
    if (target !== undefined) this.recordMotionPlan(target);
  }

  tick(): void {
    if (!this.aircraft.isActive()) return;
    const state = this.aircraft.airUnitState();
    if (state.state === "ready") return;
    if (state.state === "rearming") {
      if ((state.rearmUntilTick ?? 0) <= this.mg.ticks()) {
        this.aircraft.updateAirUnitState({ state: "ready", rearmUntilTick: undefined });
      }
      return;
    }
    if (this.applySamDefense()) return;
    if (state.state === "outbound") this.flyOutbound();
    else if (state.state === "patrolling") this.patrol();
    else if (state.state === "attacking") this.strike();
    else if (state.state === "returning") this.returnToPlatform();
  }

  private flyOutbound(): void {
    const target = this.aircraft.airUnitState().targetTile;
    if (target === undefined || this.mg.ticks() >= this.aircraft.airUnitState().sortieEndTick) {
      this.beginReturn();
      return;
    }
    if (!this.moveOneStep(target)) {
      this.aircraft.updateAirUnitState({
        state: this.aircraft.type() === UnitType.Fighter ? "patrolling" : "attacking",
      });
    }
  }

  private patrol(): void {
    if (this.mg.ticks() >= this.aircraft.airUnitState().sortieEndTick) {
      this.beginReturn();
      return;
    }
    const radius = this.mg.config().fighterInterceptionRadius();
    const target = this.mg
      .nearbyUnits(this.aircraft.tile(), radius, [UnitType.Fighter, UnitType.Bomber])
      .filter(({ unit }) =>
        unit !== this.aircraft &&
        unit.isActive() &&
        unit.airUnitState().state !== "ready" &&
        unit.airUnitState().state !== "rearming" &&
        this.aircraft.owner().canAttackPlayer(unit.owner(), true) &&
        canInterceptAircraft(
          { x: this.mg.x(this.aircraft.tile()), y: this.mg.y(this.aircraft.tile()), radius },
          { x: this.mg.x(unit.tile()), y: this.mg.y(unit.tile()) },
        ),
      )
      .sort((a, b) => a.distSquared - b.distSquared || a.unit.id() - b.unit.id())[0]?.unit;
    if (target && this.mg.ticks() - this.lastFighterAttack >= 10) {
      this.lastFighterAttack = this.mg.ticks();
      target.modifyHealth(-(this.aircraft.info().damage ?? 0), this.aircraft.owner());
    }
  }

  private strike(): void {
    if (!this.strikeApplied) {
      this.strikeApplied = true;
      const state = this.aircraft.airUnitState();
      const targetUnit = state.targetUnitId === undefined ? undefined : this.mg.unit(state.targetUnitId);
      if (
        targetUnit?.isActive() &&
        Structures.has(targetUnit.type()) &&
        targetUnit.tile() === this.aircraft.tile() &&
        this.aircraft.owner().canAttackPlayer(targetUnit.owner(), true)
      ) {
        const relation = this.mg.strategicControlRelationAt(targetUnit.tile(), "air", this.aircraft.owner());
        targetUnit.modifyHealth(
          -bombingDamage(this.mg.config().bomberStructureDamage(), relation),
          this.aircraft.owner(),
        );
      } else if (state.targetTile !== undefined && this.mg.hasOwner(state.targetTile)) {
        const owner = this.mg.owner(state.targetTile);
        if (owner.isPlayer() && this.aircraft.owner().canAttackPlayer(owner, true)) {
          const relation = this.mg.strategicControlRelationAt(state.targetTile, "air", this.aircraft.owner());
          const base = bomberTroopDamage(owner.troops(), this.mg.config().bomberTroopDamageCap());
          owner.removeTroops(bombingDamage(base, relation));
        }
      }
    }
    this.beginReturn();
  }

  private beginReturn(): void {
    this.aircraft.updateAirUnitState({ state: "returning" });
  }

  private returnToPlatform(): void {
    const platform = this.findReturnPlatform();
    if (!platform) {
      this.aircraft.delete();
      return;
    }
    if (this.aircraft.airUnitState().platformUnitId !== platform.id()) {
      this.aircraft.updateAirUnitState({ platformUnitId: platform.id() });
    }
    if (this.motionPlanTarget !== platform.tile()) {
      this.recordMotionPlan(platform.tile());
    }
    if (!this.moveOneStep(platform.tile())) {
      const relation = this.mg.strategicControlRelationAt(platform.tile(), "air", this.aircraft.owner());
      const base = this.aircraft.type() === UnitType.Fighter
        ? this.mg.config().fighterRearmTicks()
        : this.mg.config().bomberRearmTicks();
      const rearm = this.aircraft.type() === UnitType.Fighter
        ? fighterRearmTicks(base, relation)
        : base;
      this.aircraft.updateAirUnitState({
        state: "rearming",
        rearmUntilTick: this.mg.ticks() + rearm,
        targetTile: undefined,
        targetUnitId: undefined,
      });
    }
  }

  private findReturnPlatform(): Unit | undefined {
    const preferred = this.mg.unit(this.aircraft.airUnitState().platformUnitId);
    if (this.validPlatform(preferred)) return preferred;
    return this.aircraft.owner().units([UnitType.Airbase, UnitType.Carrier])
      .filter((u) => this.validPlatform(u))
      .sort((a, b) =>
        this.mg.euclideanDistSquared(this.aircraft.tile(), a.tile()) -
          this.mg.euclideanDistSquared(this.aircraft.tile(), b.tile()) || a.id() - b.id(),
      )[0];
  }

  private validPlatform(unit: Unit | undefined): unit is Unit {
    if (
      unit === undefined ||
      !unit.isActive() ||
      unit.isUnderConstruction() ||
      unit.owner() !== this.aircraft.owner() ||
      (unit.type() !== UnitType.Airbase &&
        (unit.type() !== UnitType.Carrier ||
          this.aircraft.type() !== UnitType.Fighter))
    ) {
      return false;
    }
    const held = this.aircraft
      .owner()
      .units(UnitType.Fighter, UnitType.Bomber)
      .filter(
        (aircraft) =>
          aircraft.isActive() &&
          aircraft.airUnitState().platformUnitId === unit.id(),
      ).length;
    const capacity = this.mg.config().airPlatformCapacity(unit.level());
    return this.aircraft.airUnitState().platformUnitId === unit.id()
      ? held <= capacity
      : held < capacity;
  }

  private applySamDefense(): boolean {
    const sam = this.mg
      .nearbyUnits(this.aircraft.tile(), 100, UnitType.SAMLauncher)
      .filter(({ unit }) =>
        unit.isActive() &&
        unit.airDefenseCooldownUntil() <= this.mg.ticks() &&
        unit.owner().canAttackPlayer(this.aircraft.owner(), true) &&
        this.mg.euclideanDistSquared(unit.tile(), this.aircraft.tile()) <=
          this.mg.config().samAirDefenseRange(unit.level()) ** 2,
      )
      .sort((a, b) => a.distSquared - b.distSquared || a.unit.id() - b.unit.id())[0]?.unit;
    if (!sam) return false;
    sam.setAirDefenseCooldownUntil(this.mg.ticks() + this.mg.config().samAirDefenseCooldown());
    this.aircraft.modifyHealth(-this.mg.config().samAirDefenseDamage(), sam.owner());
    return !this.aircraft.isActive();
  }

  private moveOneStep(target: TileRef): boolean {
    if (this.aircraft.tile() === target) return false;
    const x = this.mg.x(this.aircraft.tile());
    const y = this.mg.y(this.aircraft.tile());
    const tx = this.mg.x(target);
    const ty = this.mg.y(target);
    const next = this.mg.ref(x + Math.sign(tx - x), y + Math.sign(ty - y));
    this.aircraft.move(next);
    return next !== target;
  }

  private recordMotionPlan(target: TileRef): void {
    const path: TileRef[] = [this.aircraft.tile()];
    let x = this.mg.x(this.aircraft.tile());
    let y = this.mg.y(this.aircraft.tile());
    const tx = this.mg.x(target);
    const ty = this.mg.y(target);
    while (x !== tx || y !== ty) {
      x += Math.sign(tx - x);
      y += Math.sign(ty - y);
      path.push(this.mg.ref(x, y));
    }
    this.motionPlanId++;
    this.motionPlanTarget = target;
    this.mg.recordMotionPlan({
      kind: "grid",
      unitId: this.aircraft.id(),
      planId: this.motionPlanId,
      startTick: this.mg.ticks() + 1,
      ticksPerStep: 1,
      path,
    });
  }

  isActive(): boolean {
    return (
      this.aircraft.isActive() &&
      this.aircraft.airUnitState().state !== "ready"
    );
  }
  activeDuringSpawnPhase(): boolean { return false; }
}
