# Piloto nacional de 7–8 minutos

O formato do teste 05 foi aprovado. A nova montagem roda dentro do contêiner do worker: `worker/studio/render.py`, chamada por `worker/studio.ts`. O Docker inclui Python, Pillow, NumPy, FFmpeg e as fontes usadas. A mixagem processa quatro segundos por vez, sem carregar a edição inteira em arrays de áudio.

## Caminho de uma edição

`episodes.script_json.presentation` usa o schema `lib/studio-plan.ts`, modo `heygen`, look aprovado de Clara/Pingo e engine Avatar IV. O plano contém aprovação do texto, teto financeiro, duração máxima, geografia das matérias, manchetes extras com fontes e inserts vinculados a palavras efetivamente faladas.

O worker valida referências visuais, cobertura, fontes, imagens disponíveis, carteira e acesso ao canal antes de gerar fala. Em seguida registra cada etapa paga antes de enviá-la; cria Marin, obtém transcrição e tempos reais, envia o áudio ao HeyGen, consulta o avatar até o estado terminal, monta o MP4 no próprio worker e entrega ao uploader retomável existente. A verificação do YouTube mantém o vídeo privado. Nenhum `publishAt` ou autorização pública foi adicionado.

Se uma chamada paga tiver começado e não houver resultado persistido, o worker bloqueia a edição para reconciliação. Não repete o POST para descobrir se funcionou. Se o avatar já foi criado, uma retomada não exige novamente o saldo anterior à cobrança. O arquivo gerado e os registros são reaproveitados.

## Regras editoriais do plano

- Maioria brasileira, pelo menos três macrorregiões nas matérias principais e nenhuma cidade repetida entre essas pautas. A escolha editorial pode cobrir as cinco regiões.
- As manchetes da faixa não podem usar a mesma reportagem de uma matéria narrada; retirar parâmetros de rastreamento não contorna a comparação.
- Fontes das matérias e da faixa devem estar no manifesto editorial verificado.
- Uma imagem que já contém informação ocupa um cutaway próprio, com proporções preservadas e área de legenda separada. A faixa fica oculta nesse intervalo, e não se acrescenta manchete sobre a imagem. O plano trata imagens como contendo texto por padrão.
- As legendas vêm dos tempos reais de palavras e preservam pontuação. Datas e anos são agrupados. Nomes e transcrições ambíguas ainda exigem conferência antes de considerar a edição editorialmente validada.
- O estúdio e o enquadramento do avatar são preservados. Imagens documentais não são inventadas.

O seletor automático de notícias anterior ainda produz o formato antigo, curto, e precisa de expansão e validação para o perfil nacional longo. Ele não é apresentado como validado para este piloto. O render estático legado fica bloqueado por padrão; `ALLOW_LEGACY_STATIC_RENDER=true` existe somente para uma eventual operação histórica explícita. Não habilitar um fluxo antigo como substituto silencioso do formato aprovado.

## Verificação de prontidão e ensaio sem créditos novos

`PRODUCTION_PREFLIGHT_KEY` registra em `audit_events.PRODUCTION_READINESS` uma consulta atual ao OAuth/canal e à carteira HeyGen, sem salvar credenciais. Um novo marcador executa uma nova verificação. O dashboard protegido mostra esses resultados e a estimativa financeira.

`STUDIO_PROBE_KEY` executa o compositor no Railway usando `work/test05/aroll.mp4`, `master.wav` e as transcrições já produzidas, mais o anúncio real consultado. Não chama TTS, transcrição ou geração HeyGen. Registra `STUDIO_PROBE_READY` com duração, hash e resultado técnico, ou `STUDIO_PROBE_FAILED`. É ensaio de infraestrutura, não uma edição jornalística nova nem uma publicação.

## Orçamento

Tarifa consultada em 03/11/2026: Photo Avatar IV US$ 2,31/minuto. Estimativas: 420 s → US$ 16,17; 480 s → US$ 18,48, excluindo voz, transcrição e infraestrutura. O teto do plano e a carteira disponível precisam comportar a duração máxima antes de iniciar novas chamadas pagas. O resultado real deve ser reconciliado pela diferença de saldo e, quando disponível, pelo extrato.

Fonte: https://help.heygen.com/en/articles/10060327-heygen-api-pricing-explained

## Validação e limites

Os testes exercitam o orçamento, a diversidade nacional, a proteção contra repetir uma cobrança incerta e um encode real de fixture que comprova a ausência da faixa sobre um cutaway de imagem. O ensaio real no Railway é registrado separadamente. Nem fixtures nem um encode bem-sucedido certificam fatos, escuta, expressividade ou sincronização labial percebida.

O piloto completo somente estará concluído quando a nova pauta longa, geração, montagem, envio e verificação de um vídeo privado no canal forem executados. Saldo insuficiente, OAuth inválido, roteiro sem confirmação ou etapa ambígua bloqueiam a execução. Não registrar essas pendências como integrações concluídas.
