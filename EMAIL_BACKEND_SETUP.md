# Backend tradicional de e-mail

Este projeto agora possui um backend Node tradicional para:

- testar conexao SMTP
- enviar e-mail de teste
- processar filas de e-mail no Supabase

Tambem foram adicionadas rotas compativeis com a Vercel para teste rapido:

- `/api/email/test-connection`
- `/api/email/send-test`
- `/api/email/process-jobs`

## O que ele processa

- `contact_notification_email_jobs`
- `plan_alert_email_jobs`
- `radar_match_email_jobs`

## Dependencias

Instale as dependencias do projeto:

```powershell
npm install
```

## Variaveis necessarias

Defina no ambiente do backend:

```env
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_ANON_KEY=SEU_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=SEU_SERVICE_ROLE_KEY
APP_URL=https://seudominio.com.br
EMAIL_BACKEND_PORT=4010
EMAIL_BACKEND_SECRET=UMA_CHAVE_FORTE
EMAIL_PROCESSOR_AUTO_START=false
EMAIL_PROCESSOR_INTERVAL_MS=60000
```

Para o frontend usar esse backend no painel SMTP:

```env
VITE_EMAIL_BACKEND_URL=http://localhost:4010
```

Na Vercel, para teste, use:

```env
VITE_EMAIL_BACKEND_URL=https://SEU-PROJETO.vercel.app
```

## Rodar o backend tradicional

```powershell
npm run email:backend
```

Endpoints disponiveis:

- `GET /health`
- `POST /api/email/test-connection`
- `POST /api/email/send-test`
- `POST /api/email/process-jobs`

## Teste pela Vercel

Se quiser testar rapidamente pela Vercel:

1. publique o projeto com as envs corretas
2. configure:

```env
VITE_EMAIL_BACKEND_URL=https://SEU-PROJETO.vercel.app
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_ANON_KEY=SEU_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=SEU_SERVICE_ROLE_KEY
APP_URL=https://SEU-PROJETO.vercel.app
EMAIL_BACKEND_SECRET=UMA_CHAVE_FORTE
```

3. o painel SMTP vai chamar as rotas `/api/email/...` da propria Vercel

Observacao:

- isso serve bem para teste
- para operacao continua em producao, o backend tradicional continua sendo o caminho mais solido

## Autenticacao

### Teste SMTP no painel

As rotas:

- `/api/email/test-connection`
- `/api/email/send-test`

validam o JWT do admin logado pelo Supabase.

### Processamento das filas

Voce pode chamar `/api/email/process-jobs` de duas formas:

1. com `Authorization: Bearer <jwt_admin>`
2. com header:

```text
x-email-backend-secret: SUA_CHAVE_FORTE
```

## Cron universal

Se quiser um cron externo de 1 em 1 minuto:

### Windows

Chame:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4010/api/email/process-jobs" `
  -Headers @{ "x-email-backend-secret" = "SUA_CHAVE_FORTE" } `
  -ContentType "application/json" `
  -Body "{}"
```

### Linux

```bash
* * * * * curl -X POST http://localhost:4010/api/email/process-jobs -H "x-email-backend-secret: SUA_CHAVE_FORTE" -H "Content-Type: application/json" -d '{}'
```

## Modo automatico

Se preferir deixar o backend se auto-processando, use:

```env
EMAIL_PROCESSOR_AUTO_START=true
EMAIL_PROCESSOR_INTERVAL_MS=60000
```

Nesse modo, ele processa as filas internamente a cada 1 minuto sem precisar de cron externo.
