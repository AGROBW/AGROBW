import QRCode from 'qrcode';
import type { AdArtworkFormat, AdArtworkTemplate } from '../lib/adShareArtwork';
import { getAdArtworkDimensions } from '../lib/adShareArtwork';

export type AdShareArtworkRenderInput = {
  format: AdArtworkFormat;
  template: AdArtworkTemplate;
  imageUrl: string;
  title: string;
  priceLabel: string;
  locationLabel: string;
  announcementUrl: string;
  logoUrl?: string;
};

const COLORS = {
  navy: '#0b172b',
  navySoft: '#13223a',
  green: '#16a34a',
  greenBright: '#22c55e',
  lime: '#d9f99d',
  cream: '#f7f8f2',
  white: '#ffffff',
  slate: '#64748b',
};

const roundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
};

const loadImage = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.decoding = 'async';
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Nao foi possivel carregar uma das imagens da arte.'));
  image.src = url;
});

const drawImageCover = (
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) => {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
};

const getWrappedLines = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
) => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) lines.push(current);
    current = word;
    if (lines.length === maxLines - 1) break;
  }

  if (current && lines.length < maxLines) lines.push(current);

  const consumed = lines.join(' ').split(/\s+/).length;
  if (consumed < words.length && lines.length) {
    let last = lines[lines.length - 1];
    while (last.length > 1 && ctx.measureText(`${last}...`).width > maxWidth) {
      last = last.slice(0, -1);
    }
    lines[lines.length - 1] = `${last.trim()}...`;
  }

  return lines;
};

const drawLines = (
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
) => lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));

const drawBrand = (
  ctx: CanvasRenderingContext2D,
  logo: HTMLImageElement | null,
  x: number,
  y: number,
  width: number,
) => {
  if (logo) {
    const ratio = logo.naturalHeight / logo.naturalWidth;
    ctx.drawImage(logo, x, y, width, width * ratio);
    return;
  }

  ctx.font = `900 ${Math.round(width * 0.22)}px Arial, sans-serif`;
  ctx.fillStyle = COLORS.green;
  ctx.fillText('AGRO', x, y + width * 0.22);
  ctx.fillStyle = '#f5b800';
  ctx.fillText('BW', x + width * 0.55, y + width * 0.22);
};

const drawQrBlock = (
  ctx: CanvasRenderingContext2D,
  qr: HTMLImageElement,
  x: number,
  y: number,
  size: number,
  darkText = false,
) => {
  ctx.save();
  ctx.fillStyle = COLORS.white;
  roundedRect(ctx, x, y, size, size, Math.round(size * 0.12));
  ctx.fill();
  const padding = Math.round(size * 0.08);
  ctx.drawImage(qr, x + padding, y + padding, size - padding * 2, size - padding * 2);
  ctx.restore();

  ctx.fillStyle = darkText ? COLORS.navy : COLORS.white;
  ctx.font = `700 ${Math.max(20, Math.round(size * 0.12))}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('Veja o anuncio', x + size / 2, y + size + Math.round(size * 0.17));
  ctx.textAlign = 'left';
};

const renderShowcase = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  image: HTMLImageElement,
  logo: HTMLImageElement | null,
  qr: HTMLImageElement,
  input: AdShareArtworkRenderInput,
) => {
  const story = input.format === 'story';
  const landscape = input.format === 'landscape';
  const imageHeight = story ? height * 0.58 : landscape ? height * 0.64 : height * 0.57;
  const pad = width * (landscape ? 0.045 : 0.065);

  ctx.fillStyle = COLORS.navy;
  ctx.fillRect(0, 0, width, height);
  drawImageCover(ctx, image, 0, 0, width, imageHeight);

  const gradient = ctx.createLinearGradient(0, imageHeight * 0.35, 0, imageHeight);
  gradient.addColorStop(0, 'rgba(11,23,43,0)');
  gradient.addColorStop(1, COLORS.navy);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, imageHeight + 3);

  drawBrand(ctx, logo, pad, pad, landscape ? 190 : 220);
  ctx.fillStyle = COLORS.greenBright;
  ctx.font = `800 ${landscape ? 21 : 25}px Arial, sans-serif`;
  ctx.fillText('ANUNCIADO NA AGRO BW', pad, imageHeight + (story ? 90 : landscape ? 45 : 65));

  const titleSize = story ? 62 : landscape ? 38 : 48;
  ctx.font = `900 ${titleSize}px Arial, sans-serif`;
  ctx.fillStyle = COLORS.white;
  const qrSize = story ? 220 : landscape ? 145 : 165;
  const titleMaxWidth = landscape ? width - pad * 3 - qrSize : width - pad * 2;
  const titleY = imageHeight + (story ? 170 : landscape ? 95 : 130);
  const titleLines = getWrappedLines(ctx, input.title, titleMaxWidth, landscape ? 2 : 3);
  drawLines(ctx, titleLines, pad, titleY, titleSize * 1.08);

  const priceY = titleY + titleLines.length * titleSize * 1.08 + (story ? 55 : 25);
  ctx.fillStyle = COLORS.lime;
  ctx.font = `900 ${story ? 54 : landscape ? 35 : 42}px Arial, sans-serif`;
  ctx.fillText(input.priceLabel, pad, priceY);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = `600 ${story ? 28 : landscape ? 20 : 23}px Arial, sans-serif`;
  ctx.fillText(input.locationLabel, pad, priceY + (story ? 55 : 42));

  drawQrBlock(
    ctx,
    qr,
    width - pad - qrSize,
    height - (story ? 330 : landscape ? 205 : 230),
    qrSize,
  );

  ctx.fillStyle = '#94a3b8';
  ctx.font = `700 ${story ? 25 : landscape ? 18 : 21}px Arial, sans-serif`;
  ctx.fillText('agrobw.com.br', pad, height - pad);
};

const renderImpact = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  image: HTMLImageElement,
  logo: HTMLImageElement | null,
  qr: HTMLImageElement,
  input: AdShareArtworkRenderInput,
) => {
  const landscape = input.format === 'landscape';
  const story = input.format === 'story';
  const pad = width * (landscape ? 0.05 : 0.07);
  drawImageCover(ctx, image, 0, 0, width, height);

  const gradient = ctx.createLinearGradient(0, 0, landscape ? width * 0.78 : 0, landscape ? 0 : height);
  gradient.addColorStop(0, 'rgba(5,16,30,0.96)');
  gradient.addColorStop(landscape ? 0.64 : 0.45, 'rgba(5,16,30,0.76)');
  gradient.addColorStop(1, 'rgba(5,16,30,0.18)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = COLORS.greenBright;
  roundedRect(ctx, pad, pad, landscape ? 275 : 340, landscape ? 42 : 56, 28);
  ctx.fill();
  ctx.fillStyle = COLORS.navy;
  ctx.font = `900 ${landscape ? 18 : 23}px Arial, sans-serif`;
  ctx.fillText('OPORTUNIDADE NO AGRO', pad + 24, pad + (landscape ? 28 : 37));

  const titleSize = story ? 76 : landscape ? 48 : 62;
  ctx.fillStyle = COLORS.white;
  ctx.font = `900 ${titleSize}px Arial, sans-serif`;
  const maxWidth = landscape ? width * 0.57 : width - pad * 2;
  const titleY = story ? height * 0.48 : landscape ? height * 0.38 : height * 0.48;
  const lines = getWrappedLines(ctx, input.title, maxWidth, story ? 4 : 3);
  drawLines(ctx, lines, pad, titleY, titleSize * 1.03);

  const priceY = titleY + lines.length * titleSize * 1.03 + (story ? 70 : 38);
  ctx.fillStyle = COLORS.lime;
  ctx.font = `900 ${story ? 66 : landscape ? 40 : 52}px Arial, sans-serif`;
  ctx.fillText(input.priceLabel, pad, priceY);
  ctx.fillStyle = COLORS.white;
  ctx.font = `600 ${story ? 30 : landscape ? 20 : 25}px Arial, sans-serif`;
  ctx.fillText(input.locationLabel, pad, priceY + (story ? 62 : 45));

  const qrSize = story ? 230 : landscape ? 150 : 175;
  drawQrBlock(ctx, qr, width - pad - qrSize, height - pad - qrSize - qrSize * 0.2, qrSize);
  drawBrand(ctx, logo, pad, height - pad - (landscape ? 47 : 62), landscape ? 175 : 215);
};

const renderInstitutional = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  image: HTMLImageElement,
  logo: HTMLImageElement | null,
  qr: HTMLImageElement,
  input: AdShareArtworkRenderInput,
) => {
  const landscape = input.format === 'landscape';
  const story = input.format === 'story';
  const pad = width * (landscape ? 0.045 : 0.065);
  ctx.fillStyle = COLORS.cream;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = COLORS.green;
  ctx.fillRect(0, 0, landscape ? width * 0.02 : width, landscape ? height : height * 0.025);

  const imageX = landscape ? width * 0.54 : pad;
  const imageY = story ? height * 0.1 : pad;
  const imageWidth = landscape ? width * 0.42 : width - pad * 2;
  const imageHeight = story ? height * 0.48 : landscape ? height - pad * 2 : height * 0.47;
  ctx.save();
  roundedRect(ctx, imageX, imageY, imageWidth, imageHeight, landscape ? 26 : 38);
  ctx.clip();
  drawImageCover(ctx, image, imageX, imageY, imageWidth, imageHeight);
  ctx.restore();

  drawBrand(ctx, logo, pad, story ? height * 0.035 : pad, landscape ? 180 : 210);
  const contentY = landscape ? height * 0.26 : imageY + imageHeight + (story ? 85 : 60);
  ctx.fillStyle = COLORS.green;
  ctx.font = `800 ${story ? 25 : landscape ? 18 : 22}px Arial, sans-serif`;
  ctx.fillText('ENCONTRE NA AGRO BW', pad, contentY);

  const titleSize = story ? 62 : landscape ? 39 : 48;
  ctx.font = `900 ${titleSize}px Arial, sans-serif`;
  ctx.fillStyle = COLORS.navy;
  const titleWidth = landscape ? width * 0.43 : width - pad * 2;
  const lines = getWrappedLines(ctx, input.title, titleWidth, landscape ? 3 : 2);
  drawLines(ctx, lines, pad, contentY + titleSize * 1.25, titleSize * 1.08);

  const priceY = contentY + titleSize * 1.25 + lines.length * titleSize * 1.08 + 24;
  ctx.fillStyle = COLORS.green;
  ctx.font = `900 ${story ? 54 : landscape ? 34 : 42}px Arial, sans-serif`;
  ctx.fillText(input.priceLabel, pad, priceY);
  ctx.fillStyle = COLORS.slate;
  ctx.font = `600 ${story ? 28 : landscape ? 19 : 23}px Arial, sans-serif`;
  ctx.fillText(input.locationLabel, pad, priceY + (story ? 55 : 40));

  const qrSize = story ? 220 : landscape ? 130 : 155;
  drawQrBlock(ctx, qr, width - pad - qrSize, height - pad - qrSize - qrSize * 0.2, qrSize, true);
  ctx.fillStyle = COLORS.navy;
  ctx.font = `700 ${story ? 24 : landscape ? 17 : 20}px Arial, sans-serif`;
  ctx.fillText('agrobw.com.br', pad, height - pad);
};

export const renderAdShareArtwork = async (input: AdShareArtworkRenderInput): Promise<Blob> => {
  if (!input.imageUrl) throw new Error('Este anuncio precisa ter pelo menos uma foto para gerar a arte.');

  const { width, height } = getAdArtworkDimensions(input.format);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Seu navegador nao conseguiu iniciar o gerador de arte.');

  const qrDataUrl = await QRCode.toDataURL(input.announcementUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 420,
    color: { dark: COLORS.navy, light: COLORS.white },
  });

  const [image, qr, logo] = await Promise.all([
    loadImage(input.imageUrl),
    loadImage(qrDataUrl),
    input.logoUrl ? loadImage(input.logoUrl).catch(() => null) : Promise.resolve(null),
  ]);

  if (input.template === 'impact') {
    renderImpact(ctx, width, height, image, logo, qr, input);
  } else if (input.template === 'institutional') {
    renderInstitutional(ctx, width, height, image, logo, qr, input);
  } else {
    renderShowcase(ctx, width, height, image, logo, qr, input);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Nao foi possivel finalizar o arquivo PNG.'));
    }, 'image/png', 0.95);
  });
};

