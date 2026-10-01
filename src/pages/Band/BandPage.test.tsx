import { describe, expect, it } from 'vitest'
import { buildBandInviteUrl } from '../../application/bands/bandInviteService'

describe('band invite UI contract', () => {
  it('builds a PWA-safe invite URL with the bearer token in the path', () => {
    const originalBase = import.meta.env.BASE_URL
    Object.assign(import.meta.env, { BASE_URL: '/cantun/' })
    const url = buildBandInviteUrl('a'.repeat(64))
    expect(url).toContain(`/cantun/bands/invite/${'a'.repeat(64)}`)
    expect(url).not.toContain('?token=')
    Object.assign(import.meta.env, { BASE_URL: originalBase })
  })
})
