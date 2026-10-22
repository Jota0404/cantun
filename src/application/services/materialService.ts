import type { AccessContext, Capability } from '../../domain/access/permissions'
import { hasPermission } from '../../domain/access/permissions'
import type { Material } from '../../domain/services/material'
import { parseMaterialUrl, validateMaterial } from '../../domain/services/material'
import { isFinalStatus } from '../../domain/services/serviceLifecycle'
import { materialRepository, type MaterialOwnerField } from '../../db/repositories/materialRepository'
import { rehearsalRepository } from '../../db/repositories/rehearsalRepository'
import { serviceRepository } from '../../db/repositories/serviceRepository'
import { songRepository } from '../../db/repositories/songRepository'
import { getCurrentUser } from '../../platform/auth'
import { getMyAccessContext } from '../teams/teamMemberService'

export type MaterialOwner = { type: 'service' | 'rehearsal' | 'song'; id: string }
export type MaterialView = { id: string; ownerType: 'service' | 'rehearsal' | 'song'; ownerId: string; title: string; url: string; domain: string; notes?: string }
export type MaterialInput = { title: string; url: string; notes?: string }

export interface MaterialRepositories {
  materials: typeof materialRepository
  services: typeof serviceRepository
  rehearsals: typeof rehearsalRepository
  songs: typeof songRepository
  access: (input: { organizationId: string; teamId?: string }) => Promise<AccessContext>
  currentUserId: () => string | undefined
}

export const defaultMaterialRepositories: MaterialRepositories = {
  materials: materialRepository, services: serviceRepository, rehearsals: rehearsalRepository, songs: songRepository,
  access: getMyAccessContext, currentUserId: () => getCurrentUser()?.id,
}

type Fail = { success: false; errors: string[] }
const fail = (message: string): Fail => ({ success: false, errors: [message] })

const FIELD: Record<MaterialOwner['type'], MaterialOwnerField> = { service: 'serviceId', rehearsal: 'rehearsalId', song: 'songId' }

export function toMaterialView(m: Material): MaterialView {
  const parsed = parseMaterialUrl(m.url)
  const type = m.serviceId ? 'service' : m.rehearsalId ? 'rehearsal' : 'song'
  return { id: m.id, ownerType: type, ownerId: (m.serviceId ?? m.rehearsalId ?? m.songId) as string, title: m.title, url: m.url, domain: parsed.ok ? parsed.domain : '', notes: m.notes }
}

/** Materiais planos do serviço, dos ensaios dele e das músicas da ordem (visão do músico). */
export async function listServiceMaterialViews(serviceId: string, rehearsalIds: string[], songIds: string[], repository = materialRepository): Promise<MaterialView[]> {
  const lists = await Promise.all([
    repository.listByOwner('serviceId', serviceId),
    ...rehearsalIds.map((id) => repository.listByOwner('rehearsalId', id)),
    ...[...new Set(songIds)].map((id) => repository.listByOwner('songId', id)),
  ])
  return lists.flat().map(toMaterialView)
}

type Context = { organizationId: string; access: AccessContext; final: boolean; capability: Capability; teamId?: string }

async function contextOf(owner: MaterialOwner, repositories: MaterialRepositories): Promise<Context | Fail> {
  let serviceId: string | undefined
  if (owner.type === 'service') serviceId = owner.id
  if (owner.type === 'rehearsal') {
    const rehearsal = await repositories.rehearsals.get(owner.id)
    if (!rehearsal) return fail('Ensaio não encontrado.')
    serviceId = rehearsal.serviceId
  }
  if (serviceId) {
    const service = await repositories.services.getById(serviceId)
    if (!service) return fail('Serviço não encontrado.')
    const teamId = service.teamId ?? undefined
    return { organizationId: service.organizationId, teamId, access: await repositories.access({ organizationId: service.organizationId, teamId }), final: isFinalStatus(service.status), capability: 'material.manage' }
  }
  const song = await repositories.songs.getById(owner.id)
  if (!song) return fail('Música não encontrada.')
  if (!song.organizationId) return fail('Materiais só podem ser anexados a músicas do Ministério, não a músicas pessoais.')
  return { organizationId: song.organizationId, access: await repositories.access({ organizationId: song.organizationId }), final: false, capability: 'song.edit' }
}

const canRead = (access: AccessContext) => Boolean(access.organizationRole) && access.isActiveInOrganization !== false
const canWrite = (c: Context) => hasPermission(c.access, c.capability) && !c.final

export async function listMaterials(owner: MaterialOwner, repositories = defaultMaterialRepositories): Promise<{ success: true; materials: MaterialView[]; canManage: boolean } | Fail> {
  const context = await contextOf(owner, repositories)
  if ('success' in context) return context
  if (!canRead(context.access)) return fail('Você não tem acesso a estes materiais.')
  const rows = await repositories.materials.listByOwner(FIELD[owner.type], owner.id)
  return { success: true, materials: rows.map(toMaterialView), canManage: canWrite(context) }
}

async function writeContext(owner: MaterialOwner, repositories: MaterialRepositories): Promise<Context | Fail> {
  const context = await contextOf(owner, repositories)
  if ('success' in context) return context
  if (!hasPermission(context.access, context.capability)) return fail('Você não tem permissão para gerenciar materiais.')
  if (context.final) return fail('Serviço encerrado não aceita alteração.')
  return context
}

export async function addMaterial(owner: MaterialOwner, input: MaterialInput, repositories = defaultMaterialRepositories): Promise<{ success: true; material: MaterialView } | Fail> {
  const context = await writeContext(owner, repositories)
  if ('success' in context) return context
  const now = new Date().toISOString()
  const value: Material = {
    id: crypto.randomUUID(), organizationId: context.organizationId, kind: 'link', title: input.title.trim(), url: input.url.trim(), notes: input.notes?.trim() || undefined,
    createdByUserId: repositories.currentUserId(), createdAt: now, updatedAt: now, [FIELD[owner.type]]: owner.id,
  }
  const errors = validateMaterial(value)
  if (errors.length) return { success: false, errors }
  const parsedUrl = parseMaterialUrl(value.url)
  if (parsedUrl.ok) value.url = parsedUrl.href
  await repositories.materials.save(value)
  return { success: true, material: toMaterialView(value) }
}

export async function updateMaterial(materialId: string, input: MaterialInput, repositories = defaultMaterialRepositories): Promise<{ success: true; material: MaterialView } | Fail> {
  const existing = await repositories.materials.get(materialId)
  if (!existing) return fail('Material não encontrado.')
  const view = toMaterialView(existing)
  const context = await writeContext({ type: view.ownerType, id: view.ownerId }, repositories)
  if ('success' in context) return context
  const value: Material = { ...existing, title: input.title.trim(), url: input.url.trim(), notes: input.notes?.trim() || undefined, updatedAt: new Date().toISOString() }
  const errors = validateMaterial(value)
  if (errors.length) return { success: false, errors }
  const parsedUrl = parseMaterialUrl(value.url)
  if (parsedUrl.ok) value.url = parsedUrl.href
  await repositories.materials.save(value)
  return { success: true, material: toMaterialView(value) }
}

export async function deleteMaterial(materialId: string, repositories = defaultMaterialRepositories): Promise<{ success: true } | Fail> {
  const existing = await repositories.materials.get(materialId)
  if (!existing) return fail('Material não encontrado.')
  const view = toMaterialView(existing)
  const context = await writeContext({ type: view.ownerType, id: view.ownerId }, repositories)
  if ('success' in context) return context
  await repositories.materials.remove(materialId)
  return { success: true }
}
