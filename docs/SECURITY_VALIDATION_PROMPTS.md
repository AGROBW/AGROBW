# Security Validation Prompts

Use estes prompts um por vez com o Claude, sempre fechando um tema antes de abrir o proximo.

## Ordem recomendada

1. Segredos e privilegio
2. Superficies expostas
3. Logica de negocio
4. Abuse / rate limiting
5. Dependencias
6. Observabilidade
7. Producao / infraestrutura

## Como usar

- Envie um prompt por vez.
- Nao deixe o Claude abrir outras frentes no mesmo ciclo.
- Feche cada bloco com:
  - concluido
  - pendente
  - risco residual aceito

---

## 1. Segredos e privilegio

```text
Quero validar a frente de segredos e privilegio de forma sistematica, nao fazer caca generica.

Objetivo:
confirmar se existe exposicao de segredo, privilegio excessivo, uso indevido de service_role, ou credenciais sensiveis em frontend, repo, logs, builds ou Edge Functions.

Escopo:
- variaveis de ambiente
- service_role
- tokens de webhook
- chaves de API
- segredos em frontend
- segredos em Edge Functions
- privilegios excessivos em integracoes
- credenciais em logs, fallback, preview deploy ou codigo versionado

Regras:
- nao altere nada ainda
- nao implemente correcoes
- nao abra outras frentes
- primeiro quero so diagnostico

Quero que voce entregue:
1. mapa da superficie
2. o que foi validado
3. achados confirmados
4. hipoteses que ainda precisam de teste
5. comandos e passos exatos para eu validar
6. conclusao final:
- concluido
- pendente
- risco residual aceito

Antes de aprofundar, me entregue um plano curto do que vai inspecionar primeiro.
```

---

## 2. Superficies expostas

```text
Quero validar a frente de superficies expostas de forma sistematica, nao fazer caca generica.

Objetivo:
confirmar se existe alguma rota, Edge Function, RPC, endpoint publico ou superficie administrativa exposta sem autenticacao adequada, sem checagem de privilegio, sem aal2 quando deveria, ou fora do padrao de seguranca do projeto.

Escopo:
- todas as Edge Functions
- RPCs / funcoes SQL expostas
- rotas/paginas administrativas
- endpoints publicos
- operacoes sensiveis que exigem auth
- operacoes sensiveis que exigem admin
- operacoes sensiveis que deveriam exigir aal2
- qualquer superficie esquecida, legada ou inconsistente

Regras:
- nao altere nada ainda
- nao implemente correcoes
- nao abra outras frentes
- primeiro quero so diagnostico

Quero que voce entregue:
1. mapa da superficie
2. o que foi validado
3. achados confirmados
4. hipoteses que ainda precisam de teste
5. comandos, queries ou passos exatos para eu validar
6. conclusao final:
- concluido
- pendente
- risco residual aceito

Antes de aprofundar, me entregue um plano curto do que vai inspecionar primeiro.
```

---

## 3. Logica de negocio

```text
Quero validar a frente de logica de negocio de forma sistematica, nao fazer caca generica.

Objetivo:
confirmar se existe alguma brecha funcional que permita fraude, bypass de regra de negocio, concessao indevida de beneficio, ganho financeiro indevido, ou acao administrativa sensivel sem protecao suficiente.

Escopo:
- planos
- assinaturas
- pagamentos
- boosters
- creditos
- anuncios pagos/destaques
- concessoes administrativas
- cancelamentos
- reembolsos
- fluxos promocionais
- qualquer caminho em que usuario possa receber beneficio sem pagar ou sem autorizacao correta

Regras:
- nao altere nada ainda
- nao implemente correcoes
- nao abra outras frentes
- primeiro quero so diagnostico

Quero que voce entregue:
1. mapa da superficie
2. o que foi validado
3. achados confirmados
4. hipoteses que ainda precisam de teste
5. comandos, queries ou passos exatos para eu validar
6. conclusao final:
- concluido
- pendente
- risco residual aceito

Antes de aprofundar, me entregue um plano curto do que vai inspecionar primeiro.
```

---

## 4. Abuse / rate limiting

```text
Quero validar a frente de abuse / rate limiting de forma sistematica, nao fazer caca generica.

Objetivo:
confirmar se existe risco relevante de abuso, brute force, spam, scraping, flood, consumo indevido de recursos, ou operacoes sensiveis sem limitacao adequada.

Escopo:
- login
- MFA
- reset de senha
- cadastro
- webhooks
- uploads
- captura de URLs
- geracao de conteudo
- formularios
- tickets/suporte
- qualquer endpoint caro, sensivel ou exposto a automacao

Regras:
- nao altere nada ainda
- nao implemente correcoes
- nao abra outras frentes
- primeiro quero so diagnostico

Quero que voce entregue:
1. mapa da superficie
2. o que foi validado
3. achados confirmados
4. hipoteses que ainda precisam de teste
5. comandos, queries ou passos exatos para eu validar
6. conclusao final:
- concluido
- pendente
- risco residual aceito

Antes de aprofundar, me entregue um plano curto do que vai inspecionar primeiro.
```

---

## 5. Dependencias

```text
Quero validar a frente de dependencias de forma sistematica, nao fazer caca generica.

Objetivo:
confirmar se existem bibliotecas vulneraveis, desatualizadas de forma relevante, abandonadas, ou especialmente sensiveis do ponto de vista de seguranca e manutencao.

Escopo:
- dependencias do frontend
- dependencias do backend / Edge Functions
- bibliotecas de auth
- bibliotecas de upload
- bibliotecas de editor rich text / HTML
- DOMPurify
- Supabase SDK
- bibliotecas de pagamento
- bibliotecas de scraping/captura
- qualquer dependencia critica para seguranca ou exposicao externa

Regras:
- nao altere nada ainda
- nao implemente correcoes
- nao abra outras frentes
- primeiro quero so diagnostico

Quero que voce entregue:
1. mapa da superficie
2. o que foi validado
3. achados confirmados
4. hipoteses que ainda precisam de teste
5. comandos e passos exatos para eu validar
6. conclusao final:
- concluido
- pendente
- risco residual aceito

Antes de aprofundar, me entregue um plano curto do que vai inspecionar primeiro.
```

---

## 6. Observabilidade

```text
Quero validar a frente de observabilidade de seguranca de forma sistematica, nao fazer caca generica.

Objetivo:
confirmar se o sistema gera evidencia suficiente para detectar abuso, investigar incidente, rastrear acoes sensiveis e acompanhar bloqueios de seguranca sem vazar informacao indevida.

Escopo:
- logs de autenticacao
- logs administrativos
- logs de webhook
- security_events
- eventos de bloqueio
- trilhas de auditoria
- qualidade dos metadados gravados
- lacunas de visibilidade
- risco de vazar segredo ou dado sensivel em log

Regras:
- nao altere nada ainda
- nao implemente correcoes
- nao abra outras frentes
- primeiro quero so diagnostico

Quero que voce entregue:
1. mapa da superficie
2. o que foi validado
3. achados confirmados
4. hipoteses que ainda precisam de teste
5. comandos, queries ou passos exatos para eu validar
6. conclusao final:
- concluido
- pendente
- risco residual aceito

Antes de aprofundar, me entregue um plano curto do que vai inspecionar primeiro.
```

---

## 7. Producao / infraestrutura

```text
Quero validar a frente de producao / infraestrutura de forma sistematica, nao fazer caca generica.

Objetivo:
confirmar se existe risco relevante na configuracao de producao, deploy, dominio, headers, redirects, sessoes, segredos operacionais, backup/restore, monitoramento ou integracoes externas.

Escopo:
- Vercel / ambiente publicado
- Supabase de producao
- dominio e redirects
- headers de seguranca
- CSP
- sessao/cookies
- secrets operacionais
- integracoes externas
- backups
- restore
- monitoramento
- alertas
- readiness de go-live

Regras:
- nao altere nada ainda
- nao implemente correcoes
- nao abra outras frentes
- primeiro quero so diagnostico

Quero que voce entregue:
1. mapa da superficie
2. o que foi validado
3. achados confirmados
4. hipoteses que ainda precisam de teste
5. comandos, queries ou passos exatos para eu validar
6. conclusao final:
- concluido
- pendente
- risco residual aceito

Antes de aprofundar, me entregue um plano curto do que vai inspecionar primeiro.
```
