import { Execution, Game, Unit, UnitType } from "../game/Game";
import { WaterPathFinder } from "../pathfinding/PathFinder";
import { PathStatus } from "../pathfinding/types";


/** Movement and role combat for Submarine and Carrier without altering Warship. */
export class NavalUnitExecution implements Execution {
  private mg: Game;
  private pathfinder: WaterPathFinder;
  private lastAttackTick = -1_000_000;

  constructor(private readonly naval: Unit) {}

  init(mg: Game): void {
    this.mg = mg;
    this.pathfinder = new WaterPathFinder(mg);
  }

  tick(): void {
    if (!this.naval.isActive()) return;
    if (this.naval.type() === UnitType.Submarine) this.attackFromAmbush();
    this.moveTowardPatrol();
  }

  private attackFromAmbush(): void {
    if (
      this.mg.ticks() - this.lastAttackTick <
      this.mg.config().submarineAttackCooldown()
    ) return;
    const targets = this.mg
      .nearbyUnits(this.naval.tile(), this.mg.config().submarineAttackRange(), [
        UnitType.Carrier,
        UnitType.TradeShip,
        UnitType.TransportShip,
        UnitType.Warship,
      ])
      .filter(({ unit }) =>
        unit !== this.naval &&
        unit.isActive() &&
        this.naval.owner().canAttackPlayer(unit.owner(), true),
      )
      .sort((a, b) =>
        this.priority(a.unit) - this.priority(b.unit) ||
        a.distSquared - b.distSquared ||
        a.unit.id() - b.unit.id(),
      );
    const target = targets[0]?.unit;
    if (!target) return;
    this.lastAttackTick = this.mg.ticks();
    if (target.hasHealth()) {
      target.modifyHealth(-this.mg.config().submarineAttackDamage(), this.naval.owner());
    } else {
      target.delete(true, this.naval.owner());
    }
  }


  private priority(unit: Unit): number {
    switch (unit.type()) {
      case UnitType.Carrier: return 0;
      case UnitType.TradeShip: return 1;
      case UnitType.TransportShip: return 2;
      default: return 3;
    }
  }

  private moveTowardPatrol(): void {
    const target = this.naval.warshipState().patrolTile;
    if (target === undefined || target === this.naval.tile()) return;
    const result = this.pathfinder.next(this.naval.tile(), target);
    if (result.status === PathStatus.NEXT || result.status === PathStatus.COMPLETE) {
      this.naval.move(result.node);
    }
  }

  isActive(): boolean { return this.naval.isActive(); }
  activeDuringSpawnPhase(): boolean { return false; }
}
