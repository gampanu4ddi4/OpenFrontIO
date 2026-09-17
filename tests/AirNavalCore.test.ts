import { describe, expect, it } from "vitest";
import { Config } from "../src/core/configuration/Config";
import { GameMapSize, GameMapType, GameMode, GameType, Difficulty, UnitType } from "../src/core/game/Game";
import { bomberTroopDamage, bombingDamage } from "../src/core/game/AirNavalRules";
import { canDetectSubmarine, canInterceptAircraft } from "../src/core/game/NavalDetection";
import { LaunchAirSortieIntentSchema } from "../src/core/Schemas";

const config = new Config({
  gameMap: GameMapType.Asia,
  gameMapSize: GameMapSize.Normal,
  gameMode: GameMode.FFA,
  gameType: GameType.Singleplayer,
  difficulty: Difficulty.Medium,
  nations: "default",
  donateGold: false,
  donateTroops: false,
  bots: 0,
  infiniteGold: false,
  infiniteTroops: false,
  instantBuild: false,
  randomSpawn: false,
}, null, false);

describe("naval and air core rules", () => {
  it("detects submarines by actual integer distance with capped air-control radius", () => {
    expect(canDetectSubmarine({ x: 0, y: 0, radius: 8 }, { x: 8, y: 0 }, "neutral")).toBe(true);
    expect(canDetectSubmarine({ x: 0, y: 0, radius: 8 }, { x: 9, y: 0 }, "neutral")).toBe(false);
    expect(canDetectSubmarine({ x: 31, y: 0, radius: 8 }, { x: 32, y: 0 }, "neutral")).toBe(true);
    expect(canDetectSubmarine({ x: 0, y: 0, radius: 8 }, { x: 10, y: 0 }, "hostile")).toBe(true);
  });

  it("intercepts by patrol radius rather than sector membership", () => {
    expect(canInterceptAircraft({ x: 0, y: 0, radius: 5 }, { x: 3, y: 4 })).toBe(true);
    expect(canInterceptAircraft({ x: 0, y: 0, radius: 5 }, { x: 4, y: 4 })).toBe(false);
  });

  it("caps proportional bomber troop damage and applies control modifiers", () => {
    expect(bomberTroopDamage(1_000, 50_000)).toBe(20);
    expect(bomberTroopDamage(10_000_000, 50_000)).toBe(50_000);
    expect(bombingDamage(250, "friendly")).toBe(262);
    expect(bombingDamage(250, "hostile")).toBe(225);
  });

  it("enforces four held and two concurrent slots and validates sortie wire input", () => {
    expect(config.airPlatformCapacity(1)).toBe(4);
    expect(config.airPlatformConcurrentSorties(1)).toBe(2);
    expect(LaunchAirSortieIntentSchema.parse({
      type: "launch_air_sortie",
      platformUnitId: 1,
      aircraftType: UnitType.Fighter,
      targetTile: 2,
    })).toMatchObject({ aircraftType: UnitType.Fighter });
    expect(() => LaunchAirSortieIntentSchema.parse({
      type: "launch_air_sortie",
      platformUnitId: 1,
      aircraftType: UnitType.Carrier,
      targetTile: 2,
    })).toThrow();
  });

  it("keeps SAM air-defense cooldown independent from nuclear cooldown constants", () => {
    expect(config.samAirDefenseCooldown()).not.toBe(config.SAMCooldown());
  });
});
