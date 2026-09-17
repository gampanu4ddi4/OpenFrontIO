import { describe, expect, it } from "vitest";
import { StrategicControlGrid } from "../src/core/game/StrategicControlGrid";
import { StrategicControlView } from "../src/client/view/StrategicControlView";

describe("StrategicControlGrid", () => {
  it("uses deterministic sector boundaries and threshold rules", () => {
    const grid = new StrategicControlGrid(65, 33, 32, 20, 12_000);
    expect(grid.columns()).toBe(3);
    expect(grid.rows()).toBe(2);
    expect(grid.sectorIndex(31, 31)).toBe(0);
    expect(grid.sectorIndex(32, 31)).toBe(1);
    expect(grid.sectorIndex(64, 32)).toBe(5);

    grid.recompute([
      { playerID: 1, domain: "sea", x: 1, y: 1, score: 100 },
      { playerID: 2, domain: "sea", x: 1, y: 1, score: 95 },
      { playerID: 1, domain: "air", x: 40, y: 1, score: 100 },
      { playerID: 2, domain: "air", x: 40, y: 1, score: 70 },
      { playerID: 3, domain: "air", x: 64, y: 32, score: 19 },
    ]);
    expect(grid.controlAt(1, 1, "sea").status).toBe("contested");
    expect(grid.controlAt(40, 1, "air").status).toBe("controlled");
    expect(grid.controlAt(64, 32, "air").status).toBe("neutral");
  });

  it("aggregates friendly influence for viewer-specific effects", () => {
    const grid = new StrategicControlGrid(32, 32, 32, 20, 12_000);
    grid.recompute([
      { playerID: 1, domain: "air", x: 1, y: 1, score: 65 },
      { playerID: 2, domain: "air", x: 1, y: 1, score: 55 },
      { playerID: 3, domain: "air", x: 1, y: 1, score: 100 },
    ]);

    expect(
      grid.relationAt(1, 1, "air", 1, (id) => id === 2),
    ).toBe("friendly");
  });

  it("excludes sea control from land-dominated sectors", () => {
    const grid = new StrategicControlGrid(
      64,
      32,
      32,
      20,
      12_000,
      new Set([1]),
    );
    grid.recompute([
      { playerID: 1, domain: "sea", x: 1, y: 1, score: 100 },
      { playerID: 1, domain: "sea", x: 40, y: 1, score: 100 },
    ]);

    expect(grid.controlAt(1, 1, "sea").status).toBe("neutral");
    expect(grid.controlAt(40, 1, "sea").status).toBe("controlled");
  });

  it("packs seven lanes and hydrates the client cache", () => {
    const grid = new StrategicControlGrid(64, 64);
    grid.recompute([
      { playerID: 7, domain: "air", x: 2, y: 2, score: 30 },
    ]);
    const packed = grid.pack();
    expect(packed).toBeInstanceOf(Uint32Array);
    expect(packed?.length).toBe(7);
    const view = new StrategicControlView();
    view.applyPacked(packed);
    expect(view.at(0, "air")).toMatchObject({
      leaderSmallID: 7,
      leaderScore: 30,
      status: "controlled",
    });
  });
});
