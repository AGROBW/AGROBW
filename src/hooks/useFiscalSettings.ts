import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { FiscalSettings } from '../../types';

const mapFiscalSettings = (row: any): FiscalSettings => ({
  id: row.id,
  provider: row.provider,
  environment: row.environment,
  autoIssueEnabled: row.auto_issue_enabled,
  legalName: row.legal_name ?? '',
  tradeName: row.trade_name ?? null,
  cnpj: row.cnpj ?? '',
  municipalRegistration: row.municipal_registration ?? null,
  taxRegime: row.tax_regime ?? null,
  serviceCode: row.service_code ?? null,
  serviceDescription: row.service_description ?? null,
  serviceCityCode: row.service_city_code ?? null,
  cnaeCode: row.cnae_code ?? null,
  issuerEmail: row.issuer_email ?? null,
  providerApiBaseUrl: row.provider_api_base_url ?? 'https://homologacao.focusnfe.com.br',
  providerCompanyId: row.provider_company_id ?? null,
  providerInvoiceEndpointPath: row.provider_invoice_endpoint_path ?? '/v2/nfse?ref={reference}',
  providerWebhookSecret: row.provider_webhook_secret ?? null,
  invoiceSeries: row.invoice_series ?? null,
  nextRpsNumber: row.next_rps_number ?? null,
  focusReferencePrefix: row.focus_nfse_reference_prefix ?? 'BWAGRO',
  focusNaturezaOperacao: row.focus_natureza_operacao ?? '1',
  focusSpecialTaxRegime: row.focus_special_tax_regime ?? null,
  focusSimpleNational: row.focus_simple_national ?? false,
  focusServiceListItem: row.focus_service_list_item ?? null,
  focusMunicipalTaxCode: row.focus_municipal_tax_code ?? null,
  focusIssWithheld: row.focus_iss_withheld ?? false,
  focusIssTaxationType: row.focus_iss_taxation_type ?? null,
  focusIssRate: row.focus_iss_rate ?? null,
  additionalInformation: row.additional_information ?? null,
  lastUpdatedBy: row.last_updated_by ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const useFiscalSettings = () => {
  const [settings, setSettings] = useState<FiscalSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = async () => {
    setIsLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from('fiscal_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) {
      setError(error.message);
      setSettings(null);
    } else {
      setSettings(data ? mapFiscalSettings(data) : null);
    }

    setIsLoading(false);
  };

  const saveSettings = async (payload: Partial<FiscalSettings>) => {
    const currentId = settings?.id;

    const dbPayload = {
      provider: payload.provider ?? settings?.provider ?? 'FOCUSNFE',
      environment: payload.environment ?? settings?.environment ?? 'sandbox',
      auto_issue_enabled: payload.autoIssueEnabled ?? settings?.autoIssueEnabled ?? false,
      legal_name: payload.legalName ?? settings?.legalName ?? '',
      trade_name: payload.tradeName ?? settings?.tradeName ?? null,
      cnpj: payload.cnpj ?? settings?.cnpj ?? '',
      municipal_registration: payload.municipalRegistration ?? settings?.municipalRegistration ?? null,
      tax_regime: payload.taxRegime ?? settings?.taxRegime ?? null,
      service_code: payload.serviceCode ?? settings?.serviceCode ?? null,
      service_description: payload.serviceDescription ?? settings?.serviceDescription ?? null,
      service_city_code: payload.serviceCityCode ?? settings?.serviceCityCode ?? null,
      cnae_code: payload.cnaeCode ?? settings?.cnaeCode ?? null,
      issuer_email: payload.issuerEmail ?? settings?.issuerEmail ?? null,
      provider_api_base_url:
        payload.providerApiBaseUrl ??
        settings?.providerApiBaseUrl ??
        'https://homologacao.focusnfe.com.br',
      provider_company_id: payload.providerCompanyId ?? settings?.providerCompanyId ?? null,
      provider_invoice_endpoint_path:
        payload.providerInvoiceEndpointPath ??
        settings?.providerInvoiceEndpointPath ??
        '/v2/nfse?ref={reference}',
      provider_webhook_secret: payload.providerWebhookSecret ?? settings?.providerWebhookSecret ?? null,
      invoice_series: payload.invoiceSeries ?? settings?.invoiceSeries ?? null,
      next_rps_number: payload.nextRpsNumber ?? settings?.nextRpsNumber ?? null,
      focus_nfse_reference_prefix:
        payload.focusReferencePrefix ?? settings?.focusReferencePrefix ?? 'BWAGRO',
      focus_natureza_operacao:
        payload.focusNaturezaOperacao ?? settings?.focusNaturezaOperacao ?? '1',
      focus_special_tax_regime:
        payload.focusSpecialTaxRegime ?? settings?.focusSpecialTaxRegime ?? null,
      focus_simple_national:
        payload.focusSimpleNational ?? settings?.focusSimpleNational ?? false,
      focus_service_list_item:
        payload.focusServiceListItem ?? settings?.focusServiceListItem ?? null,
      focus_municipal_tax_code:
        payload.focusMunicipalTaxCode ?? settings?.focusMunicipalTaxCode ?? null,
      focus_iss_withheld:
        payload.focusIssWithheld ?? settings?.focusIssWithheld ?? false,
      focus_iss_taxation_type:
        payload.focusIssTaxationType ?? settings?.focusIssTaxationType ?? null,
      focus_iss_rate: payload.focusIssRate ?? settings?.focusIssRate ?? null,
      additional_information: payload.additionalInformation ?? settings?.additionalInformation ?? null,
      updated_at: new Date().toISOString(),
    };

    const query = currentId
      ? supabase.from('fiscal_settings').update(dbPayload).eq('id', currentId)
      : supabase.from('fiscal_settings').insert(dbPayload);

    const { error } = await query;

    if (error) {
      return { error: error.message };
    }

    await fetchSettings();
    return { error: null };
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  return {
    settings,
    isLoading,
    error,
    fetchSettings,
    saveSettings,
  };
};
