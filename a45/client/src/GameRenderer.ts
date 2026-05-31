import * as PIXI from 'pixi.js';
import { 
  Vec2, 
  vec2Add, 
  vec2Scale, 
  vec2Length, 
  EntitySnapshot,
  CommodityInventory,
  calculateCargoWeight,
  getCommodity,
  CommodityType
} from '@space-trade/shared';
import { GalaxyData, StarData, PlanetData, StationData, ClientPlayerState } from './types';

export class GameRenderer {
  private app: PIXI.Application;
  private container: HTMLElement;
  private galaxy: GalaxyData | null = null;
  private cameraOffset: Vec2 = { x: 0, y: 0 };
  private zoom: number = 1;

  private galaxyContainer: PIXI.Container;
  private starContainer: PIXI.Container;
  private planetContainer: PIXI.Container;
  private stationContainer: PIXI.Container;
  private shipContainer: PIXI.Container;

  private starSprites: Map<string, PIXI.Container> = new Map();
  private planetSprites: Map<string, PIXI.Container> = new Map();
  private stationSprites: Map<string, { container: PIXI.Container; label: PIXI.Text }> = new Map();
  private playerShips: Map<string, PIXI.Container> = new Map();
  private playerLabels: Map<string, PIXI.Text> = new Map();

  private playerState: ClientPlayerState | null = null;

  private mousePosition: Vec2 = { x: 0, y: 0 };
  private isDragging: boolean = false;
  private dragStart: Vec2 = { x: 0, y: 0 };
  private lastDragOffset: Vec2 = { x: 0, y: 0 };

  constructor(container: HTMLElement) {
    this.container = container;

    this.app = new PIXI.Application({
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: 0x0a0a1a,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true
    });

    container.appendChild(this.app.view as HTMLCanvasElement);

    this.galaxyContainer = new PIXI.Container();
    this.starContainer = new PIXI.Container();
    this.planetContainer = new PIXI.Container();
    this.stationContainer = new PIXI.Container();
    this.shipContainer = new PIXI.Container();

    this.galaxyContainer.addChild(this.starContainer);
    this.galaxyContainer.addChild(this.planetContainer);
    this.galaxyContainer.addChild(this.stationContainer);
    this.galaxyContainer.addChild(this.shipContainer);

    this.app.stage.addChild(this.galaxyContainer);

    this.setupEventListeners();
    this.createStarfield();
  }

  private setupEventListeners(): void {
    window.addEventListener('resize', () => {
      this.app.renderer.resize(window.innerWidth, window.innerHeight);
    });

    const view = this.app.view as HTMLCanvasElement;
    if (!view) return;

    view.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      this.zoom = Math.max(0.1, Math.min(3, this.zoom * delta));
      this.updateCamera();
    }, { passive: false });

    view.addEventListener('mousedown', (e) => {
      if (e.button === 0 || e.button === 2) {
        this.isDragging = true;
        this.dragStart = { x: e.clientX, y: e.clientY };
        this.lastDragOffset = { ...this.cameraOffset };
      }
    });

    view.addEventListener('mousemove', (e) => {
      this.mousePosition = { x: e.clientX, y: e.clientY };
      
      if (this.isDragging) {
        const dx = (e.clientX - this.dragStart.x) / this.zoom;
        const dy = (e.clientY - this.dragStart.y) / this.zoom;
        this.cameraOffset = {
          x: this.lastDragOffset.x + dx,
          y: this.lastDragOffset.y + dy
        };
        this.updateCamera();
      }
    });

    view.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    view.addEventListener('mouseleave', () => {
      this.isDragging = false;
    });

    view.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
  }

  private createStarfield(): void {
    const starCount = 200;
    for (let i = 0; i < starCount; i++) {
      const star = new PIXI.Graphics();
      const x = Math.random() * 4000 - 2000;
      const y = Math.random() * 4000 - 2000;
      const size = Math.random() * 2 + 0.5;
      const alpha = Math.random() * 0.5 + 0.3;
      
      star.beginFill(0xFFFFFF, alpha);
      star.drawCircle(x, y, size);
      star.endFill();
      
      this.galaxyContainer.addChildAt(star, 0);
    }
  }

  setGalaxy(galaxy: GalaxyData): void {
    this.galaxy = galaxy;
    this.clearGalaxy();
    this.createGalaxy();
    this.centerCamera();
  }

  private clearGalaxy(): void {
    this.starSprites.clear();
    this.planetSprites.clear();
    this.stationSprites.clear();
    
    while (this.starContainer.children.length > 0) {
      this.starContainer.removeChildAt(0);
    }
    
    while (this.planetContainer.children.length > 0) {
      this.planetContainer.removeChildAt(0);
    }
    
    while (this.stationContainer.children.length > 0) {
      this.stationContainer.removeChildAt(0);
    }
  }

  private createGalaxy(): void {
    if (!this.galaxy) return;

    for (const star of this.galaxy.stars) {
      this.createStar(star);
    }

    for (const planet of this.galaxy.planets) {
      this.createPlanet(planet);
    }

    for (const station of this.galaxy.stations) {
      this.createStation(station);
    }
  }

  private createStar(star: StarData): void {
    const container = new PIXI.Container();

    const glow = new PIXI.Graphics();
    glow.beginFill(star.color, 0.3);
    glow.drawCircle(0, 0, star.size * 2);
    glow.endFill();
    container.addChild(glow);

    const body = new PIXI.Graphics();
    body.beginFill(star.color);
    body.drawCircle(0, 0, star.size);
    body.endFill();
    container.addChild(body);

    const label = new PIXI.Text(star.name, {
      fontFamily: 'Arial',
      fontSize: 14,
      fill: 0xFFFFFF,
      align: 'center'
    });
    label.anchor.set(0.5);
    label.y = star.size + 20;
    container.addChild(label);

    container.x = star.position.x;
    container.y = star.position.y;

    this.starContainer.addChild(container);
    this.starSprites.set(star.id, container);
  }

  private createPlanet(planet: PlanetData): void {
    const container = new PIXI.Container();

    const body = new PIXI.Graphics();
    body.beginFill(planet.color);
    body.drawCircle(0, 0, planet.radius);
    body.endFill();
    container.addChild(body);

    const highlight = new PIXI.Graphics();
    highlight.beginFill(0xFFFFFF, 0.2);
    highlight.drawCircle(-planet.radius * 0.3, -planet.radius * 0.3, planet.radius * 0.4);
    highlight.endFill();
    container.addChild(highlight);

    container.x = planet.position.x;
    container.y = planet.position.y;

    this.planetContainer.addChild(container);
    this.planetSprites.set(planet.id, container);
  }

  private createStation(station: StationData): void {
    const container = new PIXI.Container();

    const outerRing = new PIXI.Graphics();
    outerRing.lineStyle(3, 0x4fc3f7);
    outerRing.drawCircle(0, 0, 25);
    outerRing.endFill();
    container.addChild(outerRing);

    const innerCore = new PIXI.Graphics();
    innerCore.beginFill(0x0288d1);
    innerCore.drawCircle(0, 0, 10);
    innerCore.endFill();
    container.addChild(innerCore);

    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const module = new PIXI.Graphics();
      module.beginFill(0x4fc3f7);
      module.drawRect(
        Math.cos(angle) * 20 - 5,
        Math.sin(angle) * 20 - 5,
        10,
        10
      );
      module.endFill();
      container.addChild(module);
    }

    const label = new PIXI.Text(station.name, {
      fontFamily: 'Arial',
      fontSize: 12,
      fill: 0x4fc3f7,
      align: 'center'
    });
    label.anchor.set(0.5);
    label.y = 40;
    container.addChild(label);

    container.x = station.position.x;
    container.y = station.position.y;

    this.stationContainer.addChild(container);
    this.stationSprites.set(station.id, { container, label });
  }

  createPlayerShip(playerId: string, initialState: ClientPlayerState): void {
    if (this.playerShips.has(playerId)) {
      return;
    }

    const container = new PIXI.Container();

    const body = new PIXI.Graphics();
    body.beginFill(0x4fc3f7);
    body.moveTo(20, 0);
    body.lineTo(-10, -10);
    body.lineTo(-5, 0);
    body.lineTo(-10, 10);
    body.closePath();
    body.endFill();
    container.addChild(body);

    const engine = new PIXI.Graphics();
    engine.beginFill(0xff9800, 0.5);
    engine.moveTo(-5, 0);
    engine.lineTo(-15, -5);
    engine.lineTo(-20, 0);
    engine.lineTo(-15, 5);
    engine.closePath();
    engine.endFill();
    container.addChild(engine);

    const label = new PIXI.Text('', {
      fontFamily: 'Arial',
      fontSize: 12,
      fill: 0xffffff,
      align: 'center'
    });
    label.anchor.set(0.5);
    label.y = -25;
    container.addChild(label);

    container.x = initialState.position.x;
    container.y = initialState.position.y;
    container.rotation = initialState.rotation;

    this.shipContainer.addChild(container);
    this.playerShips.set(playerId, container);
    this.playerLabels.set(playerId, label);
  }

  updatePlayerShip(playerId: string, state: ClientPlayerState): void {
    const ship = this.playerShips.get(playerId);
    if (!ship) return;

    ship.x = state.position.x;
    ship.y = state.position.y;
    ship.rotation = state.rotation;

    const label = this.playerLabels.get(playerId);
    if (label) {
      label.text = `${Math.round(state.credits)} cr`;
    }
  }

  updatePlayerState(state: ClientPlayerState): void {
    this.playerState = state;
    
    if (state.dockingStationId) {
      const station = this.stationSprites.get(state.dockingStationId);
      if (station) {
        station.label.style.fill = 0x4caf50;
      }
    }
  }

  private centerCamera(): void {
    if (!this.galaxy) return;

    if (this.playerState) {
      this.cameraOffset = {
        x: -this.playerState.position.x + window.innerWidth / 2 / this.zoom,
        y: -this.playerState.position.y + window.innerHeight / 2 / this.zoom
      };
    } else if (this.galaxy.stars.length > 0) {
      const centerX = window.innerWidth / 2 / this.zoom;
      const centerY = window.innerHeight / 2 / this.zoom;
      this.cameraOffset = { x: centerX, y: centerY };
    }

    this.updateCamera();
  }

  private updateCamera(): void {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    this.galaxyContainer.scale.set(this.zoom);
    this.galaxyContainer.x = centerX + this.cameraOffset.x * this.zoom;
    this.galaxyContainer.y = centerY + this.cameraOffset.y * this.zoom;
  }

  setCameraTarget(position: Vec2): void {
    this.cameraOffset = {
      x: -position.x + window.innerWidth / 2 / this.zoom,
      y: -position.y + window.innerHeight / 2 / this.zoom
    };
    this.updateCamera();
  }

  getStationAtPosition(screenPos: Vec2): StationData | null {
    if (!this.galaxy) return null;

    const worldPos = this.screenToWorld(screenPos);

    for (const station of this.galaxy.stations) {
      const distance = Math.sqrt(
        Math.pow(station.position.x - worldPos.x, 2) + 
        Math.pow(station.position.y - worldPos.y, 2)
      );
      if (distance < 30 / this.zoom) {
        return station;
      }
    }

    return null;
  }

  private screenToWorld(screenPos: Vec2): Vec2 {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    return {
      x: (screenPos.x - centerX) / this.zoom - this.cameraOffset.x,
      y: (screenPos.y - centerY) / this.zoom - this.cameraOffset.y
    };
  }

  getCurrentZoom(): number {
    return this.zoom;
  }

  getCameraOffset(): Vec2 {
    return { ...this.cameraOffset };
  }

  destroy(): void {
    this.app.destroy(true, { children: true });
  }
}
