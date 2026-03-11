# 📋 Guia de Uso: Sistema de Auditoria Administrativa

## Visão Geral

O hook `useAdminAudit` permite registrar todas as ações administrativas realizadas na plataforma, criando uma trilha completa de auditoria para compliance e rastreabilidade.

---

## 🔧 Importação

```typescript
import { useAdminAudit, ADMIN_ACTIONS, RESOURCE_TYPES } from '../src/hooks/useAdminAudit';
```

---

## 📚 Exemplos de Uso

### 1. ✅ Aprovar Anúncio

```typescript
const ModerationPanel: React.FC = () => {
  const { logAction } = useAdminAudit();
  const [loading, setLoading] = useState(false);

  const handleApproveAd = async (adId: string, adTitle: string) => {
    setLoading(true);
    
    try {
      // 1. Buscar dados antigos do anúncio
      const { data: oldAd } = await supabase
        .from('announcements')
        .select('status, featured, rejection_reason')
        .eq('id', adId)
        .single();

      // 2. Atualizar status do anúncio
      const { error } = await supabase
        .from('announcements')
        .update({ 
          status: 'ACTIVE',
          approved_at: new Date().toISOString(),
          rejection_reason: null 
        })
        .eq('id', adId);

      if (error) throw error;

      // 3. Registrar ação de auditoria
      await logAction({
        action: ADMIN_ACTIONS.APPROVE_AD,
        resourceType: RESOURCE_TYPES.ANNOUNCEMENT,
        resourceId: adId,
        oldValue: { 
          status: oldAd.status,
          rejection_reason: oldAd.rejection_reason 
        },
        newValue: { 
          status: 'ACTIVE',
          approved_at: new Date().toISOString() 
        },
        reason: `Anúncio "${adTitle}" aprovado após revisão manual de conteúdo e compliance`
      });

      toast.success('Anúncio aprovado com sucesso!');
    } catch (err) {
      console.error('[ModerationPanel] Erro ao aprovar anúncio:', err);
      toast.error('Erro ao aprovar anúncio');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={() => handleApproveAd(adId, adTitle)}>
      Aprovar Anúncio
    </button>
  );
};
```

---

### 2. ❌ Rejeitar Anúncio

```typescript
const handleRejectAd = async (adId: string, adTitle: string, reason: string) => {
  const { data: oldAd } = await supabase
    .from('announcements')
    .select('status')
    .eq('id', adId)
    .single();

  await supabase
    .from('announcements')
    .update({ 
      status: 'REJECTED',
      rejection_reason: reason,
      rejected_at: new Date().toISOString()
    })
    .eq('id', adId);

  // Auditoria
  await logAction({
    action: ADMIN_ACTIONS.REJECT_AD,
    resourceType: RESOURCE_TYPES.ANNOUNCEMENT,
    resourceId: adId,
    oldValue: { status: oldAd.status },
    newValue: { 
      status: 'REJECTED', 
      rejection_reason: reason 
    },
    reason: `Anúncio "${adTitle}" rejeitado: ${reason}`
  });

  toast.success('Anúncio rejeitado');
};
```

---

### 3. 🗑️ Deletar Usuário

```typescript
const UserManagementPanel: React.FC = () => {
  const { logAction } = useAdminAudit();

  const handleDeleteUser = async (userId: string) => {
    // Confirmação
    const confirmed = window.confirm(
      'Tem certeza que deseja deletar este usuário? Esta ação não pode ser desfeita.'
    );
    if (!confirmed) return;

    try {
      // 1. Buscar dados completos do usuário
      const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      // 2. Deletar usuário (cascade deleta anúncios, mensagens, etc)
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', userId);

      if (error) throw error;

      // 3. Registrar auditoria detalhada
      await logAction({
        action: ADMIN_ACTIONS.DELETE_USER,
        resourceType: RESOURCE_TYPES.USER,
        resourceId: userId,
        oldValue: {
          name: user.name,
          email: user.email,
          phone: user.phone,
          plan: user.plan,
          created_at: user.created_at,
          total_ads: user.total_ads
        },
        newValue: null, // Usuário foi deletado
        reason: `Usuário ${user.name} (${user.email}) deletado permanentemente por violação de termos de uso`
      });

      toast.success(`Usuário ${user.name} deletado com sucesso`);
    } catch (err) {
      console.error('[UserManagement] Erro ao deletar usuário:', err);
      toast.error('Erro ao deletar usuário');
    }
  };

  return (
    <button onClick={() => handleDeleteUser(userId)} className="text-red-600">
      Deletar Usuário
    </button>
  );
};
```

---

### 4. 🔐 Suspender Usuário (Temporário)

```typescript
const handleSuspendUser = async (
  userId: string, 
  userName: string, 
  suspensionReason: string,
  suspendUntil: Date
) => {
  const { data: oldUser } = await supabase
    .from('users')
    .select('is_suspended, suspension_reason, suspended_until')
    .eq('id', userId)
    .single();

  await supabase
    .from('users')
    .update({ 
      is_suspended: true,
      suspension_reason: suspensionReason,
      suspended_until: suspendUntil.toISOString(),
      suspended_at: new Date().toISOString()
    })
    .eq('id', userId);

  // Auditoria
  await logAction({
    action: ADMIN_ACTIONS.SUSPEND_USER,
    resourceType: RESOURCE_TYPES.USER,
    resourceId: userId,
    oldValue: {
      is_suspended: oldUser.is_suspended,
      suspension_reason: oldUser.suspension_reason
    },
    newValue: {
      is_suspended: true,
      suspension_reason: suspensionReason,
      suspended_until: suspendUntil.toISOString()
    },
    reason: `Usuário ${userName} suspenso até ${suspendUntil.toLocaleDateString()}: ${suspensionReason}`
  });

  toast.success(`Usuário ${userName} suspenso até ${suspendUntil.toLocaleDateString()}`);
};
```

---

### 5. 👑 Alterar Plano de Usuário

```typescript
const handleUpdateUserPlan = async (
  userId: string, 
  userName: string, 
  newPlan: 'FREE' | 'BASIC' | 'PRO' | 'PREMIUM',
  reason: string
) => {
  const { data: oldUser } = await supabase
    .from('users')
    .select('plan, plan_started_at, plan_ends_at')
    .eq('id', userId)
    .single();

  const planEndsAt = new Date();
  planEndsAt.setMonth(planEndsAt.getMonth() + 1); // +1 mês

  await supabase
    .from('users')
    .update({ 
      plan: newPlan,
      plan_started_at: new Date().toISOString(),
      plan_ends_at: planEndsAt.toISOString()
    })
    .eq('id', userId);

  // Auditoria
  await logAction({
    action: ADMIN_ACTIONS.UPDATE_PLAN,
    resourceType: RESOURCE_TYPES.SUBSCRIPTION,
    resourceId: userId,
    oldValue: {
      plan: oldUser.plan,
      plan_ends_at: oldUser.plan_ends_at
    },
    newValue: {
      plan: newPlan,
      plan_ends_at: planEndsAt.toISOString()
    },
    reason: `Plano de ${userName} atualizado para ${newPlan}: ${reason}`
  });

  toast.success(`Plano de ${userName} atualizado para ${newPlan}`);
};
```

---

### 6. 💳 Conceder Créditos Manualmente

```typescript
const handleGrantCredits = async (
  userId: string, 
  userName: string, 
  credits: number,
  reason: string
) => {
  const { data: oldUser } = await supabase
    .from('users')
    .select('ad_credits')
    .eq('id', userId)
    .single();

  const newCredits = (oldUser.ad_credits || 0) + credits;

  await supabase
    .from('users')
    .update({ ad_credits: newCredits })
    .eq('id', userId);

  // Auditoria
  await logAction({
    action: ADMIN_ACTIONS.GRANT_CREDITS,
    resourceType: RESOURCE_TYPES.USER,
    resourceId: userId,
    oldValue: { ad_credits: oldUser.ad_credits || 0 },
    newValue: { ad_credits: newCredits },
    reason: `${credits} créditos concedidos manualmente para ${userName}: ${reason}`
  });

  toast.success(`${credits} créditos concedidos para ${userName}`);
};
```

---

### 7. ⚙️ Atualizar Configurações SMTP

```typescript
const SMTPConfigPanel: React.FC = () => {
  const { logAction } = useAdminAudit();

  const handleUpdateSMTP = async (newConfig: SMTPConfig) => {
    try {
      // 1. Buscar config antiga (mascarar senha)
      const { data: oldConfig } = await supabase
        .from('system_config')
        .select('smtp_host, smtp_port, smtp_user')
        .eq('key', 'smtp_settings')
        .single();

      // 2. Atualizar configuração
      await supabase
        .from('system_config')
        .update({ 
          value: newConfig,
          updated_at: new Date().toISOString()
        })
        .eq('key', 'smtp_settings');

      // 3. Auditoria (NUNCA logar senhas em texto plano)
      await logAction({
        action: ADMIN_ACTIONS.UPDATE_SMTP_CONFIG,
        resourceType: RESOURCE_TYPES.SYSTEM_CONFIG,
        resourceId: null,
        oldValue: {
          smtp_host: oldConfig.smtp_host,
          smtp_port: oldConfig.smtp_port,
          smtp_user: oldConfig.smtp_user,
          smtp_password: '[HIDDEN]' // ⚠️ NÃO logar senhas
        },
        newValue: {
          smtp_host: newConfig.smtp_host,
          smtp_port: newConfig.smtp_port,
          smtp_user: newConfig.smtp_user,
          smtp_password: '[HIDDEN]'
        },
        reason: 'Configurações SMTP atualizadas por necessidade operacional'
      });

      toast.success('Configurações SMTP atualizadas');
    } catch (err) {
      console.error('[SMTPConfig] Erro:', err);
      toast.error('Erro ao atualizar SMTP');
    }
  };

  return <form onSubmit={handleUpdateSMTP}>...</form>;
};
```

---

### 8. 🎯 Destacar Anúncio (Featured)

```typescript
const handleFeatureAd = async (adId: string, adTitle: string, durationDays: number) => {
  const { data: oldAd } = await supabase
    .from('announcements')
    .select('featured, featured_until')
    .eq('id', adId)
    .single();

  const featuredUntil = new Date();
  featuredUntil.setDate(featuredUntil.getDate() + durationDays);

  await supabase
    .from('announcements')
    .update({ 
      featured: true,
      featured_until: featuredUntil.toISOString(),
      featured_at: new Date().toISOString()
    })
    .eq('id', adId);

  // Auditoria
  await logAction({
    action: ADMIN_ACTIONS.FEATURE_AD,
    resourceType: RESOURCE_TYPES.ANNOUNCEMENT,
    resourceId: adId,
    oldValue: {
      featured: oldAd.featured,
      featured_until: oldAd.featured_until
    },
    newValue: {
      featured: true,
      featured_until: featuredUntil.toISOString()
    },
    reason: `Anúncio "${adTitle}" destacado por ${durationDays} dias`
  });

  toast.success(`Anúncio destacado por ${durationDays} dias`);
};
```

---

### 9. 🔄 Forçar Logout de Usuário

```typescript
const handleForceLogout = async (userId: string, userName: string, reason: string) => {
  // 1. Invalidar sessões ativas do usuário no Supabase Auth
  const { error } = await supabase.auth.admin.signOut(userId);

  if (error) throw error;

  // 2. Auditoria
  await logAction({
    action: ADMIN_ACTIONS.FORCE_LOGOUT,
    resourceType: RESOURCE_TYPES.USER,
    resourceId: userId,
    oldValue: { status: 'logged_in' },
    newValue: { status: 'logged_out_forced' },
    reason: `Logout forçado de ${userName}: ${reason}`
  });

  toast.success(`${userName} foi desconectado forcosamente`);
};
```

---

## 📊 Constantes Disponíveis

### ADMIN_ACTIONS (Ações)

```typescript
export const ADMIN_ACTIONS = {
  // Anúncios
  APPROVE_AD: 'APPROVE_AD',
  REJECT_AD: 'REJECT_AD',
  DELETE_AD: 'DELETE_AD',
  FEATURE_AD: 'FEATURE_AD',
  
  // Usuários
  DELETE_USER: 'DELETE_USER',
  SUSPEND_USER: 'SUSPEND_USER',
  UPDATE_USER_ROLE: 'UPDATE_USER_ROLE',
  VERIFY_USER: 'VERIFY_USER',
  
  // Assinaturas
  UPDATE_PLAN: 'UPDATE_PLAN',
  CANCEL_SUBSCRIPTION: 'CANCEL_SUBSCRIPTION',
  REFUND_PAYMENT: 'REFUND_PAYMENT',
  GRANT_CREDITS: 'GRANT_CREDITS',
  
  // Sistema
  UPDATE_SMTP_CONFIG: 'UPDATE_SMTP_CONFIG',
  UPDATE_BANNER: 'UPDATE_BANNER',
  UPDATE_PAGE_CONTENT: 'UPDATE_PAGE_CONTENT',
  
  // Segurança
  FORCE_LOGOUT: 'FORCE_LOGOUT',
  CLEAR_CACHE: 'CLEAR_CACHE',
  RUN_MIGRATION: 'RUN_MIGRATION'
} as const;
```

### RESOURCE_TYPES (Recursos)

```typescript
export const RESOURCE_TYPES = {
  ANNOUNCEMENT: 'announcement',
  USER: 'user',
  SUBSCRIPTION: 'subscription',
  PAYMENT: 'payment',
  MESSAGE: 'message',
  SYSTEM_CONFIG: 'system_config',
  BANNER: 'banner',
  SYSTEM: 'system'
} as const;
```

---

## 🔍 Visualizar Logs de Auditoria (Query SQL)

```sql
-- Logs recentes (últimas 100 ações)
SELECT * FROM v_recent_admin_actions ORDER BY created_at DESC LIMIT 100;

-- Logs de um admin específico
SELECT * FROM admin_audit_logs 
WHERE admin_email = 'admin@example.com' 
ORDER BY created_at DESC;

-- Logs de ações em um recurso específico
SELECT * FROM admin_audit_logs 
WHERE resource_type = 'announcement' 
AND resource_id = 'uuid-do-anuncio';

-- Estatísticas por admin
SELECT * FROM v_admin_action_stats ORDER BY total_actions DESC;

-- Ações críticas (DELETE, SUSPEND)
SELECT * FROM admin_audit_logs 
WHERE action IN ('DELETE_USER', 'DELETE_AD', 'SUSPEND_USER') 
ORDER BY created_at DESC;
```

---

## ⚠️ Boas Práticas

### ✅ Fazer

1. **Sempre registrar oldValue e newValue** para rastreabilidade completa
2. **Adicionar reason descritivo** explicando o motivo da ação
3. **Mascarar dados sensíveis** (senhas, tokens) com `[HIDDEN]`
4. **Usar constantes** (ADMIN_ACTIONS, RESOURCE_TYPES) ao invés de strings hardcoded
5. **Logar ANTES de atualizar dados críticos** (para capturar estado original)
6. **Tratar erros silenciosamente** para não bloquear a operação principal

### ❌ Evitar

1. ❌ Logar senhas ou tokens em texto plano
2. ❌ Omitir reason em ações críticas (DELETE, SUSPEND)
3. ❌ Usar strings hardcoded ao invés de constantes
4. ❌ Logar apenas newValue sem oldValue (perde contexto)
5. ❌ Bloquear operação principal se auditoria falhar

---

## 🛡️ Segurança

- **Função RPC `log_admin_action`** é `SECURITY DEFINER` (executa com permissões elevadas)
- **Apenas admins** podem escrever em `admin_audit_logs` (RLS configurado)
- **Logs são imutáveis** (políticas RLS bloqueiam UPDATE/DELETE)
- **IP e User Agent** são capturados automaticamente (se disponíveis)
- **Dados sensíveis** devem ser mascarados antes de logar

---

## 📈 Compliance e Rastreabilidade

Este sistema de auditoria garante:

✅ **LGPD/GDPR Compliance** - Rastreamento completo de ações em dados pessoais  
✅ **Accountability** - Cada admin é identificado por ID, email e nome  
✅ **Non-repudiation** - Logs imutáveis com timestamp preciso  
✅ **Forensics** - Valores antigos e novos para análise de mudanças  
✅ **Audit Trail** - Trilha completa para auditorias internas/externas  

---

## 📞 Suporte

Para dúvidas ou problemas:
1. Consulte a documentação técnica: `README_RBAC_SECURITY.md`
2. Verifique os logs no Supabase: Tabela `admin_audit_logs`
3. Execute queries de diagnóstico: Views `v_recent_admin_actions` e `v_admin_action_stats`
