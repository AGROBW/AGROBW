import { supabase } from '../lib/supabaseClient';

export type PublicationModerationReason = {
  rule_id?: string;
  rule_name?: string;
  rule_kind?: string;
  action?: 'review' | 'block';
  message?: string;
};

export type PublicationModerationResult = {
  blocked: boolean;
  reviewRequired: boolean;
  reasons: PublicationModerationReason[];
};

type ModerationPayload = {
  title?: string | null;
  description?: string | null;
  categorySlug?: string | null;
  images?: string[] | null;
};

export const parsePublicationModerationReasons = (value: unknown): PublicationModerationReason[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is PublicationModerationReason => Boolean(item && typeof item === 'object'));
};

export const formatPublicationModerationReasons = (reasons: PublicationModerationReason[]) => {
  const messages = reasons
    .map((reason) => reason.message || reason.rule_name)
    .filter((message): message is string => Boolean(message));

  return messages.length > 0 ? messages.join(' | ') : 'Revise as regras de publicação.';
};

export const evaluatePublicationModeration = async (
  payload: ModerationPayload
): Promise<PublicationModerationResult | null> => {
  const { data, error } = await supabase.rpc('evaluate_announcement_publication_rules', {
    p_title: payload.title || '',
    p_description: payload.description || '',
    p_category_slug: payload.categorySlug || '',
    p_images: Array.isArray(payload.images) ? payload.images : [],
  });

  if (error) {
    console.warn('[PublicationModeration] Não foi possível avaliar regras de publicação:', error);
    return null;
  }

  return {
    blocked: Boolean(data?.blocked),
    reviewRequired: Boolean(data?.review_required),
    reasons: parsePublicationModerationReasons(data?.reasons),
  };
};
