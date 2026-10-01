# Exportar o schema de produção (B1 / A0)

> Roteiro para o **owner**. Gera o dump **só de schema** e a lista de migrations aplicadas, usados no baseline do banco (`docs/BACKEND_MIGRATION_PLAN.md` §3 A0 · `docs/blocks/B1-portabilidade-postgres.md`).

## Avisos

- **Não exporte dados.** Todos os comandos usam `--schema-only`. Não use `pg_dump` sem essa flag.
- Os arquivos vão para `../cantum-db-export/`, **fora do repositório**. Não os commite.
- A connection string contém a senha do banco. Defina-a só na sessão do terminal, não a escreva em arquivo, não a cole em chat, issue ou PR e não a envie para a IA.
- Use a connection string do **Session pooler** ou a direta de *Supabase → Project Settings → Database → Connection string*. O `pg_dump` não funciona com o *Transaction pooler* (porta 6543).
- Depois de gerar os arquivos, avise a IA que eles existem; ela só trabalhará com o conteúdo que você decidir compartilhar.

## 1. Instalar o cliente PostgreSQL

### Windows

ID do pacote confirmado com `winget search --id PostgreSQL.PostgreSQL`:

```powershell
winget install --id PostgreSQL.PostgreSQL.16
```

(`PostgreSQL.PostgreSQL.17` também existe. Use a versão igual ou superior à do servidor Supabase.)

O instalador pergunta quais componentes instalar; os **Command Line Tools** bastam. Em seguida, abra um novo terminal e confirme:

```powershell
$env:Path += ";C:\Program Files\PostgreSQL\16\bin"   # só se pg_dump não for encontrado
pg_dump --version
psql --version
```

### Linux / macOS (Bash)

```bash
# Debian/Ubuntu
sudo apt install postgresql-client
# macOS
brew install libpq && brew link --force libpq
```

## 2. Definir a connection string (apenas na sessão)

**PowerShell**

```powershell
$env:SUPABASE_DB_URL = Read-Host "Cole a connection string (não será salva)"
```

**Bash**

```bash
read -rs -p "Cole a connection string (não será salva): " SUPABASE_DB_URL; export SUPABASE_DB_URL; echo
```

## 3. Criar a pasta de destino (fora do repo)

**PowerShell** (a partir da raiz do repositório)

```powershell
New-Item -ItemType Directory -Force ..\cantum-db-export | Out-Null
```

**Bash**

```bash
mkdir -p ../cantum-db-export
```

## 4. Exportar o schema

Use `--file`/`-f`/`-o` em vez de `>` — no Windows PowerShell 5.1 o redirecionamento grava UTF-16 e quebra o arquivo.

**PowerShell**

```powershell
pg_dump $env:SUPABASE_DB_URL --schema-only --no-owner --no-privileges `
  --schema=public --schema=private --schema=app `
  --file=..\cantum-db-export\prod-schema.sql

# Políticas de realtime.messages (schema do Supabase, fora dos três acima)
pg_dump $env:SUPABASE_DB_URL --schema-only --no-owner `
  --table='realtime.messages' `
  --file=..\cantum-db-export\prod-realtime-messages.sql
```

**Bash**

```bash
pg_dump "$SUPABASE_DB_URL" --schema-only --no-owner --no-privileges \
  --schema=public --schema=private --schema=app \
  --file=../cantum-db-export/prod-schema.sql

# Políticas de realtime.messages (schema do Supabase, fora dos três acima)
pg_dump "$SUPABASE_DB_URL" --schema-only --no-owner \
  --table='realtime.messages' \
  --file=../cantum-db-export/prod-realtime-messages.sql
```

Observações:

- Se algum schema não existir (por exemplo `private` ou `app`), o `pg_dump` aborta com `no matching schemas were found`. Anote o erro e rode de novo sem esse `--schema`.
- O arquivo de `realtime.messages` inclui `create policy …` quando há RLS ativo.
- Alternativa pela CLI do Supabase: `supabase db dump --schema public,private,app -f ..\cantum-db-export\prod-schema.sql` (também só schema).

## 5. Listar as migrations aplicadas

**PowerShell**

```powershell
psql $env:SUPABASE_DB_URL --no-psqlrc -A -F "|" `
  -c "select version, name from supabase_migrations.schema_migrations order by version" `
  -o ..\cantum-db-export\applied-migrations.txt
```

**Bash**

```bash
psql "$SUPABASE_DB_URL" --no-psqlrc -A -F "|" \
  -c "select version, name from supabase_migrations.schema_migrations order by version" \
  -o ../cantum-db-export/applied-migrations.txt
```

## 6. Conferir e limpar

**PowerShell**

```powershell
Get-ChildItem ..\cantum-db-export | Select-Object Name, Length
Select-String -Path ..\cantum-db-export\prod-schema.sql -Pattern "^COPY |^INSERT INTO" | Select-Object -First 3   # deve retornar vazio
Remove-Item Env:SUPABASE_DB_URL
```

**Bash**

```bash
ls -l ../cantum-db-export
grep -cE '^(COPY|INSERT INTO) ' ../cantum-db-export/prod-schema.sql   # deve imprimir 0
unset SUPABASE_DB_URL
```

Se o grep encontrar `COPY` ou `INSERT`, **apague os arquivos** e revise os comandos: algo exportou dados.

## 7. Próximo passo

Com os três arquivos em `../cantum-db-export/` (`prod-schema.sql`, `prod-realtime-messages.sql`, `applied-migrations.txt`), abra uma sessão para o B1/A0: comparar o dump com o resultado do harness (`scripts/db/verify-migrations.sh`) e versionar `db/baseline/0000_baseline.sql`.
