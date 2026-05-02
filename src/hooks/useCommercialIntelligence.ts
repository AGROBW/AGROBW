import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CommercialIntelligenceContactShare,
  CommercialIntelligenceConversation,
  CommercialIntelligenceConversationMessage,
  CommercialIntelligenceInterestResponse,
  CommercialIntelligenceOpportunityInboxItem,
  CommercialIntelligenceOutreachCampaign,
  CommercialIntelligenceReportRow,
  CommercialLeadPreference,
} from '../../types';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from './useSubscription';

type CategoryOption = {
  id: string;
  name: string;
  slug: string;
};

type SubcategoryOption = {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
};

const CONSENT_TEXT_VERSION = 'commercial-intelligence-v1';

const emptyPreference = (userId: string): CommercialLeadPreference => ({
  userId,
  allowCommercialContact: false,
  allowedCategorySlugs: [],
  preferredChannels: ['platform'],
  consentTextVersion: CONSENT_TEXT_VERSION,
  consentGrantedAt: null,
  consentRevokedAt: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
});

export const useCommercialIntelligence = () => {
  const { user } = useAuth();
  const { subscription } = useSubscription();
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [subcategories, setSubcategories] = useState<SubcategoryOption[]>([]);
  const [preference, setPreference] = useState<CommercialLeadPreference | null>(null);
  const [report, setReport] = useState<CommercialIntelligenceReportRow[]>([]);
  const [outreachCampaigns, setOutreachCampaigns] = useState<CommercialIntelligenceOutreachCampaign[]>([]);
  const [receivedOpportunities, setReceivedOpportunities] = useState<CommercialIntelligenceOpportunityInboxItem[]>([]);
  const [interestResponses, setInterestResponses] = useState<CommercialIntelligenceInterestResponse[]>([]);
  const [conversations, setConversations] = useState<CommercialIntelligenceConversation[]>([]);
  const [conversationMessages, setConversationMessages] = useState<Record<string, CommercialIntelligenceConversationMessage[]>>({});
  const [contactShares, setContactShares] = useState<CommercialIntelligenceContactShare[]>([]);
  const [requestCountThisMonth, setRequestCountThisMonth] = useState(0);
  const [outreachCountThisMonth, setOutreachCountThisMonth] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingPreference, setIsSavingPreference] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isSendingOutreach, setIsSendingOutreach] = useState(false);
  const [isRespondingToOpportunity, setIsRespondingToOpportunity] = useState(false);
  const [isStartingConversation, setIsStartingConversation] = useState(false);
  const [isSendingConversationMessage, setIsSendingConversationMessage] = useState(false);
  const [isGrantingContactShare, setIsGrantingContactShare] = useState(false);
  const [loadingConversationId, setLoadingConversationId] = useState<string | null>(null);

  const hasCommercialIntelligence = Boolean(subscription?.plans?.has_commercial_intelligence);
  const requestLimit = Number(subscription?.plans?.commercial_intelligence_requests_per_month || 0);
  const remainingRequests = Math.max(0, requestLimit - requestCountThisMonth);

  const loadBaseData = useCallback(async () => {
    if (!user?.id) {
      setCategories([]);
      setSubcategories([]);
      setPreference(null);
      setOutreachCampaigns([]);
      setReceivedOpportunities([]);
      setInterestResponses([]);
      setConversations([]);
      setConversationMessages({});
      setContactShares([]);
      setRequestCountThisMonth(0);
      setOutreachCountThisMonth(0);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [
      categoriesResponse,
      subcategoriesResponse,
      preferenceResponse,
      requestsResponse,
      outreachCountResponse,
      campaignsResponse,
      inboxResponse,
      responsesResponse,
      conversationsResponse,
      contactSharesResponse,
    ] = await Promise.all([
      supabase
        .from('categories')
        .select('id, name, slug')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('category_subcategories')
        .select('id, category_id, name, slug')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('commercial_lead_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('commercial_intelligence_requests')
        .select('id', { count: 'exact', head: true })
        .eq('seller_user_id', user.id)
        .gte('created_at', monthStart.toISOString()),
      supabase
        .from('commercial_intelligence_outreach_campaigns')
        .select('id', { count: 'exact', head: true })
        .eq('seller_user_id', user.id)
        .gte('created_at', monthStart.toISOString()),
      supabase
        .from('commercial_intelligence_outreach_campaigns')
        .select('id, category_slug, subcategory_slug, message_template, recipients_count, delivered_count, created_at, updated_at')
        .eq('seller_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase.rpc('list_received_commercial_intelligence_opportunities'),
      supabase.rpc('list_sent_commercial_intelligence_interest_responses'),
      supabase.rpc('list_my_commercial_intelligence_conversations'),
      supabase.rpc('list_my_commercial_intelligence_contact_shares'),
    ]);

    if (!categoriesResponse.error) {
      setCategories(
        ((categoriesResponse.data as Array<{ id: string; name: string; slug: string }> | null) || []).map((category) => ({
          id: category.id,
          name: category.name,
          slug: category.slug,
        }))
      );
    }

    if (!subcategoriesResponse.error) {
      setSubcategories(
        ((subcategoriesResponse.data as Array<{ id: string; category_id: string; name: string; slug: string }> | null) || []).map((subcategory) => ({
          id: subcategory.id,
          categoryId: subcategory.category_id,
          name: subcategory.name,
          slug: subcategory.slug,
        }))
      );
    }

    if (!preferenceResponse.error && preferenceResponse.data) {
      const row = preferenceResponse.data as Record<string, unknown>;
      setPreference({
        userId: String(row.user_id),
        allowCommercialContact: Boolean(row.allow_commercial_contact),
        allowedCategorySlugs: Array.isArray(row.allowed_category_slugs) ? row.allowed_category_slugs.map(String) : [],
        preferredChannels: Array.isArray(row.preferred_channels) ? row.preferred_channels.map(String) : ['platform'],
        consentTextVersion: String(row.consent_text_version || CONSENT_TEXT_VERSION),
        consentGrantedAt: row.consent_granted_at ? String(row.consent_granted_at) : null,
        consentRevokedAt: row.consent_revoked_at ? String(row.consent_revoked_at) : null,
        createdAt: String(row.created_at || new Date().toISOString()),
        updatedAt: String(row.updated_at || new Date().toISOString()),
      });
    } else {
      setPreference(emptyPreference(user.id));
    }

    if (!requestsResponse.error) {
      setRequestCountThisMonth(requestsResponse.count || 0);
    }

    if (!outreachCountResponse.error) {
      setOutreachCountThisMonth(outreachCountResponse.count || 0);
    }

    if (!campaignsResponse.error) {
      setOutreachCampaigns(
        ((campaignsResponse.data as Array<Record<string, unknown>> | null) || []).map((row) => ({
          id: String(row.id),
          categorySlug: String(row.category_slug || ''),
          subcategorySlug: row.subcategory_slug ? String(row.subcategory_slug) : null,
          messageTemplate: String(row.message_template || ''),
          recipientsCount: Number(row.recipients_count || 0),
          deliveredCount: Number(row.delivered_count || 0),
          createdAt: String(row.created_at || new Date().toISOString()),
          updatedAt: String(row.updated_at || new Date().toISOString()),
        }))
      );
    }

    if (!inboxResponse.error) {
      setReceivedOpportunities(
        ((inboxResponse.data as Array<Record<string, unknown>> | null) || []).map((row) => ({
          deliveryId: String(row.delivery_id),
          campaignId: String(row.campaign_id),
          categorySlug: String(row.category_slug || ''),
          subcategorySlug: row.subcategory_slug ? String(row.subcategory_slug) : null,
          sellerLabel: String(row.seller_label || 'Loja parceira da AGRO BW'),
          messageTemplate: String(row.message_template || ''),
          receivedAt: String(row.received_at || new Date().toISOString()),
          hasResponse: Boolean(row.has_response),
          respondedAt: row.responded_at ? String(row.responded_at) : null,
        }))
      );
    }

    if (!responsesResponse.error) {
      setInterestResponses(
        ((responsesResponse.data as Array<Record<string, unknown>> | null) || []).map((row) => ({
          responseId: String(row.response_id),
          campaignId: String(row.campaign_id),
          categorySlug: String(row.category_slug || ''),
          subcategorySlug: row.subcategory_slug ? String(row.subcategory_slug) : null,
          buyerName: String(row.buyer_name || 'Comprador interessado'),
          buyerCity: row.buyer_city ? String(row.buyer_city) : null,
          buyerState: row.buyer_state ? String(row.buyer_state) : null,
          buyerNote: row.buyer_note ? String(row.buyer_note) : null,
          respondedAt: String(row.responded_at || new Date().toISOString()),
        }))
      );
    }

    if (!conversationsResponse.error) {
      setConversations(
        ((conversationsResponse.data as Array<Record<string, unknown>> | null) || []).map((row) => ({
          conversationId: String(row.conversation_id),
          responseId: String(row.response_id),
          campaignId: String(row.campaign_id),
          categorySlug: String(row.category_slug || ''),
          subcategorySlug: row.subcategory_slug ? String(row.subcategory_slug) : null,
          role: String(row.role || 'buyer') as 'seller' | 'buyer',
          counterpartName: String(row.counterpart_name || 'Participante'),
          counterpartCity: row.counterpart_city ? String(row.counterpart_city) : null,
          counterpartState: row.counterpart_state ? String(row.counterpart_state) : null,
          status: String(row.status || 'open') as 'open' | 'closed',
          createdAt: String(row.created_at || new Date().toISOString()),
          updatedAt: String(row.updated_at || new Date().toISOString()),
          lastMessagePreview: row.last_message_preview ? String(row.last_message_preview) : null,
          lastMessageAt: row.last_message_at ? String(row.last_message_at) : null,
        }))
      );
    }

    if (!contactSharesResponse.error) {
      setContactShares(
        ((contactSharesResponse.data as Array<Record<string, unknown>> | null) || []).map((row) => ({
          shareId: String(row.share_id),
          conversationId: String(row.conversation_id),
          sellerUserId: String(row.seller_user_id),
          buyerUserId: String(row.buyer_user_id),
          shareEmail: Boolean(row.share_email),
          shareWhatsapp: Boolean(row.share_whatsapp),
          sharedEmail: row.shared_email ? String(row.shared_email) : null,
          sharedWhatsapp: row.shared_whatsapp ? String(row.shared_whatsapp) : null,
          buyerNote: row.buyer_note ? String(row.buyer_note) : null,
          grantedAt: String(row.granted_at || new Date().toISOString()),
        }))
      );
    }

    setIsLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void loadBaseData();
  }, [loadBaseData]);

  const subcategoriesByCategory = useMemo(() => {
    return subcategories.reduce<Record<string, SubcategoryOption[]>>((acc, subcategory) => {
      if (!acc[subcategory.categoryId]) {
        acc[subcategory.categoryId] = [];
      }
      acc[subcategory.categoryId].push(subcategory);
      return acc;
    }, {});
  }, [subcategories]);

  const savePreference = useCallback(
    async (input: Pick<CommercialLeadPreference, 'allowCommercialContact' | 'allowedCategorySlugs' | 'preferredChannels'>) => {
      if (!user?.id) {
        throw new Error('Usuario nao autenticado.');
      }

      setIsSavingPreference(true);

      const payload = {
        user_id: user.id,
        allow_commercial_contact: input.allowCommercialContact,
        allowed_category_slugs: input.allowedCategorySlugs,
        preferred_channels: input.preferredChannels,
        consent_text_version: CONSENT_TEXT_VERSION,
        consent_granted_at: input.allowCommercialContact ? new Date().toISOString() : null,
        consent_revoked_at: input.allowCommercialContact ? null : new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('commercial_lead_preferences')
        .upsert(payload, { onConflict: 'user_id' })
        .select('*')
        .single();

      setIsSavingPreference(false);

      if (error) {
        throw error;
      }

      const row = data as Record<string, unknown>;
      const nextPreference: CommercialLeadPreference = {
        userId: String(row.user_id),
        allowCommercialContact: Boolean(row.allow_commercial_contact),
        allowedCategorySlugs: Array.isArray(row.allowed_category_slugs) ? row.allowed_category_slugs.map(String) : [],
        preferredChannels: Array.isArray(row.preferred_channels) ? row.preferred_channels.map(String) : ['platform'],
        consentTextVersion: String(row.consent_text_version || CONSENT_TEXT_VERSION),
        consentGrantedAt: row.consent_granted_at ? String(row.consent_granted_at) : null,
        consentRevokedAt: row.consent_revoked_at ? String(row.consent_revoked_at) : null,
        createdAt: String(row.created_at || new Date().toISOString()),
        updatedAt: String(row.updated_at || new Date().toISOString()),
      };

      setPreference(nextPreference);
      return nextPreference;
    },
    [user?.id]
  );

  const generateReport = useCallback(
    async (categorySlug: string, subcategorySlug?: string) => {
      if (!user?.id) {
        throw new Error('Usuario nao autenticado.');
      }

      setIsGeneratingReport(true);

      const { data, error } = await supabase.rpc('generate_commercial_intelligence_report', {
        p_category_slug: categorySlug,
        p_subcategory_slug: subcategorySlug || null,
      });

      setIsGeneratingReport(false);

      if (error) {
        throw error;
      }

      const mappedReport = ((data as Array<Record<string, unknown>> | null) || []).map((row) => ({
        state: row.state ? String(row.state) : null,
        city: row.city ? String(row.city) : null,
        scoreBand: (String(row.score_band || 'low') as 'high' | 'medium' | 'low'),
        interestedBuyers: Number(row.interested_buyers || 0),
        consentingBuyers: Number(row.consenting_buyers || 0),
        announcementViews: Number(row.announcement_views || 0),
        favoritesCount: Number(row.favorites_count || 0),
        leadActions: Number(row.lead_actions || 0),
        priceMin: row.price_min === null || row.price_min === undefined ? null : Number(row.price_min),
        priceMax: row.price_max === null || row.price_max === undefined ? null : Number(row.price_max),
        lastActivityAt: row.last_activity_at ? String(row.last_activity_at) : null,
      })) satisfies CommercialIntelligenceReportRow[];

      setReport(mappedReport);
      setRequestCountThisMonth((current) => current + 1);
      return mappedReport;
    },
    [user?.id]
  );

  const sendOutreach = useCallback(
    async (categorySlug: string, subcategorySlug: string | undefined, message: string) => {
      if (!user?.id) {
        throw new Error('Usuario nao autenticado.');
      }

      setIsSendingOutreach(true);

      const { data, error } = await supabase.rpc('dispatch_commercial_intelligence_outreach', {
        p_category_slug: categorySlug,
        p_subcategory_slug: subcategorySlug || null,
        p_message: message,
      });

      setIsSendingOutreach(false);

      if (error) {
        throw error;
      }

      await loadBaseData();

      const row = Array.isArray(data) ? data[0] : null;
      return {
        campaignId: row?.campaign_id ? String(row.campaign_id) : null,
        recipientsCount: Number(row?.recipients_count || 0),
        deliveredCount: Number(row?.delivered_count || 0),
      };
    },
    [loadBaseData, user?.id]
  );

  const respondToOpportunity = useCallback(
    async (deliveryId: string, buyerNote?: string) => {
      if (!user?.id) {
        throw new Error('Usuario nao autenticado.');
      }

      setIsRespondingToOpportunity(true);

      const { data, error } = await supabase.rpc('respond_to_commercial_intelligence_outreach', {
        p_delivery_id: deliveryId,
        p_buyer_note: buyerNote?.trim() || null,
      });

      setIsRespondingToOpportunity(false);

      if (error) {
        throw error;
      }

      await loadBaseData();

      const row = Array.isArray(data) ? data[0] : null;
      return {
        responseId: row?.response_id ? String(row.response_id) : null,
        sellerNotificationId: row?.seller_notification_id ? String(row.seller_notification_id) : null,
      };
    },
    [loadBaseData, user?.id]
  );

  const loadConversationMessages = useCallback(
    async (conversationId: string) => {
      if (!user?.id) {
        throw new Error('Usuario nao autenticado.');
      }

      setLoadingConversationId(conversationId);

      const { data, error } = await supabase.rpc('list_commercial_intelligence_conversation_messages', {
        p_conversation_id: conversationId,
      });

      setLoadingConversationId(null);

      if (error) {
        throw error;
      }

      const messages = ((data as Array<Record<string, unknown>> | null) || []).map((row) => ({
        messageId: String(row.message_id),
        senderUserId: String(row.sender_user_id),
        senderName: String(row.sender_name || 'Participante'),
        content: String(row.content || ''),
        createdAt: String(row.created_at || new Date().toISOString()),
      })) satisfies CommercialIntelligenceConversationMessage[];

      setConversationMessages((current) => ({
        ...current,
        [conversationId]: messages,
      }));

      return messages;
    },
    [user?.id]
  );

  const startConversation = useCallback(
    async (responseId: string, initialMessage: string) => {
      if (!user?.id) {
        throw new Error('Usuario nao autenticado.');
      }

      setIsStartingConversation(true);

      const { data, error } = await supabase.rpc('start_commercial_intelligence_conversation', {
        p_response_id: responseId,
        p_initial_message: initialMessage,
      });

      setIsStartingConversation(false);

      if (error) {
        throw error;
      }

      await loadBaseData();

      const row = Array.isArray(data) ? data[0] : null;
      const conversationId = row?.conversation_id ? String(row.conversation_id) : null;
      if (conversationId) {
        await loadConversationMessages(conversationId);
      }
      return {
        conversationId,
        messageId: row?.message_id ? String(row.message_id) : null,
      };
    },
    [loadBaseData, loadConversationMessages, user?.id]
  );

  const sendConversationMessage = useCallback(
    async (conversationId: string, message: string) => {
      if (!user?.id) {
        throw new Error('Usuario nao autenticado.');
      }

      setIsSendingConversationMessage(true);

      const { data, error } = await supabase.rpc('send_commercial_intelligence_conversation_message', {
        p_conversation_id: conversationId,
        p_message: message,
      });

      setIsSendingConversationMessage(false);

      if (error) {
        throw error;
      }

      await Promise.all([loadBaseData(), loadConversationMessages(conversationId)]);

      const row = Array.isArray(data) ? data[0] : null;
      return {
        messageId: row?.message_id ? String(row.message_id) : null,
      };
    },
    [loadBaseData, loadConversationMessages, user?.id]
  );

  const grantContactShare = useCallback(
    async (conversationId: string, shareEmail: boolean, shareWhatsapp: boolean, buyerNote?: string) => {
      if (!user?.id) {
        throw new Error('Usuario nao autenticado.');
      }

      setIsGrantingContactShare(true);

      const { data, error } = await supabase.rpc('grant_commercial_intelligence_contact_share', {
        p_conversation_id: conversationId,
        p_share_email: shareEmail,
        p_share_whatsapp: shareWhatsapp,
        p_buyer_note: buyerNote?.trim() || null,
      });

      setIsGrantingContactShare(false);

      if (error) {
        throw error;
      }

      await loadBaseData();

      const row = Array.isArray(data) ? data[0] : null;
      return {
        shareId: row?.share_id ? String(row.share_id) : null,
        sellerNotificationId: row?.seller_notification_id ? String(row.seller_notification_id) : null,
      };
    },
    [loadBaseData, user?.id]
  );

  return {
    categories,
    subcategories,
    subcategoriesByCategory,
    preference,
    report,
    outreachCampaigns,
    receivedOpportunities,
    interestResponses,
    conversations,
    conversationMessages,
    contactShares,
    hasCommercialIntelligence,
    requestLimit,
    requestCountThisMonth,
    remainingRequests,
    outreachCountThisMonth,
    isLoading,
    isSavingPreference,
    isGeneratingReport,
    isSendingOutreach,
    isRespondingToOpportunity,
    isStartingConversation,
    isSendingConversationMessage,
    isGrantingContactShare,
    loadingConversationId,
    savePreference,
    generateReport,
    sendOutreach,
    respondToOpportunity,
    loadConversationMessages,
    startConversation,
    sendConversationMessage,
    grantContactShare,
    refresh: loadBaseData,
  };
};
