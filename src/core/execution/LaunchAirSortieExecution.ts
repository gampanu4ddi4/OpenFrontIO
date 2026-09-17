import { Execution, Game, Player, Unit, UnitType } from "../game/Game";
import { TileRef } from "../game/GameMap";
import { AircraftExecution } from "./AircraftExecution";

export class LaunchAirSortieExecution implements Execution {
  private active = true;
  private game: Game;
  private aircraftToStart: Unit | undefined;

  constructor(
    private readonly owner: Player,
    private readonly platformUnitId: number,
    private readonly aircraftType: UnitType.Fighter | UnitType.Bomber,
    private readonly targetTile: TileRef,
    private readonly targetUnitId?: number,
  ) {}

  init(mg: Game): void {
    this.game = mg;
    if (!mg.isValidRef(this.targetTile)) {
      this.active = false;
      return;
    }
    const platform = mg.unit(this.platformUnitId);
    if (
      !platform?.isActive() ||
      platform.owner() !== this.owner ||
      platform.isUnderConstruction() ||
      (platform.type() !== UnitType.Airbase &&
        platform.type() !== UnitType.Carrier) ||
      (platform.type() === UnitType.Carrier &&
        this.aircraftType === UnitType.Bomber)
    ) {
      this.active = false;
      return;
    }
    if (
      mg.euclideanDistSquared(platform.tile(), this.targetTile) >
      mg.config().aircraftMaximumRange() ** 2
    ) {
      this.active = false;
      return;
    }

    const based = this.owner
      .units(UnitType.Fighter, UnitType.Bomber)
      .filter((unit) => unit.airUnitState().platformUnitId === platform.id());
    const airborne = based.filter((unit) => {
      const state = unit.airUnitState().state;
      return state !== "ready" && state !== "rearming";
    }).length;
    if (
      airborne >= mg.config().airPlatformConcurrentSorties(platform.level())
    ) {
      this.active = false;
      return;
    }

    const aircraft = based
      .filter(
        (unit) =>
          unit.type() === this.aircraftType &&
          unit.airUnitState().state === "ready",
      )
      .sort((a, b) => a.id() - b.id())[0];
    if (!aircraft) {
      this.active = false;
      return;
    }
    aircraft.move(platform.tile());
    aircraft.updateAirUnitState({
      state: "outbound",
      sortieEndTick: mg.ticks() + mg.config().aircraftSortieTicks(),
      targetTile: this.targetTile,
      targetUnitId: this.targetUnitId,
      rearmUntilTick: undefined,
    });

    // GameImpl drains pending executions while calling init(). Adding the child
    // here would be overwritten by that drain. Start it from our first tick.
    this.aircraftToStart = aircraft;
  }

  tick(): void {
    if (this.aircraftToStart !== undefined) {
      this.game.addExecution(new AircraftExecution(this.aircraftToStart));
      this.aircraftToStart = undefined;
    }
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
