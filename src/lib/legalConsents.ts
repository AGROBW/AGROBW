import { supabase } from './supabaseClient';

interface ContactLegalConsentInput {
  announcementId: string;
  sellerId: string;
  buyerId: string;
}

export const recordContactLegalConsents = async (input: ContactLegalConsentInput) => {
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';

  const { error } = await supabase.rpc('record_my_contact_legal_consents', {
    p_user_agent: userAgent || null,
    p_metadata: {
      announcement_id: input.announcementId,
      seller_id: input.sellerId,
      buyer_id: input.buyerId,
      captured_from: 'contact_modal',
    },
  });

  return { error };
};
