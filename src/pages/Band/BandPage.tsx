import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/authContext'
import { bandMemberRepository, bandRepository } from '../../db/repositories/bandRepositories'
import type { Band } from '../../domain/bands/band'
import type { BandInviteRole } from '../../domain/bands/bandInvite'
import { acceptBandInvite, buildBandInviteUrl, createBandInvite, getBandInvite, listBandInvites, revokeBandInvite } from '../../application/bands/bandInviteService'
import { supabase } from '../../lib/supabase'
import { syncBands } from '../../sync/bandSyncService'
import './BandPage.css'

const isoNow = () => new Date().toISOString()

export function BandListPage() {
  const [bands, setBands] = useState<Band[]>([]); const [name, setName] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const navigate = useNavigate()
  const load = useCallback(async () => { setLoading(true); try { await syncBands(); setBands(await bandRepository.list()) } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar as bandas.') } finally { setLoading(false) } }, [])
  useEffect(() => { void load() }, [load])
  async function create() { if (!name.trim()) return; setError(''); try { const user = (await supabase?.auth.getUser())?.data.user; if (!user) throw new Error('Faça login para criar uma banda.'); const timestamp = isoNow(); const band: Band = { id: crypto.randomUUID(), name: name.trim(), ownerUserId: user.id, createdAt: timestamp, updatedAt: timestamp }; await bandRepository.create(band); setName(''); await load(); navigate(`/bands/${band.id}`) } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível criar a banda.') } }
  return <main className="band-page"><section className="band-card"><div className="band-heading"><span>CHURCH WORKSPACE</span><h2>Minhas bandas</h2><p>Crie uma banda ou entre por convite.</p></div><div className="band-create"><input aria-label="Nome da banda" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome da banda" /><button type="button" onClick={() => void create()}>Criar banda</button></div>{error && <p className="band-error" role="alert">{error}</p>}{loading ? <p>Carregando…</p> : <ul className="band-list">{bands.map((band) => <li key={band.id}><Link to={`/bands/${band.id}`}><strong>{band.name}</strong><span>Abrir banda →</span></Link></li>)}</ul>}</section></main>
}

export function BandDetailPage() {
  const { user } = useAuth(); const { bandId = '' } = useParams(); const [band, setBand] = useState<Band>(); const [members, setMembers] = useState<Awaited<ReturnType<typeof bandMemberRepository.listByBandId>>>([]); const [invites, setInvites] = useState<Awaited<ReturnType<typeof listBandInvites>>>([]); const [role, setRole] = useState<BandInviteRole>('member'); const [email, setEmail] = useState(''); const [inviteUrl, setInviteUrl] = useState(''); const [error, setError] = useState(''); const [copied, setCopied] = useState(false)
  const load = useCallback(async () => { try { await syncBands(); const [allBands, localMembers, remoteInvites] = await Promise.all([bandRepository.list(), bandMemberRepository.listByBandId(bandId), listBandInvites(bandId)]); setBand(allBands.find((item) => item.id === bandId)); setMembers(localMembers); setInvites(remoteInvites) } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar a banda.') } }, [bandId])
  useEffect(() => { void load() }, [load])
  const currentMember = members.find((member) => member.userId === user?.id); const canManage = currentMember?.role === 'owner' || currentMember?.role === 'editor'
  async function invite() { setError(''); setCopied(false); try { const created = await createBandInvite(bandId, role, email); setInviteUrl(buildBandInviteUrl(created.token)); setEmail(''); await load() } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível criar o convite.') } }
  async function copy() { if (!inviteUrl) return; await navigator.clipboard.writeText(inviteUrl); setCopied(true) }
  async function revoke(id: string) { try { await revokeBandInvite(id); await load() } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível revogar o convite.') } }
  if (!band) return <main className="band-page"><section className="band-card"><p>{error || 'Carregando banda…'}</p></section></main>
  return <main className="band-page"><section className="band-card"><div className="band-heading"><Link to="/bands">← Bandas</Link><span>BANDA</span><h2>{band.name}</h2><p>{members.length} membro(s)</p></div>{error && <p className="band-error" role="alert">{error}</p>}<section><h3>Membros</h3><ul className="member-list">{members.map((member) => <li key={member.id}><span>{member.userId === user?.id ? 'Você' : member.userId}</span><strong>{member.role}</strong></li>)}</ul></section>{canManage && <><section><h3>Convidar</h3><div className="invite-form"><select aria-label="Papel do convite" value={role} onChange={(event) => setRole(event.target.value as BandInviteRole)}><option value="member">Membro</option><option value="editor">Editor</option></select><input aria-label="Email opcional" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email (opcional)" type="email" /><button type="button" onClick={() => void invite()}>Gerar convite</button></div>{inviteUrl && <div className="invite-result"><input readOnly value={inviteUrl} aria-label="Link do convite" /><button type="button" onClick={() => void copy()}>{copied ? 'Copiado' : 'Copiar'}</button></div>}</section><section><h3>Convites</h3><ul className="invite-list">{invites.map((invite) => <li key={invite.id}><span>{invite.inviteeEmail ?? 'Link compartilhável'} · {invite.role}</span><strong>{invite.status}</strong>{invite.status === 'pending' && <button type="button" onClick={() => void revoke(invite.id)}>Revogar</button>}</li>)}</ul></section></>}</section></main>
}

export function BandInvitePage() {
  const [params] = useSearchParams(); const { user } = useAuth(); const navigate = useNavigate(); const token = params.get('token') ?? ''; const [invite, setInvite] = useState<Awaited<ReturnType<typeof getBandInvite>>>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  useEffect(() => { if (!token) { setError('Convite inválido.'); return } void getBandInvite(token).then(setInvite).catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível validar o convite.')) }, [token])
  async function accept() { setBusy(true); setError(''); try { const result = await acceptBandInvite(token); await syncBands(); navigate(`/bands/${result.bandId}`, { replace: true }) } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível aceitar o convite.') } finally { setBusy(false) } }
  if (!user) return <main className="band-page"><section className="band-card"><h2>Convite para banda</h2><p>Faça login para visualizar e aceitar este convite.</p><Link to={`/auth?redirect=/bands/invite?token=${encodeURIComponent(token)}`}>Entrar</Link></section></main>
  return <main className="band-page"><section className="band-card invite-page"><span>CONVITE</span><h2>{invite?.bandName ?? 'Validando…'}</h2>{invite && <p>Você receberá o papel de <strong>{invite.role}</strong>.</p>}{invite?.inviteeEmail && <p>Destinado a <strong>{invite.inviteeEmail}</strong>.</p>}{invite && invite.status !== 'pending' && <p role="alert">Este convite está {invite.status}.</p>}{error && <p className="band-error" role="alert">{error}</p>}{invite?.status === 'pending' && <div className="invite-actions"><button type="button" disabled={busy} onClick={() => void accept()}>{busy ? 'Aceitando…' : 'Aceitar convite'}</button><button type="button" onClick={() => navigate('/')}>Cancelar</button></div>}</section></main>
}
