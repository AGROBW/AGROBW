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
  const overscan = Math.max(18, Math.round(Math.min(width, height) * 0.04));

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();

  // O fundo preenche a area sem obrigar o recorte da fotografia principal.
  ctx.filter = `blur(${Math.round(overscan * 0.65)}px)`;
  drawImageCover(
    ctx,
    image,
    x - overscan,
    y - overscan,
    width + overscan * 2,
    height + overscan * 2,
  );
  ctx.filter = 'none';
  ctx.fillStyle = 'rgba(5,16,30,0.28)';
  ctx.fillRect(x, y, width, height);

  drawImageContain(ctx, image, x, y, width, height);
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
  const pad = width * (landscape ? 0.045 : 0.055);
  const footerHeight = story ? 250 : landscape ? 112 : 166;
  const footerY = height - footerHeight;

  ctx.fillStyle = COLORS.navy;
  ctx.fillRect(0, 0, width, height);

  if (story) {
    drawShowcasePhoto(ctx, image, 0, 0, width, footerY * 0.58);

    // Nos Stories, a fotografia ocupa o topo e o conteudo fica protegido na metade inferior.
    const panelTop = height * 0.39;
    const panelGradient = ctx.createLinearGradient(0, panelTop - 100, 0, footerY);
    panelGradient.addColorStop(0, 'rgba(11,23,43,0)');
    panelGradient.addColorStop(0.2, 'rgba(11,23,43,0.88)');
    panelGradient.addColorStop(1, COLORS.navy);
    ctx.fillStyle = panelGradient;
    ctx.fillRect(0, panelTop - 100, width, footerY - panelTop + 100);
    ctx.strokeStyle = COLORS.greenBright;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(0, panelTop);
    ctx.lineTo(width, panelTop - 72);
    ctx.stroke();
  } else {
    const photoX = landscape ? width * 0.34 : width * 0.34;
    drawShowcasePhoto(ctx, image, photoX, 0, width - photoX, footerY);

    // O recorte diagonal preserva a leitura editorial sem cobrir a fotografia inteira.
    const panelTopX = landscape ? width * 0.39 : width * 0.39;
    const panelBottomX = landscape ? width * 0.45 : width * 0.47;
    ctx.fillStyle = 'rgba(11,23,43,0.97)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(panelTopX, 0);
    ctx.lineTo(panelBottomX, footerY);
    ctx.lineTo(0, footerY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = COLORS.greenBright;
    ctx.lineWidth = landscape ? 6 : 8;
    ctx.beginPath();
    ctx.moveTo(panelTopX, 0);
    ctx.lineTo(panelBottomX, footerY);
    ctx.stroke();

    const photoShade = ctx.createLinearGradient(width * 0.39, 0, width, footerY);
    photoShade.addColorStop(0, 'rgba(11,23,43,0.30)');
    photoShade.addColorStop(0.55, 'rgba(11,23,43,0)');
    photoShade.addColorStop(1, 'rgba(11,23,43,0.16)');
    ctx.fillStyle = photoShade;
    ctx.fillRect(width * 0.34, 0, width * 0.66, footerY);
  }

  const brandX = pad;
  const brandY = story ? pad : pad * 0.85;
  drawBrand(ctx, logo, brandX, brandY, story ? 235 : landscape ? 190 : 220);

  const badgeY = story ? height * 0.43 : landscape ? height * 0.20 : height * 0.20;
  const badgeHeight = story ? 58 : landscape ? 34 : 44;
  ctx.strokeStyle = COLORS.greenBright;
  ctx.lineWidth = story ? 4 : 3;
  roundedRect(ctx, pad, badgeY, story ? 360 : landscape ? 245 : 300, badgeHeight, badgeHeight / 2);
  ctx.stroke();
  ctx.fillStyle = COLORS.greenBright;
  ctx.font = `900 ${story ? 24 : landscape ? 15 : 19}px Arial, sans-serif`;
  ctx.fillText('ANUNCIADO NA AGRO BW', pad + (story ? 25 : landscape ? 16 : 20), badgeY + badgeHeight * 0.69);

  const titleLength = input.title.trim().length;
  const titleSize = story
    ? titleLength > 80 ? 46 : titleLength > 52 ? 55 : 66
    : landscape
      ? titleLength > 80 ? 25 : titleLength > 52 ? 30 : 38
      : titleLength > 80 ? 35 : titleLength > 52 ? 43 : 56;
  const titleY = story ? badgeY + 115 : landscape ? badgeY + 75 : badgeY + 100;
  const titleWidth = story ? width - pad * 2 : landscape ? width * 0.32 : width * 0.34;
  ctx.fillStyle = COLORS.white;
  ctx.font = `900 ${titleSize}px Arial, sans-serif`;
  const titleLines = getWrappedLines(ctx, input.title, titleWidth, story ? 4 : landscape ? 4 : 5);
  const titleLineHeight = titleSize * 1.05;
  drawLines(ctx, titleLines, pad, titleY, titleLineHeight);

  const priceCardY = titleY + titleLines.length * titleLineHeight + (story ? 55 : landscape ? 25 : 36);
  const priceCardWidth = story ? width - pad * 2 : landscape ? width * 0.38 : width * 0.41;
  const priceCardHeight = story ? 185 : landscape ? 105 : 140;
  ctx.fillStyle = 'rgba(19,34,58,0.92)';
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 2;
  roundedRect(ctx, pad, priceCardY, priceCardWidth, priceCardHeight, story ? 30 : 22);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#cbd5e1';
  ctx.font = `800 ${story ? 22 : landscape ? 13 : 17}px Arial, sans-serif`;
  ctx.fillText('PRECO DO ANUNCIO', pad + (story ? 30 : 22), priceCardY + (story ? 42 : landscape ? 27 : 34));
  ctx.fillStyle = COLORS.greenBright;
  ctx.font = `900 ${story ? 53 : landscape ? 29 : 41}px Arial, sans-serif`;
  ctx.fillText(input.priceLabel, pad + (story ? 30 : 22), priceCardY + (story ? 105 : landscape ? 63 : 82));
  ctx.fillStyle = COLORS.white;
  ctx.font = `700 ${story ? 27 : landscape ? 16 : 21}px Arial, sans-serif`;
  ctx.fillText(input.locationLabel, pad + (story ? 30 : 22), priceCardY + (story ? 151 : landscape ? 88 : 116));

  // Rodape branco une acesso, endereco e QR Code sem incluir contato ou promessa comercial.
  ctx.fillStyle = 'rgba(255,255,255,0.97)';
  ctx.fillRect(0, footerY, width, footerHeight);
  ctx.fillStyle = COLORS.green;
  ctx.fillRect(0, footerY, width, story ? 8 : 6);

  const qrSize = story ? 190 : landscape ? 88 : 128;
  const qrX = width - pad - qrSize;
  const qrY = footerY + (footerHeight - qrSize) / 2;
  drawQrOnly(ctx, qr, qrX, qrY, qrSize);

  const footerTextX = pad;
  ctx.fillStyle = COLORS.navy;
  ctx.font = `900 ${story ? 34 : landscape ? 20 : 27}px Arial, sans-serif`;
  ctx.fillText('VEJA O ANUNCIO COMPLETO', footerTextX, footerY + (story ? 78 : landscape ? 43 : 62));
  ctx.fillStyle = COLORS.green;
  ctx.font = `800 ${story ? 28 : landscape ? 17 : 22}px Arial, sans-serif`;
  ctx.fillText('agrobw.com.br', footerTextX, footerY + (story ? 128 : landscape ? 72 : 101));
  ctx.fillStyle = COLORS.slate;
  ctx.font = `600 ${story ? 22 : landscape ? 13 : 17}px Arial, sans-serif`;
  ctx.fillText('Aponte a camera para o QR Code', footerTextX, footerY + (story ? 174 : landscape ? 96 : 135));
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
