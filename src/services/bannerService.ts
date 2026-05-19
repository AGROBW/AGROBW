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
