# HeyGen direto no worker

`HEYGEN_API_KEY` fica exclusivamente nas variáveis do Railway. A inicialização consulta `GET /v3/users/me` e registra somente autenticação, correspondência da conta e saldo sanitizado em `HEYGEN_API_READY`.

O teste autorizado 04 usa opt-in `HEYGEN_PILOT_KEY=ainda-bem-04-outro-api-v1`. Reutiliza o avatar aprovado e o áudio Marin do encerramento. Nenhum novo TTS, novo avatar ou publicação pública é acionado por esse módulo.

O saldo deve ser carteira USD com ao menos US$ 2. A estimativa de US$ 1 para 25,968 s de Photo Avatar IV usa a tarifa pública de US$ 2,31/min e não constitui medição faturada. O delta de saldo antes/depois é registrado como variação da conta compartilhada, não como atribuição exata ao job.

Um lock PostgreSQL serializa a submissão. `SUBMITTING` é gravado antes do POST; resposta incerta não é repetida automaticamente. `CREATED` guarda o video_id; o worker consulta o mesmo ID a cada 30 s e preserva o MP4 em `/data/work/heygen-pilot/`. Falha terminal encerra o teste sem regeneração. Um novo identificador de teste exige mudança explícita no código; reinícios não repetem cobrança.

Eventos: HEYGEN_API_READY/FAILED; HEYGEN_PILOT_SUBMITTING/CREATED/STATUS/COMPLETED/FAILED. Segredos e respostas brutas de erro não entram nos logs.

Documentação: https://developers.heygen.com/user-profile e https://developers.heygen.com/audio-to-video .
