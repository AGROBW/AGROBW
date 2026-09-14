export const getLegacyHashRouteDestination = (origin: string, hash: string) => {
  if (!hash.startsWith('#/')) return null;
  return `${origin.replace(/\/$/, '')}${hash.slice(1)}`;
};
