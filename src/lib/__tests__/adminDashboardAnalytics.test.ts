import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('AdminDashboardOverview analytics contract', () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'pages/admin/AdminDashboardOverview.tsx'),
    'utf8'
  );

  it('usa a mesma RPC consolidada do modulo Estatisticas para visitantes unicos', () => {
    expect(source).toContain("supabase.rpc('get_site_analytics_summary'");
    expect(source).toContain('p_period_days: periodDays');
  });

  it('nao consulta a tabela legada de visitas', () => {
    expect(source).not.toContain("from('website_visits')");
  });

  it('nao transforma falhas de consulta em zeros silenciosos', () => {
    expect(source).toContain('assertQuerySucceeded');
    expect(source).toContain('Alguns indicadores estao indisponiveis');
  });

  it('calcula clientes pagos a partir de pagamentos aprovados no periodo', () => {
    expect(source.match(/\.from\('payments'\)/g)).toHaveLength(2);
    expect(source).toContain(".gte('paid_at', rangeStartIso)");
    expect(source).toContain(".lte('paid_at', rangeEndIso)");
  });
});
