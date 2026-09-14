export const isGuestContactContentLocked = (params: {
  lookupFailed: boolean;
  contactFound: boolean;
  contactExpiresAt: string | null | undefined;
  now?: number;
}) => {
  if (params.lookupFailed || !params.contactFound) return true;
  if (params.contactExpiresAt == null) return false;

  const expiresAt = Date.parse(params.contactExpiresAt);
  if (!Number.isFinite(expiresAt)) return true;

  return expiresAt <= (params.now ?? Date.now());
};
