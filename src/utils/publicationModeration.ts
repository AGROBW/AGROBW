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
  hasVideo?: boolean;
};

export const systemVideoModerationReason: PublicationModerationReason = {
  rule_kind: 'system_video_review',
  rule_name: 'Vídeo anexado',
  action: 'review',
  message: 'Anúncios com vídeo são enviados automaticamente para análise jurídica prévia.',
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
  const applyLocalRules = (baseResult: PublicationModerationResult): PublicationModerationResult => {
    const nextResult: PublicationModerationResult = {
      blocked: baseResult.blocked,
      reviewRequired: baseResult.reviewRequired,
      reasons: [...baseResult.reasons],
    };

    if (payload.hasVideo) {
      nextResult.reviewRequired = true;

      const alreadyHasVideoReason = nextResult.reasons.some(
        (reason) => reason.rule_kind === systemVideoModerationReason.rule_kind,
      );

      if (!alreadyHasVideoReason) {
        nextResult.reasons.push(systemVideoModerationReason);
      }
    }

    return nextResult;
  };

  const { data, error } = await supabase.rpc('evaluate_announcement_publication_rules', {
    p_title: payload.title || '',
    p_description: payload.description || '',
    p_category_slug: payload.categorySlug || '',
    p_images: Array.isArray(payload.images) ? payload.images : [],
  });

  if (error) {
    console.warn('[PublicationModeration] Não foi possível avaliar regras de publicação:', error);

    if (!payload.hasVideo) {
      return null;
    }

    return applyLocalRules({
      blocked: false,
      reviewRequired: false,
      reasons: [],
    });
  }

  return applyLocalRules({
    blocked: Boolean(data?.blocked),
    reviewRequired: Boolean(data?.review_required),
    reasons: parsePublicationModerationReasons(data?.reasons),
  });
};
