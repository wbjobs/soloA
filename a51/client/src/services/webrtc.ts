import { SignalingService } from './signaling';

interface PeerConnection {
  pc: RTCPeerConnection;
  dataChannel?: RTCDataChannel;
}

type WebRTCEventMap = {
  peerConnected: [string];
  peerDisconnected: [string];
  data: [string, string];
};

type Listener<K extends keyof WebRTCEventMap> = (...args: WebRTCEventMap[K]) => void;

export class WebRTCService {
  private peers: Map<string, PeerConnection> = new Map();
  private signaling: SignalingService;
  private localUserId: string = '';
  private iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  private listeners: Map<string, Set<Function>> = new Map();

  constructor(signaling: SignalingService) {
    this.signaling = signaling;
    this.setupSignalingHandlers();
  }

  on<K extends keyof WebRTCEventMap>(
    event: K,
    listener: Listener<K>
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return () => this.listeners.get(event)?.delete(listener);
  }

  private emit<K extends keyof WebRTCEventMap>(
    event: K,
    ...args: WebRTCEventMap[K]
  ): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const listener of set) {
        (listener as Function)(...args);
      }
    }
  }

  setLocalUserId(userId: string): void {
    this.localUserId = userId;
  }

  private setupSignalingHandlers(): void {
    this.signaling.on('message', (msg) => {
      if (msg.type === 'rtc-offer' && 'fromUserId' in msg && msg.fromUserId) {
        this.handleOffer(msg.fromUserId, msg.offer);
      } else if (msg.type === 'rtc-answer' && 'fromUserId' in msg && msg.fromUserId) {
        this.handleAnswer(msg.fromUserId, msg.answer);
      } else if (msg.type === 'rtc-candidate' && 'fromUserId' in msg && msg.fromUserId) {
        this.handleCandidate(msg.fromUserId, msg.candidate);
      }
    });
  }

  async createPeer(remoteUserId: string, initiator: boolean): Promise<void> {
    if (this.peers.has(remoteUserId)) return;

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const peer: PeerConnection = { pc };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.signaling.sendCandidate(remoteUserId, event.candidate);
      }
    };

    pc.ondatachannel = (event) => {
      peer.dataChannel = event.channel;
      this.setupDataChannel(remoteUserId, event.channel);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        this.emit('peerConnected', remoteUserId);
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.emit('peerDisconnected', remoteUserId);
        this.peers.delete(remoteUserId);
      }
    };

    if (initiator) {
      const dc = pc.createDataChannel('terminal');
      peer.dataChannel = dc;
      this.setupDataChannel(remoteUserId, dc);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.signaling.sendOffer(remoteUserId, offer);
    }

    this.peers.set(remoteUserId, peer);
  }

  private async handleOffer(fromUserId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    let peer = this.peers.get(fromUserId);
    if (!peer) {
      const pc = new RTCPeerConnection({ iceServers: this.iceServers });
      peer = { pc };
      this.peers.set(fromUserId, peer);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.signaling.sendCandidate(fromUserId, event.candidate);
        }
      };

      pc.ondatachannel = (event) => {
        peer!.dataChannel = event.channel;
        this.setupDataChannel(fromUserId, event.channel);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          this.emit('peerConnected', fromUserId);
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          this.emit('peerDisconnected', fromUserId);
          this.peers.delete(fromUserId);
        }
      };
    }

    await peer.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answer);
    this.signaling.sendAnswer(fromUserId, answer);
  }

  private async handleAnswer(fromUserId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const peer = this.peers.get(fromUserId);
    if (peer) {
      await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }

  private async handleCandidate(fromUserId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const peer = this.peers.get(fromUserId);
    if (peer) {
      await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  private setupDataChannel(peerId: string, dc: RTCDataChannel): void {
    dc.onmessage = (event) => {
      try {
        const data = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
        this.emit('data', peerId, data);
      } catch (err) {
        console.error('Failed to parse data:', err);
      }
    };
  }

  broadcastData(data: string): void {
    for (const [peerId, peer] of this.peers) {
      if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
        try {
          peer.dataChannel.send(data);
        } catch (err) {
          console.error(`Failed to send to ${peerId}:`, err);
        }
      }
    }
  }

  sendToPeer(peerId: string, data: string): void {
    const peer = this.peers.get(peerId);
    if (peer && peer.dataChannel && peer.dataChannel.readyState === 'open') {
      peer.dataChannel.send(data);
    }
  }

  disconnectAll(): void {
    for (const [, peer] of this.peers) {
      peer.dataChannel?.close();
      peer.pc.close();
    }
    this.peers.clear();
  }
}
