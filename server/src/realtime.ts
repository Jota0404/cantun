// Tempo real do Modo Palco (docs/REALTIME_CONTRACT.md, ADR-059 §6).
// O servidor só repassa o que vem do banco (snapshot lido com a identidade de cada
// assinante) e a presença, que fica em memória. Mutação continua só por /rpc.
import websocket from '@fastify/websocket'
import type { FastifyInstance } from 'fastify'
import pg from 'pg'
import type { WebSocket } from 'ws'
import { SESSION_COOKIE, tokenHash, userIdForSessionHash } from './auth.ts'
import type { Pool } from './db.ts'
import { asUser, HttpError } from './db.ts'

export interface RealtimeOptions {
  /** Sem mensagem do cliente por este tempo, o servidor encerra a conexão. */
  idleTimeoutMs: number
  /** Revalidação de sessão e de cada tópico assinado. */
  revalidateMs: number
  /** `select 1` na conexão de LISTEN. */
  listenerHealthMs: number
  listenerBackoffMinMs: number
  listenerBackoffMaxMs: number
}

const DEFAULTS: RealtimeOptions = {
  idleTimeoutMs: 60_000,
  revalidateMs: 60_000,
  listenerHealthMs: 30_000,
  listenerBackoffMinMs: 1_000,
  listenerBackoffMaxMs: 30_000,
}

const MAX_PAYLOAD = 4096
const MAX_TOPICS = 4
const MAX_CONNECTIONS_PER_USER = 10
const RATE_WINDOW_MS = 10_000
const RATE_MAX = 30
const CHANNEL = 'stage_state_changed'
const TOPIC = /^stage-session:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/
// Valores de team_musical_functions_musical_function_check (0001_baseline.sql).
const MUSICAL_ROLES = new Set(['vocals', 'electric-guitar', 'acoustic-guitar', 'bass', 'drums', 'keys', 'piano', 'strings', 'brass', 'woodwinds', 'other'])

interface Presence {
  userId: string
  displayName: string
  musicalRole: string
  readiness: 'ready' | 'waiting'
  seq: number
}

interface Subscription {
  lastRevision: number
  presence?: Presence
}

interface Conn {
  socket: WebSocket
  userId: string
  tokenHash: Buffer
  displayName: string
  subs: Map<string, Subscription>
  queue: Promise<void>
  windowStart: number
  windowCount: number
}

type ErrorCode = 'invalid_message' | 'invalid_topic' | 'forbidden' | 'too_many_topics' | 'not_subscribed' | 'internal'

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  invalid_message: 'mensagem inválida',
  invalid_topic: 'tópico inválido',
  forbidden: 'acesso negado',
  too_many_topics: 'tópicos demais nesta conexão',
  not_subscribed: 'tópico não assinado',
  internal: 'erro interno',
}

/**
 * Nome exibido na presença, sempre derivado da sessão (contrato §5): até o B2 criar
 * `display_name`, é o prefixo do e-mail, visível só para membros da mesma organização.
 * `null` quando o usuário não existe mais.
 */
export async function displayNameFor(pool: Pool, userId: string): Promise<string | null> {
  const { rows } = await pool.query<{ email: string }>('select email from app.users where id = $1', [userId])
  return rows[0] ? rows[0].email.split('@')[0].slice(0, 80) : null
}

function isAccessError(error: unknown): boolean {
  const code = (error as { code?: unknown }).code
  return code === 'P0001' || code === '42501'
}

export async function realtimeRoutes(app: FastifyInstance, { pool, appOrigin, options }: { pool: Pool; appOrigin: string; options?: Partial<RealtimeOptions> }) {
  const opts = { ...DEFAULTS, ...options }
  const topics = new Map<string, Set<Conn>>()
  const connsByUser = new Map<string, Set<Conn>>()
  let presenceSeq = 0
  let closing = false

  const send = (conn: Conn, message: object) => {
    if (conn.socket.readyState === conn.socket.OPEN) conn.socket.send(JSON.stringify(message))
  }
  const sendError = (conn: Conn, code: ErrorCode, topic?: string) =>
    send(conn, { type: 'error', code, message: ERROR_MESSAGES[code], ...(topic ? { topic } : {}) })

  /** Mensagens e entregas de uma conexão rodam em ordem, uma por vez (contrato §1). */
  const enqueue = (conn: Conn, task: () => Promise<void>) => {
    // Depois do fechamento, nada mais roda: evita registrar assinatura de conexão morta.
    conn.queue = conn.queue.then(() => (conn.socket.readyState === conn.socket.OPEN ? task() : undefined)).catch((error: unknown) => {
      app.log.error({ err: { code: (error as { code?: string }).code, message: (error as Error).message }, userId: conn.userId }, 'realtime: falha')
      sendError(conn, 'internal')
    })
  }

  function participants(topic: string) {
    const byUser = new Map<string, Presence>()
    for (const conn of topics.get(topic) ?? []) {
      const presence = conn.subs.get(topic)?.presence
      const current = presence && byUser.get(presence.userId)
      if (presence && (!current || current.seq < presence.seq)) byUser.set(presence.userId, presence)
    }
    return [...byUser.values()].map(({ userId, displayName, musicalRole, readiness }) => ({ userId, displayName, musicalRole, readiness }))
  }

  function broadcastPresence(topic: string) {
    const message = { type: 'presence', topic, participants: participants(topic) }
    for (const conn of topics.get(topic) ?? []) send(conn, message)
  }

  function dropSubscription(conn: Conn, topic: string) {
    const sub = conn.subs.get(topic)
    if (!sub) return
    conn.subs.delete(topic)
    const set = topics.get(topic)
    set?.delete(conn)
    if (set?.size === 0) topics.delete(topic)
    if (sub.presence) broadcastPresence(topic)
  }

  async function readSnapshot(conn: Conn, topic: string): Promise<{ state: { revision: number } } | null> {
    const id = topic.slice('stage-session:'.length)
    try {
      return await asUser(pool, conn.userId, async (client) =>
        (await client.query('select public.get_target_stage_snapshot($1) as snapshot', [id])).rows[0].snapshot)
    } catch (error) {
      if (isAccessError(error)) return null
      throw error
    }
  }

  async function canSubscribe(conn: Conn, topic: string): Promise<boolean> {
    const id = topic.slice('stage-session:'.length)
    return asUser(pool, conn.userId, async (client) =>
      (await client.query<{ ok: boolean }>('select app.can_subscribe_stage_session($1) as ok', [id])).rows[0].ok)
  }

  /**
   * Entrega a mudança de revision; nunca reenvia revision já enviada (contrato §4).
   * `initial` (subscribe): envia o snapshot atual mesmo sem revision nova, seguido da presença.
   */
  async function deliver(conn: Conn, topic: string, initial = false) {
    const sub = conn.subs.get(topic)
    if (!sub) return
    const snapshot = await readSnapshot(conn, topic)
    if (!conn.subs.has(topic)) return
    if (!snapshot) {
      dropSubscription(conn, topic)
      return sendError(conn, 'forbidden', topic)
    }
    if (!initial && snapshot.state.revision <= sub.lastRevision) return
    sub.lastRevision = Math.max(sub.lastRevision, snapshot.state.revision)
    if (initial) app.log.info({ userId: conn.userId, topic, ok: true }, 'realtime: subscribe')
    send(conn, { type: 'snapshot', topic, snapshot })
    if (initial) send(conn, { type: 'presence', topic, participants: participants(topic) })
  }

  function fanOut(topic: string) {
    for (const conn of topics.get(topic) ?? []) enqueue(conn, () => deliver(conn, topic))
  }

  async function subscribe(conn: Conn, topic: string) {
    if (!conn.subs.has(topic)) {
      if (conn.subs.size >= MAX_TOPICS) return sendError(conn, 'too_many_topics', topic)
      if (!(await canSubscribe(conn, topic))) {
        app.log.info({ userId: conn.userId, topic, ok: false }, 'realtime: subscribe')
        return sendError(conn, 'forbidden', topic)
      }
      // Registrar antes de ler: um NOTIFY entre a leitura e o registro não se perde.
      conn.subs.set(topic, { lastRevision: -1 })
      if (!topics.has(topic)) topics.set(topic, new Set())
      topics.get(topic)?.add(conn)
    }
    return deliver(conn, topic, true)
  }

  function setPresence(conn: Conn, topic: string, message: Record<string, unknown>) {
    const sub = conn.subs.get(topic)
    if (!sub) return sendError(conn, 'not_subscribed', topic)
    sub.presence = {
      userId: conn.userId,
      displayName: conn.displayName,
      musicalRole: typeof message.musicalRole === 'string' && MUSICAL_ROLES.has(message.musicalRole) ? message.musicalRole : 'other',
      readiness: message.readiness === 'ready' ? 'ready' : 'waiting',
      seq: ++presenceSeq,
    }
    broadcastPresence(topic)
  }

  async function handle(conn: Conn, raw: string) {
    let message: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object')
      message = parsed as Record<string, unknown>
    } catch {
      return sendError(conn, 'invalid_message')
    }
    if (message.type === 'ping') return send(conn, { type: 'pong' })
    if (message.type !== 'subscribe' && message.type !== 'unsubscribe' && message.type !== 'presence') return sendError(conn, 'invalid_message')
    if (typeof message.topic !== 'string') return sendError(conn, 'invalid_message')
    const topic = message.topic
    if (!TOPIC.test(topic)) return sendError(conn, 'invalid_topic', topic.slice(0, 100))
    if (message.type === 'subscribe') return subscribe(conn, topic)
    if (message.type === 'unsubscribe') return dropSubscription(conn, topic)
    return setPresence(conn, topic, message)
  }

  async function revalidate(conn: Conn) {
    if ((await userIdForSessionHash(pool, conn.tokenHash)) !== conn.userId) return conn.socket.close(4401, 'sessão inválida')
    for (const topic of [...conn.subs.keys()]) {
      if (!(await canSubscribe(conn, topic))) {
        dropSubscription(conn, topic)
        sendError(conn, 'forbidden', topic)
      }
    }
  }

  // LISTEN numa conexão dedicada, fora do pool; ao reconectar, relê todo tópico assinado.
  let listener: pg.Client | null = null
  let listenerTimer: NodeJS.Timeout | undefined
  let healthTimer: NodeJS.Timeout | undefined
  let backoff = opts.listenerBackoffMinMs

  function scheduleListen() {
    if (closing || listenerTimer) return
    listenerTimer = setTimeout(() => {
      listenerTimer = undefined
      void listen()
    }, backoff)
    backoff = Math.min(backoff * 2, opts.listenerBackoffMaxMs)
  }

  async function listen() {
    const client = new pg.Client({ ...pool.options, application_name: 'cantum-realtime-listener', keepAlive: true })
    const fail = () => {
      if (listener !== client) return
      listener = null
      clearInterval(healthTimer)
      client.end().catch(() => undefined)
      app.log.warn('realtime: LISTEN caiu; reconectando')
      scheduleListen()
    }
    client.on('error', fail)
    client.on('end', fail)
    client.on('notification', (notification) => {
      if (notification.channel !== CHANNEL || !notification.payload) return
      try {
        const { stage_session_id: id } = JSON.parse(notification.payload) as { stage_session_id: string }
        fanOut(`stage-session:${id}`)
      } catch {
        app.log.error('realtime: NOTIFY com payload inválido')
      }
    })
    try {
      listener = client
      await client.connect()
      await client.query(`listen ${CHANNEL}`)
    } catch {
      return fail()
    }
    if (closing) return void client.end()
    backoff = opts.listenerBackoffMinMs
    healthTimer = setInterval(() => void client.query('select 1').catch(fail), opts.listenerHealthMs)
    if (topics.size > 0) app.log.info({ topics: topics.size }, 'realtime: resync')
    for (const topic of topics.keys()) fanOut(topic)
  }

  await app.register(websocket, {
    options: { maxPayload: MAX_PAYLOAD },
    preClose(done) {
      closing = true
      clearTimeout(listenerTimer)
      clearInterval(healthTimer)
      for (const set of connsByUser.values()) for (const conn of set) conn.socket.close(1001, 'servidor desligando')
      const client = listener
      listener = null
      void (client ? client.end().catch(() => undefined) : Promise.resolve()).then(() => this.websocketServer.close(() => done()))
    },
  })
  await listen()

  app.get('/realtime', {
    websocket: true,
    preValidation: async (request) => {
      // Defesa contra cross-site WebSocket hijacking: Origin obrigatório e igual ao do app.
      if (request.headers.origin !== appOrigin) throw new HttpError(403, 'origem não permitida')
    },
  }, async (socket, request) => {
    const token = request.cookies[SESSION_COOKIE]
    const userId = request.userId
    if (!userId || !token) return socket.close(4401, 'sessão inválida')
    const userConns = connsByUser.get(userId) ?? new Set<Conn>()
    if (userConns.size >= MAX_CONNECTIONS_PER_USER) return socket.close(4429, 'conexões demais')

    const conn: Conn = {
      socket, userId, tokenHash: tokenHash(token), displayName: '', subs: new Map(),
      queue: Promise.resolve(), windowStart: Date.now(), windowCount: 0,
    }
    userConns.add(conn)
    connsByUser.set(userId, userConns)
    app.log.info({ userId }, 'realtime: conexão aberta')
    enqueue(conn, async () => {
      // Primeira tarefa da fila: toda presença desta conexão já sai com o nome.
      const name = await displayNameFor(pool, userId)
      if (name === null) return socket.close(4401, 'sessão inválida')
      conn.displayName = name
    })

    const idle = setTimeout(() => socket.close(1001, 'inatividade'), opts.idleTimeoutMs)
    const revalidation = setInterval(() => enqueue(conn, () => revalidate(conn)), opts.revalidateMs)

    socket.on('message', (data, isBinary) => {
      idle.refresh()
      const now = Date.now()
      if (now - conn.windowStart > RATE_WINDOW_MS) {
        conn.windowStart = now
        conn.windowCount = 0
      }
      if (++conn.windowCount > RATE_MAX) return socket.close(1008, 'mensagens demais')
      if (isBinary) return sendError(conn, 'invalid_message')
      const raw = data.toString()
      enqueue(conn, () => handle(conn, raw))
    })

    socket.on('close', (code) => {
      clearTimeout(idle)
      clearInterval(revalidation)
      for (const topic of [...conn.subs.keys()]) dropSubscription(conn, topic)
      userConns.delete(conn)
      if (userConns.size === 0) connsByUser.delete(userId)
      app.log.info({ userId, code }, 'realtime: conexão fechada')
    })
  })
}
