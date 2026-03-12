# 🔐 Link Condicional para Painel Administrativo - Documentação

## ✅ Implementação Concluída

Foi adicionado um link condicional seguro para o Painel Administrativo no Header, visível **apenas** para usuários com perfil administrativo.

---

## 🎯 O Que Foi Implementado

### 1. Verificação de Role Administrativa

```tsx
// No Header.tsx - linha ~40
const isAdmin = user?.is_admin === true || user?.role === 'admin';
```

**Critério de Verificação**: Usuário é considerado admin se:
- `user.is_admin === true` **OU**
- `user.role === 'admin'`

Esta verificação dupla garante compatibilidade com diferentes estruturas de dados do AuthContext.

---

### 2. Badge de Identificação Visual

#### Desktop (Dropdown de Perfil)

**Badge "Admin" dourado**:
- Posição: Ao lado do nome do usuário
- Cor: Amber/Dourado (`bg-amber-100 text-amber-700`)
- Estilo: Texto em uppercase, fonte black, borda arredondada

**Mini-badge no avatar**:
- Ícone: `Shield` (Lucide React)
- Posição: Canto inferior direito do avatar
- Cor: Amber 500 com borda branca
- Tamanho: 16px (w-4 h-4)

#### Mobile (Menu Hamburguer)

**Badge Admin**:
- Mesmo estilo do desktop
- Posição: Ao lado do nome no card de perfil
- Visível antes de abrir qualquer submenu

**Mini-badge no avatar**:
- Mesmo comportamento do desktop
- Adaptado para tamanho mobile (w-3.5 h-3.5)

---

### 3. Dropdown de Perfil (Desktop)

**Estrutura do Menu**:

```
┌─────────────────────────────┐
│ 👤 Minha Conta              │
├─────────────────────────────┤  (se admin)
│ 🛡️ Painel Administrativo    │
├─────────────────────────────┤
│ 🚪 Sair                     │
└─────────────────────────────┘
```

**Comportamento**:
- **Clique no avatar/nome**: Abre/fecha dropdown
- **Clique fora**: Fecha dropdown automaticamente (useRef + useEffect)
- **Seta (ChevronDown)**: Rotaciona 180° quando aberto
- **Hover**: Feedback visual em cada item

**Segurança**:
- Link para `/admin` **só aparece se** `isAdmin === true`
- Renderização condicional com JSX fragment `<>...</>`
- Separador visual (border-t) antes do link admin

**Estilização Admin**:
- Cor: Amber (`text-amber-700`, `hover:bg-amber-50`)
- Ícone: Shield (distintivo de segurança)
- Font-weight: Semibold (destaque visual)

---

### 4. Menu Mobile

**Localização**: Menu hamburguer (ícone `Menu`)

**Estrutura**:

```
┌─────────────────────────────┐
│ 📧 Mensagens (badge)        │
├─────────────────────────────┤
│ [Avatar] Usuário  [Admin]   │
│ → Meu Painel                │
│                             │
│ 🛡️ Painel Administrativo    │  (se admin)
│                             │
│ [🚪 Sair]                   │
└─────────────────────────────┘
```

**Link Admin (Condicional)**:
- Background: Amber 50 com borda amber 200
- Ícone: Shield (5x5)
- Padding: Generoso para touch targets (p-2)
- Hover: Amber 100 (feedback tátil)

**Responsividade**:
- Touch-friendly: Altura mínima de 44px
- Espaçamento: 8px entre elementos (space-y-2)
- Fechamento automático: Ao clicar em qualquer link

---

## 🔒 Camadas de Segurança

### Frontend (UX)

✅ **Verificação de Role**: 
```tsx
{isAdmin && (
  <Link to="/admin">...</Link>
)}
```

✅ **Estado Sincronizado**: 
Role extraída do `user` do `AuthContext`, que vem do JWT decodificado ou metadados do Supabase.

### Backend (Proteção Real)

✅ **ProtectedAdminRoute** (App.tsx):
```tsx
<Route path="/admin" element={
  <ProtectedAdminRoute requiredRole="admin">
    <AdminLayout />
  </ProtectedAdminRoute>
} />
```

✅ **RLS (Row Level Security)** no Supabase:
- Políticas com funções `SECURITY DEFINER`
- Verificação de `is_admin` em nível de banco
- Script: `sql/ENABLE_MAXIMUM_SECURITY.sql`

### Resumo

| Camada | Mecanismo | Propósito |
|--------|-----------|-----------|
| **UI** | Renderização condicional | Esconder link de não-admins (UX) |
| **Roteamento** | ProtectedAdminRoute | Bloquear acesso à rota `/admin` |
| **Dados** | RLS + SECURITY DEFINER | Proteger queries de dados sensíveis |

**⚠️ Importante**: A renderização condicional no Header é **apenas UX**. Mesmo que um usuário force a URL `#/admin`, o `ProtectedAdminRoute` irá redirecioná-lo para `/admin/login`.

---

## 🎨 Design System

### Cores

| Elemento | Cor | Hex/Class |
|----------|-----|-----------|
| Badge Admin | Amber 100/700 | `bg-amber-100 text-amber-700` |
| Mini-badge Avatar | Amber 500 | `bg-amber-500` |
| Link Admin Hover | Amber 50 | `hover:bg-amber-50` |
| Ícone Shield | Amber 600/700 | `text-amber-600` |
| Borda Admin Mobile | Amber 200 | `border-amber-200` |

### Tipografia

| Elemento | Font | Size | Weight |
|----------|------|------|--------|
| Badge "Admin" | Sans | 9px | Black (900) |
| Nome Usuário | Sans | 12px (xs) | Semibold (600) |
| Link Dropdown | Sans | 14px (sm) | Medium (500) / Semibold (600) |
| Botão Sair | Sans | 14px (sm) | Medium (500) |

### Ícones (Lucide React)

| Ícone | Uso | Tamanho | Stroke |
|-------|-----|---------|--------|
| `Shield` | Badge avatar + Link admin | 4w/4h (desktop), 3.5w/3.5h (mobile) | 2-3 |
| `ChevronDown` | Seta dropdown | 4w/4h | 1.5 |
| `UserIcon` | Minha Conta | 4w/4h | 2 |
| `LogOut` | Sair | 4w/4h | 2 |

---

## 🧪 Como Testar

### Pré-requisitos

1. Ter um usuário com `is_admin = true` ou `role = 'admin'`
2. Estar autenticado no sistema

### Teste 1: Verificar Badge Admin (Desktop)

1. Faça login com usuário admin
2. No Header, verifique:
   - ✅ Badge dourado "Admin" ao lado do nome
   - ✅ Mini-badge `Shield` no avatar (canto inferior direito)
   - ✅ Nome truncado se muito longo (`max-w-[80px]`)

**Esperado**: Badge aparece **apenas** para admins

### Teste 2: Dropdown de Perfil (Desktop)

1. Clique no avatar/nome do usuário
2. Dropdown deve abrir com 3 opções (se admin) ou 2 (se não)
3. Verifique:
   - ✅ "Minha Conta" (sempre visível)
   - ✅ "Painel Administrativo" (se admin, com ícone Shield e cor amber)
   - ✅ Separador (linha) antes do link admin
   - ✅ "Sair" (sempre visível, cor vermelha)
4. Clique em "Painel Administrativo"
5. Deve navegar para `#/admin`

**Esperado**: 
- Dropdown fecha ao clicar em qualquer link
- Clique fora fecha o dropdown
- Seta rotaciona ao abrir/fechar

### Teste 3: Menu Mobile

1. Reduza a janela para mobile (< 768px)
2. Clique no ícone hamburguer (☰)
3. Menu deve abrir
4. Verifique:
   - ✅ Badge "Admin" ao lado do nome
   - ✅ Mini-badge Shield no avatar
   - ✅ Link "Painel Administrativo" (se admin) com:
     - Background amber claro
     - Borda amber
     - Ícone Shield à esquerda
5. Clique em "Painel Administrativo"
6. Deve navegar para `#/admin` e fechar o menu

**Esperado**: 
- Link admin só aparece para usuários com `isAdmin = true`
- Menu fecha ao clicar em qualquer link

### Teste 4: Segurança (Usuário Comum)

1. Faça login com usuário **sem** perfil admin
2. No Header, verifique:
   - ❌ Badge "Admin" **não** aparece
   - ❌ Mini-badge Shield **não** aparece
   - ❌ Link "Painel Administrativo" **não** está no dropdown
3. Tente acessar manualmente: `http://localhost:5173/#/admin`
4. Deve ser redirecionado para `/admin/login`

**Esperado**: 
- Interface limpa para usuários comuns
- Proteção de rota funciona independentemente da UI

### Teste 5: Clique Fora do Dropdown

1. Faça login com qualquer usuário
2. Clique no avatar para abrir dropdown
3. Clique em qualquer área **fora** do dropdown
4. Dropdown deve fechar automaticamente

**Esperado**: 
- useRef detecta clique outside
- Dropdown fecha suavemente

---

## 🔍 Debugging

### Console Logs Úteis

```tsx
// Adicionar temporariamente no Header.tsx
console.log('[Header] User:', user);
console.log('[Header] Is Admin:', isAdmin);
console.log('[Header] Role:', user?.role);
console.log('[Header] is_admin flag:', user?.is_admin);
```

### Verificar no Supabase

```sql
-- Ver role do usuário atual
SELECT id, email, name, role, is_admin 
FROM users 
WHERE id = auth.uid();

-- Promover usuário para admin (se necessário)
UPDATE users 
SET role = 'admin', is_admin = true 
WHERE email = 'seu-email@example.com';
```

### Verificar AuthContext

```tsx
// No console do browser (F12)
// Inspecionar objeto user do AuthContext
const { user } = useAuth();
console.table({
  id: user?.id,
  email: user?.email,
  role: user?.role,
  is_admin: user?.is_admin
});
```

---

## 📝 Notas de Implementação

### Por que Dropdown ao invés de Link Direto?

**Antes**: Avatar → Link direto para `/minha-conta`  
**Depois**: Avatar → Dropdown com 3 opções

**Justificativa**:
1. **Escalabilidade**: Fácil adicionar mais opções no futuro (Configurações, Ajuda, etc)
2. **Separação de Contextos**: Minha Conta vs Painel Admin são contextos diferentes
3. **Padrão de Mercado**: Dropdowns de perfil são padrão em dashboards profissionais (Vercel, GitHub, Linear, etc)

### Hook useRef + useEffect para Fechar Dropdown

```tsx
const profileDropdownRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
    if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
      setIsProfileDropdownOpen(false);
    }
  };

  if (isProfileDropdownOpen) {
    document.addEventListener('mousedown', handleClickOutside);
  }

  return () => {
    document.removeEventListener('mousedown', handleClickOutside);
  };
}, [isProfileDropdownOpen]);
```

**Por que `mousedown` e não `click`?**
- `mousedown` é disparado antes de `click`
- Evita race conditions com cliques dentro do dropdown
- Padrão recomendado para "click outside" detection

### Badge Posicionamento

```tsx
<div className="w-9 h-9 ... relative">
  {/* Avatar content */}
  {isAdmin && (
    <div className="absolute -bottom-1 -right-1 ...">
      <Shield />
    </div>
  )}
</div>
```

**Classes importantes**:
- `relative` no container pai (avatar)
- `absolute` no badge filho
- `-bottom-1 -right-1` para posicionar fora (overflow)
- `border-2 border-white` para separar do fundo

---

## 🚀 Próximas Melhorias (Opcional)

### 1. Animação no Dropdown

```tsx
// Usar framer-motion
<motion.div
  initial={{ opacity: 0, y: -10 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -10 }}
  transition={{ duration: 0.2 }}
>
  {/* Dropdown content */}
</motion.div>
```

### 2. Contador de Ações Pendentes

```tsx
// No link admin, mostrar badge com contagem
<Link to="/admin">
  Painel Administrativo
  {pendingCount > 0 && (
    <span className="ml-auto bg-red-500 text-white ...">
      {pendingCount}
    </span>
  )}
</Link>
```

### 3. Tooltip no Badge Admin

```tsx
<Tooltip content="Você tem permissões administrativas">
  <span className="px-1.5 py-0.5 bg-amber-100 ...">
    Admin
  </span>
</Tooltip>
```

---

## ✅ Checklist de Implementação

- [x] Importar ícones necessários (Shield, LogOut, UserIcon)
- [x] Adicionar estado `isProfileDropdownOpen`
- [x] Adicionar useRef para detectar clique fora
- [x] Adicionar useEffect para click outside listener
- [x] Adicionar verificação `isAdmin`
- [x] Adicionar badge "Admin" no nome (desktop)
- [x] Adicionar mini-badge Shield no avatar (desktop)
- [x] Converter avatar em botão com dropdown
- [x] Adicionar ChevronDown com rotação
- [x] Criar dropdown menu com 3 opções
- [x] Adicionar renderização condicional do link admin
- [x] Estilizar link admin (cor amber)
- [x] Adicionar badge admin no mobile
- [x] Adicionar link admin no menu mobile
- [x] Estilizar botão Sair no mobile
- [x] Testar em desktop e mobile
- [x] Verificar que não há erros TypeScript
- [x] Documentar implementação

---

## 📚 Referências

**Arquivos Modificados**:
- [components/Header.tsx](../components/Header.tsx)

**Documentação Relacionada**:
- [ADMIN_PANEL_DOCUMENTATION.md](./ADMIN_PANEL_DOCUMENTATION.md)
- [QUICK_START_ADMIN.md](./QUICK_START_ADMIN.md)
- [README_RBAC_SECURITY.md](./README_RBAC_SECURITY.md)

**Scripts SQL Necessários**:
- [sql/ENABLE_MAXIMUM_SECURITY.sql](../sql/ENABLE_MAXIMUM_SECURITY.sql)

---

**Última Atualização**: 12 de março de 2026  
**Versão**: 1.0  
**Autor**: Assistente AI (GitHub Copilot)
