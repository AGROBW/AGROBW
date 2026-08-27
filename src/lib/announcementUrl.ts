const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type AnnouncementUrlSource = {
  id: string;
  slug?: string | null;
};

export const isAnnouncementUuid = (value?: string | null) =>
  typeof value === 'string' && UUID_RE.test(value);

export const isAnnouncementSlug = (value?: string | null) =>
  typeof value === 'string' &&
  value.length <= 200 &&
  SLUG_RE.test(value) &&
  !isAnnouncementUuid(value);

export const getAnnouncementIdentifier = ({ id, slug }: AnnouncementUrlSource) => {
  const normalizedSlug = typeof slug === 'string' ? slug.trim() : '';
  return isAnnouncementSlug(normalizedSlug) ? normalizedSlug : id;
};

export const getAnnouncementPath = (announcement: AnnouncementUrlSource) =>
  `/anuncio/${getAnnouncementIdentifier(announcement)}`;
