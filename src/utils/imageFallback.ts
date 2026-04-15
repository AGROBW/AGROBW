export const getPrimaryImageFromList = (
  images: Array<string | null | undefined> | null | undefined,
  fallbackUrl?: string | null,
) => {
  const primaryImage = (images || []).find((image) => typeof image === 'string' && image.trim().length > 0)?.trim();
  return primaryImage || fallbackUrl || '';
};
