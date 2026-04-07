const MAX_INPUT_SIZE_BYTES = 100 * 1024 * 1024;
const MAX_DURATION_SECONDS = 60;
const TARGET_OUTPUT_SIZE_BYTES = 12 * 1024 * 1024;
const MAX_RENDER_WIDTH = 1280;
const MAX_RENDER_HEIGHT = 720;

export class VideoCompressionError extends Error {}

export type CompressedVideoResult = {
  file: File;
  durationSeconds: number;
  sizeBytes: number;
};

const waitForEvent = <T extends Event>(
  target: EventTarget,
  eventName: string,
): Promise<T> =>
  new Promise((resolve, reject) => {
    const onResolve = (event: Event) => {
      cleanup();
      resolve(event as T);
    };
    const onReject = () => {
      cleanup();
      reject(new VideoCompressionError('Nao foi possivel processar o video enviado.'));
    };
    const cleanup = () => {
      target.removeEventListener(eventName, onResolve as EventListener);
      target.removeEventListener('error', onReject as EventListener);
    };

    target.addEventListener(eventName, onResolve as EventListener, { once: true });
    target.addEventListener('error', onReject as EventListener, { once: true });
  });

const pickRecorderMimeType = () => {
  if (typeof MediaRecorder === 'undefined') return null;

  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || null;
};

const formatExtensionFromMime = (mimeType: string) => {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mp4')) return 'mp4';
  return 'webm';
};

const clampDimensions = (width: number, height: number) => {
  const widthRatio = MAX_RENDER_WIDTH / width;
  const heightRatio = MAX_RENDER_HEIGHT / height;
  const ratio = Math.min(1, widthRatio, heightRatio);

  return {
    width: Math.max(2, Math.round((width * ratio) / 2) * 2),
    height: Math.max(2, Math.round((height * ratio) / 2) * 2),
  };
};

type CaptureStreamVideoElement = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

const getVideoCaptureStream = (video: HTMLVideoElement) => {
  const captureVideo = video as CaptureStreamVideoElement;

  if (typeof captureVideo.captureStream === 'function') {
    return captureVideo.captureStream();
  }

  if (typeof captureVideo.mozCaptureStream === 'function') {
    return captureVideo.mozCaptureStream();
  }

  return null;
};

export const compressAnnouncementVideo = async (file: File): Promise<CompressedVideoResult> => {
  if (!file.type.startsWith('video/')) {
    throw new VideoCompressionError('Envie um arquivo de video valido.');
  }

  if (file.size > MAX_INPUT_SIZE_BYTES) {
    throw new VideoCompressionError('O video excede 100MB. Envie um arquivo menor.');
  }

  const sourceUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.src = sourceUrl;
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';

  try {
    await waitForEvent(video, 'loadedmetadata');

    const durationSeconds = Number.isFinite(video.duration) ? Math.ceil(video.duration) : 0;
    if (!durationSeconds || durationSeconds > MAX_DURATION_SECONDS) {
      throw new VideoCompressionError('O video precisa ter no maximo 60 segundos.');
    }

    const recorderMimeType = pickRecorderMimeType();
    const hasCanvasCapture =
      typeof HTMLCanvasElement !== 'undefined' &&
      typeof HTMLCanvasElement.prototype.captureStream === 'function';

    if (!recorderMimeType || typeof MediaRecorder === 'undefined' || !hasCanvasCapture) {
      if (file.size <= TARGET_OUTPUT_SIZE_BYTES) {
        return {
          file,
          durationSeconds,
          sizeBytes: file.size,
        };
      }

      throw new VideoCompressionError('Seu navegador nao conseguiu comprimir este video automaticamente.');
    }

    await waitForEvent(video, 'loadeddata');

    const { width, height } = clampDimensions(video.videoWidth || 1280, video.videoHeight || 720);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new VideoCompressionError('Nao foi possivel preparar a compressao do video.');
    }

    const stream = canvas.captureStream(24);
    const sourceMediaStream = getVideoCaptureStream(video);
    const sourceAudioTracks = sourceMediaStream?.getAudioTracks() || [];

    sourceAudioTracks.forEach((track) => {
      stream.addTrack(track);
    });

    const targetBitsPerSecond = Math.max(
      700_000,
      Math.min(2_500_000, Math.floor((TARGET_OUTPUT_SIZE_BYTES * 8) / durationSeconds)),
    );

    const recorder = new MediaRecorder(stream, {
      mimeType: recorderMimeType,
      videoBitsPerSecond: targetBitsPerSecond,
      audioBitsPerSecond: sourceAudioTracks.length > 0 ? 128_000 : undefined,
    });

    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    const stopPromise = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = () =>
        reject(new VideoCompressionError('Falha ao gerar a versao otimizada do video.'));
    });

    let animationFrame = 0;
    const renderFrame = () => {
      if (!video.paused && !video.ended) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        animationFrame = requestAnimationFrame(renderFrame);
      }
    };

    recorder.start(250);
    video.muted = false;
    await video.play();
    renderFrame();

    await new Promise<void>((resolve) => {
      video.onended = () => resolve();
    });

    cancelAnimationFrame(animationFrame);

    if (recorder.state !== 'inactive') {
      recorder.stop();
    }

    await stopPromise;
    stream.getTracks().forEach((track) => track.stop());
    sourceMediaStream?.getTracks().forEach((track) => track.stop());

    const compressedBlob = new Blob(chunks, { type: recorderMimeType });
    const extension = formatExtensionFromMime(recorderMimeType);
    const fileName = file.name.replace(/\.[^/.]+$/, '') || 'video';
    const compressedFile = new File([compressedBlob], `${fileName}.${extension}`, {
      type: recorderMimeType,
    });

    if (compressedFile.size >= file.size && file.size <= TARGET_OUTPUT_SIZE_BYTES) {
      return {
        file,
        durationSeconds,
        sizeBytes: file.size,
      };
    }

    return {
      file: compressedFile,
      durationSeconds,
      sizeBytes: compressedFile.size,
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
    video.removeAttribute('src');
    video.load();
  }
};

export const formatVideoSize = (bytes?: number | null) => {
  if (!bytes || bytes <= 0) return null;

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const digits = size >= 10 || unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
};
