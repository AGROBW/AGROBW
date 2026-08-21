import { supabase } from '../lib/supabaseClient';
import { appError, appWarn } from '../utils/appLogger';

/**
 * Service para upload otimizado de imagens de banners
 * - Redimensiona automaticamente para 1920x640px
 * - Converte para WebP
 * - Comprime para < 200kb
 */

interface UploadResult {
  url: string | null;
  error: string | null;
}

/**
 * Redimensiona e converte imagem para WebP
 */
const optimizeImage = async (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        // Dimensões alvo
        const targetWidth = 1920;
        const targetHeight = 640;
        
        // Criar canvas
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Não foi possível criar contexto do canvas'));
          return;
        }
        
        // Calcular dimensões mantendo proporção
        const scale = Math.max(targetWidth / img.width, targetHeight / img.height);
        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;
        
        // Centralizar imagem
        const x = (targetWidth - scaledWidth) / 2;
        const y = (targetHeight - scaledHeight) / 2;
        
        // Desenhar imagem no canvas
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
        
        // Converter para WebP com compressão
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Erro ao converter imagem'));
            }
          },
          'image/webp',
          0.85 // Qualidade 85%
        );
      };
      
      img.onerror = () => reject(new Error('Erro ao carregar imagem'));
      img.src = e.target?.result as string;
    };
    
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
    reader.readAsDataURL(file);
  });
};

/**
 * Faz upload de banner otimizado para o Supabase Storage
 */
export const uploadBannerImage = async (file: File): Promise<UploadResult> => {
  try {
    // Validar tipo de arquivo
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      return {
        url: null,
        error: 'Formato inválido. Use JPG, PNG ou WebP.'
      };
    }
    
    // Validar tamanho (máx 10MB antes da otimização)
    if (file.size > 10 * 1024 * 1024) {
      return {
        url: null,
        error: 'Arquivo muito grande. Máximo 10MB.'
      };
    }
    
    // Otimizar imagem
    const optimizedBlob = await optimizeImage(file);
    
    // Verificar tamanho final
    if (optimizedBlob.size > 250 * 1024) {
      appWarn('[uploadBanner] Imagem otimizada ainda está acima de 200kb', {
        optimizedSize: optimizedBlob.size,
        fileName: file.name,
        fileType: file.type,
        originalSize: file.size,
      });
    }
    
    // Gerar nome único
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(7);
    const fileName = `banner-${timestamp}-${randomStr}.webp`;
    
    // Upload para Supabase Storage
    const { data, error } = await supabase.storage
      .from('banners')
      .upload(fileName, optimizedBlob, {
        contentType: 'image/webp',
        cacheControl: '3600',
        upsert: false
      });
    
    if (error) {
      appError('[uploadBanner] Erro no upload', error, {
        fileName,
        fileType: file.type,
      });
      return {
        url: null,
        error: error.message
      };
    }
    
    // Obter URL pública
    const { data: { publicUrl } } = supabase.storage
      .from('banners')
      .getPublicUrl(fileName);
    
    return {
      url: publicUrl,
      error: null
    };
    
  } catch (err: any) {
    appError('[uploadBanner] Erro ao processar imagem', err, {
      fileName: file.name,
      fileType: file.type,
      originalSize: file.size,
    });
    return {
      url: null,
      error: err.message || 'Erro ao fazer upload da imagem'
    };
  }
};

/**
 * Lê as dimensões (px) de um arquivo de imagem sem enviá-lo.
 */
const readImageSize = (file: File): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = () => reject(new Error('Erro ao carregar imagem'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
    reader.readAsDataURL(file);
  });

/**
 * Otimiza a arte mobile/tablet PRESERVANDO a proporção original (sem recorte),
 * apenas limitando a largura máxima e convertendo para WebP. Diferente de
 * optimizeImage(), NÃO força 1920x640 — a arte quadrada precisa aparecer inteira.
 */
const optimizeMobileImage = async (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxWidth = 1080; // resolução recomendada; mantém a proporção da arte
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Não foi possível criar contexto do canvas'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Erro ao converter imagem'))),
          'image/webp',
          0.85
        );
      };
      img.onerror = () => reject(new Error('Erro ao carregar imagem'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
    reader.readAsDataURL(file);
  });
};

/**
 * Valida (proporção ~1:1 APROXIMADA + resolução mínima, sem exigir dimensão exata)
 * e otimiza a arte mobile/tablet para WebP PRESERVANDO a proporção. NÃO faz upload —
 * retorna o Blob pronto, para ser reutilizado com diferentes buckets/caminhos.
 */
export const prepareMobileBannerBlob = async (
  file: File
): Promise<{ blob: Blob | null; error: string | null }> => {
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    return { blob: null, error: 'Formato inválido. Use JPG, PNG ou WebP.' };
  }

  if (file.size > 10 * 1024 * 1024) {
    return { blob: null, error: 'Arquivo muito grande. Máximo 10MB.' };
  }

  // Validação aproximada (1:1) + resolução mínima. Não exige dimensão exata.
  const { width, height } = await readImageSize(file);
  const MIN_WIDTH = 900;
  const MIN_HEIGHT = 900;
  if (width < MIN_WIDTH || height < MIN_HEIGHT) {
    return {
      blob: null,
      error: `Resolução muito baixa. Use ao menos ${MIN_WIDTH}x${MIN_HEIGHT}px (recomendado 1080x1080).`,
    };
  }
  const ratio = width / height;
  const target = 1;
  // Tolerância de 10% para aceitar pequenas variações sem comprometer o encaixe.
  if (ratio < target * 0.9 || ratio > target * 1.1) {
    return {
      blob: null,
      error: 'Proporção fora do recomendado (~1:1). Envie algo próximo de 1080x1080 para preencher melhor o celular.',
    };
  }

  const blob = await optimizeMobileImage(file);
  if (blob.size > 300 * 1024) {
    appWarn('[prepareMobileBanner] Imagem otimizada acima de 300kb', {
      optimizedSize: blob.size,
      fileName: file.name,
      fileType: file.type,
      originalSize: file.size,
    });
  }
  return { blob, error: null };
};

/**
 * Prepara (valida + otimiza p/ WebP, preservando a proporção) e faz upload da arte
 * mobile/tablet para o bucket e caminho informados. Reutilizável por Banners Home
 * (bucket "banners") e Patrocinadores (bucket "layout_assets", caminho
 * "site-sponsors/banner-mobile-*"). O arquivo antigo NÃO é apagado aqui — a nova URL
 * é retornada e só então persistida pelo chamador (nunca apaga antes de salvar).
 */
export const uploadMobileBannerAsset = async (
  file: File,
  target: { bucket: string; path: string }
): Promise<UploadResult> => {
  try {
    const { blob, error } = await prepareMobileBannerBlob(file);
    if (error || !blob) {
      return { url: null, error: error ?? 'Erro ao preparar imagem.' };
    }

    const { error: uploadError } = await supabase.storage
      .from(target.bucket)
      .upload(target.path, blob, {
        contentType: 'image/webp',
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      appError('[uploadMobileBanner] Erro no upload', uploadError, {
        bucket: target.bucket,
        path: target.path,
      });
      return { url: null, error: uploadError.message };
    }

    const { data: { publicUrl } } = supabase.storage.from(target.bucket).getPublicUrl(target.path);
    return { url: publicUrl, error: null };
  } catch (err: any) {
    appError('[uploadMobileBanner] Erro ao processar imagem', err, {
      fileName: file.name,
      fileType: file.type,
      originalSize: file.size,
    });
    return { url: null, error: err.message || 'Erro ao fazer upload da imagem' };
  }
};

/**
 * Upload da arte mobile/tablet do banner da Home (bucket "banners", nome banner-mobile-*).
 */
export const uploadBannerMobileImage = (file: File): Promise<UploadResult> => {
  const fileName = `banner-mobile-${Date.now()}-${Math.random().toString(36).substring(7)}.webp`;
  return uploadMobileBannerAsset(file, { bucket: 'banners', path: fileName });
};

/**
 * Deleta imagem do storage
 */
export const deleteBannerImage = async (imageUrl: string): Promise<{ error: string | null }> => {
  try {
    // Extrair path da URL
    if (!imageUrl.includes('supabase.co/storage')) {
      return { error: 'URL inválida' };
    }
    
    const path = imageUrl.split('/banners/')[1];
    if (!path) {
      return { error: 'Path não encontrado na URL' };
    }
    
    const { error } = await supabase.storage
      .from('banners')
      .remove([path]);
    
    if (error) {
      appError('[deleteBannerImage] Erro ao remover imagem do bucket', error, {
        path,
      });
      return { error: error.message };
    }
    
    return { error: null };
    
  } catch (err: any) {
    appError('[deleteBannerImage] Erro ao deletar imagem de banner', err, {
      imageUrl,
    });
    return { error: err.message };
  }
};
