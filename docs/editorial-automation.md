# Produção editorial automática

O programa pesquisa notícias recentes do Brasil e do mundo. Cada edição deve conter pelo menos uma notícia brasileira e uma internacional. O horizonte de pesquisa é de 14 dias; a data de publicação deve estar presente na página consultada.

## Verificações

1. Pesquisa via Responses API com web search, limitada a fontes institucionais autorizadas.
2. Exigência de URLs presentes nas citações da resposta da pesquisa.
3. Consulta HTTPS à página original, com limites de tamanho, tempo e redirecionamento.
4. Conferência de trecho literal, data e integridade do conteúdo recuperado.
5. Revisão factual automatizada do roteiro contra as páginas consultadas.
6. Conferência dos hashes da referência aprovada de Clara e Pingo.
7. Renderização com identificação de audiovisual sintético e verificação FFprobe.
8. Upload privado retomável e confirmação de processamento e privacidade via YouTube API.

Essas verificações reduzem erros; revisão por modelos pode falhar. A rotina bloqueia a edição quando não obtém evidência suficiente. Nenhuma imagem documental é gerada ou retirada da internet automaticamente. A versão atual usa a referência visual aprovada, com manchetes e contexto em tela, sem animação labial dos personagens.

## Configuração

- `AUTO_EDITORIAL_ENABLED`: habilita a produção recorrente após teste real bem-sucedido.
- `OPENAI_EDITORIAL_MODEL`: modelo com suporte à busca web na Responses API.
- `EDITORIAL_PROBE_KEY`: identificador único para um teste de pesquisa sem renderização ou upload; uma execução por identificador.
- `OPENAI_API_KEY`, `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE`: credenciais e modelo de narração.
- `CLARA_APPROVED_SHA256`, `PINGO_APPROVED_SHA256`: identidade visual aprovada. A versão atual usa uma imagem combinada, com hashes iguais.

Segredos ficam nas variáveis da infraestrutura. As referências visuais e os roteiros são mantidos no banco privado e no volume persistente do worker; não são incorporados ao repositório público.

## Agenda e limites atuais

O cron da aplicação e a rotina do worker usam a mesma chave por data para evitar criar duas edições. A janela de produção começa às 06h de terça e sexta, no fuso `America/Sao_Paulo`; o horário alvo é 11h30. Até a aprovação inicial e a implementação/validação da liberação pública, todos os uploads permanecem privados: o horário alvo não os torna públicos.

Uma edição bloqueada exige diagnóstico e nova tentativa explícita. Não há repetição ilimitada de chamadas de pesquisa pagas. Auditoria registra os resultados do teste, fontes e verificação do vídeo. Uma falha de busca não substitui notícias por conteúdo inventado.

Gemini tem adaptador de rascunho separado e exige suas próprias credenciais; a produção atual usa OpenAI para pesquisa, revisão e voz. Alertas externos dependem da configuração de um destino. A durabilidade do OAuth, o agendamento público e a recuperação após interrupção real de upload devem ser validados antes da operação pública sem supervisão.
