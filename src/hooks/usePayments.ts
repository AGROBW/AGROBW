import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { PaymentRecord } from '../../types';

const mapPaymentRecord = (row: any): PaymentRecord => ({
  id: row.id,
  userId: row.user_id,
  subscriptionId: row.subscription_id ?? null,
  planId: row.plan_id ?? null,
  provider: row.provider ?? 'mercadopago',
  providerPaymentId: String(row.provider_payment_id ?? ''),
  providerPreferenceId: row.provider_preference_id ?? null,
  externalReference: row.external_reference ?? null,
  billingCycle: row.billing_cycle ?? null,
  description: row.description ?? null,
  amount: Number(row.amount ?? 0),
  currency: row.currency ?? 'BRL',
  status: row.status ?? 'pending',
  statusDetail: row.status_detail ?? null,
  paymentMethod: row.payment_method ?? null,
  receiptUrl: row.receipt_url ?? null,
  invoiceNumber: row.invoice_number ?? null,
  invoicePdfUrl: row.invoice_pdf_url ?? null,
  invoiceStoragePath: row.invoice_storage_path ?? null,
  invoiceStatus: row.invoice_status ?? 'not_applicable',
  invoiceIssuedAt: row.invoice_issued_at ?? null,
  invoiceNotes: row.invoice_notes ?? null,
  paidAt: row.paid_at ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  metadata: row.metadata ?? {},
  planName: row.plan_name ?? row.plans?.name ?? null,
});

export const usePayments = () => {
  const { user } = useAuth();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPayments = async () => {
      if (!user?.id) {
        setPayments([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('payments')
        .select('*, plans(name)')
        .eq('user_id', user.id)
        .order('paid_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (error) {
        setError(error.message);
        setPayments([]);
      } else {
        const mappedPayments = (data || []).map(mapPaymentRecord);

        const withSignedUrls = await Promise.all(
          mappedPayments.map(async (payment) => {
            if (!payment.invoiceStoragePath || payment.invoicePdfUrl) {
              return payment;
            }

            const { data: signedUrlData, error: signedUrlError } = await supabase.storage
              .from('fiscal_documents')
              .createSignedUrl(payment.invoiceStoragePath, 60 * 60);

            if (signedUrlError) {
              console.error('Erro ao gerar URL assinada da nota fiscal:', signedUrlError);
              return payment;
            }

            return {
              ...payment,
              invoicePdfUrl: signedUrlData?.signedUrl || null,
            };
          })
        );

        setPayments(withSignedUrls);
      }

      setIsLoading(false);
    };

    fetchPayments();
  }, [user?.id]);

  const lastApprovedPayment = useMemo(
    () => payments.find((payment) => payment.status === 'approved') || null,
    [payments]
  );

  const availableInvoicesCount = useMemo(
    () => payments.filter((payment) => payment.invoiceStatus === 'available').length,
    [payments]
  );

  const pendingFiscalDocumentsCount = useMemo(
    () => payments.filter((payment) => payment.invoiceStatus === 'pending').length,
    [payments]
  );

  return {
    payments,
    lastApprovedPayment,
    availableInvoicesCount,
    pendingFiscalDocumentsCount,
    isLoading,
    error,
  };
};
