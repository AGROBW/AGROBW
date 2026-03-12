# 🛡️ Sistema de Eventos de Segurança - Documentação

## ✅ Status da Implementação

**COMPLETO (100%)** - Sistema de auditoria de tentativas de acesso não autorizado

### Componentes Implementados

✅ **Tabela `security_events`** - Armazenamento de eventos de segurança  
✅ **Função SECURITY DEFINER** - Logging sem restrições RLS  
✅ **Hook `useSecurityLog`** - API simplificada para frontend  
✅ **ProtectedAdminRoute** - Integração automática de logging  
✅ **UI Limpa** - Tela de acesso negado sem informações técnicas  
✅ **Views de Análise** - Estatísticas e eventos críticos  
✅ **Triggers** - Notificações automáticas para eventos críticos

---

## 🏗️ Arquitetura

### Fluxo de Segurança

```
┌──────────────────────────────────────────────────────────────┐
│                  TENTATIVA DE ACESSO                         │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│            ProtectedAdminRoute (Middleware)                  │
│  • Verifica autenticação                                     │
│  • Verifica role do usuário                                  │
│  • Compara com role requerido                                │
└──────────────────────────────────────────────────────────────┘
                            ↓
                 [ACESSO PERMITIDO?]
                            ↓
                     ┌─────┴─────┐
                     │           │
                 [SIM]         [NÃO]
                     │           │
                     │           ↓
                     │  ┌────────────────────────────┐
                     │  │ useSecurityLog.            │
                     │  │ logUnauthorizedAccess()    │
                     │  └────────────────────────────┘
                     │           ↓
                     │  ┌────────────────────────────┐
                     │  │ Supabase RPC:              │
                     │  │ log_unauthorized_access()  │
                     │  │ (SECURITY DEFINER)         │
                     │  └────────────────────────────┘
                     │           ↓
                     │  ┌────────────────────────────┐
                     │  │ INSERT INTO                │
                     │  │ security_events            │
                     │  │ (ignora RLS do usuário)    │
                     │  └────────────────────────────┘
                     │           ↓
                     │  ┌────────────────────────────┐
                     │  │ Trigger:                   │
                     │  │ notify_critical_event      │
                     │  │ (se severity = critical)   │
                     │  └────────────────────────────┘
                     │           ↓
                     │  ┌────────────────────────────┐
                     │  │ UI: Tela de Acesso Negado  │
                     │  │ (sem detalhes técnicos)    │
                     │  └────────────────────────────┘
                     ↓
            [Renderiza Conteúdo]
```

---

## 📄 Estrutura da Tabela `security_events`

### Schema

```sql
CREATE TABLE security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identificação do Usuário
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email TEXT,
  
  -- Detalhes da Tentativa
  attempted_route TEXT NOT NULL,
  attempted_action TEXT,
  
  -- Informações de Rede
  ip_address INET,
  user_agent TEXT,
  
  -- Metadados de Segurança
  severity severity_level DEFAULT 'warning',
  reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Colunas Explicadas

| Coluna | Tipo | Descrição | Exemplo |
|--------|------|-----------|---------|
| `id` | UUID | Identificador único do evento | `a1b2c3d4-...` |
| `user_id` | UUID | ID do usuário que tentou acessar (null se anônimo) | User UUID |
| `email` | TEXT | Email do usuário (cache) | `user@example.com` |
| `attempted_route` | TEXT | Rota bloqueada | `/admin` |
| `attempted_action` | TEXT | Ação bloqueada | `access_admin_panel` |
| `ip_address` | INET | IP da tentativa | `192.168.1.100` |
| `user_agent` | TEXT | Browser/Device | `Mozilla/5.0...` |
| `severity` | ENUM | Nível: info, warning, critical, blocked | `blocked` |
| `reason` | TEXT | Motivo do bloqueio | `Role insuficiente: user (requerido: admin)` |
| `metadata` | JSONB | Dados adicionais | `{"browser": "Chrome"}` |
| `created_at` | TIMESTAMPTZ | Timestamp do evento | `2026-03-12 10:30:00` |

### Índices (Performance)

```sql
-- Busca por usuário
idx_security_events_user_id (user_id)

-- Busca temporal (mais recentes primeiro)
idx_security_events_created_at (created_at DESC)

-- Filtro por severidade
idx_security_events_severity (severity)

-- Busca por IP (detectar ataques)
idx_security_events_ip_address (ip_address)

-- Query composta (usuário + severidade + tempo)
idx_security_events_user_severity (user_id, severity, created_at DESC)
```

---

## 🔒 Segurança: SECURITY DEFINER

### Problema

Quando um usuário **sem permissão de admin** tenta acessar `/admin`, o RLS (Row Level Security) do Supabase impede que ele insira dados em `security_events` porque:
- O RLS bloqueia operações de usuários não-admin
- Queremos logar **exatamente essa tentativa de invasão**

### Solução: SECURITY DEFINER

A função `log_unauthorized_access()` usa `SECURITY DEFINER`, que significa:
- **Executa com permissões elevadas** (como se fosse o dono do banco)
- **Ignora RLS** durante a execução
- Permite logging mesmo para usuários restritos

```sql
CREATE OR REPLACE FUNCTION log_unauthorized_access(...)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER -- ← Chave para permitir logging
SET search_path = public
AS $$
BEGIN
  -- Inserção acontece com permissões elevadas
  INSERT INTO security_events (...) VALUES (...);
  RETURN event_id;
END;
$$;
```

### Políticas RLS

```sql
-- Apenas admins podem VER eventos
CREATE POLICY "admins_view_security_events"
ON security_events FOR SELECT
USING (
  (SELECT is_admin FROM users WHERE id = auth.uid()) = true
);

-- Sistema pode INSERIR (via SECURITY DEFINER)
CREATE POLICY "system_insert_security_events"
ON security_events FOR INSERT
WITH CHECK (true);

-- NINGUÉM pode atualizar ou deletar
CREATE POLICY "no_update_security_events"
ON security_events FOR UPDATE
USING (false);

CREATE POLICY "no_delete_security_events"
ON security_events FOR DELETE
USING (false);
```

---

## 🎯 Hook: `useSecurityLog`

### API Simplificada

```tsx
import { useSecurityLog } from '../src/hooks/useSecurityLog';

const { logUnauthorizedAccess } = useSecurityLog();

// Uso básico (detecta usuário automaticamente)
await logUnauthorizedAccess({
  attemptedRoute: '/admin',
  reason: 'Role insuficiente: user (requerido: admin)'
});
```

### API Completa

```tsx
const { logSecurityEvent } = useSecurityLog();

// Uso avançado (todos os campos)
await logSecurityEvent({
  userId: 'uuid-do-usuario',
  email: 'user@example.com',
  attemptedRoute: '/admin/users',
  attemptedAction: 'view_users',
  ipAddress: '192.168.1.100',
  userAgent: navigator.userAgent,
  severity: 'critical',
  reason: 'Tentativa de escalação de privilégios',
  metadata: {
    referrer: document.referrer,
    timestamp: Date.now()
  }
});
```

### Tipos TypeScript

```tsx
export interface SecurityEventData {
  userId?: string;
  email?: string;
  attemptedRoute: string; // obrigatório
  attemptedAction?: string;
  ipAddress?: string;
  userAgent?: string;
  severity?: 'info' | 'warning' | 'critical' | 'blocked';
  reason?: string;
  metadata?: Record<string, any>;
}

export interface SecurityLogResult {
  success: boolean;
  eventId?: string;
  error?: string;
}
```

---

## 🖼️ UI Refatorada: Tela de Acesso Negado

### Antes (❌ Inseguro)

```tsx
<div className="bg-slate-50 rounded-lg p-4 mb-6 text-left">
  <p className="text-xs font-semibold text-slate-500 uppercase">
    Detalhes
  </p>
  <div className="space-y-1 text-sm text-slate-700">
    <p>Seu nível: {user.role || 'user'}</p>
    <p>Necessário: {requiredRole}</p>
    <p>Rota: {location.pathname}</p>
  </div>
</div>
```

**Problema**: Expõe estrutura de permissões para invasores

### Depois (✅ Seguro)

```tsx
<div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center">
  {/* Ícone de Escudo */}
  <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-red-600 rounded-full">
    <ShieldAlert className="w-10 h-10 text-white" />
  </div>
  
  {/* Título */}
  <h2 className="text-3xl font-black text-slate-900 mb-3">
    Acesso Negado
  </h2>
  
  {/* Mensagem Amigável (SEM DETALHES TÉCNICOS) */}
  <p className="text-slate-600 mb-8 leading-relaxed">
    Você não possui as permissões necessárias para acessar esta área. 
    Entre em contato com o administrador se necessário.
  </p>
  
  {/* Botões de Ação */}
  <button onClick={() => navigate('/')}>
    Voltar para Home
  </button>
  <button onClick={() => navigate('/minha-conta')}>
    Ir para Meu Painel
  </button>
</div>
```

**Melhorias**:
- ❌ Sem detalhes de `role` do usuário
- ❌ Sem `requiredRole` exposto
- ❌ Sem rota interna exposta
- ✅ Mensagem amigável e profissional
- ✅ Ícone visualmente impactante
- ✅ Botões de navegação claros

---

## 📊 Views de Análise

### 1. `v_critical_security_events`

**Objetivo**: Ver eventos críticos dos últimos 30 dias

```sql
SELECT * FROM v_critical_security_events
ORDER BY created_at DESC
LIMIT 50;
```

**Colunas**:
- `user_id`, `user_name`, `email`
- `attempted_route`, `attempted_action`
- `ip_address`, `severity`, `reason`
- `created_at`
- `recent_attempts` (contador de tentativas repetidas do mesmo usuário)

**Uso no Admin**: Dashboard de segurança, alertas em tempo real

### 2. `v_security_stats`

**Objetivo**: Estatísticas agregadas de segurança

```sql
SELECT * FROM v_security_stats;
```

**Retorna**:
```json
{
  "critical_count": 5,
  "blocked_count": 120,
  "warning_count": 300,
  "info_count": 50,
  "total_events": 475,
  "top_ips": [
    {"ip_address": "192.168.1.100", "attempts": 50},
    {"ip_address": "10.0.0.5", "attempts": 30}
  ],
  "top_routes": [
    {"attempted_route": "/admin", "attempts": 200},
    {"attempted_route": "/admin/users", "attempts": 150}
  ],
  "first_event": "2026-02-15 10:00:00",
  "last_event": "2026-03-12 14:30:00"
}
```

**Uso no Admin**: Cards de KPI, gráficos de segurança

---

## 🚨 Triggers e Notificações

### Trigger: `notify_critical_event`

**Objetivo**: Notificar instantaneamente quando um evento **crítico** ou **bloqueado** ocorre

```sql
CREATE TRIGGER trigger_notify_critical_event
AFTER INSERT ON security_events
FOR EACH ROW
WHEN (NEW.severity IN ('critical', 'blocked'))
EXECUTE FUNCTION notify_critical_security_event();
```

### Receber Notificações no Frontend

```tsx
// No AdminDashboard ou componente de monitoramento
useEffect(() => {
  const channel = supabase
    .channel('security-alerts')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'security_events',
      filter: 'severity=in.(critical,blocked)'
    }, (payload) => {
      toast.error(`🚨 Tentativa de acesso não autorizado detectada!`, {
        description: `IP: ${payload.new.ip_address} | Rota: ${payload.new.attempted_route}`
      });
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, []);
```

---

## 🧹 Manutenção: Limpeza de Eventos Antigos

### Função: `cleanup_old_security_events`

**Objetivo**: Remover eventos de segurança mais antigos que N dias (padrão: 90)

```sql
-- Limpar eventos com mais de 90 dias
SELECT cleanup_old_security_events(90);

-- Retorna: número de eventos deletados
-- Resultado: 1250
```

### Agendar Limpeza Automática

**Opção 1: Cron Job do Supabase** (Dashboard → Database → Cron Jobs)

```sql
-- Executar todo domingo às 3h da manhã
SELECT cron.schedule(
  'cleanup-security-events',
  '0 3 * * 0',
  $$SELECT cleanup_old_security_events(90);$$
);
```

**Opção 2: Edge Function Agendada**

```typescript
// supabase/functions/cleanup-security/index.ts
import { createClient } from '@supabase/supabase-js';

Deno.serve(async (req) => {
  const supabase = createClient(...);
  
  const { data, error } = await supabase.rpc('cleanup_old_security_events', {
    p_days_to_keep: 90
  });
  
  return new Response(JSON.stringify({ deleted: data }), {
    headers: { 'Content-Type': 'application/json' }
  });
});
```

**Nota**: Recomenda-se manter logs por **no mínimo 90 dias** para conformidade com LGPD/GDPR.

---

## 🧪 Como Testar

### Teste 1: Tentativa de Acesso Não Autorizado

1. Faça login com usuário **comum** (não admin)
2. Tente acessar: `http://localhost:5173/#/admin`
3. Verifique:
   - ✅ Tela de "Acesso Negado" aparece
   - ✅ **SEM detalhes técnicos** (role, rota interna)
   - ✅ Console mostra log de acesso negado

### Teste 2: Verificar Log no Banco

```sql
-- Ver último evento de segurança
SELECT 
  id,
  user_id,
  email,
  attempted_route,
  severity,
  reason,
  created_at
FROM security_events
ORDER BY created_at DESC
LIMIT 1;
```

**Esperado**:
```
id: a1b2c3d4-...
user_id: <uuid-do-usuario>
email: user@example.com
attempted_route: /admin
severity: blocked
reason: Role insuficiente: user (requerido: admin)
created_at: 2026-03-12 14:30:00
```

### Teste 3: Estatísticas de Segurança

```sql
-- Ver estatísticas
SELECT * FROM v_security_stats;

-- Ver eventos críticos
SELECT * FROM v_critical_security_events LIMIT 10;
```

### Teste 4: Notificações Real-time (Admin)

1. Abra o painel admin em uma aba
2. Em outra aba, tente acessar `/admin` com usuário comum
3. Verifique:
   - ✅ Toast de notificação aparece no painel admin
   - ✅ Dashboard de segurança atualiza em tempo real

---

## 📈 Análise de Segurança

### Queries Úteis

**1. Top 10 IPs com Mais Tentativas**

```sql
SELECT 
  ip_address::TEXT,
  COUNT(*) AS attempts,
  MAX(created_at) AS last_attempt
FROM security_events
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY ip_address
ORDER BY attempts DESC
LIMIT 10;
```

**2. Usuários com Tentativas Repetidas**

```sql
SELECT 
  u.name,
  u.email,
  u.role,
  COUNT(*) AS attempts,
  MAX(se.created_at) AS last_attempt
FROM security_events se
JOIN users u ON se.user_id = u.id
WHERE se.created_at >= NOW() - INTERVAL '30 days'
GROUP BY u.id, u.name, u.email, u.role
HAVING COUNT(*) > 5
ORDER BY attempts DESC;
```

**3. Rotas Mais Atacadas**

```sql
SELECT 
  attempted_route,
  COUNT(*) AS attempts,
  COUNT(DISTINCT user_id) AS unique_users,
  COUNT(DISTINCT ip_address) AS unique_ips
FROM security_events
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY attempted_route
ORDER BY attempts DESC
LIMIT 10;
```

**4. Timeline de Tentativas (Por Hora)**

```sql
SELECT 
  date_trunc('hour', created_at) AS hour,
  COUNT(*) AS attempts,
  COUNT(*) FILTER (WHERE severity = 'critical') AS critical_count
FROM security_events
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

---

## ✅ Checklist de Implementação

- [x] Criar tabela `security_events` com campos completos
- [x] Criar tipo `severity_level` (ENUM)
- [x] Criar índices para performance
- [x] Criar função `log_security_event` (SECURITY DEFINER)
- [x] Criar função `log_unauthorized_access` (simplificada)
- [x] Criar view `v_critical_security_events`
- [x] Criar view `v_security_stats`
- [x] Configurar políticas RLS
- [x] Criar trigger `notify_critical_event`
- [x] Criar função `cleanup_old_security_events`
- [x] Criar hook `useSecurityLog` (TypeScript)
- [x] Integrar hook no `ProtectedAdminRoute`
- [x] Refatorar UI de acesso negado (remover detalhes)
- [x] Testar logging automático
- [x] Documentação completa

---

## 🚀 Próximos Passos (Opcional)

### 1. Dashboard de Segurança

Criar página `/admin/security` com:
- Gráfico de tentativas ao longo do tempo
- Lista de eventos críticos recentes
- Mapa de IPs suspeitos
- Alertas em tempo real

### 2. Bloqueio Automático por IP

```sql
-- Tabela de IPs bloqueados
CREATE TABLE ip_blacklist (
  ip_address INET PRIMARY KEY,
  blocked_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT,
  auto_blocked BOOLEAN DEFAULT false
);

-- Função para auto-bloquear IPs com muitas tentativas
CREATE OR REPLACE FUNCTION auto_block_suspicious_ips()
RETURNS void AS $$
BEGIN
  INSERT INTO ip_blacklist (ip_address, reason, auto_blocked)
  SELECT 
    ip_address,
    'Auto-blocked: ' || COUNT(*) || ' tentativas em 1 hora',
    true
  FROM security_events
  WHERE 
    created_at >= NOW() - INTERVAL '1 hour'
    AND severity IN ('critical', 'blocked')
  GROUP BY ip_address
  HAVING COUNT(*) >= 10
  ON CONFLICT (ip_address) DO NOTHING;
END;
$$ LANGUAGE plpgsql;
```

### 3. Integração com Email de Alertas

```typescript
// Edge Function para enviar email quando evento crítico
import { SendEmailCommand } from '@aws-sdk/client-ses';

Deno.serve(async (req) => {
  const { event } = await req.json();
  
  if (event.severity === 'critical') {
    await sendEmail({
      to: 'admin@bwagro.com',
      subject: '🚨 Tentativa de Invasão Detectada',
      body: `
        IP: ${event.ip_address}
        Usuário: ${event.email}
        Rota: ${event.attempted_route}
        Horário: ${event.created_at}
      `
    });
  }
  
  return new Response('OK');
});
```

---

## 📚 Referências

**Arquivos Criados**:
- [sql/SECURITY_EVENTS_TABLE.sql](../sql/SECURITY_EVENTS_TABLE.sql)
- [src/hooks/useSecurityLog.ts](../src/hooks/useSecurityLog.ts)

**Arquivos Modificados**:
- [components/ProtectedAdminRoute.tsx](../components/ProtectedAdminRoute.tsx)

**Documentação Relacionada**:
- [ADMIN_PANEL_DOCUMENTATION.md](./ADMIN_PANEL_DOCUMENTATION.md)
- [README_RBAC_SECURITY.md](./README_RBAC_SECURITY.md)

---

**Última Atualização**: 12 de março de 2026  
**Versão**: 1.0  
**Autor**: Assistente AI (GitHub Copilot)
