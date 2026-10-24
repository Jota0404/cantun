# CANTUM — Status do projeto (para o dono)

> Atualizado em 2026-10-23 · código em `main` @ `826eafa` · linguagem sem jargão de propósito.
> Detalhes técnicos: `AI_CONTEXT.md` §3 e `docs/blocks/00-INDICE.md`.

## Onde estamos

O aplicativo está **pronto em código** para o uso planejado no MVP. O que falta é, quase todo, **colocar no ar de verdade** (servidor, banco, domínio, textos jurídicos), e isso é decisão sua.

O que o CANTUM já faz, por bloco:

| Bloco | O que a pessoa consegue fazer hoje |
|---|---|
| B0 Fundação | (interno) Regras de trabalho, testes automáticos a cada mudança e revisão antes de juntar código. |
| B1 Servidor próprio | (interno) O app usa servidor e banco próprios; não depende mais do Supabase. Funciona offline e sincroniza ao voltar a internet. |
| B2 Equipe | Criar o Ministério e as Bandas, convidar pessoas por e-mail ou link, definir papéis (Dono, Admin, Líder, Membro) e as funções musicais de cada um. Usuário novo é guiado passo a passo. |
| B3 Serviço | Criar o culto/serviço com data, local e observações, montar a ordem (músicas e outros momentos, como oração e avisos) e acompanhar o estado: rascunho, pronto, em andamento, concluído ou cancelado. |
| B4 Escala | Abrir vagas por função, convidar membros (chega e-mail), cada um confirma ou recusa, pedir e fazer substituição, informar disponibilidade e ver tudo em "Meus serviços". |
| B5 Navegação | Menu Início · Serviços · Músicas · Bandas · Mais; tema escuro por padrão; Início mostra o próximo serviço, confirmações pendentes e vagas abertas; acessível a teclado e toque. |
| B6 Música e ensaio | Aplicar um repertório ao serviço, escolher o tom da música só para aquele culto, reprise e medley, tela do músico com tudo do serviço, marcar "preparado", agendar ensaio e anexar links (YouTube, Drive). **Envio de arquivos ficou para depois, por decisão sua.** |
| B7 Execução e histórico | Ao concluir o serviço, fica o registro do que foi tocado, em que tom e por quem; a música mostra quando foi tocada e em quais tons; o Início mostra a atividade recente (só leitura). Serviço concluído não pode ser apagado. |
| B8 Privacidade | Aceite de Política e Termos no cadastro, idade mínima de 16 anos, exportar os próprios dados, excluir a conta (pede a senha de novo), remover membro e rotina de backup. **Os textos legais ainda são rascunho.** |
| Modo Palco | Cifra em tela cheia, escura, com a banda seguindo o MD em tempo real e funcionando com internet instável. |

## O que falta para concluir o PRODUTO

Itens pequenos de código, nenhum bloqueia o lançamento:
- Sincronização: dois casos raros ainda podem gerar "alteração não enviada" que o usuário precisa descartar (issue #127, itens 2 e 6).
- Palco do serviço: falta rolagem automática e troca rápida de tom (existem só no Palco de uma música avulsa). É recurso novo; o Palco está "congelado" até você decidir.
- Organização interna do código: #132 item 6 e #42 (sem efeito para o usuário).
- Um QA final de ponta a ponta no ambiente de produção, depois de subir.

## Lançamento e servidor (você, com ajuda de um amigo)

Hoje existe um **ambiente de teste** gratuito (Render + Neon, nos EUA), só com dados de teste. Para pessoas reais, a regra combinada é ter os dados no Brasil e os textos jurídicos prontos.

| Passo | O que decidir/fazer | Onde está o roteiro |
|---|---|---|
| 1. Hospedagem | Você prefere **AWS** (São Paulo) e vai decidir perto do lançamento. Precisa de: um servidor sempre ligado (um só), banco PostgreSQL 16 gerenciado com backup automático e conexão direta, HTTPS. | `docs/HOSTING_OPTIONS_BR.md` §5 (lista para o amigo) |
| 2. Domínio | Registrar um domínio próprio (ex.: no registro.br) e apontar para o servidor. Ajuda os e-mails a não caírem no spam. | — |
| 3. E-mail | Continua o **Brevo** (já integrado): remetente verificado e chave de API; com domínio próprio, configurar SPF/DKIM. | `docs/OPERATIONS.md` §3 |
| 4. Banco e backups | Ligar o backup automático do banco e fazer o dump manual; **testar um restore** e anotar a data. | `docs/BACKUP_RECOVERY.md` |
| 5. Subir o banco e o servidor | As 27 migrations rodam sozinhas quando o servidor sobe. A **0019 tem de estar aplicada antes do servidor novo** (a subida automática já garante a ordem). Banco novo e vazio (ex.: AWS): roda tudo do zero, sem dado a perder. Banco de teste atual: seguir o checklist, porque 0007/0008 apagam itens de teste. | `docs/GO_LIVE_CHECKLIST.md` |
| 6. Jurídico / LGPD | Advogado revisa Política, Termos, idade mínima, retenção, quem é o controlador e a transferência de dados. Depois, um PR troca o texto e pede novo aceite. | `docs/privacy/LEGAL_REVIEW_BRIEF.md`, `docs/privacy/privacy-policy.md`, `docs/privacy/terms.md` |
| 7. Monitoramento | Mínimo: alerta se o endereço `/health` parar de responder e olhar os logs do servidor. Não há monitoramento automático no código hoje. | `docs/OPERATIONS.md` §6 |
| 8. Registro da decisão | Um ADR novo substitui o ADR-060 (Render + Neon) quando a hospedagem for escolhida. A IA prepara; você aprova. | `docs/adr/README.md` |

**Custos estimados por mês** (pesquisa de 2026-10-22, sem impostos; confirme antes de contratar, `docs/HOSTING_OPTIONS_BR.md` §2):

| Opção | Custo aproximado |
|---|---|
| Ambiente de teste atual (Render + Neon gratuitos, EUA) | US$ 0 (só para teste) |
| Fly.io + Neon, São Paulo (mais barato no Brasil) | ~US$ 10–20 |
| AWS São Paulo (RDS + EC2), sua preferência | ~US$ 45–60 |
| Fly.io com banco gerenciado da Fly | ~US$ 45 |
| Brevo (e-mail) | plano gratuito com cota diária |

**Checklist resumido do lançamento:**
- [ ] Escolher a hospedagem (AWS ou outra) e registrar o ADR.
- [ ] Domínio próprio e e-mail Brevo com remetente do domínio.
- [ ] Banco com backup automático; dump manual; restore testado e anotado.
- [ ] Subir migrations + servidor juntos; conferir `/health`, cadastro, login, Palco com dois aparelhos.
- [ ] Texto jurídico final publicado e nova versão de aceite.
- [ ] Alerta de queda configurado.
- [ ] Só então convidar a primeira igreja real.

## Estimativa de andamento

| Frente | Pronto | Por quê |
|---|---|---|
| Produto (o que o app faz) | **~95%** | Todos os blocos do MVP estão em código e passaram por QA; restam ajustes pequenos (acima). |
| Lançamento (no ar para igrejas reais) | **~20%** | Já existem roteiros, checklist, scripts de backup, rascunhos legais e comparativo de hospedagem; faltam a escolha da hospedagem, o banco de produção, o restore real, o domínio e o texto jurídico. |

Estimativa de julgamento, não medição: o lançamento é curto em código, mas depende de decisões e de terceiros (advogado, amigo, provedores).

## Riscos conhecidos

- **Jurídico:** participar de um ministério pode revelar religião (dado sensível) e há adolescentes nas equipes. Sem o texto revisado, não convide usuários reais.
- **Dados fora do Brasil:** o ambiente de teste está nos EUA; serve só para teste.
- **Backup depende de você:** até haver backup automático, a perda máxima de 24 h só vale se o dump for feito todo dia.
- **Um servidor só:** atende bem 5–20 igrejas; crescer muito exige mudar a parte de tempo real.
- **Plano gratuito "dorme":** no ambiente de teste, abra o app uns minutos antes do culto.
- **E-mails no spam** enquanto não houver domínio próprio.
- **Sincronização:** em casos raros, o usuário vê "alteração não enviada" e precisa descartar; nada some sem aviso.
- **Uma pessoa só no projeto:** você e a IA. Os documentos em `docs/` e `.claude/handoffs/00-LEIA-ME-PRIMEIRO.md` existem para que qualquer pessoa (ou o seu amigo) consiga continuar.
