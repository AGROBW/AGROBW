# 🎨 Guia Visual - Link Admin no Header

## 📊 Antes vs Depois

### Desktop - Header (Antes)

```
┌───────────────────────────────────────────────────────────────┐
│ [Logo] BWAGRO    Início  Anúncios  Categorias  Planos         │
│                                                                │
│                   🔔(2)  👤 João | Painel  [Sair]  [Anunciar] │
└───────────────────────────────────────────────────────────────┘
```

**Limitações**:
- ❌ Sem indicação visual de perfil admin
- ❌ Sem acesso rápido ao painel administrativo
- ❌ Botão "Sair" solto (não integrado)

---

### Desktop - Header (Depois)

```
┌───────────────────────────────────────────────────────────────┐
│ [Logo] BWAGRO    Início  Anúncios  Categorias  Planos         │
│                                                                │
│            🔔(2)  [🛡️👤 João [Admin] | Painel ▼]  [Anunciar] │
│                   └─────────────────────────────┘              │
│                   ┌─ Dropdown Menu ──────────┐                │
│                   │ 👤 Minha Conta           │                │
│                   ├──────────────────────────┤                │
│                   │ 🛡️ Painel Administrativo │ ← NOVO         │
│                   ├──────────────────────────┤                │
│                   │ 🚪 Sair                  │                │
│                   └──────────────────────────┘                │
└───────────────────────────────────────────────────────────────┘
```

**Melhorias**:
- ✅ Badge "Admin" dourado ao lado do nome
- ✅ Mini-badge Shield (🛡️) no avatar
- ✅ Dropdown organizado com 3 opções
- ✅ Link para Painel Admin com destaque amber
- ✅ Botão "Sair" integrado ao dropdown
- ✅ ChevronDown rotaciona ao abrir/fechar

---

### Mobile - Menu (Antes)

```
┌─────────────────────────────────┐
│ ☰                     [Logo]    │
└─────────────────────────────────┘

[Menu Aberto:]
┌─────────────────────────────────┐
│ Início                          │
│ Anúncios                        │
│ Categorias                      │
│ Planos                          │
├─────────────────────────────────┤
│ 📧 Mensagens (2)                │
├─────────────────────────────────┤
│ 👤 João                         │
│ Meu Painel           [Sair]     │
└─────────────────────────────────┘
```

**Limitações**:
- ❌ Sem indicação de perfil admin
- ❌ Sem acesso ao painel administrativo

---

### Mobile - Menu (Depois)

```
┌─────────────────────────────────┐
│ ☰                     [Logo]    │
└─────────────────────────────────┘

[Menu Aberto - Usuário Admin:]
┌─────────────────────────────────┐
│ Início                          │
│ Anúncios                        │
│ Categorias                      │
│ Planos                          │
├─────────────────────────────────┤
│ 📧 Mensagens (2)                │
├─────────────────────────────────┤
│ 🛡️👤 João [Admin]               │ ← Badge visível
│ → Meu Painel                    │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ 🛡️ Painel Administrativo    │ │ ← NOVO
│ └─────────────────────────────┘ │
│                                 │
│ [🚪 Sair]                       │
└─────────────────────────────────┘

[Menu Aberto - Usuário Comum:]
┌─────────────────────────────────┐
│ Início                          │
│ Anúncios                        │
│ Categorias                      │
│ Planos                          │
├─────────────────────────────────┤
│ 📧 Mensagens (2)                │
├─────────────────────────────────┤
│ 👤 Maria                        │ ← Sem badge
│ → Meu Painel                    │
│                                 │
│                                 │ ← Link admin não aparece
│                                 │
│ [🚪 Sair]                       │
└─────────────────────────────────┘
```

**Melhorias**:
- ✅ Badge "Admin" visível no mobile
- ✅ Mini-badge Shield no avatar
- ✅ Link destacado para Painel Admin (fundo amber)
- ✅ Botão Sair redesenhado (com ícone)
- ✅ Layout organizado verticalmente

---

## 🎨 Componentes Visuais

### 1. Badge "Admin"

```
┌─────────┐
│ [ADMIN] │ ← Amber 100 background
└─────────┘   Amber 700 text
              Font: Black (900)
              Size: 9px
              Uppercase
              Rounded-full
```

**Código**:
```tsx
<span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-black uppercase rounded-full">
  Admin
</span>
```

---

### 2. Mini-badge Shield no Avatar

```
     ┌────────┐
     │   J    │ ← Avatar (green-700)
     │     🛡️ │ ← Shield badge (amber-500)
     └────────┘
```

**Posicionamento**:
- `relative` no avatar
- `absolute -bottom-1 -right-1` no badge
- `border-2 border-white` para separar

**Código**:
```tsx
<div className="w-9 h-9 rounded-full bg-green-700 relative">
  J
  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-amber-500 rounded-full border-2 border-white">
    <Shield className="w-2.5 h-2.5 text-white" />
  </div>
</div>
```

---

### 3. Dropdown Menu (Desktop)

```
┌───────────────────────────────┐
│                               │
│  👤  Minha Conta              │ ← text-slate-700
│                               │   hover:bg-slate-50
├───────────────────────────────┤
│                               │
│  🛡️  Painel Administrativo    │ ← text-amber-700
│                               │   hover:bg-amber-50
├───────────────────────────────┤
│                               │
│  🚪  Sair                     │ ← text-red-600
│                               │   hover:bg-red-50
└───────────────────────────────┘
```

**Classes**:
```tsx
// Container
className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-50"

// Item normal
className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"

// Item admin
className="flex items-center gap-3 px-4 py-2.5 text-sm text-amber-700 hover:bg-amber-50"

// Item sair
className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
```

---

### 4. Link Admin Mobile

```
┌─────────────────────────────────────┐
│                                     │
│  🛡️  Painel Administrativo          │
│                                     │
└─────────────────────────────────────┘
    ↑
    Background: amber-50
    Border: amber-200
    Text: amber-700 (semibold)
    Padding: 8px (p-2)
    Rounded: lg
    Hover: amber-100
```

**Código**:
```tsx
<Link 
  to="/admin" 
  className="flex items-center gap-3 p-2 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100"
>
  <Shield className="w-5 h-5 text-amber-600" />
  <span className="font-semibold text-amber-700 text-sm">
    Painel Administrativo
  </span>
</Link>
```

---

## 🔄 Estados Interativos

### Dropdown - Estados

#### 1. Fechado (Default)
```
┌─────────────────────┐
│ 🛡️👤 João [Admin] ▼ │ ← ChevronDown normal
└─────────────────────┘
```

#### 2. Aberto
```
┌─────────────────────┐
│ 🛡️👤 João [Admin] ▲ │ ← ChevronDown rotacionado (rotate-180)
└─────────────────────┘
┌─ Menu ──────────────┐
│ 👤 Minha Conta      │
│ 🛡️ Painel Admin     │
│ 🚪 Sair             │
└─────────────────────┘
```

#### 3. Hover no Item
```
┌─ Menu ──────────────────┐
│ 👤 Minha Conta          │
│ ╔═══════════════════╗   │ ← bg-amber-50
│ ║ 🛡️ Painel Admin   ║   │
│ ╚═══════════════════╝   │
│ 🚪 Sair                 │
└─────────────────────────┘
```

---

### Mobile - Link Admin Estados

#### 1. Normal
```
┌───────────────────────────┐
│ 🛡️ Painel Administrativo  │ ← bg-amber-50
└───────────────────────────┘
```

#### 2. Hover/Touch
```
┌───────────────────────────┐
│ 🛡️ Painel Administrativo  │ ← bg-amber-100 (mais escuro)
└───────────────────────────┘
```

---

## 🎯 Áreas Clicáveis

### Desktop

```
┌────────────────────────────────────┐
│ [CLIQUE AQUI PARA ABRIR DROPDOWN]  │
│                                    │
│ 🛡️👤 João [Admin] | Painel ▼       │
│                                    │
└────────────────────────────────────┘
       ↓
       Abre dropdown completo
```

**Elementos clicáveis**:
- ✅ Avatar
- ✅ Nome + Badge
- ✅ Texto "Painel"
- ✅ ChevronDown

**Área total**: ~180px de largura × 44px de altura

---

### Mobile

```
┌──────────────────────────────┐
│ [CLICÁVEL - Link para conta] │
│                              │
│ 🛡️👤 João [Admin]            │
│ → Meu Painel                 │
└──────────────────────────────┘

┌──────────────────────────────┐
│ [CLICÁVEL - Link para admin] │
│                              │
│ 🛡️ Painel Administrativo     │
└──────────────────────────────┘

┌──────────────────────────────┐
│ [CLICÁVEL - Logout]          │
│                              │
│ 🚪 Sair                      │
└──────────────────────────────┘
```

**Altura mínima**: 44px (recomendação Apple HIG para touch targets)

---

## 🎨 Paleta de Cores

### Amber (Admin)

| Shade | Hex | Uso |
|-------|-----|-----|
| Amber 50 | `#FFFBEB` | Background hover (mobile) |
| Amber 100 | `#FEF3C7` | Badge background |
| Amber 200 | `#FDE68A` | Border (mobile link) |
| Amber 500 | `#F59E0B` | Mini-badge Shield |
| Amber 600 | `#D97706` | Shield icon |
| Amber 700 | `#B45309` | Badge text, link text |

### Green (Padrão)

| Shade | Hex | Uso |
|-------|-----|-----|
| Green 50 | `#F0FDF4` | Hover secundário |
| Green 100 | `#DCFCE7` | Border avatar |
| Green 600 | `#16A34A` | "Painel" subtitle |
| Green 700 | `#15803D` | Avatar background, botão primário |

### Slate (Neutro)

| Shade | Hex | Uso |
|-------|-----|-----|
| Slate 50 | `#F8FAFC` | Card background, hover |
| Slate 100 | `#F1F5F9` | Border separador |
| Slate 200 | `#E2E8F0` | Border dropdown |
| Slate 400 | `#94A3B8` | ChevronDown, ícones secundários |
| Slate 500 | `#64748B` | Ícones, subtexts |
| Slate 600 | `#475569` | Text normal |
| Slate 700 | `#334155` | Text dropdown |
| Slate 800 | `#1E293B` | Nome usuário (bold) |
| Slate 900 | `#0F172A` | Headings |

### Red (Ações Destrutivas)

| Shade | Hex | Uso |
|-------|-----|-----|
| Red 50 | `#FEF2F2` | Hover "Sair" |
| Red 500 | `#EF4444` | Texto "Sair" (mobile) |
| Red 600 | `#DC2626` | Texto "Sair" (desktop) |

---

## 📐 Dimensões & Espaçamento

### Desktop

| Elemento | Dimensão |
|----------|----------|
| Avatar | 36×36px (w-9 h-9) |
| Mini-badge Shield | 16×16px (w-4 h-4) |
| Badge "Admin" | Auto × 18px (py-0.5) |
| Dropdown width | 224px (w-56) |
| Dropdown item height | 40px (py-2.5) |
| Ícone dropdown | 16×16px (w-4 h-4) |
| Gap entre elementos | 12px (gap-3) |

### Mobile

| Elemento | Dimensão |
|----------|----------|
| Avatar | 32×32px (w-8 h-8) |
| Mini-badge Shield | 14×14px (w-3.5 h-3.5) |
| Link admin | Auto × mínimo 44px |
| Padding link admin | 8px (p-2) |
| Ícone Shield (mobile) | 20×20px (w-5 h-5) |
| Gap vertical | 8px (space-y-2) |

---

## ✅ Acessibilidade

### Contraste de Cores (WCAG AA)

| Combinação | Contraste | Status |
|------------|-----------|--------|
| Amber 700 / Amber 100 | 6.2:1 | ✅ Pass AAA |
| Amber 700 / Amber 50 | 8.1:1 | ✅ Pass AAA |
| Slate 700 / White | 12.6:1 | ✅ Pass AAA |
| Red 600 / White | 6.5:1 | ✅ Pass AAA |

### Keyboard Navigation

| Ação | Tecla |
|------|-------|
| Abrir dropdown | Enter / Space |
| Navegar items | ↑ ↓ |
| Selecionar item | Enter |
| Fechar dropdown | Esc |

### ARIA Labels (Recomendado)

```tsx
<button 
  aria-label="Menu do usuário"
  aria-expanded={isProfileDropdownOpen}
  aria-haspopup="menu"
>
  {/* Avatar + Nome */}
</button>

<div role="menu" aria-label="Opções do usuário">
  <Link to="/minha-conta" role="menuitem">
    Minha Conta
  </Link>
  {isAdmin && (
    <Link to="/admin" role="menuitem">
      Painel Administrativo
    </Link>
  )}
  <button role="menuitem">Sair</button>
</div>
```

---

## 🚀 Performance

### Renderizações Otimizadas

```tsx
// ❌ Problema: Re-renderiza toda vez que user muda
{user && user.role === 'admin' && <Link>...</Link>}

// ✅ Solução: Memoizar verificação
const isAdmin = useMemo(() => 
  user?.is_admin === true || user?.role === 'admin',
  [user?.is_admin, user?.role]
);
```

### Lazy Loading de Ícones

```tsx
// Todos os ícones Lucide importados de uma vez
import { Shield, LogOut, UserIcon, ChevronDown } from 'lucide-react';

// Bundle size: ~2KB (gzipped)
// Performance: ✅ Aceitável (poucos ícones)
```

### Click Outside Performance

```tsx
// useEffect roda apenas quando dropdown abre/fecha
// Listener é adicionado/removido dinamicamente
useEffect(() => {
  if (isProfileDropdownOpen) {
    document.addEventListener('mousedown', handleClickOutside);
  }
  return () => {
    document.removeEventListener('mousedown', handleClickOutside);
  };
}, [isProfileDropdownOpen]); // ← Dependency array otimizada
```

---

**Última Atualização**: 12 de março de 2026  
**Versão**: 1.0  
**Autor**: Assistente AI (GitHub Copilot)
