import { describe, expect, it } from 'vitest'
import { buildBandInviteUrl } from '../../application/bands/bandInviteService'

describe('band invite UI contract', () => {
  it('builds a PWA-safe invite URL with the bearer token only in the query', () => {
    const originalBase = import.meta.env.BASE_URL
    Object.assign(import.meta.env, { BASE_URL: '/cantun/' })
    const url = buildBandInviteUrl('a'.repeat(64))
    expect(url).toContain('/cantun/bands/invite?token=')
    expect(url).toContain('a'.repeat(64))
    Object.assign(import.meta.env, { BASE_URL: originalBase })
  })
})
