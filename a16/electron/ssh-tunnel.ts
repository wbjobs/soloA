import { Client } from 'ssh2'
import { SSHConfig } from './types'
import net from 'net'

interface TunnelOptions {
  sshConfig: SSHConfig
  targetHost: string
  targetPort: number
}

interface ActiveTunnel {
  sshClient: Client
  localPort: number
  server: net.Server
}

const activeTunnels = new Map<string, ActiveTunnel>()

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, () => {
      const port = (server.address() as net.AddressInfo).port
      server.close(() => resolve(port))
    })
    server.on('error', reject)
  })
}

export async function createSSHTunnel(tunnelId: string, options: TunnelOptions): Promise<number> {
  if (activeTunnels.has(tunnelId)) {
    return activeTunnels.get(tunnelId)!.localPort
  }

  const localPort = await getFreePort()
  const { sshConfig, targetHost, targetPort } = options

  return new Promise((resolve, reject) => {
    const sshClient = new Client()
    
    const connectConfig: any = {
      host: sshConfig.host,
      port: sshConfig.port,
      username: sshConfig.username,
    }

    if (sshConfig.password) {
      connectConfig.password = sshConfig.password
    } else if (sshConfig.privateKey) {
      connectConfig.privateKey = sshConfig.privateKey
    }

    const server = net.createServer((socket) => {
      sshClient.forwardOut(
        '127.0.0.1',
        localPort,
        targetHost,
        targetPort,
        (err, stream) => {
          if (err) {
            socket.end()
            return
          }
          socket.pipe(stream).pipe(socket)
        }
      )
    })

    server.listen(localPort, '127.0.0.1', () => {
      sshClient.on('ready', () => {
        activeTunnels.set(tunnelId, { sshClient, localPort, server })
        resolve(localPort)
      })

      sshClient.on('error', (err) => {
        server.close()
        reject(err)
      })

      sshClient.connect(connectConfig)
    })

    server.on('error', reject)
  })
}

export async function closeSSHTunnel(tunnelId: string): Promise<void> {
  const tunnel = activeTunnels.get(tunnelId)
  if (tunnel) {
    return new Promise((resolve) => {
      tunnel.server.close(() => {
        tunnel.sshClient.end()
        activeTunnels.delete(tunnelId)
        resolve()
      })
    })
  }
}

export function closeAllTunnels(): Promise<void[]> {
  const ids = Array.from(activeTunnels.keys())
  return Promise.all(ids.map(id => closeSSHTunnel(id)))
}
