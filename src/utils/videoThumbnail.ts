const revokeObjectUrlSafe = (value?: string | null) => {
  if (value && value.startsWith('blob:')) {
    URL.revokeObjectURL(value);
  }
};

const waitForEvent = <T extends Event>(target: EventTarget, eventName: string) =>
  new Promise<T>((resolve, reject) => {
    const handleSuccess = (event: Event) => {
      cleanup();
      resolve(event as T);
    };

    const handleError = () => {
      cleanup();
      reject(new Error(`Falha ao aguardar evento do video: ${eventName}`));
    };

    const cleanup = () => {
      target.removeEventListener(eventName, handleSuccess as EventListener);
      target.removeEventListener('error', handleError);
    };

    target.addEventListener(eventName, handleSuccess as EventListener, { once: true });
    target.addEventListener('error', handleError, { once: true });
  });

export const generateVideoThumbnail = async (
  file: File,
  options?: {
    captureRatio?: number;
    quality?: number;
    type?: string;
  }
) => {
  const captureRatio = options?.captureRatio ?? 0.25;
  const quality = options?.quality ?? 0.86;
  const type = options?.type ?? 'image/jpeg';
  const sourceUrl = URL.createObjectURL(file);
  const video = document.createElement('video');

  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.src = sourceUrl;

  try {
    await waitForEvent(video, 'loadedmetadata');

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const safeDuration = duration > 0 ? duration : 1;
    const candidateTime = Math.max(0.1, safeDuration * captureRatio);
    const captureTime = Math.min(candidateTime, Math.max(safeDuration - 0.1, 0.1));

    if (Math.abs(video.currentTime - captureTime) > 0.01) {
      video.currentTime = captureTime;
      await waitForEvent(video, 'seeked');
    }

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Nao foi possivel gerar a capa automatica do video.');
    }

    context.drawImage(video, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (!result) {
            reject(new Error('Nao foi possivel exportar a capa automatica do video.'));
            return;
          }
          resolve(result);
        },
        type,
        quality,
      );
    });

    const extension = type === 'image/webp' ? 'webp' : 'jpg';
    const baseName = file.name.replace(/\.[^/.]+$/, '') || 'video';
    const thumbnailFile = new File([blob], `${baseName}-thumbnail.${extension}`, {
      type,
      lastModified: Date.now(),
    });

    return {
      file: thumbnailFile,
      width,
      height,
      durationSeconds: duration,
    };
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    revokeObjectUrlSafe(sourceUrl);
  }
};
