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

const drawImageContain = (
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) => {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const targetWidth = image.naturalWidth * scale;
  const targetHeight = image.naturalHeight * scale;
  const targetX = x + (width - targetWidth) / 2;
  const targetY = y + (height - targetHeight) / 2;
  ctx.drawImage(image, targetX, targetY, targetWidth, targetHeight);
};

const drawShowcasePhoto = (
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) => {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.fillStyle = COLORS.navy;
  ctx.fillRect(x, y, width, height);

  const imageAspect = image.naturalWidth / image.naturalHeight;
  const areaAspect = width / height;
  const aspectRatio = imageAspect / areaAspect;

  if (aspectRatio >= 0.74 && aspectRatio <= 1.35) {
    drawImageCover(ctx, image, x, y, width, height);
  } else {
    drawImageCover(ctx, image, x, y, width, height);
    ctx.fillStyle = 'rgba(5,16,30,0.68)';
    ctx.fillRect(x, y, width, height);
    drawImageContain(ctx, image, x, y, width, height);
  }
  ctx.restore();
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

const fitFontSize = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  preferredSize: number,
  minimumSize: number,
  weight = 900,
) => {
  let size = preferredSize;
  while (size > minimumSize) {
    ctx.font = `${weight} ${size}px Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 1;
  }
  return minimumSize;
};

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

const drawQrOnly = (
  ctx: CanvasRenderingContext2D,
  qr: HTMLImageElement,
  x: number,
  y: number,
  size: number,
) => {
  ctx.save();
  ctx.fillStyle = COLORS.white;
  roundedRect(ctx, x, y, size, size, Math.round(size * 0.1));
  ctx.fill();
  const padding = Math.round(size * 0.08);
  ctx.drawImage(qr, x + padding, y + padding, size - padding * 2, size - padding * 2);
  ctx.restore();
};

const drawGlobeIcon = (
  ctx: CanvasRenderingContext2D,
  x: number,
  centerY: number,
  size: number,
) => {
  const radius = size / 2;
  const centerX = x + radius;

  ctx.save();
  ctx.strokeStyle = COLORS.green;
  ctx.lineWidth = Math.max(2, size * 0.09);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(centerX, centerY, radius * 0.42, radius, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(centerX - radius, centerY);
  ctx.lineTo(centerX + radius, centerY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(centerX - radius * 0.82, centerY - radius * 0.48);
  ctx.bezierCurveTo(
    centerX - radius * 0.28,
    centerY - radius * 0.2,
    centerX + radius * 0.28,
    centerY - radius * 0.2,
    centerX + radius * 0.82,
    centerY - radius * 0.48,
  );
  ctx.moveTo(centerX - radius * 0.82, centerY + radius * 0.48);
  ctx.bezierCurveTo(
    centerX - radius * 0.28,
    centerY + radius * 0.2,
    centerX + radius * 0.28,
    centerY + radius * 0.2,
    centerX + radius * 0.82,
    centerY + radius * 0.48,
  );
  ctx.stroke();
  ctx.restore();
};

const renderShowcaseLandscape = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  image: HTMLImageElement,
  logo: HTMLImageElement | null,
  qr: HTMLImageElement,
  input: AdShareArtworkRenderInput,
) => {
  const pad = width * 0.037;
  const photoX = width * 0.44;
  const photoWidth = width - photoX;
  const footerY = height - 108;

  ctx.fillStyle = COLORS.navy;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.beginPath();
  ctx.rect(photoX, 0, photoWidth, height);
  ctx.clip();
  ctx.filter = 'blur(14px)';
  drawImageCover(ctx, image, photoX - 20, -20, photoWidth + 40, height + 40);
  ctx.filter = 'none';
  ctx.fillStyle = 'rgba(5,16,30,0.46)';
  ctx.fillRect(photoX, 0, photoWidth, height);
  drawImageContain(ctx, image, photoX, 0, photoWidth, height);

  const photoGradient = ctx.createLinearGradient(0, height * 0.72, 0, height);
  photoGradient.addColorStop(0, 'rgba(5,16,30,0)');
  photoGradient.addColorStop(1, 'rgba(5,16,30,0.28)');
  ctx.fillStyle = photoGradient;
  ctx.fillRect(photoX, 0, photoWidth, height);
  ctx.restore();

  ctx.fillStyle = COLORS.navy;
  ctx.fillRect(0, 0, photoX, height);

  ctx.strokeStyle = COLORS.greenBright;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(photoX, 0);
  ctx.lineTo(photoX, height);
  ctx.stroke();

  drawBrand(ctx, logo, pad, 42, 180);

  ctx.fillStyle = COLORS.greenBright;
  ctx.font = '900 15px Arial, sans-serif';
  ctx.fillText('ANUNCIADO NA AGRO BW', pad, 167);

  const titleLength = input.title.trim().length;
  const titleSize = titleLength > 80 ? 28 : titleLength > 52 ? 31 : 35;
  const titleY = 218;
  const titleWidth = width * 0.335;
  ctx.fillStyle = COLORS.white;
  ctx.font = `900 ${titleSize}px Arial, sans-serif`;
  const titleLines = getWrappedLines(ctx, input.title, titleWidth, 3);
  const titleLineHeight = titleSize * 1.05;
  drawLines(ctx, titleLines, pad, titleY, titleLineHeight);

  const priceCardX = pad;
  const priceCardWidth = width * 0.325;
  const priceCardHeight = 108;
  const priceCardY = Math.min(
    Math.max(350, titleY + titleLines.length * titleLineHeight + 24),
    footerY - priceCardHeight - 20,
  );
  ctx.fillStyle = 'rgba(19,34,58,0.88)';
  ctx.strokeStyle = 'rgba(255,255,255,0.26)';
  ctx.lineWidth = 2;
  roundedRect(ctx, priceCardX, priceCardY, priceCardWidth, priceCardHeight, 18);
  ctx.fill();
  ctx.stroke();

  const priceInset = 20;
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '800 12px Arial, sans-serif';
  ctx.fillText('PRECO DO ANUNCIO', priceCardX + priceInset, priceCardY + 26);
  const priceSize = fitFontSize(ctx, input.priceLabel, priceCardWidth - priceInset * 2, 31, 21);
  ctx.fillStyle = COLORS.greenBright;
  ctx.font = `900 ${priceSize}px Arial, sans-serif`;
  ctx.fillText(
    input.priceLabel,
    priceCardX + priceInset,
    priceCardY + 65,
    priceCardWidth - priceInset * 2,
  );
  ctx.fillStyle = COLORS.white;
  ctx.font = '700 14px Arial, sans-serif';
  ctx.fillText(input.locationLabel, priceCardX + priceInset, priceCardY + 91, priceCardWidth - priceInset * 2);

  ctx.fillStyle = 'rgba(255,255,255,0.98)';
  ctx.fillRect(0, footerY, photoX, height - footerY);

  const iconSize = 24;
  drawGlobeIcon(ctx, pad, footerY + 36, iconSize);
  const footerTextX = pad + iconSize + 16;
  ctx.fillStyle = COLORS.navy;
  ctx.font = '900 17px Arial, sans-serif';
  ctx.fillText('VEJA O ANUNCIO COMPLETO', footerTextX, footerY + 34);
  ctx.fillStyle = COLORS.green;
  ctx.font = '800 16px Arial, sans-serif';
  ctx.fillText('agrobw.com.br', footerTextX, footerY + 60);
  ctx.fillStyle = COLORS.slate;
  ctx.font = '600 11px Arial, sans-serif';
  ctx.fillText('Aponte a camera para o QR Code', footerTextX, footerY + 82);

  const qrSize = 76;
  drawQrOnly(ctx, qr, photoX - pad - qrSize, footerY + 16, qrSize);
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
  if (landscape) {
    renderShowcaseLandscape(ctx, width, height, image, logo, qr, input);
    return;
  }

  const pad = width * (landscape ? 0.04 : 0.045);
  const photoHeight = story ? height * 0.58 : landscape ? height * 0.58 : height * 0.6;
  const footerHeight = story ? 270 : landscape ? 104 : 180;
  const footerY = height - footerHeight;
  const infoY = photoHeight;
  const infoHeight = footerY - infoY;

  ctx.fillStyle = COLORS.navy;
  ctx.fillRect(0, 0, width, height);
  drawShowcasePhoto(ctx, image, 0, 0, width, photoHeight);

  const photoGradient = ctx.createLinearGradient(0, photoHeight * 0.72, 0, photoHeight);
  photoGradient.addColorStop(0, 'rgba(5,16,30,0)');
  photoGradient.addColorStop(1, 'rgba(5,16,30,0.36)');
  ctx.fillStyle = photoGradient;
  ctx.fillRect(0, 0, width, photoHeight);

  const brandWidth = story ? 245 : landscape ? 170 : 205;
  const brandPlateWidth = brandWidth + (story ? 52 : landscape ? 34 : 44);
  const brandPlateHeight = story ? 100 : landscape ? 64 : 82;
  ctx.save();
  ctx.shadowColor = 'rgba(2,6,23,0.34)';
  ctx.shadowBlur = story ? 26 : 18;
  ctx.shadowOffsetY = story ? 9 : 6;
  ctx.fillStyle = 'rgba(11,23,43,0.94)';
  roundedRect(ctx, pad * 0.62, pad * 0.62, brandPlateWidth, brandPlateHeight, brandPlateHeight * 0.24);
  ctx.fill();
  ctx.restore();
  drawBrand(
    ctx,
    logo,
    pad * 0.62 + (story ? 25 : landscape ? 17 : 22),
    pad * 0.62 + (story ? 24 : landscape ? 15 : 19),
    brandWidth,
  );

  ctx.fillStyle = COLORS.navy;
  ctx.fillRect(0, infoY, width, infoHeight);
  const infoGradient = ctx.createLinearGradient(0, infoY, width, footerY);
  infoGradient.addColorStop(0, 'rgba(19,34,58,0.22)');
  infoGradient.addColorStop(1, 'rgba(5,16,30,0)');
  ctx.fillStyle = infoGradient;
  ctx.fillRect(0, infoY, width, infoHeight);

  const badgeY = infoY + (story ? 58 : landscape ? 21 : 38);
  ctx.fillStyle = COLORS.greenBright;
  ctx.font = `900 ${story ? 25 : landscape ? 14 : 18}px Arial, sans-serif`;
  ctx.fillText('ANUNCIADO NA AGRO BW', pad, badgeY);

  const titleLength = input.title.trim().length;
  const titleSize = story
    ? titleLength > 80 ? 43 : titleLength > 52 ? 49 : 56
    : landscape
      ? titleLength > 80 ? 24 : titleLength > 52 ? 28 : 32
      : titleLength > 80 ? 34 : titleLength > 52 ? 39 : 45;
  const titleY = badgeY + (story ? 68 : landscape ? 38 : 52);
  const titleWidth = story ? width - pad * 2 : landscape ? width * 0.57 : width * 0.58;
  ctx.fillStyle = COLORS.white;
  ctx.font = `900 ${titleSize}px Arial, sans-serif`;
  const titleLines = getWrappedLines(ctx, input.title, titleWidth, 2);
  const titleLineHeight = titleSize * 1.05;
  drawLines(ctx, titleLines, pad, titleY, titleLineHeight);

  const dividerX = width * (landscape ? 0.63 : 0.64);
  if (!story) {
    const dividerTop = infoY + infoHeight * 0.22;
    const dividerBottom = footerY - infoHeight * 0.2;
    ctx.strokeStyle = COLORS.greenBright;
    ctx.lineWidth = landscape ? 3 : 4;
    ctx.beginPath();
    ctx.moveTo(dividerX, dividerTop);
    ctx.lineTo(dividerX, dividerBottom);
    ctx.stroke();
  }

  const priceCardX = story ? pad : dividerX + (landscape ? 20 : 28);
  const priceCardWidth = story ? width - pad * 2 : width - pad - priceCardX;
  const priceCardHeight = story ? 174 : landscape ? 112 : 146;
  const priceCardY = story
    ? Math.min(
      titleY + titleLines.length * titleLineHeight + 32,
      footerY - priceCardHeight - 34,
    )
    : infoY + (infoHeight - priceCardHeight) / 2;
  ctx.fillStyle = 'rgba(19,34,58,0.76)';
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 2;
  roundedRect(ctx, priceCardX, priceCardY, priceCardWidth, priceCardHeight, story ? 30 : 20);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#cbd5e1';
  const priceInset = story ? 30 : 20;
  ctx.font = `800 ${story ? 20 : landscape ? 12 : 16}px Arial, sans-serif`;
  ctx.fillText('PRECO DO ANUNCIO', priceCardX + priceInset, priceCardY + (story ? 38 : landscape ? 28 : 35));
  ctx.fillStyle = COLORS.greenBright;
  const priceSize = story
    ? fitFontSize(ctx, input.priceLabel, priceCardWidth - priceInset * 2, 52, 34)
    : landscape ? 28 : 39;
  ctx.font = `900 ${priceSize}px Arial, sans-serif`;
  ctx.fillText(
    input.priceLabel,
    priceCardX + priceInset,
    priceCardY + (story ? 99 : landscape ? 65 : 82),
    priceCardWidth - priceInset * 2,
  );
  ctx.fillStyle = COLORS.white;
  ctx.font = `700 ${story ? 23 : landscape ? 15 : 20}px Arial, sans-serif`;
  ctx.fillText(input.locationLabel, priceCardX + priceInset, priceCardY + (story ? 143 : landscape ? 91 : 116));

  ctx.fillStyle = 'rgba(255,255,255,0.97)';
  ctx.fillRect(0, footerY, width, footerHeight);

  const qrSize = story ? 190 : landscape ? 76 : 124;
  const qrX = width - pad - qrSize;
  const qrY = footerY + (footerHeight - qrSize) / 2;
  drawQrOnly(ctx, qr, qrX, qrY, qrSize);

  const iconSize = story ? 42 : landscape ? 25 : 32;
  const iconX = pad;
  const iconY = footerY + footerHeight * 0.34;
  drawGlobeIcon(ctx, iconX, iconY, iconSize);

  const footerTextX = iconX + iconSize + (story ? 28 : landscape ? 15 : 20);
  ctx.fillStyle = COLORS.navy;
  ctx.font = `900 ${story ? 32 : landscape ? 18 : 25}px Arial, sans-serif`;
  ctx.fillText('VEJA O ANUNCIO COMPLETO', footerTextX, footerY + (story ? 75 : landscape ? 40 : 62));
  ctx.fillStyle = COLORS.green;
  ctx.font = `800 ${story ? 28 : landscape ? 16 : 22}px Arial, sans-serif`;
  ctx.fillText('agrobw.com.br', footerTextX, footerY + (story ? 126 : landscape ? 67 : 102));
  ctx.fillStyle = COLORS.slate;
  ctx.font = `600 ${story ? 21 : landscape ? 12 : 16}px Arial, sans-serif`;
  ctx.fillText('Aponte a camera para o QR Code', footerTextX, footerY + (story ? 170 : landscape ? 90 : 136));
};

const renderImpactStory = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  image: HTMLImageElement,
  logo: HTMLImageElement | null,
  qr: HTMLImageElement,
  input: AdShareArtworkRenderInput,
) => {
  const pad = width * 0.065;
  const photoHeight = height * 0.56;
  const infoY = photoHeight;

  ctx.fillStyle = COLORS.navy;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, photoHeight);
  ctx.clip();
  ctx.filter = 'blur(18px)';
  drawImageCover(ctx, image, -24, -24, width + 48, photoHeight + 48);
  ctx.filter = 'none';
  ctx.fillStyle = 'rgba(5,16,30,0.50)';
  ctx.fillRect(0, 0, width, photoHeight);
  drawImageContain(ctx, image, 0, 0, width, photoHeight);

  const photoGradient = ctx.createLinearGradient(0, photoHeight * 0.72, 0, photoHeight);
  photoGradient.addColorStop(0, 'rgba(5,16,30,0)');
  photoGradient.addColorStop(1, 'rgba(5,16,30,0.30)');
  ctx.fillStyle = photoGradient;
  ctx.fillRect(0, 0, width, photoHeight);
  ctx.restore();

  const brandCardWidth = 292;
  const brandCardHeight = 108;
  ctx.save();
  ctx.shadowColor = 'rgba(2,6,23,0.30)';
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  roundedRect(ctx, pad, pad, brandCardWidth, brandCardHeight, 24);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = COLORS.slate;
  ctx.font = '800 15px Arial, sans-serif';
  ctx.fillText('ANUNCIADO NA', pad + 20, pad + 28);
  drawBrand(ctx, logo, pad + 20, pad + 43, 205);

  ctx.fillStyle = COLORS.greenBright;
  ctx.fillRect(0, infoY, width, 8);

  const badgeY = infoY + 76;
  ctx.fillStyle = COLORS.greenBright;
  ctx.font = '900 24px Arial, sans-serif';
  ctx.fillText('OPORTUNIDADE NO AGRO', pad, badgeY);

  const titleLength = input.title.trim().length;
  const titleSize = titleLength > 80 ? 48 : titleLength > 52 ? 55 : 62;
  const titleY = badgeY + 72;
  const titleWidth = width - pad * 2;
  ctx.fillStyle = COLORS.white;
  ctx.font = `900 ${titleSize}px Arial, sans-serif`;
  const titleLines = getWrappedLines(ctx, input.title, titleWidth, 3);
  const titleLineHeight = titleSize * 1.06;
  drawLines(ctx, titleLines, pad, titleY, titleLineHeight);

  const priceTop = titleY + titleLines.length * titleLineHeight + 38;
  const priceHeight = 86;
  const priceMaxWidth = width * 0.6;
  const priceFontSize = fitFontSize(ctx, input.priceLabel, priceMaxWidth - 64, 52, 34);
  ctx.font = `900 ${priceFontSize}px Arial, sans-serif`;
  const priceWidth = Math.min(priceMaxWidth, ctx.measureText(input.priceLabel).width + 64);
  ctx.fillStyle = COLORS.green;
  roundedRect(ctx, pad, priceTop, priceWidth, priceHeight, priceHeight / 2);
  ctx.fill();
  ctx.fillStyle = COLORS.white;
  ctx.fillText(input.priceLabel, pad + 32, priceTop + priceHeight * 0.69, priceWidth - 64);

  ctx.fillStyle = COLORS.white;
  ctx.font = '700 27px Arial, sans-serif';
  ctx.fillText(input.locationLabel, pad, priceTop + priceHeight + 43, width * 0.58);

  const qrSize = 190;
  const qrPanelPad = 18;
  const qrPanelWidth = qrSize + qrPanelPad * 2;
  const qrPanelHeight = qrSize + qrPanelPad * 2 + 48;
  const qrPanelX = width - pad - qrPanelWidth;
  const qrPanelY = height - pad - qrPanelHeight;
  ctx.fillStyle = 'rgba(19,34,58,0.92)';
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  roundedRect(ctx, qrPanelX, qrPanelY, qrPanelWidth, qrPanelHeight, 28);
  ctx.fill();
  ctx.stroke();
  drawQrBlock(ctx, qr, qrPanelX + qrPanelPad, qrPanelY + qrPanelPad, qrSize);

  ctx.fillStyle = COLORS.white;
  ctx.font = '800 23px Arial, sans-serif';
  ctx.fillText('ACESSE O ANUNCIO', pad, height - pad - 45);
  ctx.fillStyle = COLORS.greenBright;
  ctx.font = '800 25px Arial, sans-serif';
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
  if (story) {
    renderImpactStory(ctx, width, height, image, logo, qr, input);
    return;
  }

  const pad = width * (landscape ? 0.05 : 0.07);
  drawImageCover(ctx, image, 0, 0, width, height);

  // Mantem a foto viva e concentra o contraste somente onde o texto precisa dele.
  const gradient = landscape
    ? ctx.createLinearGradient(0, 0, width * 0.82, 0)
    : ctx.createLinearGradient(0, height * 0.18, 0, height);
  gradient.addColorStop(0, landscape ? 'rgba(5,16,30,0.93)' : 'rgba(5,16,30,0.02)');
  gradient.addColorStop(landscape ? 0.66 : 0.38, landscape ? 'rgba(5,16,30,0.68)' : 'rgba(5,16,30,0.10)');
  gradient.addColorStop(1, landscape ? 'rgba(5,16,30,0.04)' : 'rgba(5,16,30,0.96)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Marca em uma placa clara: legivel em qualquer fotografia, sem selo promocional solto.
  const brandCardWidth = landscape ? 230 : 292;
  const brandCardHeight = landscape ? 78 : 108;
  ctx.save();
  ctx.shadowColor = 'rgba(2, 6, 23, 0.26)';
  ctx.shadowBlur = landscape ? 18 : 26;
  ctx.shadowOffsetY = landscape ? 7 : 10;
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  roundedRect(ctx, pad, pad, brandCardWidth, brandCardHeight, landscape ? 18 : 24);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = COLORS.slate;
  ctx.font = `800 ${landscape ? 12 : 15}px Arial, sans-serif`;
  ctx.fillText('ANUNCIADO NA', pad + (landscape ? 16 : 20), pad + (landscape ? 21 : 28));
  drawBrand(
    ctx,
    logo,
    pad + (landscape ? 16 : 20),
    pad + (landscape ? 32 : 43),
    landscape ? 162 : 205,
  );

  const titleLength = input.title.trim().length;
  const titleSize = story
    ? titleLength > 80 ? 52 : titleLength > 52 ? 60 : 68
    : landscape
      ? titleLength > 80 ? 34 : titleLength > 52 ? 40 : 46
      : titleLength > 80 ? 42 : titleLength > 52 ? 49 : 57;
  ctx.fillStyle = COLORS.white;
  ctx.font = `900 ${titleSize}px Arial, sans-serif`;
  const maxWidth = landscape ? width * 0.53 : width - pad * 2;
  const titleY = story ? height * 0.49 : landscape ? height * 0.31 : height * 0.46;
  const maxTitleLines = landscape ? 2 : 3;
  const lines = getWrappedLines(ctx, input.title, maxWidth, maxTitleLines);
  const titleLineHeight = titleSize * 1.06;
  drawLines(ctx, lines, pad, titleY, titleLineHeight);

  // O preco vira o segundo ponto de atencao, dentro de uma faixa consistente.
  const priceFontSize = story ? 54 : landscape ? 32 : 43;
  const priceLineHeight = story ? 88 : landscape ? 58 : 72;
  const priceTop = titleY + lines.length * titleLineHeight + (story ? 48 : landscape ? 24 : 34);
  ctx.font = `900 ${priceFontSize}px Arial, sans-serif`;
  const priceWidth = Math.min(
    maxWidth,
    ctx.measureText(input.priceLabel).width + (story ? 64 : landscape ? 42 : 52),
  );
  ctx.fillStyle = COLORS.green;
  roundedRect(ctx, pad, priceTop, priceWidth, priceLineHeight, priceLineHeight / 2);
  ctx.fill();
  ctx.fillStyle = COLORS.white;
  ctx.font = `900 ${priceFontSize}px Arial, sans-serif`;
  ctx.fillText(
    input.priceLabel,
    pad + (story ? 32 : landscape ? 21 : 26),
    priceTop + priceLineHeight * 0.69,
  );

  const locationY = priceTop + priceLineHeight + (story ? 44 : landscape ? 30 : 35);
  ctx.fillStyle = COLORS.white;
  ctx.font = `700 ${story ? 28 : landscape ? 19 : 23}px Arial, sans-serif`;
  ctx.fillText(input.locationLabel, pad, locationY);

  // QR e chamada formam um unico bloco, evitando que parecam elementos desconectados.
  const qrSize = story ? 218 : landscape ? 136 : 164;
  const qrPanelPad = story ? 18 : landscape ? 12 : 14;
  const qrPanelWidth = qrSize + qrPanelPad * 2;
  const qrPanelHeight = qrSize + qrPanelPad * 2 + (story ? 48 : landscape ? 31 : 38);
  const qrPanelX = width - pad - qrPanelWidth;
  const qrPanelY = height - pad - qrPanelHeight;
  ctx.fillStyle = 'rgba(11,23,43,0.90)';
  roundedRect(ctx, qrPanelX, qrPanelY, qrPanelWidth, qrPanelHeight, story ? 28 : 20);
  ctx.fill();
  drawQrBlock(ctx, qr, qrPanelX + qrPanelPad, qrPanelY + qrPanelPad, qrSize);

  ctx.fillStyle = COLORS.white;
  ctx.font = `800 ${story ? 23 : landscape ? 16 : 19}px Arial, sans-serif`;
  ctx.fillText('ACESSE O ANUNCIO', pad, height - pad - (story ? 45 : landscape ? 27 : 34));
  ctx.fillStyle = COLORS.greenBright;
  ctx.font = `800 ${story ? 25 : landscape ? 17 : 21}px Arial, sans-serif`;
  ctx.fillText('agrobw.com.br', pad, height - pad);
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
