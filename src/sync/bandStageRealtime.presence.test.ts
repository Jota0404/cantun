import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BandStageRealtime } from './bandStageRealtime'

const snapshot = (status: 'live' | 'ended' = 'live') => ({
  session: { id:'s1', band_id:'b1', setlist_id:'sl1', md_user_id:'md1', status, created_at:'2026-09-08T00:00:00Z', started_at:'2026-09-08T00:00:01Z', ...(status === 'ended' ? { ended_at:'2026-09-08T00:00:03Z' } : {}), updated_at:'2026-09-08T00:00:02Z' },
  state: { session_id:'s1', revision:3, current_index:0, current_song_id:'song-1', current_key:'C', is_running:true, updated_at:'2026-09-08T00:00:02Z' },
})

function makeChannel() {
  const handlers = new Map<string, (payload?: unknown) => void>()
  const state: Record<string, unknown[]> = {}
  const value = {
    on: vi.fn((kind:string, config:{event:string}, handler:(payload?: unknown)=>void) => { handlers.set(`${kind}:${config.event}`, handler); return value }),
    subscribe: vi.fn(async () => 'SUBSCRIBED'),
    unsubscribe: vi.fn(async () => 'ok'),
    send: vi.fn(async () => 'ok'),
    track: vi.fn(async (payload:unknown) => { state.client=[payload]; handlers.get('presence:sync')?.(); return 'ok' }),
    untrack: vi.fn(async () => { delete state.client; handlers.get('presence:sync')?.({}); return 'ok' }),
    presenceState: vi.fn(() => state),
    emitPresence: (next:Record<string,unknown>) => { for (const [key,val] of Object.entries(next)) state[key]=val; handlers.get('presence:sync')?.({}) },
  }
  return value
}
function makeClient(status:'live'|'ended'='live', userId = 'u1') {
  const channel=makeChannel()
  return {
    channel:vi.fn(()=>channel),
    auth:{ getUser:vi.fn(async()=>({data:{user:{id:userId}},error:null})) },
    rpc:vi.fn(async()=>({data:[{session:snapshot(status).session,state:snapshot(status).state}],error:null})),
    channelRef:channel,
  }
}
describe('BandStageRealtime presence',()=>{
  it('tracks only after validating the authenticated identity',async()=>{
    const client=makeClient('live','u1'), onPresence=vi.fn(), realtime=new BandStageRealtime({client:client as unknown as SupabaseClient,sessionId:'s1',onPresence})
    await realtime.connect()
    await realtime.trackPresence({userId:'u1',displayName:'Pedro',musicalRole:'bass',isMd:false,readiness:'waiting'})
    expect(client.auth.getUser).toHaveBeenCalledTimes(1)
    expect(client.channelRef.track).toHaveBeenCalledWith(expect.objectContaining({userId:'u1'}))
  })
  it('rejects presence that claims another user',async()=>{
    const client=makeClient('live','u1'), realtime=new BandStageRealtime({client:client as unknown as SupabaseClient,sessionId:'s1'})
    await realtime.connect()
    await expect(realtime.trackPresence({userId:'u2',displayName:'Impostor',musicalRole:'bass',isMd:false,readiness:'waiting'})).rejects.toThrow(/usuário autenticado/)
    expect(client.channelRef.track).not.toHaveBeenCalled()
  })
  it('derives MD from the authoritative snapshot',async()=>{
    const client=makeClient('live','md1'), realtime=new BandStageRealtime({client:client as unknown as SupabaseClient,sessionId:'s1'})
    await realtime.connect()
    await realtime.trackPresence({userId:'md1',displayName:'João',musicalRole:'vocals',isMd:false,readiness:'waiting'})
    expect(client.channelRef.track).toHaveBeenCalledWith(expect.objectContaining({isMd:true}))
  })
  it('supports multiple participants and derives MD from snapshot',async()=>{
    const client=makeClient('live','u1'), onPresence=vi.fn(), realtime=new BandStageRealtime({client:client as unknown as SupabaseClient,sessionId:'s1',onPresence})
    await realtime.connect()
    client.channelRef.emitPresence({a:[{userId:'md1',displayName:'João',musicalRole:'vocals',isMd:false,readiness:'waiting'}],b:[{userId:'bass1',displayName:'Lucas',musicalRole:'bass',isMd:true,readiness:'ready'}]})
    expect(onPresence).toHaveBeenLastCalledWith([{userId:'md1',displayName:'João',musicalRole:'vocals',isMd:true,readiness:'waiting'},{userId:'bass1',displayName:'Lucas',musicalRole:'bass',isMd:false,readiness:'ready'}])
  })
  it('falls back safely',async()=>{
    const client=makeClient(), onPresence=vi.fn(), realtime=new BandStageRealtime({client:client as unknown as SupabaseClient,sessionId:'s1',onPresence})
    await realtime.connect()
    client.channelRef.emitPresence({a:[{userId:'u1',displayName:'',musicalRole:'invalid'}],b:[{displayName:'missing'}]})
    expect(onPresence).toHaveBeenLastCalledWith([{userId:'u1',displayName:'Participante',musicalRole:'other',isMd:false,readiness:'waiting'}])
  })
  it('retracks after reconnect and ignores presence after teardown',async()=>{
    const client=makeClient(), onPresence=vi.fn(), realtime=new BandStageRealtime({client:client as unknown as SupabaseClient,sessionId:'s1',onPresence})
    await realtime.connect()
    await realtime.trackPresence({userId:'u1',displayName:'Pedro',musicalRole:'electric-guitar',isMd:false,readiness:'ready'})
    await realtime.reconnect()
    expect(client.channelRef.track).toHaveBeenCalledTimes(2)
    onPresence.mockClear()
    await realtime.disconnect()
    client.channelRef.emitPresence({c:[{userId:'late',displayName:'Late',musicalRole:'bass'}]})
    expect(onPresence).not.toHaveBeenCalled()
  })
  it('does not track an ended snapshot',async()=>{
    const client=makeClient('ended'), realtime=new BandStageRealtime({client:client as unknown as SupabaseClient,sessionId:'s1'})
    await realtime.connect()
    expect(client.channelRef.track).not.toHaveBeenCalled()
    expect(client.channelRef.untrack).toHaveBeenCalledTimes(1)
  })
})