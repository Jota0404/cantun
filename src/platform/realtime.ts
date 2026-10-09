import { apiUrl } from './http'

// Cliente do WebSocket `/realtime` (docs/REALTIME_CONTRACT.md): uma conexão por aba,
// multiplexando tópicos. Só assina e publica presença; estado muda por `/rpc`.

export type RealtimeStatus = 'DISCONNECTED' | 'CONNECTING' | 'SUBSCRIBED' | 'RECONNECTING' | 'ERROR'
export type RealtimeErrorCode = 'forbidden' | 'session_expired'

export interface TopicHandlers {
  /** `first`: primeiro snapshot depois de um `subscribe` (entrada ou reconexão). */
  onSnapshot: (snapshot: Record<string, unknown>, first: boolean) => void
  onPresence?: (participants: unknown[]) => void
  onStatus?: (status: RealtimeStatus) => void
  /** Erro terminal do tópico: a assinatura já foi descartada. */
  onError?: (code: RealtimeErrorCode) => void
}

export interface TopicSubscription {
  setPresence(presence: Record<string, unknown>): void
  unsubscribe(): void
}

export const HEARTBEAT_MS = 25_000
export const PONG_TIMEOUT_MS = 10_000
const BACKOFF_MS = [500, 1000, 2000, 4000, 8000]
const CLOSE_NORMAL = 1000
const CLOSE_UNAUTHORIZED = 4401

interface Topic {
  handlers: TopicHandlers
  presence?: Record<string, unknown>
  awaitingFirst: boolean
}

export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]
  return Math.round(base * (0.8 + random() * 0.4))
}

export function realtimeUrl(httpUrl: string = apiUrl): string {
  return `${httpUrl.replace(/^http/, 'ws')}/realtime`
}

export class RealtimeClient {
  private socket: WebSocket | null = null
  private readonly topics = new Map<string, Topic>()
  private attempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined
  private pongTimer: ReturnType<typeof setTimeout> | undefined
  private listening = false
  private readonly url: () => string
  private readonly createSocket: (url: string) => WebSocket
  /** Injetado pelo AuthContext: 4401 significa que a sessão do cookie caiu. */
  onSessionExpired: (() => void) | null = null

  constructor(url: () => string = realtimeUrl, createSocket: (url: string) => WebSocket = (value) => new WebSocket(value)) {
    this.url = url
    this.createSocket = createSocket
  }

  subscribe(topic: string, handlers: TopicHandlers): TopicSubscription {
    const key = topic.toLowerCase()
    this.topics.set(key, { handlers, awaitingFirst: true })
    handlers.onStatus?.('CONNECTING')
    this.listen()
    if (this.isOpen()) this.sendSubscribe(key)
    else this.open()
    return {
      setPresence: (presence) => {
        const entry = this.topics.get(key)
        if (!entry || entry.handlers !== handlers) return
        entry.presence = presence
        // Fechado: vai junto com o próximo subscribe (reconexão).
        if (this.isOpen()) this.send({ type: 'presence', topic: key, ...presence })
      },
      unsubscribe: () => {
        const entry = this.topics.get(key)
        if (!entry || entry.handlers !== handlers) return
        this.topics.delete(key)
        handlers.onStatus?.('DISCONNECTED')
        if (this.isOpen()) this.send({ type: 'unsubscribe', topic: key })
        if (this.topics.size === 0) this.close()
      },
    }
  }

  private isOpen() {
    return this.socket?.readyState === WebSocket.OPEN
  }

  private send(message: Record<string, unknown>) {
    this.socket?.send(JSON.stringify(message))
  }

  private sendSubscribe(topic: string) {
    const entry = this.topics.get(topic)
    if (!entry) return
    entry.awaitingFirst = true
    this.send({ type: 'subscribe', topic })
    // O servidor processa em ordem: a presença enviada logo depois não passa à frente do subscribe.
    if (entry.presence) this.send({ type: 'presence', topic, ...entry.presence })
  }

  private open() {
    if (this.socket || this.topics.size === 0) return
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = undefined
    const socket = this.createSocket(this.url())
    this.socket = socket
    socket.onopen = () => {
      for (const topic of this.topics.keys()) this.sendSubscribe(topic)
      this.heartbeatTimer = setInterval(() => this.ping(), HEARTBEAT_MS)
    }
    socket.onmessage = (event) => this.handleMessage(event.data)
    socket.onclose = (event) => this.handleClose(socket, event.code)
  }

  private ping() {
    if (!this.isOpen()) return
    this.send({ type: 'ping' })
    if (this.pongTimer === undefined) {
      this.pongTimer = setTimeout(() => {
        this.pongTimer = undefined
        // Sem pong: trata como queda sem esperar o `close` do navegador.
        const socket = this.socket
        socket?.close()
        if (socket) this.handleClose(socket, 1006)
      }, PONG_TIMEOUT_MS)
    }
  }

  private handleMessage(data: unknown) {
    let message: Record<string, unknown>
    try {
      message = JSON.parse(String(data)) as Record<string, unknown>
    } catch {
      return
    }
    const topic = typeof message.topic === 'string' ? message.topic : ''
    const entry = this.topics.get(topic)
    switch (message.type) {
      case 'pong':
        clearTimeout(this.pongTimer)
        this.pongTimer = undefined
        return
      case 'snapshot': {
        if (!entry || !message.snapshot || typeof message.snapshot !== 'object') return
        const first = entry.awaitingFirst
        entry.awaitingFirst = false
        this.attempt = 0
        entry.handlers.onStatus?.('SUBSCRIBED')
        entry.handlers.onSnapshot(message.snapshot as Record<string, unknown>, first)
        return
      }
      case 'presence':
        if (entry && Array.isArray(message.participants)) entry.handlers.onPresence?.(message.participants)
        return
      case 'error':
        return this.handleError(topic, entry, message.code)
    }
  }

  private handleError(topic: string, entry: Topic | undefined, code: unknown) {
    if (!entry) return
    if (code === 'forbidden') {
      this.topics.delete(topic)
      entry.handlers.onStatus?.('ERROR')
      entry.handlers.onError?.('forbidden')
      if (this.topics.size === 0) this.close()
    } else if (code === 'not_subscribed') {
      this.sendSubscribe(topic)
    } else if (code === 'internal') {
      setTimeout(() => { if (this.isOpen()) this.sendSubscribe(topic) }, backoffDelay(this.attempt++))
    }
    // invalid_message, invalid_topic, too_many_topics: bug do cliente; a conexão segue.
  }

  private handleClose(socket: WebSocket, code: number) {
    if (this.socket !== socket) return
    this.detach()
    if (code === CLOSE_UNAUTHORIZED) {
      const entries = [...this.topics.values()]
      this.topics.clear()
      for (const entry of entries) {
        entry.handlers.onStatus?.('ERROR')
        entry.handlers.onError?.('session_expired')
      }
      this.onSessionExpired?.()
      return
    }
    if (this.topics.size === 0) return
    for (const entry of this.topics.values()) entry.handlers.onStatus?.('RECONNECTING')
    this.reconnectTimer = setTimeout(() => this.open(), backoffDelay(this.attempt++))
  }

  private stopHeartbeat() {
    clearInterval(this.heartbeatTimer)
    clearTimeout(this.pongTimer)
    this.heartbeatTimer = undefined
    this.pongTimer = undefined
  }

  /** Desmonta heartbeat, timer de reconexão e handlers; devolve o socket anterior. */
  private detach(): WebSocket | null {
    const socket = this.socket
    this.stopHeartbeat()
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = undefined
    this.socket = null
    if (socket) socket.onopen = socket.onmessage = socket.onclose = null
    return socket
  }

  private close() {
    this.detach()?.close(CLOSE_NORMAL)
    this.attempt = 0
  }

  /** Volta ao primeiro plano ou à rede: confirma o socket na hora, ou reconecta sem esperar o backoff. */
  private readonly wake = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    if (this.isOpen()) this.ping()
    else if (!this.socket) this.open()
  }

  private listen() {
    if (this.listening || typeof window === 'undefined') return
    this.listening = true
    window.addEventListener('online', this.wake)
    document.addEventListener('visibilitychange', this.wake)
  }
}

export const realtime = new RealtimeClient()
