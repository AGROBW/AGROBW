import React, { useEffect, useState } from 'react';
import { AlertCircle, Building2, FileCheck2, Loader2, Save, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useFiscalSettings } from '../../src/hooks/useFiscalSettings';
import { useAdminAudit, ADMIN_ACTIONS, RESOURCE_TYPES } from '../../src/hooks/useAdminAudit';

const FiscalSettingsManagement: React.FC = () => {
  const { settings, isLoading, saveSettings } = useFiscalSettings();
  const { logAction } = useAdminAudit();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    provider: 'FOCUSNFE' as 'FOCUSNFE',
    environment: 'sandbox' as 'sandbox' | 'production',
    autoIssueEnabled: false,
    legalName: '',
    tradeName: '',
    cnpj: '',
    municipalRegistration: '',
    taxRegime: '',
    serviceCode: '',
    serviceDescription: '',
    serviceCityCode: '',
    cnaeCode: '',
    issuerEmail: '',
    providerApiBaseUrl: 'https://homologacao.focusnfe.com.br',
    providerCompanyId: '',
    providerInvoiceEndpointPath: '/v2/nfse?ref={reference}',
    providerWebhookSecret: '',
    invoiceSeries: '',
    nextRpsNumber: '',
    focusReferencePrefix: 'BWAGRO',
    focusNaturezaOperacao: '1',
    focusSpecialTaxRegime: '',
    focusSimpleNational: false,
    focusServiceListItem: '',
    focusMunicipalTaxCode: '',
    focusIssWithheld: false,
    focusIssTaxationType: '',
    focusIssRate: '',
    additionalInformation: '',
  });

  useEffect(() => {
    if (!settings) return;

    setFormData({
      provider: settings.provider,
      environment: settings.environment,
      autoIssueEnabled: settings.autoIssueEnabled,
      legalName: settings.legalName || '',
      tradeName: settings.tradeName || '',
      cnpj: settings.cnpj || '',
      municipalRegistration: settings.municipalRegistration || '',
      taxRegime: settings.taxRegime || '',
      serviceCode: settings.serviceCode || '',
      serviceDescription: settings.serviceDescription || '',
      serviceCityCode: settings.serviceCityCode || '',
      cnaeCode: settings.cnaeCode || '',
      issuerEmail: settings.issuerEmail || '',
      providerApiBaseUrl: settings.providerApiBaseUrl || 'https://homologacao.focusnfe.com.br',
      providerCompanyId: settings.providerCompanyId || '',
      providerInvoiceEndpointPath: settings.providerInvoiceEndpointPath || '/v2/nfse?ref={reference}',
      providerWebhookSecret: settings.providerWebhookSecret || '',
      invoiceSeries: settings.invoiceSeries || '',
      nextRpsNumber: settings.nextRpsNumber ? String(settings.nextRpsNumber) : '',
      focusReferencePrefix: settings.focusReferencePrefix || 'BWAGRO',
      focusNaturezaOperacao: settings.focusNaturezaOperacao || '1',
      focusSpecialTaxRegime: settings.focusSpecialTaxRegime || '',
      focusSimpleNational: settings.focusSimpleNational,
      focusServiceListItem: settings.focusServiceListItem || '',
      focusMunicipalTaxCode: settings.focusMunicipalTaxCode || '',
      focusIssWithheld: settings.focusIssWithheld,
      focusIssTaxationType: settings.focusIssTaxationType || '',
      focusIssRate: settings.focusIssRate != null ? String(settings.focusIssRate) : '',
      additionalInformation: settings.additionalInformation || '',
    });
  }, [settings]);

  const handleChange = (field: keyof typeof formData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.legalName.trim() || !formData.cnpj.trim()) {
      toast.error('Preencha a razao social e o CNPJ fiscal.');
      return;
    }

    if (!formData.serviceCode.trim()) {
      toast.error('Informe o codigo do servico usado na NFS-e.');
      return;
    }

    setSaving(true);

    const payload = {
      ...formData,
      nextRpsNumber: formData.nextRpsNumber ? Number(formData.nextRpsNumber) : null,
      tradeName: formData.tradeName || null,
      municipalRegistration: formData.municipalRegistration || null,
      taxRegime: formData.taxRegime || null,
      serviceCode: formData.serviceCode || null,
      serviceDescription: formData.serviceDescription || null,
      serviceCityCode: formData.serviceCityCode || null,
      cnaeCode: formData.cnaeCode || null,
      issuerEmail: formData.issuerEmail || null,
      providerCompanyId: formData.providerCompanyId || null,
      providerWebhookSecret: formData.providerWebhookSecret || null,
      invoiceSeries: formData.invoiceSeries || null,
      focusSpecialTaxRegime: formData.focusSpecialTaxRegime || null,
      focusServiceListItem: formData.focusServiceListItem || null,
      focusMunicipalTaxCode: formData.focusMunicipalTaxCode || null,
      focusIssTaxationType: formData.focusIssTaxationType || null,
      focusIssRate: formData.focusIssRate ? Number(formData.focusIssRate) : null,
      additionalInformation: formData.additionalInformation || null,
    };

    const previousValue = settings;
    const { error } = await saveSettings(payload);

    if (error) {
      toast.error(error);
      setSaving(false);
      return;
    }

    await logAction({
      action: ADMIN_ACTIONS.UPDATE_PAGE_CONTENT,
      resourceType: RESOURCE_TYPES.SYSTEM,
      resourceId: settings?.id || null,
      oldValue: previousValue as any,
      newValue: payload as any,
      reason: 'Configuracao fiscal Focus NFe atualizada no painel administrativo',
    });

    toast.success('Configuracao fiscal salva com sucesso.');
    setSaving(false);
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-lg shadow-emerald-500/30">
          <FileCheck2 className="h-5 w-5" strokeWidth={2.2} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-900">Automacao de NFS-e Focus NFe</h2>
          <p className="text-sm text-slate-500">
            Configure a emissora, os parametros fiscais e o conector da Focus para emitir NFS-e automaticamente.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold">Antes de ativar a automacao</p>
            <p>
              Confirme com o contador o codigo de servico, item da lista, natureza da operacao, tributacao de ISS
              e o municipio emissor correto para o seu modelo de assinatura.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr,0.85fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900">
              <Building2 className="h-5 w-5 text-green-600" />
              Empresa Emissora
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <input value={formData.legalName} onChange={(e) => handleChange('legalName', e.target.value)} placeholder="Razao social" className="rounded-xl border border-slate-200 px-4 py-3" />
              <input value={formData.tradeName} onChange={(e) => handleChange('tradeName', e.target.value)} placeholder="Nome fantasia" className="rounded-xl border border-slate-200 px-4 py-3" />
              <input value={formData.cnpj} onChange={(e) => handleChange('cnpj', e.target.value)} placeholder="CNPJ" className="rounded-xl border border-slate-200 px-4 py-3" />
              <input value={formData.municipalRegistration} onChange={(e) => handleChange('municipalRegistration', e.target.value)} placeholder="Inscricao municipal" className="rounded-xl border border-slate-200 px-4 py-3" />
              <input value={formData.taxRegime} onChange={(e) => handleChange('taxRegime', e.target.value)} placeholder="Regime tributario" className="rounded-xl border border-slate-200 px-4 py-3" />
              <input value={formData.issuerEmail} onChange={(e) => handleChange('issuerEmail', e.target.value)} placeholder="E-mail emissor" className="rounded-xl border border-slate-200 px-4 py-3" />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900">
              <ShieldCheck className="h-5 w-5 text-green-600" />
              Parametros Fiscais Focus
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <input value={formData.serviceCode} onChange={(e) => handleChange('serviceCode', e.target.value)} placeholder="Codigo do servico" className="rounded-xl border border-slate-200 px-4 py-3" />
              <input value={formData.focusServiceListItem} onChange={(e) => handleChange('focusServiceListItem', e.target.value)} placeholder="Item da lista de servico" className="rounded-xl border border-slate-200 px-4 py-3" />
              <input value={formData.serviceCityCode} onChange={(e) => handleChange('serviceCityCode', e.target.value)} placeholder="Codigo do municipio do servico" className="rounded-xl border border-slate-200 px-4 py-3" />
              <input value={formData.focusMunicipalTaxCode} onChange={(e) => handleChange('focusMunicipalTaxCode', e.target.value)} placeholder="Codigo tributario municipal" className="rounded-xl border border-slate-200 px-4 py-3" />
              <input value={formData.cnaeCode} onChange={(e) => handleChange('cnaeCode', e.target.value)} placeholder="CNAE" className="rounded-xl border border-slate-200 px-4 py-3" />
              <input value={formData.focusNaturezaOperacao} onChange={(e) => handleChange('focusNaturezaOperacao', e.target.value)} placeholder="Natureza da operacao" className="rounded-xl border border-slate-200 px-4 py-3" />
              <input value={formData.focusSpecialTaxRegime} onChange={(e) => handleChange('focusSpecialTaxRegime', e.target.value)} placeholder="Regime especial tributario" className="rounded-xl border border-slate-200 px-4 py-3" />
              <input value={formData.focusIssTaxationType} onChange={(e) => handleChange('focusIssTaxationType', e.target.value)} placeholder="Tributacao de ISS" className="rounded-xl border border-slate-200 px-4 py-3" />
              <input value={formData.focusIssRate} onChange={(e) => handleChange('focusIssRate', e.target.value)} placeholder="Aliquota ISS (%)" className="rounded-xl border border-slate-200 px-4 py-3" />
              <input value={formData.focusReferencePrefix} onChange={(e) => handleChange('focusReferencePrefix', e.target.value)} placeholder="Prefixo da referencia" className="rounded-xl border border-slate-200 px-4 py-3" />
              <input value={formData.invoiceSeries} onChange={(e) => handleChange('invoiceSeries', e.target.value)} placeholder="Serie / lote fiscal" className="rounded-xl border border-slate-200 px-4 py-3" />
              <input value={formData.nextRpsNumber} onChange={(e) => handleChange('nextRpsNumber', e.target.value)} placeholder="Proximo RPS" className="rounded-xl border border-slate-200 px-4 py-3" />
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <input type="checkbox" checked={formData.focusSimpleNational} onChange={(e) => handleChange('focusSimpleNational', e.target.checked)} />
                <span className="text-sm font-medium text-slate-700">Optante pelo Simples Nacional</span>
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <input type="checkbox" checked={formData.focusIssWithheld} onChange={(e) => handleChange('focusIssWithheld', e.target.checked)} />
                <span className="text-sm font-medium text-slate-700">ISS retido na fonte</span>
              </label>
              <textarea value={formData.serviceDescription} onChange={(e) => handleChange('serviceDescription', e.target.value)} placeholder="Descricao padrao do servico fiscal" rows={3} className="rounded-xl border border-slate-200 px-4 py-3 md:col-span-2" />
              <textarea value={formData.additionalInformation} onChange={(e) => handleChange('additionalInformation', e.target.value)} placeholder="Informacoes complementares para a nota" rows={3} className="rounded-xl border border-slate-200 px-4 py-3 md:col-span-2" />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="mb-4 text-lg font-bold text-slate-900">Conector Focus NFe</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <select value={formData.provider} onChange={(e) => handleChange('provider', e.target.value)} className="rounded-xl border border-slate-200 px-4 py-3">
                <option value="FOCUSNFE">Focus NFe</option>
              </select>
              <select value={formData.environment} onChange={(e) => handleChange('environment', e.target.value)} className="rounded-xl border border-slate-200 px-4 py-3">
                <option value="sandbox">Sandbox / homologacao</option>
                <option value="production">Producao</option>
              </select>
              <input value={formData.providerApiBaseUrl} onChange={(e) => handleChange('providerApiBaseUrl', e.target.value)} placeholder="https://homologacao.focusnfe.com.br" className="rounded-xl border border-slate-200 px-4 py-3 md:col-span-2" />
              <input value={formData.providerInvoiceEndpointPath} onChange={(e) => handleChange('providerInvoiceEndpointPath', e.target.value)} placeholder="/v2/nfse?ref={reference}" className="rounded-xl border border-slate-200 px-4 py-3 md:col-span-2" />
              <input value={formData.providerWebhookSecret} onChange={(e) => handleChange('providerWebhookSecret', e.target.value)} placeholder="Token do webhook fiscal" className="rounded-xl border border-slate-200 px-4 py-3 md:col-span-2" />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="mb-4 text-lg font-bold text-slate-900">Automacao</h3>
            <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <input type="checkbox" checked={formData.autoIssueEnabled} onChange={(e) => handleChange('autoIssueEnabled', e.target.checked)} />
              <div>
                <p className="font-semibold text-slate-900">Emitir NFS-e automaticamente</p>
                <p className="text-sm text-slate-500">
                  Ao aprovar o pagamento, o sistema envia a requisicao para a Focus e acompanha a autorizacao.
                </p>
              </div>
            </label>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Salvando configuracao...' : 'Salvar configuracao fiscal'}
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="mb-3 text-lg font-bold text-slate-900">Checklist Focus NFe</h3>
            <ul className="space-y-2 text-sm text-slate-600">
              <li>1. Preencher empresa emissora, codigo do servico e item da lista</li>
              <li>2. Configurar `FISCAL_PROVIDER_API_KEY` com o token da Focus nas secrets</li>
              <li>3. Configurar `INTERNAL_AUTOMATION_SECRET` nas secrets das functions</li>
              <li>4. Publicar `issue-nfse` e `webhook-fiscal`</li>
              <li>5. Criar um gatilho na Focus apontando para o webhook fiscal com o mesmo token</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FiscalSettingsManagement;
