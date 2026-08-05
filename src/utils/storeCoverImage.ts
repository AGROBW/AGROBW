export type StoreCoverVariant = 'desktop' | 'mobile';

const VALID_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_SOURCE_SIZE_BYTES = 10 * 1024 * 1024;

const COVER_OPTIONS: Record<StoreCoverVariant, { maxSizeMB: number; maxWidthOrHeight: number }> = {
  desktop: { maxSizeMB: 0.5, maxWidthOrHeight: 2000 },
  mobile: { maxSizeMB: 0.35, maxWidthOrHeight: 1200 },
};

export const optimizeStoreCoverImage = async (
  file: File,
  variant: StoreCoverVariant
): Promise<File> => {
  if (!VALID_IMAGE_TYPES.has(file.type)) {
    throw new Error('Formato invalido. Use JPG, PNG ou WebP.');
  }

  if (file.size > MAX_SOURCE_SIZE_BYTES) {
    throw new Error('Arquivo muito grande. O limite antes da otimizacao e 10MB.');
  }

  const options = COVER_OPTIONS[variant];
  const { default: imageCompression } = await import('browser-image-compression');
  const compressed = await imageCompression(file, {
    ...options,
    fileType: 'image/webp',
    initialQuality: 0.82,
    useWebWorker: true,
    preserveExif: false,
  });

  const baseName = file.name.replace(/\.[^/.]+$/, '') || `cover-${variant}`;
  return new File([compressed], `${baseName}.webp`, {
    type: 'image/webp',
    lastModified: Date.now(),
  });
};
