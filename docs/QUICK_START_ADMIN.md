# 🚀 Quick Start - Painel Administrativo

## Passos Rápidos para Testar

### 1. Verificar Instalação

Confirme que todas as dependências estão instaladas:

```bash
npm install
```

### 2. Configurar Banco de Dados

Execute o script de segurança máxima (se ainda não executou):

```sql
-- No Supabase SQL Editor
-- Execute: sql/ENABLE_MAXIMUM_SECURITY.sql

-- Isso cria:
-- ✅ Funções SECURITY DEFINER (sem recursão RLS)
-- ✅ Políticas seguras para users
-- ✅ Políticas para admin_audit_logs
```

### 3. Criar Usuário Admin

Se você não tem um usuário admin, crie um:

```sql
-- Opção 1: Promover usuário existente
UPDATE users
SET role = 'admin', is_admin = true
WHERE email = 'seu-email@example.com';

-- Opção 2: Criar novo admin
INSERT INTO users (
  id,
  name,
  email,
  role,
  is_admin,
  plan,
  created_at
) VALUES (
  gen_random_uuid(),
  'Admin Principal',
  'admin@bwagro.com',
  'admin',
  true,
  'PREMIUM',
  NOW()
);
```

### 4. Iniciar Servidor de Desenvolvimento

```bash
npm run dev
```

Servidor inicia em: `http://localhost:5173`

### 5. Fazer Login

1. Acesse: `http://localhost:5173/#/login`
2. Entre com suas credenciais de admin
3. Ou acesse diretamente: `http://localhost:5173/#/admin/login`

### 6. Acessar Painel Admin

Após login, navegue para:

```
http://localhost:5173/#/admin
```

---

## 🎯 Rotas Disponíveis

| Rota | Componente | Descrição |
|------|-----------|-----------|
| `/admin` | AdminDashboardOverview | Dashboard com KPIs e gráficos |
| `/admin/moderation` | ModerationQueue | Fila de moderação de anúncios |
| `/admin/users` | UserManagement | Gestão de usuários (CRM) |
| `/admin/audit` | AuditLogs | Logs de auditoria |
| `/admin/settings` | AdminDashboard | Configurações (temporário) |

---

## 🧪 Testes Rápidos

### Teste 1: Aprovar Anúncio

1. Vá para `/admin/moderation`
2. Se não houver anúncios pendentes, crie um:
   ```sql
   INSERT INTO announcements (
     id, title, description, category, type, 
     status, owner_id, created_at
   ) VALUES (
     gen_random_uuid(),
     'Teste de Anúncio',
     'Descrição do teste',
     'MAQUINAS',
     'VENDA',
     'PENDING',
     '<seu-user-id>',
     NOW()
   );
   ```
3. Clique em **Aprovar** ✅
4. Verifique em `/admin/audit` se o log foi registrado

### Teste 2: Alterar Plano de Usuário

1. Vá para `/admin/users`
2. Encontre um usuário (pode usar busca)
3. Clique em **Editar** (ícone de lápis)
4. Altere o plano para `PRO` ou `PREMIUM`
5. Clique em **Salvar Alterações**
6. Verifique em `/admin/audit` o log `UPDATE_PLAN`

### Teste 3: Ver Estatísticas

1. Vá para `/admin` (Dashboard)
2. Observe os KPI Cards:
   - Anúncios Ativos
   - Anúncios Pendentes
   - Usuários Ativos Mensais
   - Matches do Radar
3. Veja os gráficos:
   - BarChart: Anúncios por categoria
   - PieChart: Distribuição por tipo
4. Mude o filtro temporal (7d / 30d / 90d)

---

## 🔍 Verificar Funcionamento

### Checklist Rápido

- [ ] Servidor rodando sem erros (`npm run dev`)
- [ ] Login admin funcionando
- [ ] Sidebar do painel aparecendo
- [ ] Dashboard carregando KPIs
- [ ] Gráficos (Recharts) renderizando
- [ ] Fila de moderação mostrando anúncios
- [ ] Gestão de usuários mostrando tabela
- [ ] Auditoria mostrando logs
- [ ] Ações (aprovar, rejeitar, editar) funcionando
- [ ] Notificações (toast) aparecendo

### Logs Importantes

**Console do Browser** (F12):
```
✅ [useAuth] User loaded: { id, email, role }
✅ [ProtectedAdminRoute] Access granted
✅ [ModerationQueue] Loaded X pending announcements
✅ [AdminAudit] Action logged successfully
```

**Supabase Logs** (Dashboard → Logs):
```
✅ SELECT * FROM v_recent_admin_actions
✅ INSERT INTO admin_audit_logs
✅ UPDATE announcements SET status = 'ACTIVE'
```

---

## ⚠️ Problemas Comuns

### Erro: "Não autorizado" ao acessar /admin

**Causa**: Usuário não tem `is_admin=true`

**Solução**:
```sql
UPDATE users SET is_admin = true, role = 'admin'
WHERE email = 'seu-email@example.com';
```

### Erro: "infinite recursion detected"

**Causa**: Políticas RLS antigas com recursão

**Solução**: Execute `sql/ENABLE_MAXIMUM_SECURITY.sql` novamente

### Gráficos não aparecem

**Causa**: Recharts não instalado

**Solução**:
```bash
npm install recharts @types/recharts
```

### Badge de notificações não aparece

**Causa**: Contagem de notificações não retorna dados

**Solução**: Verifique se `useNotificationsCount` está funcionando:
```tsx
const { notificationsCount } = useNotificationsCount();
console.log('Notificações:', notificationsCount);
```

### Tabela de moderação vazia

**Causa**: Não há anúncios com `status='PENDING'`

**Solução**: Crie anúncios de teste (veja SQL acima) ou mude status de anúncios existentes:
```sql
UPDATE announcements
SET status = 'PENDING'
WHERE id = '<uuid-do-anuncio>';
```

---

## 📚 Documentação Completa

Para detalhes completos de implementação, veja:

📄 [ADMIN_PANEL_DOCUMENTATION.md](./ADMIN_PANEL_DOCUMENTATION.md)

---

## 🎉 Pronto!

Se todos os testes passaram, o painel administrativo está **100% funcional**.

Próximos passos:
- ⏳ Implementar Módulo de Configurações completo
- ⏳ Adicionar notificações real-time
- ⏳ Implementar exportação de dados (CSV/Excel)

---

**Happy Coding! 🚀**
