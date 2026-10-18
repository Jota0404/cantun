import { expect, it } from 'vitest'
import { MINIMUM_ACCOUNT_AGE } from './age'

const migrations = import.meta.glob('../../../db/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

it('a idade mínima do cliente é a da última migration que define app.minimum_account_age()', () => {
  const ages = Object.keys(migrations).sort()
    .map((file) => /function app\.minimum_account_age\(\)[\s\S]*?select (\d+)/.exec(migrations[file])?.[1])
    .filter((age): age is string => Boolean(age))
  expect(Number(ages.at(-1))).toBe(MINIMUM_ACCOUNT_AGE)
})
