import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const panel = readFileSync(
  resolve(process.cwd(), 'components/dashboard/SellerStoreInsightsPanel.tsx'),
  'utf8',
);
const dashboard = readFileSync(
  resolve(process.cwd(), 'components/dashboard/SellerStoreDashboard.tsx'),
  'utf8',
);
const hook = readFileSync(resolve(process.cwd(), 'src/hooks/useSellerStoreInsights.ts'), 'utf8');

describe('Seller Store Insights stage 4', () => {
  it('adds an accessible performance tab without changing the default workspace', () => {
    expect(dashboard).toContain("id: 'insights', label: 'Desempenho'");
    expect(dashboard).toContain('id="store-panel-insights"');
    expect(dashboard).toContain('aria-labelledby="store-tab-insights"');
    expect(dashboard).toContain("React.lazy(() => import('./SellerStoreInsightsPanel'))");
    expect(dashboard).toContain('<React.Suspense');
    expect(dashboard).toContain("useState<StoreDashboardTab>('overview')");
  });

  it('supports the three contracted periods and explicit refresh', () => {
    expect(panel).toContain("{ value: 7, label: '7 dias' }");
    expect(panel).toContain("{ value: 30, label: '30 dias' }");
    expect(panel).toContain("{ value: 90, label: '90 dias' }");
    expect(panel).toContain('onClick={() => void refresh()}');
    expect(panel).toContain('aria-pressed={period === option.value}');
  });

  it('presents the agreed commercial metrics and previous-period comparisons', () => {
    for (const label of [
      'Visitas à loja',
      'Produtos abertos',
      'Ações de contato',
      'Conversão',
      'Origem das visitas',
      'Anúncios com maior interesse',
      'Ações comerciais',
      'Acessos por QR Code',
    ]) {
      expect(panel).toContain(label);
    }
    expect(panel).toContain('ComparisonBadge');
    expect(panel).toContain('changePercentagePoints');
    expect(panel).not.toContain("label: 'WhatsApp'");
    expect(panel).toContain('Sessões que enviaram contato pela plataforma');
  });

  it('renders responsive charts, privacy guidance and empty states', () => {
    expect(panel).toContain('<ResponsiveContainer');
    expect(panel).toContain('<AreaChart');
    expect(panel).toContain('<BarChart');
    expect(panel).toContain('não exibem dados pessoais dos visitantes');
    expect(panel).toContain('Ainda não há interações suficientes');
    expect(panel).toContain('As origens aparecerão após as próximas visitas');
  });

  it('does not request insights for an unavailable or paused store', () => {
    expect(panel).toContain('insightsEnabled');
    expect(panel).toContain('useSellerStoreInsights(period, 5, insightsEnabled)');
    expect(hook).toContain('if (!enabled)');
  });
});
