## Auditoria Tecnica - Ponto de Pausa (2026-06-12)

### Estado atual

A auditoria tecnica do BWAGRO foi encerrada com sucesso.

Fechado:
- RLS, grants, policies, views e SECURITY DEFINER
- SMTP backend-only + aal2
- Webhooks Asaas endurecidos
- Webhook fiscal com idempotencia
- RPCs com erros 400 corrigidas
- Hardening de guardas admin com aal2
- Edge/API authz + IDOR sem achado ativo
- seller_stores.is_verified corrigido
- Residual 2B/2C tecnico encerrado

### Residuais aceitos/documentados

- HMAC de corpo do Asaas: residual aceito por limitacao do provedor, mitigado por idempotencia + confirmacao via API
- CSP script-src sem nonce: adiado para pos-go-live
- webhook-fiscal: existe um refinamento opcional de robustez
  - hoje a registry por `ref:status` e gravada antes de confirmar se o `payment` existe
  - isso nao reabre vulnerabilidade; e apenas um edge case raro de consistencia
- `is_current_user_moderator()`: funcao morta, drop opcional de housekeeping

### O que NAO ficou pendente na parte tecnica

- Nao ha vulnerabilidade ativa conhecida em aberto dentro do escopo auditado
- O item 5 (idempotencia do webhook-fiscal) foi validado sinteticamente:
  - primeiro envio: `404 Payment not found`
  - replay identico: `200 ok`
  - `webhook_request_registry`: 1 linha para o `request_id`

### Ponto de pausa decidido

O trabalho tecnico foi pausado aqui para permitir ajustes no projeto antes de iniciar o bloco operacional.

### Proximo passo quando retomar

Abrir uma frente separada de go-live operacional:
- rotacionar chave/token do Asaas
- reenroll de MFA dos 2 admins
- purge/limpeza do historico git sensivel
- revisar configuracoes finais de Supabase, Vercel, SMTP e fiscal

### Observacao sobre fiscal

Hoje o projeto ainda possui integracao fiscal modelada em torno da FocusNFe:
- `supabase/functions/issue-nfse/index.ts`
- `supabase/functions/webhook-fiscal/index.ts`
- `src/hooks/useFiscalSettings.ts`

Como o uso pretendido e apenas NFS-e de servico, existe forte indicacao de que migrar para o emissor do Asaas pode simplificar bastante a stack fiscal. Porem isso ficou deliberadamente adiado, porque ainda nao houve validacao real da emissao no Asaas/prefeitura.

Decisao atual:
- nao evoluir mais a FocusNFe por enquanto
- validar o emissor NFS-e do Asaas mais adiante
- se o teste real passar, tratar a migracao Asaas x FocusNFe como frente nova de arquitetura/produto, nao como correcao de seguranca
