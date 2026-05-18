import React, { useMemo } from 'react';
import { BarChart3, FileText, Receipt, RotateCcw } from 'lucide-react';
import { AdminPaymentRecord } from './types';
import { civilDateToLocalDate } from '../../../src/utils/brazilCivilDate';

interface PaymentsOverviewTabProps {
  payments: AdminPaymentRecord[];
  formatCurrency: (amount: number, currency?: string) => string;
}

const PaymentsOverviewTab: React.FC<PaymentsOverviewTabProps> = ({ payments, formatCurrency }) => {
  const monthlyRows = useMemo(() => {
    const grouped = new Map<string, { monthLabel: string; issued: number; pending: number; failed: number; refunded: number; totalAmount: number }>();

    payments.forEach((payment) => {
      const issuedDate = civilDateToLocalDate(payment.invoice_issued_on);
      const fallbackDate = payment.invoice_issued_at || payment.paid_at || payment.created_at;
      const date = issuedDate || new Date(fallbackDate);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });

      const current = grouped.get(monthKey) || {
        monthLabel,
        issued: 0,
        pending: 0,
        failed: 0,
        refunded: 0,
        totalAmount: 0,
      };

      if (payment.invoice_status === 'available') current.issued += 1;
      if (payment.invoice_status === 'pending') current.pending += 1;
      if (payment.invoice_status === 'failed') current.failed += 1;
      if (payment.status === 'refunded' || payment.status === 'cancelled') current.refunded += 1;
      if (payment.invoice_status === 'available') current.totalAmount += payment.amount || 0;

      grouped.set(monthKey, current);
    });

    return Array.from(grouped.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 6)
      .map(([, value]) => value);
  }, [payments]);

  const totalIssued = payments.filter((payment) => payment.invoice_status === 'available').length;
  const totalPending = payments.filter((payment) => payment.invoice_status === 'pending').length;
  const totalFailed = payments.filter((payment) => payment.invoice_status === 'failed').length;
  const totalRefunded = payments.filter((payment) => payment.status === 'refunded' || payment.status === 'cancelled').length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Receipt className="w-5 h-5" strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Notas emitidas</p>
              <p className="text-2xl font-black text-slate-900">{totalIssued}</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <FileText className="w-5 h-5" strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Pendentes</p>
              <p className="text-2xl font-black text-slate-900">{totalPending}</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
              <BarChart3 className="w-5 h-5" strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Falhas fiscais</p>
              <p className="text-2xl font-black text-slate-900">{totalFailed}</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <RotateCcw className="w-5 h-5" strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Estornos/cancelamentos</p>
              <p className="text-2xl font-black text-slate-900">{totalRefunded}</p>
            </div>
          </div>
        </div>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Visão fiscal</p>
          <h2 className="text-lg font-semibold text-slate-900">Quantidade de notas fiscais emitidas por mês</h2>
        </div>

        {monthlyRows.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            Ainda não há dados fiscais suficientes para o resumo mensal.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-slate-500">
                  <th className="px-6 py-3 font-semibold">Mês</th>
                  <th className="px-6 py-3 font-semibold">Emitidas</th>
                  <th className="px-6 py-3 font-semibold">Pendentes</th>
                  <th className="px-6 py-3 font-semibold">Falhas</th>
                  <th className="px-6 py-3 font-semibold">Estornos</th>
                  <th className="px-6 py-3 font-semibold">Volume emitido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {monthlyRows.map((row) => (
                  <tr key={row.monthLabel}>
                    <td className="px-6 py-4 font-semibold text-slate-900">{row.monthLabel}</td>
                    <td className="px-6 py-4 text-emerald-700 font-semibold">{row.issued}</td>
                    <td className="px-6 py-4 text-amber-700 font-semibold">{row.pending}</td>
                    <td className="px-6 py-4 text-rose-700 font-semibold">{row.failed}</td>
                    <td className="px-6 py-4 text-slate-700 font-semibold">{row.refunded}</td>
                    <td className="px-6 py-4 text-slate-900">{formatCurrency(row.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default PaymentsOverviewTab;
