import { describe, expect, it } from 'vitest'

describe('vitest environment', () => {
  it('runs TypeScript test files with working assertions', () => {
    expect(1 + 1).toBe(2)
  })
})