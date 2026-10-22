# Ideias futuras — importação de músicas e áudio por música

> **Status: ideias registradas, NÃO aprovadas.** Nenhuma spec, ADR ou código. Origem: conversa com o owner em 2026-10-21/22. Adiadas de propósito para dar tempo de pensar e validar se o usuário final usaria. Qualquer retomada passa pelo planner (Feature Spec + ADR `Proposed`) e pelo teste de fronteira do Blueprint §40. Não é fonte de escopo (`AI_CONTEXT.md` §2).

## 1. Importar músicas além do `.txt`

**Hoje:** só `.txt` no formato do CANTUM (`parseSongDraft`), com tela de revisão antes de salvar (`ImportSongPage`). Essa revisão é a base de qualquer caminho novo ("converte e o usuário edita depois").

**Intenção do owner:** o usuário trazer uma cifra (ou, no limite, um áudio) e o sistema montar letra e cifra, que o usuário ajusta depois. O ponto de partida exato ainda não foi escolhido:

| | Entrada | Saída | IA? |
|---|---|---|---|
| A | Cifra pronta em outro formato (texto copiado, PDF, Word, foto/print) | Letra + cifra no formato do CANTUM | Não (texto/PDF/Word); OCR para foto |
| B | Só a letra | Sugestão de acordes | Sim |
| C | Áudio | Letra e acordes | Sim |

**Degraus (do mais barato ao mais arriscado):**
1. **Sem IA, determinístico (recomendado como primeiro passo):** colar texto num campo (sem arquivo); detectar "linha de acordes sobre a letra" e converter; PDF com texto selecionável e Word (extrair texto e usar o mesmo conversor); inferir o tom pelo primeiro/último acorde; marcar seções (Verso, Refrão) por palavras-chave. Offline, nada sai do aparelho. Domínio puro + UI, sem migration. Dependência nova (leitor de PDF/Word) exige justificativa e carga sob demanda.
2. **Foto/print com OCR no aparelho:** biblioteca de OCR no navegador, offline, sem enviar dados. Alinhamento de acordes é frágil: a revisão é obrigatória. Custo de peso no PWA (carregar só ao usar).
3. **IA (áudio → letra/acordes, letra → acordes):** conteúdo do usuário sai para terceiros (LGPD, subprocessador, custo, exige internet), qualidade variável e direito autoral da letra gerada. **Fora da fronteira** (`AI_CONTEXT.md` §8; Blueprint: "recursos de inteligência" = futuro não comprometido). Só com decisão explícita do owner + ADR.

**Riscos/regras:** nada de importação por link/raspagem de sites de cifra (viola os termos deles); responsabilidade do usuário pelos direitos autorais nos termos de uso (texto jurídico é do owner/advogado); mostrar o resultado e permitir edição antes de salvar é parte do produto.

**Perguntas em aberto:** situação mais comum do usuário (site, PDF/foto de caderno, áudio)? foto/caderno é importante a ponto de valer o OCR? o degrau 3 fica como "talvez no futuro" ou é descartado?

## 2. Áudio por música com player (inclui importação de MP3 pelo Google Drive)

**Intenção do owner:** o usuário importar um arquivo de áudio (MP3) — por vínculo/acesso ao Google Drive ou pelo aparelho — para o membro da banda ouvir a música **antes** de tocar (ritmo, arranjo). O áudio fica como arquivo, com cópia guardada pelo app. **Não toca no Modo Palco** (que segue congelado, D6); o player vive na tela da música/serviço (por exemplo, a visão do músico `/services/:id/prepare`). Letra/cifra seguindo a voz foi uma ideia inicial do owner, mas o app de referência **não** sincroniza (rolagem manual).

**Referência funcional** (descrição feita pelo GPT a partir de um vídeo de um app de louvor local; não é fonte de arquitetura nem para copiar marca/ativos): evento → aba Repertório → músicas na ordem; **cada música com várias faixas de áudio** (instrumental, voz principal, contralto, soprano, tenor; às vezes em outro tom); tocar uma faixa abre **miniplayer** fixo no rodapé, que expande para um **player** (título, progresso, pausa, abas Letra | Cifra, letra rolável independente do áudio); "Letra e cifra" recolhível em cada música; skeletons de carregamento. Fora da fronteira e **não** importar: aba de comentários e agenda mensal/semanal como produto (`AI_CONTEXT.md` §8). A verificar se a VS-03 já cobre: "pedir troca/indicar substituto" e contador de confirmados.

**Encaixe no CANTUM:** serviço/Ordem/escala já existem; a tela do músico (B6 fatia 4) é o contêiner natural. Áudio = material de áudio **da música** (o B6 já prevê `materials` com dono `song_id`; upload é a fatia 8, bloqueada pela ADR-064 `Accepted` e pela D10 de armazenamento). Faixas com tipo/voz e **tom da faixa** (avisar se diverge do tom do serviço, RN-08). Sem sincronização letra↔áudio no primeiro corte (manual ou IA só depois, e IA exige decisão do owner).

**Decisões do owner até aqui:** cópia no servidor (não só link); áudio fora do Palco; termos de uso com responsabilidade do usuário; servidor migra depois para hospedagem paga (AWS ou similar), então o armazenamento deve ser trocável (API compatível com S3) e hospedado no Brasil (`AI_CONTEXT.md` §3); começar com cota pequena por organização.

**Google Drive:** o acesso amplo a arquivos exige verificação/auditoria do Google (lenta). Alternativas: Google Picker com escopo `drive.file` (o app só vê o arquivo escolhido) ou, mais simples, **enviar pelo aparelho** (o seletor do celular já abre o Drive, sem OAuth). Recomendação: começar pelo envio pelo aparelho.

**Ponto aberto de produto:** a ideia de apagar o áudio quando a banda fechar ou ~15 dias após o serviço conflita com faixas que pertencem à música e são reaproveitadas em vários serviços. Alternativa: áudio fica com a música, com cota e exclusão manual; a limpeza automática vale para o cache do aparelho.

**Riscos:** direitos autorais (gravações de terceiros e vozes separadas): termos + validação jurídica (D6); peso e cota (o peso é do áudio, não da biblioteca de textos); sobre a biblioteca pessoal (owner está revendo): remover exige ADR novo, e "biblioteca por banda" conflita com "Organização é dona de Song" — usar filtro por banda.

## 3. Se for retomado
Ordem sugerida: spec do degrau 1 de importação (pequena, sem IA) → decisão D10 de armazenamento + ADR → faixas por música e upload → player → (opcional) sincronização. Nada disso entra antes de fechar o B6 sem decisão do owner.
