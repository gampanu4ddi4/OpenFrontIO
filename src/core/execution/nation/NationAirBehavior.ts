import { Difficulty, Game, Player, Unit, UnitType } from "../../game/Game";
import { ConstructionExecution } from "../ConstructionExecution";
import { LaunchAirSortieExecution } from "../LaunchAirSortieExecution";

/** Small deterministic air doctrine for Nation players. */
export class NationAirBehavior {
  constructor(
    private readonly game: Game,
    private readonly player: Player,
  ) {}

  handleAirForce(): boolean {
    if (
      this.game.config().gameConfig().difficulty === Difficulty.Easy ||
      this.game.config().isUnitDisabled(UnitType.Airbase) ||
      this.game.config().isUnitDisabled(UnitType.Fighter)
    ) {
      return false;
    }

    const platforms = this.player
      .units(UnitType.Airbase, UnitType.Carrier)
      .filter((unit) => unit.isActive() && !unit.isUnderConstruction())
      .sort((a, b) => a.id() - b.id());
    for (const platform of platforms) {
      if (this.tryBuildAircraft(platform)) return true;
      if (this.tryLaunchFighter(platform)) return true;
      if (platform.type() === UnitType.Airbase && this.tryLaunchBomber(platform)) {
        return true;
      }
    }
    return false;
  }

  private tryBuildAircraft(platform: Unit): boolean {
    const based = this.basedAircraft(platform);
    const capacity = this.game.config().airPlatformCapacity(platform.level());
    if (based.length >= capacity) return false;

    const fighterCount = based.filter(
      (unit) => unit.type() === UnitType.Fighter,
    ).length;
    const difficulty = this.game.config().gameConfig().difficulty;
    const bomberCount = based.length - fighterCount;
    const type =
      platform.type() === UnitType.Airbase &&
      (difficulty === Difficulty.Hard || difficulty === Difficulty.Impossible) &&
      fighterCount >= 2 &&
      bomberCount === 0 &&
      !this.game.config().isUnitDisabled(UnitType.Bomber)
        ? UnitType.Bomber
        : UnitType.Fighter;

    if (this.player.canBuild(type, platform.tile()) === false) return false;
    this.game.addExecution(
      new ConstructionExecution(this.player, type, platform.tile()),
    );
    return true;
  }

  private tryLaunchFighter(platform: Unit): boolean {
    if (!this.hasSortieSlot(platform)) return false;
    const ready = this.basedAircraft(platform).find(
      (unit) =>
        unit.type() === UnitType.Fighter &&
        unit.airUnitState().state === "ready",
    );
    if (ready === undefined) return false;

    const hostileAircraft = this.game
      .nearbyUnits(
        platform.tile(),
        this.game.config().aircraftMaximumRange(),
        [UnitType.Fighter, UnitType.Bomber],
      )
      .filter(
        ({ unit }) =>
          unit.isActive() &&
          unit.airUnitState().state !== "ready" &&
          unit.airUnitState().state !== "rearming" &&
          this.player.canAttackPlayer(unit.owner(), true),
      )
      .sort((a, b) => a.distSquared - b.distSquared || a.unit.id() - b.unit.id());
    const targetTile = hostileAircraft[0]?.unit.tile() ?? platform.tile();
    this.game.addExecution(
      new LaunchAirSortieExecution(
        this.player,
        platform.id(),
        UnitType.Fighter,
        targetTile,
        hostileAircraft[0]?.unit.id(),
      ),
    );
    return true;
  }

  private tryLaunchBomber(platform: Unit): boolean {
    if (!this.hasSortieSlot(platform)) return false;
    const ready = this.basedAircraft(platform).find(
      (unit) =>
        unit.type() === UnitType.Bomber &&
        unit.airUnitState().state === "ready",
    );
    if (ready === undefined) return false;

    const target = this.bomberTarget(platform);
    if (target === undefined) return false;
    const relation = this.game.strategicControlRelationAt(
      target.tile,
      "air",
      this.player,
    );
    if (relation === "hostile") return false;

    this.game.addExecution(
      new LaunchAirSortieExecution(
        this.player,
        platform.id(),
        UnitType.Bomber,
        target.tile,
        target.unit?.id(),
      ),
    );
    return true;
  }

  private bomberTarget(platform: Unit): { tile: number; unit?: Unit } | undefined {
    const candidates = this.player
      .targets()
      .filter(
        (target) =>
          target.isAlive() && this.player.canAttackPlayer(target, true),
      )
      .sort((a, b) => a.smallID() - b.smallID());
    for (const target of candidates) {
      const structure = target
        .units([
          UnitType.Airbase,
          UnitType.SAMLauncher,
          UnitType.Port,
          UnitType.Factory,
          UnitType.City,
        ])
        .filter(
          (unit) =>
            this.game.euclideanDistSquared(platform.tile(), unit.tile()) <=
            this.game.config().aircraftMaximumRange() ** 2,
        )
        .sort((a, b) => a.id() - b.id())[0];
      if (structure !== undefined) return { tile: structure.tile(), unit: structure };
      const tile = target.borderTiles().values().next().value;
      if (
        tile !== undefined &&
        this.game.euclideanDistSquared(platform.tile(), tile) <=
          this.game.config().aircraftMaximumRange() ** 2
      ) {
        return { tile };
      }
    }
    return undefined;
  }

  private basedAircraft(platform: Unit): Unit[] {
    return this.player
      .units(UnitType.Fighter, UnitType.Bomber)
      .filter(
        (unit) =>
          unit.isActive() &&
          unit.airUnitState().platformUnitId === platform.id(),
      )
      .sort((a, b) => a.id() - b.id());
  }

  private hasSortieSlot(platform: Unit): boolean {
    const airborne = this.basedAircraft(platform).filter((unit) => {
      const state = unit.airUnitState().state;
      return state !== "ready" && state !== "rearming";
    }).length;
    return (
      airborne <
      this.game.config().airPlatformConcurrentSorties(platform.level())
    );
  }
}
