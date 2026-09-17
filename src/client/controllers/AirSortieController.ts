import { EventBus, GameEvent } from "../../core/EventBus";
import { UnitType } from "../../core/game/Game";
import { TileRef } from "../../core/game/GameMap";
import { Controller } from "../Controller";
import { CloseViewEvent, MouseUpEvent } from "../InputHandler";
import { LaunchAirSortieIntentEvent } from "../Transport";
import { TransformHandler } from "../TransformHandler";
import { GameView, UnitView } from "../view";

export class SelectAirSortieMissionEvent implements GameEvent {
  constructor(
    public readonly platform: UnitView,
    public readonly aircraftType: UnitType.Fighter | UnitType.Bomber,
  ) {}
}

/** Two-step platform/mission controller usable by HUD and pointer flows. */
export class AirSortieController implements Controller {
  private platform: UnitView | undefined;
  private aircraftType: UnitType.Fighter | UnitType.Bomber | undefined;

  constructor(
    private readonly game: GameView,
    private readonly eventBus: EventBus,
    private readonly transformHandler: TransformHandler,
  ) {}

  init(): void {
    this.eventBus.on(SelectAirSortieMissionEvent, (event) => {
      this.selectMission(event.platform, event.aircraftType);
    });
    this.eventBus.on(MouseUpEvent, (event) => this.onMouseUp(event));
    this.eventBus.on(CloseViewEvent, () => this.cancel());
  }
  tick(): void {}

  selectMission(
    platform: UnitView,
    aircraftType: UnitType.Fighter | UnitType.Bomber,
  ): boolean {
    if (
      platform.type() !== UnitType.Airbase &&
      platform.type() !== UnitType.Carrier
    ) return false;
    if (platform.type() === UnitType.Carrier && aircraftType === UnitType.Bomber) {
      return false;
    }
    this.platform = platform;
    this.aircraftType = aircraftType;
    return true;
  }

  launch(targetTile: TileRef, targetUnitId?: number): boolean {
    if (!this.platform || !this.aircraftType || !this.platform.isActive()) return false;
    this.eventBus.emit(
      new LaunchAirSortieIntentEvent(
        this.platform.id(),
        this.aircraftType,
        targetTile,
        targetUnitId,
      ),
    );
    this.cancel();
    return true;
  }

  cancel(): void {
    this.platform = undefined;
    this.aircraftType = undefined;
  }

  private onMouseUp(event: MouseUpEvent): void {
    if (!this.platform || !this.aircraftType) return;
    const cell = this.transformHandler.screenToWorldCoordinates(event.x, event.y);
    if (!this.game.isValidCoord(cell.x, cell.y)) return;
    const targetTile = this.game.ref(cell.x, cell.y);
    const targetUnit = this.game
      .units()
      .find(
        (unit) =>
          unit.tile() === targetTile && unit.owner() !== this.game.myPlayer(),
      );
    this.launch(targetTile, targetUnit?.id());
  }
}
