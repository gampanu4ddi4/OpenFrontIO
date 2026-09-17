import { beforeEach, describe, expect, it } from "vitest";
import { AircraftExecution } from "../src/core/execution/AircraftExecution";
import { LaunchAirSortieExecution } from "../src/core/execution/LaunchAirSortieExecution";
import { Game, Player, PlayerInfo, PlayerType, UnitType } from "../src/core/game/Game";
import { setup } from "./util/Setup";
import { executeTicks } from "./util/utils";

let game: Game;
let owner: Player;
let enemy: Player;

beforeEach(async () => {
  game = await setup(
    "half_land_half_ocean",
    { infiniteGold: true, infiniteTroops: false, instantBuild: true },
    [
      new PlayerInfo("pilot", PlayerType.Human, null, "pilot"),
      new PlayerInfo("target", PlayerType.Human, null, "target"),
    ],
  );
  owner = game.player("pilot");
  enemy = game.player("target");
  owner.conquer(game.ref(2, 2));
  enemy.conquer(game.ref(4, 2));
});

describe("air sortie lifecycle", () => {
  it("limits a platform to two concurrent sorties", () => {
    const base = owner.buildUnit(UnitType.Airbase, game.ref(2, 2), {});
    const fighters = [0, 1, 2].map(() =>
      owner.buildUnit(UnitType.Fighter, base.tile(), {
        platformUnitId: base.id(),
        targetTile: game.ref(5, 2),
      }),
    );
    for (let i = 0; i < 3; i++) {
      game.addExecution(
        new LaunchAirSortieExecution(
          owner,
          base.id(),
          UnitType.Fighter,
          game.ref(5, 2),
        ),
      );
    }
    game.executeNextTick();
    expect(fighters.map((f) => f.airUnitState().state)).toEqual([
      "outbound",
      "outbound",
      "ready",
    ]);
  });

  it("bombs once with capped troop damage, returns, rearms, and becomes ready", () => {
    const base = owner.buildUnit(UnitType.Airbase, game.ref(2, 2), {});
    const bomber = owner.buildUnit(UnitType.Bomber, base.tile(), {
      platformUnitId: base.id(),
      targetTile: game.ref(4, 2),
    });
    enemy.setTroops(1_000);
    expect(game.owner(game.ref(4, 2))).toBe(enemy);
    expect(owner.canAttackPlayer(enemy, true)).toBe(true);
    game.addExecution(
      new LaunchAirSortieExecution(
        owner,
        base.id(),
        UnitType.Bomber,
        game.ref(4, 2),
      ),
    );
    game.executeNextTick();
    executeTicks(game, 8);
    expect(bomber.airUnitState().state).toBe("rearming");
    // Base 2% damage (20) receives the configured +5% friendly-air-control
    // modifier in this tiny single-sector fixture.
    expect(enemy.troops()).toBe(979);
    executeTicks(game, game.config().bomberRearmTicks() + 1);
    expect(bomber.airUnitState().state).toBe("ready");
  });

  it("uses a SAM air cooldown without consuming the nuclear missile queue", () => {
    const base = owner.buildUnit(UnitType.Airbase, game.ref(2, 2), {});
    const fighter = owner.buildUnit(UnitType.Fighter, base.tile(), {
      platformUnitId: base.id(),
      targetTile: game.ref(4, 2),
    });
    const sam = enemy.buildUnit(UnitType.SAMLauncher, game.ref(4, 2), {});
    fighter.updateAirUnitState({
      state: "outbound",
      sortieEndTick: 100,
      targetTile: game.ref(4, 2),
    });
    game.addExecution(new AircraftExecution(fighter));
    game.executeNextTick();
    game.executeNextTick();
    expect(sam.airDefenseCooldownUntil()).toBeGreaterThan(0);
    expect(sam.missileTimerQueue()).toEqual([]);
  });
});
