import React, { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { useSupportTickets } from '../../src/hooks/useSupportTickets';
import { SupportSettings, useSupportSettings } from '../../src/hooks/useSupportSettings';
import SupportTicketsTable from '../../components/admin/support/SupportTicketsTable';
import SupportTicketConversationPanel from '../../components/admin/support/SupportTicketConversationPanel';

const TextInput = ({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) => (
  <label className="block">
    <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-slate-400">{label}</span>
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50"
    />
  </label>
);

const SupportTicketsManagement: React.FC = () => {
  const {
    tickets,
    messages,
    selectedTicketId,
    setSelectedTicketId,
    isLoading,
    isMessagesLoading,
    addMessage,
    updateTicketStatus,
  } = useSupportTickets('admin');
  const {
    settings,
    isLoading: isSettingsLoading,
    isSaving: isSavingSettings,
    saveSettings,
  } = useSupportSettings();
  const [settingsForm, setSettingsForm] = useState<SupportSettings>(settings);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);

  const selectedTicket = tickets.find((ticket) => ticket.id === selectedTicketId) ?? null;

  useEffect(() => {
    setSettingsForm(settings);
  }, [settings]);

  const updateSettingsForm = <K extends keyof SupportSettings>(key: K, value: SupportSettings[K]) => {
    setSettingsForm((current) => ({ ...current, [key]: value }));
  };

  const handleSaveSettings = async () => {
    const result = await saveSettings(settingsForm);

    if (!result.success) {
      toast.error(result.message || 'N\u00e3o foi poss\u00edvel salvar as configura\u00e7\u00f5es de atendimento.');
      return;
    }

    toast.success('Configura\u00e7\u00f5es de atendimento salvas com sucesso.');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h1 className="text-2xl font-black text-slate-900">Suporte</h1>
        <p className="text-sm text-slate-500 mt-2">
          Acompanhe a fila de tickets e responda os atendimentos da Central de Ajuda.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <button
              type="button"
              onClick={() => setIsSettingsPanelOpen((current) => !current)}
              className="inline-flex items-center gap-2 text-left"
              aria-expanded={isSettingsPanelOpen}
            >
              <ChevronDown
                className={`h-4 w-4 text-emerald-700 transition-transform ${isSettingsPanelOpen ? 'rotate-180' : ''}`}
              />
              <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">{'Configura\u00e7\u00f5es de atendimento'}</p>
            </button>
            <h2 className="mt-2 text-xl font-black text-slate-900">Card da Central de Ajuda</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              {'Controle os textos exibidos no card de atendimento do painel do usu\u00e1rio e altere o status do suporte em tempo real.'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className={`h-2.5 w-2.5 rounded-full ${settingsForm.isOnline ? 'bg-emerald-500' : 'bg-slate-400'}`} />
            <select
              value={settingsForm.isOnline ? 'online' : 'offline'}
              onChange={(event) => updateSettingsForm('isOnline', event.target.value === 'online')}
              className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none"
            >
              <option value="online">Suporte online</option>
              <option value="offline">Suporte offline</option>
            </select>
          </div>
        </div>

        {isSettingsPanelOpen && (
          isSettingsLoading ? (
            <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-500">
              {'Carregando configura\u00e7\u00f5es de atendimento...'}
            </div>
          ) : (
            <>
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <TextInput
                label={'T\u00edtulo do card'}
                value={settingsForm.cardTitle}
                onChange={(value) => updateSettingsForm('cardTitle', value)}
                placeholder="Atendimento"
              />
              <TextInput
                label="Label da resposta"
                value={settingsForm.averageResponseLabel}
                onChange={(value) => updateSettingsForm('averageResponseLabel', value)}
                placeholder={'Resposta m\u00e9dia'}
              />
              <TextInput
                label="Valor da resposta"
                value={settingsForm.averageResponseValue}
                onChange={(value) => updateSettingsForm('averageResponseValue', value)}
                placeholder="< 24h"
              />
              <TextInput
                label={'Label do hor\u00e1rio'}
                value={settingsForm.scheduleLabel}
                onChange={(value) => updateSettingsForm('scheduleLabel', value)}
                placeholder={'Hor\u00e1rio'}
              />
              <TextInput
                label="Dias de atendimento"
                value={settingsForm.scheduleDays}
                onChange={(value) => updateSettingsForm('scheduleDays', value)}
                placeholder="Seg-Sex"
              />
              <TextInput
                label={'Label do per\u00edodo'}
                value={settingsForm.scheduleTimeLabel}
                onChange={(value) => updateSettingsForm('scheduleTimeLabel', value)}
                placeholder="Das"
              />
              <TextInput
                label={'Hor\u00e1rio de atendimento'}
                value={settingsForm.scheduleTime}
                onChange={(value) => updateSettingsForm('scheduleTime', value)}
                placeholder={'08h \u00e0s 18h'}
              />
              <TextInput
                label="Texto online"
                value={settingsForm.onlineStatusText}
                onChange={(value) => updateSettingsForm('onlineStatusText', value)}
                placeholder="Suporte online agora"
              />
              <TextInput
                label="Texto offline"
                value={settingsForm.offlineStatusText}
                onChange={(value) => updateSettingsForm('offlineStatusText', value)}
                placeholder="Suporte offline no momento"
              />
            </div>

            <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-slate-900">{'Pr\u00e9via do status'}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {settingsForm.isOnline ? settingsForm.onlineStatusText : settingsForm.offlineStatusText}
                </p>
              </div>
              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
                className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingSettings ? 'Salvando...' : 'Salvar configura\u00e7\u00f5es'}
              </button>
            </div>
            </>
          )
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-6">
        {isLoading ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 text-sm text-slate-500 xl:col-span-2">
            Carregando tickets...
          </div>
        ) : (
          <>
            <SupportTicketsTable
              tickets={tickets}
              selectedTicketId={selectedTicketId}
              onSelect={setSelectedTicketId}
            />
            <SupportTicketConversationPanel
              ticket={selectedTicket}
              messages={messages}
              isMessagesLoading={isMessagesLoading}
              onReply={async (ticketId, text) => {
                const result = await addMessage(ticketId, text);
                if (!result.success) {
                  toast.error(result.message || 'Nao foi possivel responder o ticket');
                } else {
                  toast.success('Resposta enviada');
                }
                return result;
              }}
              onUpdateStatus={async (ticketId, status) => {
                const result = await updateTicketStatus(ticketId, status);
                if (!result.success) {
                  toast.error(result.message || 'Nao foi possivel atualizar o ticket');
                } else {
                  toast.success('Status atualizado');
                }
                return result;
              }}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default SupportTicketsManagement;

