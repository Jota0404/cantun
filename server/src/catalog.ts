import type { Pool } from './db.ts'

export interface RpcFunction {
  name: string
  args: { name: string; type: string }[]
  returnsSet: boolean
  returns: 'void' | 'scalar' | 'row'
}

export interface Table {
  name: string
  columns: Map<string, string>
  primaryKey: string[]
}

export interface Catalog {
  functions: Map<string, RpcFunction>
  tables: Map<string, Table>
}

/**
 * A allowlist vem dos grants do SQL: só funções com EXECUTE explícito para
 * cantum_user e tabelas que cantum_user pode ler. Nada é listado no TypeScript.
 */
export async function loadCatalog(pool: Pool): Promise<Catalog> {
  const functions = await pool.query<{ name: string; returns_set: boolean; returns: RpcFunction['returns']; args: RpcFunction['args'] }>(`
    with f as (
      select p.proname, p.proretset, p.prorettype, p.proargnames as names,
        coalesce(p.proallargtypes, array(select unnest(p.proargtypes))) as types,
        coalesce(p.proargmodes, array_fill('i'::"char", array[p.pronargs])) as modes
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f'
        and exists (
          select 1 from aclexplode(p.proacl) a
          where a.grantee = 'cantum_user'::regrole and a.privilege_type = 'EXECUTE'
        )
    )
    select f.proname as name, f.proretset as returns_set,
      case when f.prorettype = 'void'::regtype then 'void'
           when f.prorettype = 'record'::regtype or t.typtype = 'c' then 'row'
           else 'scalar' end as returns,
      coalesce((
        select json_agg(json_build_object('name', f.names[i], 'type', format_type(f.types[i], null)) order by i)
        from generate_subscripts(f.types, 1) i
        where f.modes[i] in ('i', 'b')
      ), '[]') as args
    from f join pg_type t on t.oid = f.prorettype`)

  const tables = await pool.query<{ name: string; columns: Record<string, string>; primary_key: string[] }>(`
    select c.relname as name,
      (select json_object_agg(a.attname, format_type(a.atttypid, a.atttypmod))
         from pg_attribute a
        where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as columns,
      (select json_agg(a.attname order by k.ord)
         from pg_index i
         cross join unnest(i.indkey::int2[]) with ordinality k(attnum, ord)
         join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
        where i.indrelid = c.oid and i.indisprimary) as primary_key
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and has_table_privilege('cantum_user', c.oid, 'select')`)

  return {
    functions: new Map(functions.rows.map((r) => [r.name, { name: r.name, args: r.args, returnsSet: r.returns_set, returns: r.returns }])),
    tables: new Map(tables.rows.map((r) => [r.name, { name: r.name, columns: new Map(Object.entries(r.columns)), primaryKey: r.primary_key ?? [] }])),
  }
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/

/** Nome vindo do catálogo, ainda assim validado e entre aspas. */
export function ident(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Error(`identificador inválido: ${name}`)
  return `"${name}"`
}
