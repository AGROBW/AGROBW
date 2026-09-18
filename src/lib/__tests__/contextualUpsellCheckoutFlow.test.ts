import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const checkoutService = readFileSync(resolve('services/paymentCheckoutService.ts'), 'utf8');
const dashboard = readFileSync(resolve('pages/UserDashboardView.tsx'), 'utf8');
const upgradeModal = readFileSync(resolve('components/finance/RecommendedUpgradeModal.tsx'), 'utf8');
const webhook = readFileSync(resolve('supabase/functions/webhook-asaas/index.ts'), 'utf8');
const migration = readFileSync(resolve('sql/create_contextual_upsell_2026-09-16.sql'), 'utf8');
const supabaseConfig = readFileSync(resolve('supabase/config.toml'), 'utf8');

describe('contextual upsell checkout attribution flow', () => {
  it('registra a intencao somente depois de o checkout retornar uma URL valida', () => {
    const validUrlGuard = checkoutService.indexOf('if (!data?.url)');
    const lifecycleCallback = checkoutService.indexOf('options?.onCheckoutCreated');
    const redirect = checkoutService.indexOf('window.location.assign(data.url)');
    expect(validUrlGuard).toBeGreaterThan(-1);
    expect(lifecycleCallback).toBeGreaterThan(validUrlGuard);
    expect(redirect).toBeGreaterThan(lifecycleCallback);
  });

  it('transporta o contexto ate o checkout real do Financeiro', () => {
    expect(dashboard).toContain('readContextualUpsellCheckoutIntent()');
    expect(dashboard).toContain('recordContextualUpsellCheckoutStarted(matchingIntent)');
    expect(dashboard).toContain('contextualUpsellIntent?.targetPlanId === plan.id');
    expect(dashboard).toContain('const freshContextualIntent = readContextualUpsellCheckoutIntent()');
    expect(dashboard).toContain('freshContextualIntent?.targetPlanId === plan.id');
  });

  it('explica a revisao no Financeiro e destaca somente o plano recomendado', () => {
    expect(upgradeModal).toContain("? 'Revisar upgrade no Financeiro'");
    expect(upgradeModal).toContain('com o plano ${nextPlan.name} destacado');
    expect(dashboard).toContain("return 'Continuar para pagamento'");
    expect(dashboard).toContain('Recomendado para você');
    expect(dashboard).toContain('const isContextualRecommendation = Boolean(');
    expect(dashboard).toContain('!(hasActiveManagedPlan && isCurrentPlanRecurring)');
  });

  it('preserva a escolha de fechar o painel durante rerenders do dashboard', () => {
    const panelState = dashboard.indexOf('const [isPlanChangePanelOpen, setIsPlanChangePanelOpen]');
    const financeDashboard = dashboard.indexOf('const FinanceDashboard = () =>');
    expect(panelState).toBeGreaterThan(-1);
    expect(financeDashboard).toBeGreaterThan(panelState);
  });

  it('atribui no webhook depois das gravacoes e sem transformar telemetria em erro de pagamento', () => {
    const attribution = webhook.indexOf("'attribute_contextual_upsell_conversion'");
    const successfulLog = webhook.indexOf('await updateWebhookLog(200, true, null)', attribution);
    expect(attribution).toBeGreaterThan(-1);
    expect(successfulLog).toBeGreaterThan(attribution);
    expect(webhook.slice(attribution, successfulLog)).toContain('if (attributionError)');
    expect(webhook.slice(attribution, successfulLog)).toContain('catch (attributionError)');
    expect(webhook.slice(attribution, successfulLog)).toContain('p_conversion_key: conversionKey');
    expect(webhook.slice(attribution, successfulLog)).not.toContain('throw attributionError');
  });

  it('recusa planos que nao estejam na vitrine publica', () => {
    expect(migration).toContain('plans.show_in_public_pricing is true');
  });

  it('preserva a sessao do checkout e publica a retencao sem JWT', () => {
    const paymentPayload = webhook.slice(webhook.indexOf('const paymentPayload = {'));
    expect(paymentPayload).toContain('providerCheckoutSessionId || existingPayment?.provider_checkout_session_id || null');
    expect(supabaseConfig).toContain('[functions.purge-contextual-upsell-data]');
    expect(supabaseConfig).toMatch(/\[functions\.purge-contextual-upsell-data\][\s\S]*?verify_jwt = false/);
  });
});
