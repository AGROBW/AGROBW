# 📋 Expansão do Formulário de Cadastro - BWAGRO

## ✨ Novos Recursos Implementados

### 1. **Novos Campos de Dados Pessoais**
- ✅ **Data de Nascimento** (apenas para perfil Individual) - type="date"
- ✅ **Site/URL** (campo opcional) - aceita URLs completas

### 2. **Nova Seção: Endereço Completo**
- ✅ **CEP** com máscara automática (00000-000)
- ✅ **Integração ViaCEP** - consulta automática ao sair do campo (onBlur)
- ✅ **Logradouro** (Rua, Avenida, etc) - preenchido automaticamente
- ✅ **Número** - campo obrigatório
- ✅ **Complemento** - campo opcional (Apto, Bloco, etc)
- ✅ **Bairro** - preenchido automaticamente pelo ViaCEP
- ✅ **Cidade** - preenchido automaticamente pelo ViaCEP
- ✅ **Estado (UF)** - preenchido automaticamente, máximo 2 caracteres

### 3. **Integração com AuthContext**
- ✅ Função `signUp()` atualizada para receber novos campos
- ✅ Dados enviados tanto para `auth.signUp()` (auth.user.user_metadata) quanto para INSERT na tabela public.users
- ✅ Validação de email e senhas mantidas

### 4. **Design & UX**
- ✅ Bordas arredondadas (rounded-2xl)
- ✅ Tipografia Inter com design minimalista
- ✅ Cores institucionais (Green-700)
- ✅ Indicador visual de "carregando" (⏳) ao consultar ViaCEP
- ✅ Campos preenchidos automaticamente ficam com aparência "carregada"
- ✅ Seção de endereço separada visualmente com divisor e ícone 📍

## 🚀 Como Usar

### Passo 1: Executar a Migração no Supabase

1. Vá para [Supabase Dashboard](https://app.supabase.com/)
2. Selecione seu projeto BWAGRO
3. Vá para **SQL Editor** (ou **Database** → **SQL**)
4. Copie e execute o conteúdo do arquivo `supabase-migrations-address.sql`

Este script vai:
- Adicionar as novas colunas à tabela `users`
- Criar índices para melhorar performance
- Adicionar comentários descritivos

### Passo 2: Testar o Novo Formulário

1. Acesse `/register`
2. Selecione o tipo de perfil (Produtor ou Empresa)
3. Preencha os dados básicos
4. Após o Telefone, você verá o novo campo **Site/URL** (opcional)
5. Para perfis de Produtor, verá também **Data de Nascimento**
6. Role para baixo e veja a **Seção Endereço**:
   - Digite um CEP (ex: 01310-100)
   - Ao sair do campo, a API ViaCEP é consultada automaticamente
   - Os campos Logradouro, Bairro, Cidade e Estado se preenchem automaticamente
   - Complete com o Número (obrigatório) e Complemento (opcional)

### Passo 3: Verificar Dados no Supabase

Após criar uma conta, você pode verificar os dados em:
1. **Supabase Dashboard** → seu projeto
2. **Tables** → `users`
3. Procure pela linha com seu email
4. Veja os novos campos preenchidos

## 📊 Estrutura de Dados

### Novos Campos na Tabela `users`:

```sql
birth_date      DATE              -- Data de nascimento
website         VARCHAR(255)      -- URL do site/perfil
cep             VARCHAR(8)        -- CEP sem formatação
logradouro      VARCHAR(255)      -- Rua/Avenida
numero          VARCHAR(20)       -- Número do imóvel
complemento     VARCHAR(255)      -- Apto/Bloco/etc
bairro          VARCHAR(100)      -- Bairro
cidade          VARCHAR(100)      -- Cidade
estado          VARCHAR(2)        -- UF (SP, RJ, etc)
```

## 🔄 Fluxo de Dados

```
Usuário preche formulário
          ↓
Clica em "Cadastrar"
          ↓
handleRegister() valida dados
          ↓
signUp() envia para:
  - auth.signUp() (cria usuário na Auth)
  - INSERT em public.users (salva dados adicionais)
          ↓
Usuário redirecionado para /anunciar
```

## 🛡️ Validações

- **CEP**: Deve ter exatamente 8 dígitos
- **Email**: Validação básica de formato
- **Senha**: Mínimo 6 caracteres
- **Confirmar Senha**: Deve coincidir com a senha
- **Termos de Uso**: Obrigatório aceitar
- **Website**: Validação opcional, aceita qualquer URL

## 🔌 Integração ViaCEP

- **URL**: `https://viacep.com.br/ws/{cep}/json/`
- **Timeout**: 5 segundos
- **Resposta**: Preenche automaticamente logradouro, bairro, cidade, estado
- **Erro**: Mostra mensagem se CEP não encontrado

## 📱 Responsividade

O formulário é totalmente responsivo:
- **Mobile**: Coluna única, campos empilhados
- **Tablet**: Grid de 2 colunas para alguns campos
- **Desktop**: Layout otimizado com largura máxima de 448px

## 🎨 Classes CSS Tailwind Utilizadas

- `rounded-2xl` - Bordas arredondadas
- `bg-slate-50` - Fundo dos inputs
- `border-green-600` - Cor de foco
- `text-green-700` - Textos de labels
- `shadow-xl shadow-green-200` - Sombra do botão
- `animate-spin` - Indicador de carregamento

## ❓ FAQ

**P: O campo de endereço é obrigatório?**
R: Não totalmente. Apenas CEP e Número são essenciais para localização. Cidade e Estado são preenchidos automaticamente pelo ViaCEP.

**P: O ViaCEP funciona offline?**
R: Não, é necessário conexão com a internet. Se falhar, mostra erro.

**P: Posso editar os campos preenchidos pelo ViaCEP?**
R: Sim! Após o preenchimento automático, você pode editar qualquer campo.

**P: A Data de Nascimento é obrigatória?**
R: Não, aparece apenas para Perfil Individual e é opcional.

**P: Os dados de endereço ficam públicos?**
R: Isso depende das políticas RLS do Supabase. Atualmente, apenas o próprio usuário pode ver seus dados.

## 📞 Suporte

Se encontrar problemas:
1. Verifique se a migração SQL foi executada
2. Abra o console do navegador (F12) e procure por erros
3. Verifique se o ViaCEP está acessível
4. Teste com CEPs conhecidos (ex: 01310-100 - Av. Paulista, São Paulo)
