# 🚀 Quick Start - Sistema de Eventos de Segurança

## Instalação Rápida

### 1. Executar Script SQL

No Supabase SQL Editor:

```sql
-- Execute o arquivo completo
-- sql/SECURITY_EVENTS_TABLE.sql
```

**O script irá criar**:
- ✅ Tipo `severity_level` (ENUM)
- ✅ Tabela `security_events`
- ✅ Índices de performance
- ✅ Funções SECURITY DEFINER
- ✅ Views de análise
- ✅ Políticas RLS
- ✅ Triggers de notificação

**Resultado esperado**:
```
✅ Tabela security_events criada com sucesso
✅ Funções de logging configuradas (SECURITY DEFINER)
✅ Views de análise criadas
✅ Políticas RLS aplicadas
✅ Triggers de notificação habilitados
```

---

### 2. Verificar Instalação

```sql
-- Verificar se tabela existe
SELECT * FROM security_events LIMIT 1;

-- Verificar funções
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name LIKE '%security%';

-- Resultado esperado:
-- log_security_event
-- log_unauthorized_access
-- cleanup_old_security_events
-- notify_critical_security_event

-- Verificar views
SELECT * FROM v_security_stats;
```

---

## 🧪 Testes Práticos

### Teste 1: Tentativa de Acesso Não Autorizado

**Objetivo**: Verificar que o sistema registra automaticamente tentativas de invasão

**Passos**:

1. **Fazer login com usuário comum** (não admin):
   ```
   http://localhost:5173/#/login
   ```
   
2. **Tentar acessar área administrativa**:
   ```
   http://localhost:5173/#/admin
   ```

3. **Verificar tela de acesso negado**:
   - ✅ Ícone de escudo vermelho
   - ✅ Mensagem: "Acesso Negado"
   - ✅ Texto amigável (sem detalhes técnicos)
   - ✅ Botão "Voltar para Home"
   - ✅ Botão "Ir para Meu Painel"

4. **Verificar log no banco**:
   ```sql
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

**Resultado esperado**:
```
id: <uuid>
user_id: <user-uuid>
email: user@example.com
attempted_route: /admin
severity: blocked
reason: Role insuficiente: user (requerido: admin)
created_at: 2026-03-12 14:30:00
```

---

### Teste 2: Logging Manual via Hook

**Objetivo**: Testar o hook `useSecurityLog` manualmente

**Código de Teste** (adicione temporariamente em qualquer componente):

```tsx
import { useSecurityLog } from '../src/hooks/useSecurityLog';
import { useEffect } from 'react';

export const TestSecurityLog = () => {
  const { logUnauthorizedAccess } = useSecurityLog();

  useEffect(() => {
    const testLog = async () => {
      const result = await logUnauthorizedAccess({
        attemptedRoute: '/test-route',
        reason: 'Teste manual de logging'
      });

      console.log('Resultado do log:', result);
      // Esperado: { success: true, eventId: '<uuid>' }
    };

    testLog();
  }, []);

  return <div>Teste de Security Log - Veja o console</div>;
};
```

**Verificar no banco**:
```sql
SELECT * FROM security_events 
WHERE attempted_route = '/test-route'
ORDER BY created_at DESC 
LIMIT 1;
```

---

### Teste 3: Estatísticas de Segurança

**Objetivo**: Verificar que as views de análise funcionam

```sql
-- Ver estatísticas gerais
SELECT * FROM v_security_stats;
```

**Resultado esperado**:
```json
{
  "critical_count": 0,
  "blocked_count": 5,
  "warning_count": 0,
  "info_count": 0,
  "total_events": 5,
  "top_ips": [...],
  "top_routes": [
    {"attempted_route": "/admin", "attempts": 5}
  ]
}
```

```sql
-- Ver eventos críticos
SELECT * FROM v_critical_security_events LIMIT 10;
```

---

### Teste 4: Função de Limpeza

**Objetivo**: Verificar que eventos antigos podem ser removidos

```sql
-- Criar evento de teste antigo (120 dias atrás)
INSERT INTO security_events (
  email,
  attempted_route,
  severity,
  reason,
  created_at
) VALUES (
  'test@example.com',
  '/test',
  'warning',
  'Evento de teste antigo',
  NOW() - INTERVAL '120 days'
);

-- Verificar evento foi criado
SELECT COUNT(*) FROM security_events 
WHERE created_at < NOW() - INTERVAL '90 days';
-- Resultado: 1

-- Executar limpeza (remover eventos com mais de 90 dias)
SELECT cleanup_old_security_events(90);
-- Resultado: 1 (1 evento removido)

-- Verificar que evento antigo foi removido
SELECT COUNT(*) FROM security_events 
WHERE created_at < NOW() - INTERVAL '90 days';
-- Resultado: 0
```

---

## 📊 Uso no Painel Administrativo

### Adicionar Card de Segurança no Dashboard

**Arquivo**: `pages/admin/AdminDashboardOverview.tsx`

```tsx
// Adicionar estado
const [securityStats, setSecurityStats] = useState<any>(null);

// Adicionar query
const loadSecurityStats = async () => {
  const { data } = await supabase
    .from('v_security_stats')
    .select('*')
    .single();
  
  setSecurityStats(data);
};

// Adicionar ao useEffect
useEffect(() => {
  loadSecurityStats();
}, []);

// Adicionar KPI Card
<KPICard
  title="Tentativas Bloqueadas"
  value={securityStats?.blocked_count || 0}
  icon={ShieldAlert}
  color="bg-red-500"
  trend={-5} // Negativo = bom (menos tentativas)
/>
```

---

### Criar Página de Logs de Segurança

**Arquivo**: `pages/admin/SecurityLogs.tsx`

```tsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../src/lib/supabaseClient';
import { ShieldAlert } from 'lucide-react';

const SecurityLogs = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    const { data } = await supabase
      .from('security_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    
    setEvents(data || []);
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-black">Logs de Segurança</h1>
      
      <div className="bg-white rounded-xl border">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left">Data</th>
              <th className="px-6 py-3 text-left">Usuário</th>
              <th className="px-6 py-3 text-left">Rota</th>
              <th className="px-6 py-3 text-left">IP</th>
              <th className="px-6 py-3 text-left">Severidade</th>
            </tr>
          </thead>
          <tbody>
            {events.map(event => (
              <tr key={event.id} className="border-t hover:bg-slate-50">
                <td className="px-6 py-4">
                  {new Date(event.created_at).toLocaleString('pt-BR')}
                </td>
                <td className="px-6 py-4">{event.email || '—'}</td>
                <td className="px-6 py-4">
                  <code className="text-sm">{event.attempted_route}</code>
                </td>
                <td className="px-6 py-4">
                  <code className="text-sm">{event.ip_address || '—'}</code>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${
                    event.severity === 'critical' ? 'bg-red-100 text-red-700' :
                    event.severity === 'blocked' ? 'bg-orange-100 text-orange-700' :
                    event.severity === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {event.severity}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SecurityLogs;
```

---

## 🚨 Notificações Real-time (Opcional)

### Setup de Canal Real-time

**Arquivo**: `pages/admin/AdminLayout.tsx`

```tsx
import { useEffect } from 'react';
import { supabase } from '../src/lib/supabaseClient';
import { toast } from 'sonner';

// Dentro do componente AdminLayout
useEffect(() => {
  // Canal para eventos de segurança críticos
  const channel = supabase
    .channel('security-alerts')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'security_events',
      filter: 'severity=in.(critical,blocked)'
    }, (payload) => {
      const event = payload.new;
      
      toast.error('🚨 Tentativa de Acesso Não Autorizado', {
        description: `${event.email || 'Anônimo'} tentou acessar ${event.attempted_route}`,
        duration: 10000,
        action: {
          label: 'Ver Logs',
          onClick: () => navigate('/admin/security')
        }
      });
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, []);
```

---

## 🔍 Queries Úteis

### 1. Eventos de Hoje

```sql
SELECT 
  email,
  attempted_route,
  severity,
  reason,
  created_at
FROM security_events
WHERE created_at >= CURRENT_DATE
ORDER BY created_at DESC;
```

### 2. Top 5 IPs com Mais Tentativas (Última Semana)

```sql
SELECT 
  ip_address::TEXT,
  COUNT(*) AS attempts,
  MAX(created_at) AS last_attempt
FROM security_events
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY ip_address
ORDER BY attempts DESC
LIMIT 5;
```

### 3. Usuários com Tentativas Repetidas

```sql
SELECT 
  u.name,
  u.email,
  u.role,
  COUNT(*) AS attempts
FROM security_events se
JOIN users u ON se.user_id = u.id
WHERE se.created_at >= NOW() - INTERVAL '30 days'
GROUP BY u.id, u.name, u.email, u.role
HAVING COUNT(*) >= 3
ORDER BY attempts DESC;
```

### 4. Contagem por Severidade

```sql
SELECT 
  severity,
  COUNT(*) AS count
FROM security_events
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY severity
ORDER BY 
  CASE severity
    WHEN 'critical' THEN 1
    WHEN 'blocked' THEN 2
    WHEN 'warning' THEN 3
    WHEN 'info' THEN 4
  END;
```

---

## 📅 Manutenção Programada

### Opção 1: Cron Job do Supabase

**Dashboard → Database → Cron Jobs**

```sql
-- Limpar eventos com mais de 90 dias
-- Executar toda segunda-feira às 3h da manhã

SELECT cron.schedule(
  'cleanup-security-events-weekly',
  '0 3 * * 1', -- Segunda-feira às 3h
  $$SELECT cleanup_old_security_events(90);$$
);
```

### Opção 2: Scheduled Edge Function

**supabase/functions/cleanup-security/index.ts**

```typescript
import { createClient } from '@supabase/supabase-js';

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data, error } = await supabase.rpc('cleanup_old_security_events', {
    p_days_to_keep: 90
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500
    });
  }

  return new Response(JSON.stringify({ 
    success: true,
    deleted_count: data 
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
});
```

**Deploy**:
```bash
supabase functions deploy cleanup-security
```

**Configurar Agendamento** (Dashboard → Edge Functions → Cron):
- Função: `cleanup-security`
- Cron: `0 3 * * 1` (segunda-feira 3h)

---

## ✅ Checklist de Setup

- [ ] Executar `sql/SECURITY_EVENTS_TABLE.sql` no Supabase
- [ ] Verificar que tabela `security_events` foi criada
- [ ] Verificar que funções foram criadas (3 funções)
- [ ] Verificar que views foram criadas (2 views)
- [ ] Testar logging manual via hook
- [ ] Testar acesso negado em `/admin` com usuário comum
- [ ] Verificar que evento foi registrado no banco
- [ ] Verificar que UI de acesso negado está limpa (sem detalhes)
- [ ] (Opcional) Criar página de logs no painel admin
- [ ] (Opcional) Configurar notificações real-time
- [ ] (Opcional) Configurar limpeza automática (cron)

---

## 🆘 Troubleshooting

### Erro: "function log_unauthorized_access does not exist"

**Causa**: Script SQL não foi executado

**Solução**:
```sql
-- Executar novamente o script completo
-- sql/SECURITY_EVENTS_TABLE.sql
```

### Erro: "permission denied for table security_events"

**Causa**: Políticas RLS não configuradas corretamente

**Solução**:
```sql
-- Verificar RLS está habilitado
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'security_events';

-- Deve retornar: rowsecurity = true

-- Verificar políticas
SELECT * FROM pg_policies 
WHERE tablename = 'security_events';
```

### Erro: "cannot insert into table security_events"

**Causa**: Função SECURITY DEFINER não está funcionando

**Solução**:
```sql
-- Recriar função com SECURITY DEFINER
DROP FUNCTION IF EXISTS log_unauthorized_access;

-- Depois executar novamente o script SQL
-- que contém CREATE FUNCTION ... SECURITY DEFINER
```

### Eventos não aparecem no banco

**Debug**:
```sql
-- Verificar se há eventos
SELECT COUNT(*) FROM security_events;

-- Se 0, verificar logs do Supabase
-- Dashboard → Logs → Postgres Logs

-- Testar inserção manual
SELECT log_unauthorized_access('/test', 'Teste manual');

-- Verificar novamente
SELECT * FROM security_events ORDER BY created_at DESC LIMIT 1;
```

---

**Está pronto para uso!** 🎉

Se tiver dúvidas, consulte a [documentação completa](./SECURITY_EVENTS_DOCUMENTATION.md).
