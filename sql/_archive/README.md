# sql/_archive — Scripts arquivados (NÃO EXECUTAR)

Os arquivos com sufixo `.DONOTRUN` foram **arquivados por segurança** em 2026-06-07.
Eles permanecem aqui apenas como registro histórico e **não devem ser executados**
em nenhum ambiente.

| Arquivo | Por que foi arquivado |
|---|---|
| `DISABLE_RLS_COMPLETELY.sql.DONOTRUN` | Desabilita RLS de `users`/`admin_audit_logs` ("segurança no frontend"). Reabriria exposição total de PII + escalada de privilégio. |
| `RECOVERY_RLS_RECURSION.sql.DONOTRUN` | Desabilita RLS de `users` e remove policies para contornar recursão. Reabriria as brechas V1–V4. |

## O que usar no lugar
- Hardening de RLS/grants: **`sql/SECURITY_FIX_RLS_PRIVS_2026-06-07.sql`** (RLS ON + policies que exigem MFA/aal2 + least privilege).
- Limpeza de policies duplicadas: **`sql/SECURITY_FIX_POLICY_DEDUP_2026-06-07.sql`**.
- Recursão de policy em `users` deve ser resolvida com funções `SECURITY DEFINER`
  (ex.: `public.is_admin()`), **nunca** desligando o RLS.
