import { vec2Length } from '@space-trade/shared';
import { ClientPhysics } from './ClientPhysics';
import { NetworkClient, NetworkStats } from './NetworkClient';

export interface DebugInfo {
  positionError: number;
  positionErrorAvg: number;
  correctionStrength: number;
  pendingInputCount: number;
  speed: number;
  networkStats: NetworkStats;
  lastSnapshotSequence: number;
  inputSequence: number;
}

export class DebugOverlay {
  private container: HTMLDivElement | null = null;
  private info: DebugInfo;
  private visible: boolean = false;
  private networkClient: NetworkClient | null = null;

  constructor() {
    this.info = {
      positionError: 0,
      positionErrorAvg: 0,
      correctionStrength: 0,
      pendingInputCount: 0,
      speed: 0,
      networkStats: {
        lastPing: 0,
        averagePing: 0,
        packetLossEstimate: 0,
        consecutiveLost: 0,
        recoveredSnapshots: 0
      },
      lastSnapshotSequence: 0,
      inputSequence: 0
    };
    this.createContainer();
    this.setupKeyBinding();
  }

  private createContainer(): void {
    this.container = document.createElement('div');
    this.container.id = 'debug-overlay';
    this.container.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.8);
      color: #00ff00;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 12px;
      padding: 12px;
      border-radius: 6px;
      border: 1px solid #00ff00;
      z-index: 1000;
      min-width: 220px;
      pointer-events: none;
      user-select: none;
      display: none;
    `;
    document.body.appendChild(this.container);
  }

  private setupKeyBinding(): void {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  setNetworkClient(client: NetworkClient): void {
    this.networkClient = client;
  }

  toggle(): void {
    this.visible = !this.visible;
    if (this.container) {
      this.container.style.display = this.visible ? 'block' : 'none';
    }
  }

  update(
    playerVelocity: { x: number; y: number },
    lastSnapshotSequence: number,
    correctionStrength: number = 0
  ): void {
    this.info.speed = vec2Length(playerVelocity);
    this.info.positionError = ClientPhysics.getLastError();
    this.info.positionErrorAvg = ClientPhysics.getAverageError();
    this.info.correctionStrength = correctionStrength;
    this.info.lastSnapshotSequence = lastSnapshotSequence;
    
    if (this.networkClient) {
      this.info.networkStats = this.networkClient.getNetworkStats();
      this.info.pendingInputCount = this.networkClient.getPendingInputs().length;
      this.info.inputSequence = this.networkClient.getInputSequence();
    }

    this.render();
  }

  private render(): void {
    if (!this.container || !this.visible) return;

    const errorColor = this.getErrorColor(this.info.positionError);
    const pingColor = this.info.networkStats.averagePing > 150 ? '#ff6666' : '#00ff00';
    const lossColor = this.info.networkStats.packetLossEstimate > 0.05 ? '#ff6666' : '#00ff00';

    this.container.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid #333; padding-bottom: 4px;">
        DEBUG [F3 to toggle]
      </div>
      
      <div style="margin-bottom: 6px;">
        <span style="color: #aaa;">Position Error:</span> 
        <span style="color: ${errorColor};">${this.info.positionError.toFixed(2)}px</span>
      </div>
      <div style="margin-bottom: 6px;">
        <span style="color: #aaa;">Avg Error:</span> 
        <span style="color: ${this.getErrorColor(this.info.positionErrorAvg)};">${this.info.positionErrorAvg.toFixed(2)}px</span>
      </div>
      <div style="margin-bottom: 6px;">
        <span style="color: #aaa;">Correction:</span> 
        <span>${(this.info.correctionStrength * 100).toFixed(0)}%</span>
      </div>
      
      <div style="border-top: 1px solid #333; margin: 8px 0; padding-top: 8px;"></div>
      
      <div style="margin-bottom: 6px;">
        <span style="color: #aaa;">Speed:</span> 
        <span>${this.info.speed.toFixed(1)} px/s</span>
      </div>
      <div style="margin-bottom: 6px;">
        <span style="color: #aaa;">Pending Inputs:</span> 
        <span>${this.info.pendingInputCount}</span>
      </div>
      
      <div style="border-top: 1px solid #333; margin: 8px 0; padding-top: 8px;"></div>
      
      <div style="margin-bottom: 6px;">
        <span style="color: #aaa;">Ping:</span> 
        <span style="color: ${pingColor};">${this.info.networkStats.lastPing.toFixed(0)}ms</span>
        <span style="color: #666;"> (avg: ${this.info.networkStats.averagePing.toFixed(0)}ms)</span>
      </div>
      <div style="margin-bottom: 6px;">
        <span style="color: #aaa;">Loss:</span> 
        <span style="color: ${lossColor};">${(this.info.networkStats.packetLossEstimate * 100).toFixed(1)}%</span>
      </div>
      <div style="margin-bottom: 6px;">
        <span style="color: #aaa;">Snapshot Seq:</span> 
        <span>${this.info.lastSnapshotSequence}</span>
      </div>
      <div>
        <span style="color: #aaa;">Input Seq:</span> 
        <span>${this.info.inputSequence}</span>
      </div>
    `;
  }

  private getErrorColor(error: number): string {
    if (error < 10) return '#00ff00';
    if (error < 30) return '#ffff00';
    if (error < 60) return '#ff9900';
    return '#ff3333';
  }

  isVisible(): boolean {
    return this.visible;
  }
}
