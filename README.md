# Ainda Bem! — implementação operacional em desenvolvimento

Canal: `UCX85MdRZ1IoRBlx0NWfhaVg`. Stack: Next.js/TypeScript na Vercel, Neon PostgreSQL e worker Docker no Railway.

Leia [IMPLEMENTACAO.md](IMPLEMENTACAO.md) para o estado real. Nenhum serviço externo deve ser considerado integrado antes de testes autenticados. O uploader envia apenas vídeos privados. `PUBLICATION_ENABLED` não habilita publicação pública nesta versão.

## Executar

```sh
npm ci
cp .env.example .env.local
# Preencher variáveis no ambiente; scripts Node não carregam .env.local automaticamente.
npm run typecheck
npm test
npm run build
# Com DATABASE_URL exportada:
npm run db:migrate
npm run dev
# Worker com todas as variáveis exportadas:
npm run worker
```

Node 24. Teste FFmpeg requer ffmpeg/ffprobe no PATH. Docker inclui FFmpeg. Scripts de migração usam uma transação, advisory lock e registro das migrações aplicadas. Não colocar segredos em comandos compartilhados, histórico ou Git.

## Serviços e configuração

1. Criar repositório privado e enviar o código. Importar na Vercel como Next.js. Build `npm run build`; instalação `npm ci`.
2. Criar Neon, usar conexão pooled na aplicação e conexão direta para migrações quando disponível. Preencher `DATABASE_URL` em Vercel e Railway, com TLS. Aplicar `npm run db:migrate` e registrar resultado.
3. Railway: raiz do repositório; `railway.json` seleciona `worker/Dockerfile`. Montar volume persistente em `/data`, armazenar mídias aprovadas em `/data/media`. Executar uma única réplica nesta etapa. Testar build Docker e reinicialização antes de produção.
4. Google Cloud: habilitar YouTube Data API v3, configurar consentimento e cliente OAuth Web. Cadastrar URI exata `https://DOMINIO/api/oauth/google/callback`. Preencher client ID/secret e redirect URI na Vercel e no Railway. O worker precisa renovar o token no mesmo cliente.
5. Gerar chaves independentes para `ADMIN_SETUP_KEY`, `CRON_SECRET`, `WORKER_CALLBACK_SECRET`; gerar `ENCRYPTION_KEY_HEX` de 32 bytes. A chave de criptografia precisa ser igual nos dois serviços. Manter em secret managers e ter cópia de recuperação segura.
6. Iniciar OAuth por GET `/api/oauth/google/start` com header `Authorization: Bearer …`. A resposta é um redirect e um cookie de estado. O botão Autorizar YouTube do dashboard usa POST com header e preserva o cookie antes de redirecionar. Não inserir a chave na URL. Login SSO/RBAC ainda pendente. Confirmar que `channels.list(mine=true)` retorna o canal alvo antes de persistir refresh token.
7. Definir `OPENAI_API_KEY`, `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE`, `GEMINI_API_KEY`, `GEMINI_MODEL`. Escolher modelos e limites de gastos antes de chamadas reais.
8. Obter referências visuais aprovadas de Clara/Pingo e definir SHA-256 em `CLARA_APPROVED_SHA256`, `PINGO_APPROVED_SHA256`. Não gerar substitutos. O ZIP não contém as referências.
9. Configurar webhook HTTPS de alertas e testar entrega. A reconciliação padrão é diária; para monitoramento frequente contratar plano adequado ou executar um scheduler externo autenticado.

## Fluxo editorial e audiovisual

Cron cria edição terça/sexta às 06h de Brasília (09h UTC). `lib/schedule.ts` calcula o alvo 11h30 no fuso IANA `America/Sao_Paulo`. Não há publicação pública implementada.

Submeter `POST /api/editorial` autenticado com `episodeId` e `script` válido em `lib/editorial.ts`: título, descrição, classificação madeForKids, narração, fontes com URL/trecho/data/revisor, mídias locais com SHA-256/licença/flag sintética e aprovação das referências de marca. Isso é aprovação humana, não comprovação automática da notícia.

Worker toma lock `FOR UPDATE SKIP LOCKED`, usa lease renovável, tenta no máximo cinco vezes e renderiza a primeira imagem aprovada com narração OpenAI. A marca de audiovisual sintético fica visível. As demais imagens são verificadas, mas ainda não entram numa montagem multicana. O adaptador Gemini gera somente rascunhos; não está ligado automaticamente à fila. Pesquisa jornalística, seleção de matérias, geração de cenas, animações e legendas completas ainda não estão implementadas.

Upload verifica canal, inicia sessão retomável, persiste URI criptografada, consulta offset com PUT vazio e continua em blocos de 8 MiB. HTTP 308 indica progresso. Erros preservam sessão para retomada; sessões expiradas exigem reconciliação manual antes de qualquer reset. Não há reset automático que possa duplicar vídeo. Falha entre criação remota da sessão e persistência local ainda requer tratamento operacional.

Depois do upload, edição permanece `VERIFYING`. Conferir processamento, privacidade e conteúdo no YouTube e registrar evidências. Reconciliador de processamento do YouTube, aprovação por episódio para publicação e ativação pública ainda pendentes.

## Observabilidade

Dashboard consulta `/api/status` sob chave em memória, sem localStorage. `/api/metrics` protegido expõe contagens Prometheus. Worker emite JSON sem tokens; heartbeat no banco. `/api/cron/reconcile` detecta atraso e ausência de heartbeat e tenta enviar alerta se configurado. Não há collector de métricas, painel externo, tracing, SSO/RBAC, deduplicação de alertas nem monitoramento externo configurados.

## Verificação privada exigida

- Aplicar migrações em Neon e registrar versão.
- Completar consentimento e conferir ID do canal.
- Executar TTS e Gemini com fontes verificadas e limites de custo.
- Renderizar episódio aprovado; conferir áudio, fontes, licenças e fidelidade de Clara/Pingo.
- Fazer upload privado, interromper worker e comprovar retomada sem duplicação.
- Consultar `videos.list` para verificar `privacyStatus=private` e processamento concluído. O código não realiza ainda essa consulta automaticamente.
- Receber alerta real e conferir dashboard/heartbeat após reinicialização.
- Somente após aprovação explícita implementar/liberar o agendamento público com `publishAt` futuro. Nunca usar horário passado.

## Referências técnicas

- https://developers.google.com/youtube/data/guides/using_resumable_upload_protocol
- https://developers.google.com/youtube/data/reference/rest/v3/videos
- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://neon.com/docs/connect/connect-from-any-app
- https://docs.railway.com/guides/dockerfiles
