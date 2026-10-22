import { describe, expect, it } from 'vitest'
import { parseMaterialUrl, validateMaterial } from './material'

describe('parseMaterialUrl', () => {
  it('accepts https and strips www', () => {
    expect(parseMaterialUrl(' https://www.youtube.com/watch?v=1 ')).toEqual({ ok: true, href: 'https://www.youtube.com/watch?v=1', domain: 'youtube.com' })
  })
  it.each(['http://x.com', 'javascript:alert(1)', 'data:text/html,hi', '/relativa', 'x.com/a', 'https://a b.com', 'https://user:pw@x.com', 'https://user@x.com', `https://x.com/${'a'.repeat(2048)}`, ''])('refuses %s', (url) => {
    expect(parseMaterialUrl(url).ok).toBe(false)
  })
})

describe('parseMaterialUrl normalization', () => {
  it.each(['HTTPS://x.com', 'https:\\x.com', 'https:x.com', 'https:/x.com'])('%s normalizes to a DB-valid href', (u) => {
    const r = parseMaterialUrl(u)
    expect(r.ok && /^https:\/\/[^\s]+$/.test(r.href)).toBe(true)
  })
  it('refuses embedded credentials', () => expect(parseMaterialUrl('https://youtube.com@evil.com/').ok).toBe(false))
  it('refuses href over 2048 after normalization', () => expect(parseMaterialUrl('https://x.com/' + 'a'.repeat(2040)).ok).toBe(false))
})

describe('validateMaterial', () => {
  const ok = { serviceId: 's1', title: 'Cifra', url: 'https://x.com' }
  it('accepts a single owner', () => expect(validateMaterial(ok)).toEqual([]))
  it('refuses no owner, two owners, bad title and long notes', () => {
    expect(validateMaterial({ ...ok, serviceId: undefined })).toHaveLength(1)
    expect(validateMaterial({ ...ok, songId: 'g' })).toHaveLength(1)
    expect(validateMaterial({ ...ok, title: ' ' })).toHaveLength(1)
    expect(validateMaterial({ ...ok, title: 'a'.repeat(121) })).toHaveLength(1)
    expect(validateMaterial({ ...ok, notes: 'a'.repeat(501) })).toHaveLength(1)
  })
})
