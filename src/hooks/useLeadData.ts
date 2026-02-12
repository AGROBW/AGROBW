import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

interface LeadData {
  id: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string | null;
  buyerCep: string | null;
  initialMessage: string;
  status: string;
  createdAt: string;
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
          buyerName: data.buyer_name,
          buyerEmail: data.buyer_email,
          buyerPhone: data.buyer_phone,
          buyerCep: data.buyer_cep,
          initialMessage: data.initial_message,
          status: data.status,
          createdAt: data.created_at
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
