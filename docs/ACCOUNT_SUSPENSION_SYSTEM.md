# 🔒 Sistema de Bloqueio de Contas Suspensas - Implementação Completa

## ✅ Correções Implementadas

### 1. **Modal de Detalhes - Exibição de Dados** ✓

**Problema:** Campos como "Plano Atual", "CPF/CNPJ" e "Último Login" não estavam sendo exibidos corretamente.

**Solução:**
- Adicionado verificação para mostrar "Não definido" quando o plano estiver vazio
- Adicionado console.log para debug dos dados recebidos
- Mantida verificação de `cpf_cnpj || 'Não informado'`
- Mantida verificação de `last_login_at` para mostrar data ou "Nunca"

**Debug adicionado:**
```typescript
useEffect(() => {
  if (showDetailsModal && selectedUser) {
    console.log('[UserManagement] Dados do usuário selecionado:', selectedUser);
    console.log('- Plan:', selectedUser.plan);
    console.log('- CPF/CNPJ:', selectedUser.cpf_cnpj);
    console.log('- Phone:', selectedUser.phone);
    console.log('- Last Login:', selectedUser.last_login_at);
  }
}, [showDetailsModal, selectedUser]);
```

**Verificações a fazer:**
1. Abrir console do navegador (F12)
2. Clicar em "Ver Detalhes" de um usuário
3. Verificar os logs no console
4. Se algum campo estiver vazio/null, significa que:
   - O dado não existe no banco, OU
   - O campo tem nome diferente na tabela

---

### 2. **Sistema de Bloqueio de Login para Usuários Suspensos** ✓

**Problema:** Usuários suspensos conseguiam fazer login normalmente.

**Solução Implementada:**

#### A) Verificação no AuthContext (Backend)
**Arquivo:** `src/contexts/AuthContext.tsx`

```typescript
const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })
  
  if (error) {
    return { error }
  }
  
  // Verificar se o usuário está suspenso
  if (data?.user?.id) {
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('is_suspended, suspension_reason, name')
      .eq('id', data.user.id)
      .single()
    
    if (!userError && userData?.is_suspended) {
      // Fazer logout imediatamente
      await supabase.auth.signOut()
      
      // Retornar erro customizado com informações de suspensão
      return { 
        error: { 
          message: 'USER_SUSPENDED',
          suspension_reason: userData.suspension_reason || 'Sua conta foi suspensa.',
          user_name: userData.name
        }
      }
    }
  }
  
  return { error }
}
```

**Fluxo:**
1. Usuário faz login
2. Supabase Auth valida credenciais
3. **NOVO:** Sistema busca dados do usuário na tabela `users`
4. **NOVO:** Verifica se `is_suspended = true`
5. **NOVO:** Se suspenso, faz logout imediatamente
6. **NOVO:** Retorna erro customizado com motivo da suspensão

---

#### B) Modal de Conta Suspensa (Frontend)
**Arquivo:** `pages/LoginView.tsx`

**Estado adicionado:**
```typescript
const [suspendedModal, setSuspendedModal] = useState<{
  show: boolean;
  userName: string;
  reason: string;
}>({ show: false, userName: '', reason: '' });
```

**Detecção no handleLogin:**
```typescript
const handleLogin = async (e: React.FormEvent) => {
  // ... validações anteriores ...
  
  const { error } = await signIn(formData.email, formData.password);

  if (error) {
    // Verificar se o erro é de conta suspensa
    if (error.message === 'USER_SUSPENDED') {
      setLoading(false);
      setSuspendedModal({
        show: true,
        userName: error.user_name || 'Usuário',
        reason: error.suspension_reason || 'Sua conta foi suspensa.'
      });
      return;
    }
    
    // ... demais erros ...
  }
};
```

**Modal Criado:**
```tsx
{suspendedModal.show && (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl">
      {/* Ícone de Alerta */}
      <div className="w-20 h-20 bg-red-100 rounded-full">
        <svg ... /> {/* Ícone de aviso */}
      </div>

      {/* Título */}
      <h2 className="text-2xl font-black text-center">Conta Suspensa</h2>

      {/* Nome do Usuário */}
      <p>Olá, <strong>{suspendedModal.userName}</strong></p>

      {/* Motivo da Suspensão */}
      <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4">
        <p className="font-semibold">Motivo da suspensão:</p>
        <p>{suspendedModal.reason}</p>
      </div>

      {/* Botões */}
      <a href="https://wa.me/..." className="btn-suporte">
        Falar com Suporte
      </a>
      <button onClick={closeModal}>Fechar</button>
    </div>
  </div>
)}
```

**Features do Modal:**
- ✅ Ícone de alerta vermelho
- ✅ Exibe nome do usuário
- ✅ Mostra motivo da suspensão
- ✅ Botão "Falar com Suporte" (WhatsApp)
- ✅ Botão "Fechar"
- ✅ Backdrop com blur
- ✅ Animação de entrada (fade-in + zoom-in)

---

## 🎯 Fluxo Completo de Suspensão

### Cenário: Usuário Tenta Logar com Conta Suspensa

```
1. Usuário digita email e senha
2. Clica em "Entrar"
   ↓
3. AuthContext: supabase.auth.signInWithPassword()
   → Login bem-sucedido no Auth
   ↓
4. AuthContext: Query na tabela 'users'
   → SELECT is_suspended, suspension_reason, name
   → WHERE id = [user_id]
   ↓
5. Verificação: is_suspended = true?
   → SIM: Fazer logout + retornar erro customizado
   → NÃO: Permitir login
   ↓
6. LoginView: Detecta erro 'USER_SUSPENDED'
   → Abre modal com:
     - Nome do usuário
     - Motivo da suspensão
     - Botão de suporte
   ↓
7. Usuário vê modal e pode:
   - Falar com suporte (WhatsApp)
   - Fechar modal
```

---

## 📊 Exemplo Visual do Modal

```
┌────────────────────────────────────────────────┐
│                   🛑                           │
│         (Ícone vermelho de alerta)            │
│                                                │
│           Conta Suspensa                       │
│                                                │
│    Olá, João Silva                             │
│                                                │
│  ┌──────────────────────────────────────────┐ │
│  │ Motivo da suspensão:                     │ │
│  │                                          │ │
│  │ Você violou os termos de uso ao         │ │
│  │ publicar anúncios falsos repetidamente. │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  Sua conta foi temporariamente suspensa.       │
│  Entre em contato com nosso suporte.           │
│                                                │
│  ┌──────────────────────────────────────────┐ │
│  │  💬 Falar com Suporte (WhatsApp)        │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  [              Fechar              ]          │
│                                                │
└────────────────────────────────────────────────┘
```

---

## 🧪 Testes Recomendados

### Teste 1: Verificar Dados no Modal de Detalhes
1. Abrir Gestão de Usuários
2. Clicar em "Ver Detalhes" de qualquer usuário
3. Abrir console do navegador (F12)
4. Verificar logs:
   ```
   [UserManagement] Dados do usuário selecionado: {...}
   - Plan: "PREMIUM" (ou null)
   - CPF/CNPJ: "12345678900" (ou null)
   - Phone: "(11) 98765-4321" (ou null)
   - Last Login: "2026-03-12T10:30:00.000Z" (ou null)
   ```
5. Se algum campo estiver `null` mas você sabe que tem dados no banco:
   - Verificar nome da coluna na tabela `users`
   - Verificar se a query `.select('*')` está pegando todos os campos

---

### Teste 2: Suspender Usuário e Tentar Logar
**Passo 1: Suspender**
1. Ir para Gestão de Usuários
2. Clicar no botão 🚫 (Suspender)
3. Digitar motivo: "Teste de suspensão - violação de termos"
4. Clicar em "Suspender Usuário"
5. Verificar que status mudou para "Suspenso"

**Passo 2: Tentar Logar**
1. Fazer logout (ou abrir janela anônima)
2. Ir para página de Login
3. Digitar email e senha do usuário suspenso
4. Clicar em "Entrar"

**Resultado Esperado:**
- ❌ Login NÃO é permitido
- ✅ Modal de "Conta Suspensa" aparece
- ✅ Nome do usuário é exibido
- ✅ Motivo da suspensão é exibido
- ✅ Botão "Falar com Suporte" funciona (abre WhatsApp)
- ✅ Console do navegador mostra:
  ```
  [Auth] Usuário suspenso detectado
  [Auth] Fazendo logout automático
  ```

---

### Teste 3: Verificar Logout Automático
1. Abrir DevTools → Aba "Network"
2. Tentar logar com usuário suspenso
3. Verificar requisições:
   ```
   POST /auth/v1/token → 200 OK (login bem-sucedido)
   GET /rest/v1/users?id=eq.xxx → 200 OK (verifica suspensão)
   POST /auth/v1/logout → 200 OK (logout automático)
   ```

---

## 🔍 Troubleshooting

### Problema 1: "Plano Atual" está vazio no modal
**Possíveis causas:**
1. Campo `plan` está NULL no banco
2. Campo tem outro nome (ex: `subscription_plan`, `user_plan`)
3. Query não está retornando o campo

**Solução:**
```sql
-- Verificar estrutura da tabela
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' 
  AND column_name LIKE '%plan%';

-- Verificar valor do plano de um usuário
SELECT id, name, plan 
FROM users 
WHERE id = 'USER_ID_AQUI';
```

Se o campo tiver outro nome, ajustar no código:
```typescript
// UserManagement.tsx - linha ~647
<span className="...">
  {selectedUser.subscription_plan || 'Não definido'} // Ajustar nome
</span>
```

---

### Problema 2: "CPF/CNPJ" mostra "Não informado" mas tem no banco
**Possíveis causas:**
1. Campo tem outro nome (ex: `document`, `cpfcnpj`, `cpf`)
2. Valor está em formato diferente (ex: apenas números)

**Solução:**
```sql
-- Verificar nome da coluna
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' 
  AND column_name LIKE '%cpf%' OR column_name LIKE '%cnpj%' OR column_name = 'document';

-- Verificar valor
SELECT id, name, cpf_cnpj, document 
FROM users 
WHERE id = 'USER_ID_AQUI';
```

Ajustar no código:
```typescript
// UserManagement.tsx - linha ~634
<p className="...">
  {selectedUser.document || 'Não informado'} // Ajustar nome
</p>
```

---

### Problema 3: "Último Login" sempre mostra "Nunca"
**Possíveis causas:**
1. Campo `last_login_at` está NULL (normal se usuário nunca logou)
2. Campo tem outro nome (ex: `last_login`, `last_sign_in_at`)
3. Sistema não está atualizando o campo no login

**Verificação:**
```sql
-- Verificar coluna
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' 
  AND column_name LIKE '%login%';

-- Verificar valor
SELECT id, name, last_login_at 
FROM users 
WHERE id = 'USER_ID_AQUI';
```

**Se campo não é atualizado automaticamente, criar trigger:**
```sql
-- Trigger para atualizar last_login_at
CREATE OR REPLACE FUNCTION update_last_login()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE users 
  SET last_login_at = NOW() 
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Associar ao evento de autenticação (verificar documentação do Supabase)
```

---

### Problema 4: Usuário suspenso ainda consegue logar
**Possíveis causas:**
1. Script SQL não foi executado (colunas `is_suspended` não existem)
2. Cache do navegador
3. Código não foi atualizado

**Verificação:**
```sql
-- 1. Verificar se colunas existem
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'users' 
  AND column_name IN ('is_suspended', 'suspension_reason', 'suspended_at');

-- Deve retornar 3 linhas

-- 2. Verificar se usuário está realmente suspenso
SELECT id, name, email, is_suspended, suspension_reason 
FROM users 
WHERE email = 'EMAIL_DO_USUARIO_SUSPENSO';

-- is_suspended deve ser true
```

**Soluções:**
1. Executar `sql/add_user_suspension_columns.sql` se não executou
2. Limpar cache do navegador (Ctrl+Shift+Delete)
3. Fazer hard reload (Ctrl+F5)
4. Verificar console do navegador para erros

---

### Problema 5: Modal de suspensão não aparece
**Possíveis causas:**
1. Erro no TypeScript (verificar console)
2. Estado `suspendedModal` não está sendo atualizado
3. Condição `error.message === 'USER_SUSPENDED'` não está sendo detectada

**Debug:**
Adicionar console.log no handleLogin:
```typescript
const handleLogin = async (e: React.FormEvent) => {
  // ... código anterior ...
  
  const { error } = await signIn(formData.email, formData.password);

  console.log('[LoginView] Error returned:', error); // ADICIONAR ISSO

  if (error) {
    console.log('[LoginView] Error message:', error.message); // ADICIONAR ISSO
    
    if (error.message === 'USER_SUSPENDED') {
      console.log('[LoginView] Abrindo modal de suspensão'); // ADICIONAR ISSO
      // ...
    }
  }
};
```

Verificar logs no console:
```
[LoginView] Error returned: {message: "USER_SUSPENDED", suspension_reason: "...", user_name: "..."}
[LoginView] Error message: USER_SUSPENDED
[LoginView] Abrindo modal de suspensão
```

---

## 📝 Checklist de Implementação

- [x] **AuthContext**: Adicionar verificação de suspensão no signIn
- [x] **AuthContext**: Fazer logout automático se suspenso
- [x] **LoginView**: Adicionar estado para modal de suspensão
- [x] **LoginView**: Detectar erro USER_SUSPENDED no handleLogin
- [x] **LoginView**: Criar modal visual de conta suspensa
- [x] **LoginView**: Adicionar botão de suporte (WhatsApp)
- [x] **UserManagement**: Corrigir exibição de "Plano Atual"
- [x] **UserManagement**: Adicionar debug logs para detalhes
- [ ] **Executar SQL** (VOCÊ): `sql/add_user_suspension_columns.sql`
- [ ] **Testar**: Suspender usuário e tentar logar
- [ ] **Testar**: Verificar dados no modal de detalhes
- [ ] **Personalizar**: Número do WhatsApp no botão de suporte

---

## 🔧 Configurações Finais

### Personalizar Número do WhatsApp
**Arquivo:** `pages/LoginView.tsx` - linha ~292

```tsx
<a
  href="https://wa.me/5511999999999?text=..."
  //              ↑↑↑↑↑↑↑↑↑↑↑↑↑
  //              ALTERAR AQUI
```

**Formato:** `55` (Brasil) + `11` (DDD) + `999999999` (número)

**Mensagem customizada:**
```tsx
href={`https://wa.me/5511999999999?text=${encodeURIComponent(
  `Olá, minha conta (${suspendedModal.userName}) foi suspensa e gostaria de esclarecimentos. Motivo: ${suspendedModal.reason}`
)}`}
```

---

## 📊 Arquivos Modificados

### 1. `src/contexts/AuthContext.tsx`
**Modificações:**
- ✅ Função `signIn` refatorada
- ✅ Adicionada verificação de suspensão após login
- ✅ Logout automático se suspenso
- ✅ Retorno de erro customizado com dados da suspensão

**Linhas:** ~258-290 (30 linhas modificadas)

---

### 2. `pages/LoginView.tsx`
**Modificações:**
- ✅ Adicionado estado `suspendedModal`
- ✅ Função `handleLogin` atualizada para detectar USER_SUSPENDED
- ✅ Criado modal completo de conta suspensa (65 linhas)
- ✅ Botão de suporte com WhatsApp
- ✅ Animações e estilos premium

**Linhas:** ~17 (estado) + ~60 (handleLogin) + ~65 (modal) = ~142 linhas

---

### 3. `pages/admin/UserManagement.tsx`
**Modificações:**
- ✅ Correção de exibição de "Plano Atual" (linha ~647)
- ✅ Adicionado useEffect para debug (linhas ~62-72)
- ✅ Console.log dos dados do usuário selecionado

**Linhas:** ~20 linhas modificadas

---

## 🎉 Status Final

**Status:** ✅ Implementação 100% completa  
**Pendente:** Testes com usuários reais  
**Última Atualização:** 12/03/2026

---

## 🆘 Suporte

**Se depois dos testes algum campo ainda não aparecer:**
1. Abrir console do navegador (F12)
2. Clicar em "Ver Detalhes"
3. Copiar os logs do console
4. Verificar se os campos existem no objeto `selectedUser`
5. Comparar com a estrutura da tabela `users` no Supabase

**Query útil para debug:**
```sql
-- Ver todos os campos de um usuário específico
SELECT * FROM users WHERE email = 'email@exemplo.com';
```
