// Aplica db/migrations no banco de DATABASE_URL (ou das variáveis PG*). Mesmo
// contrato do scripts/db/migrate.sh, sem depender do psql (a imagem do Render não
// o tem): cada arquivo roda numa transação junto com o registro em
// app.schema_migrations; se falhar, nada daquele arquivo fica aplicado.
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const MIGRATIONS_DIR = fileURLToPath(new URL('../../db/migrations', import.meta.url))

export async function migrate(config: pg.ClientConfig, dir = MIGRATIONS_DIR): Promise<string[]> {
  const files = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort()
  const applied: string[] = []

  const setup = new pg.Client(config)
  await setup.connect()
  let done: Set<string>
  try {
    await setup.query('set client_min_messages = warning')
    await setup.query('create schema if not exists app')
    await setup.query('create table if not exists app.schema_migrations (version text primary key, applied_at timestamptz not null default now())')
    done = new Set((await setup.query<{ version: string }>('select version from app.schema_migrations')).rows.map((row) => row.version))
  } finally {
    await setup.end()
  }

  for (const file of files) {
    const version = file.slice(0, -'.sql'.length)
    if (done.has(version)) continue
    // Uma conexão por arquivo, como o psql: os SET de um arquivo não vazam para o próximo.
    const client = new pg.Client(config)
    await client.connect()
    try {
      await client.query('begin')
      await client.query(await readFile(`${dir}/${file}`, 'utf8'))
      await client.query('insert into app.schema_migrations (version) values ($1)', [version])
      await client.query('commit')
      applied.push(version)
    } catch (error) {
      await client.query('rollback').catch(() => undefined)
      throw new Error(`migration ${version} falhou: ${(error as Error).message}`, { cause: error })
    } finally {
      await client.end()
    }
  }

  // O servidor conecta com este mesmo usuário e faz `set local role` em cada requisição.
  // Num PostgreSQL gerenciado (ex.: Neon) ele não é superusuário: precisa ser membro dos papéis.
  const grant = new pg.Client(config)
  await grant.connect()
  try {
    await grant.query('set client_min_messages = warning')
    await grant.query('grant cantum_user, cantum_anon to current_user')
  } finally {
    await grant.end()
  }
  return applied
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const applied = await migrate(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {})
  for (const version of applied) console.log(`aplicada  ${version}`)
  console.log(`migrations em dia (${applied.length} nova(s))`)
}
