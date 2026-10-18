import { expect, it } from 'vitest'
import { CONSENT_VERSION } from './consent'

const migrations = import.meta.glob('../../../db/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

it('a versão do cliente é a mesma da última migration que define app.current_consent_version()', () => {
  const versions = Object.keys(migrations).sort()
    .map((file) => /function app\.current_consent_version\(\)[\s\S]*?select '([^']+)'::text/.exec(migrations[file])?.[1])
    .filter((version): version is string => Boolean(version))
  expect(versions.at(-1)).toBe(CONSENT_VERSION)
})
