import { useSimulationStore } from '../store/simulationStore';
import { SimulationState } from '../types';

type WSHandler = (data: any) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private simId: number | null = null;
  private handlers: Map<string, WSHandler[]> = new Map();

  connect(simId: number): void {
    this.simId = simId;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws/simulation/${simId}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      useSimulationStore.getState().setWsConnected(true);
      this.send({ action: 'get_state' });
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      } catch (e) {
        console.error('Failed to parse WS message:', e);
      }
    };

    this.ws.onclose = () => {
      useSimulationStore.getState().setWsConnected(false);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      useSimulationStore.getState().setError('WebSocket 连接错误');
    };
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.simId = null;
  }

  send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private handleMessage(data: any): void {
    if (data.error) {
      useSimulationStore.getState().setError(data.error);
      return;
    }

    if (data.bodies !== undefined) {
      useSimulationStore.getState().setCurrentState(data as SimulationState);
      this.emit('state', data);
    }

    if (data.status === 'paused') {
      useSimulationStore.getState().setPaused(true);
      this.emit('paused', data);
    }

    if (data.status === 'running') {
      useSimulationStore.getState().setPaused(false);
      this.emit('running', data);
    }

    if (data.time_scale !== undefined) {
      useSimulationStore.getState().setTimeScale(data.time_scale);
      this.emit('time_scale', data);
    }
  }

  on(event: string, handler: WSHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }

  off(event: string, handler: WSHandler): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: any): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach(h => h(data));
    }
  }

  step(steps: number = 1): void {
    this.send({ action: 'step', steps });
  }

  pause(): void {
    this.send({ action: 'pause' });
  }

  resume(): void {
    this.send({ action: 'resume' });
  }

  setTimeScale(scale: number): void {
    this.send({ action: 'set_time_scale', scale });
  }
}

export const wsService = new WebSocketService();
