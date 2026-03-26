import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

interface LeadData {
  id: string;
  buyerName: string;
  buyerEmail: string | null;
  buyerPhone: string | null;
  buyerCep: string | null;
  initialMessage: string | null;
  status: string;
  createdAt: string;
  contactExpiresAt: string | null;
  isLocked: boolean;
}

export const useLeadData = (chatId: string | null) => {
  const [lead, setLead] = useState<LeadData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!chatId) {
      setLead(null);
      setIsLoading(false);
      return;
    }

    const fetchLead = async () => {
      setIsLoading(true);
      
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('chat_id', chatId)
        .maybeSingle();

      if (error) {
        setError(error.message);
        console.error('Erro ao buscar lead:', error);
        setLead(null);
      } else if (data) {
        setLead({
          id: data.id,
          buyerName: data.contact_expires_at && new Date(data.contact_expires_at).getTime() <= Date.now() ? 'Lead bloqueado' : data.buyer_name,
          buyerEmail: data.contact_expires_at && new Date(data.contact_expires_at).getTime() <= Date.now() ? null : data.buyer_email,
          buyerPhone: data.contact_expires_at && new Date(data.contact_expires_at).getTime() <= Date.now() ? null : data.buyer_phone,
          buyerCep: data.contact_expires_at && new Date(data.contact_expires_at).getTime() <= Date.now() ? null : data.buyer_cep,
          initialMessage: data.contact_expires_at && new Date(data.contact_expires_at).getTime() <= Date.now() ? null : data.initial_message,
          status: data.status,
          createdAt: data.created_at,
          contactExpiresAt: data.contact_expires_at ?? null,
          isLocked: !!data.contact_expires_at && new Date(data.contact_expires_at).getTime() <= Date.now()
        });
      } else {
        setLead(null);
      }
      
      setIsLoading(false);
    };

    fetchLead();
  }, [chatId]);

  return { lead, isLoading, error };
};
