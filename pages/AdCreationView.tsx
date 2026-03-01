
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CATEGORIES } from '../constants';
import AdCard from '../components/AdCard';
import { AdStatus } from '../types';
import { usePlanCheck } from '../src/hooks/usePlanCheck';
import { useSubscription } from '../src/hooks/useSubscription';
import { useAuth } from '../src/contexts/AuthContext';
import { supabase } from '../src/lib/supabaseClient';
import { toast } from 'sonner';
import { Trash2, GripVertical, AlertCircle } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { motion } from 'framer-motion';
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type Step = 'CATEGORY' | 'DETAILS' | 'MEDIA' | 'PRICING' | 'REVIEW' | 'SUCCESS';
type ImageItem = {
  id: string;
  previewUrl: string;
  publicUrl?: string;
  storagePath?: string;
  uploading: boolean;
  progress: number;
  originalFile?: File;
};

const SortableImageItem: React.FC<{
  item: ImageItem;
  index: number;
  onRemove: (item: ImageItem) => void;
}> = ({ item, index, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  } as React.CSSProperties;

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      layout
      className={`relative aspect-square rounded-2xl overflow-hidden border-2 shadow-sm transition-all ${isDragging ? 'border-green-600' : 'border-slate-200'} ${index === 0 ? 'ring-2 ring-green-500 border-green-500' : ''}`}
    >
      <img src={item.previewUrl || item.publicUrl} className="w-full h-full object-cover" />
      {index === 0 && (
        <div className="absolute top-2 left-2 bg-green-600 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase border border-yellow-300 shadow">CAPA</div>
      )}
      {item.uploading && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {item.uploading && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/40 p-2">
          <div className="w-full h-1.5 bg-white/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-400 transition-all"
              style={{ width: `${Math.max(5, item.progress)}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-white font-bold text-center">{item.progress}%</p>
        </div>
      )}
      <button
        type="button"
        onClick={() => onRemove(item)}
        className="absolute top-2 right-2 bg-white/90 p-2 rounded-full text-slate-700 hover:text-red-600"
        aria-label="Remover imagem"
      >
        <Trash2 className="w-4 h-4" />
      </button>
      <button
        type="button"
        className="absolute bottom-2 left-2 bg-white/90 p-2 rounded-full text-slate-700 cursor-grab active:cursor-grabbing"
        aria-label="Arrastar imagem"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>
    </motion.div>
  );
};

const AdCreationView: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { handleAction } = usePlanCheck();
  const { subscription, usage, canCreateAd, adLimitMessage, refreshUsage } = useSubscription();
  
  // A rota já é protegida pelo RequireAuth no App.tsx.
  if (!user) return null;

  const [currentStep, setCurrentStep] = useState<Step>('CATEGORY');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [imageItems, setImageItems] = useState<ImageItem[]>([]);
  const [draftAdId, setDraftAdId] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isCreatingDraft = useRef(false);
  const draftIdRef = useRef<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );
  const [dbCategories, setDbCategories] = useState<Array<{ id: string; name: string; slug: string; icon?: string | null; technical_fields_schema?: any[] }>>([]);
  const [dbSubcategories, setDbSubcategories] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [technicalFieldsSchema, setTechnicalFieldsSchema] = useState<any[]>([]);
  const [formData, setFormData] = useState<any>({
    title: '',
    description: '',
    price: 0,
    priceNegotiable: false,
    categoryId: '',
    categorySlug: '',
    subCategoryId: '',
    subCategoryLabel: '',
    quantity: 1,
    unit: 'Unidade',
    unitPrice: 0,
    currency: 'BRL',
    location: { cep: '', city: '', state: '' },
    technical: {},
    images: [],
    isPremium: false
  });

  // Persistência de rascunho
  useEffect(() => {
    const draft = localStorage.getItem('bwagro_ad_draft');
    if (draft) setFormData(JSON.parse(draft));
    const draftId = localStorage.getItem('bwagro_ad_draft_id');
    if (draftId) setDraftAdId(draftId);
  }, []);

  useEffect(() => {
    const loadCategories = async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id,name,slug,icon,technical_fields_schema')
        .order('name', { ascending: true });
      if (!error && data) {
        setDbCategories(data as Array<{ id: string; name: string; slug: string; icon?: string | null; technical_fields_schema?: any[] }>);
      }
    };
    loadCategories();
  }, []);

  // Atualizar schema de campos técnicos quando categoria mudar
  useEffect(() => {
    if (formData.categoryId) {
      const selectedCategory = dbCategories.find(cat => cat.id === formData.categoryId);
      console.log('[Debug] Categoria selecionada:', selectedCategory?.name, selectedCategory?.slug);
      
      if (selectedCategory?.technical_fields_schema) {
        console.log('[Debug] Schema de campos técnicos carregado:', selectedCategory.technical_fields_schema);
        setTechnicalFieldsSchema(selectedCategory.technical_fields_schema);
      } else {
        console.log('[Debug] Nenhum schema de campos técnicos definido para esta categoria');
        setTechnicalFieldsSchema([]);
      }
    } else {
      setTechnicalFieldsSchema([]);
    }
  }, [formData.categoryId, dbCategories]);

  const categoryIcons: Record<string, string> = {
    animais: '🐂',
    maquinas: '⚙️',
    insumos: '🧪',
    imoveis: '🏡',
    servicos: '🛠️',
    sementes: '🌱',
    pecas: '🔩',
    'maquinas-equipamentos': '🚜',
    implementos: '🧰',
    fazendas: '🌾',
    'imoveis-rurais': '🏡',
    'armazenagem-de-produtos': '🏬',
    'alimentos-em-geral': '🥕',
    'arvores-adultas-mudas': '🌳',
    'tratores-agricolas': '🚜',
    'maquinas-pesadas': '🚧',
    'fertilizantes-agricolas': '🧫',
    'colheitadeiras-colhedoras': '🌾',
    'alimentos-para-nutricao-animal': '🐄'
  };

  useEffect(() => {
    const loadSubcategories = async () => {
      if (!formData.categoryId) {
        setDbSubcategories([]);
        return;
      }
      const { data, error } = await supabase
        .from('subcategories')
        .select('id,name,slug')
        .eq('category_id', formData.categoryId)
        .order('name', { ascending: true });
      if (!error && data) {
        setDbSubcategories(data as Array<{ id: string; name: string; slug: string }>);
      } else {
        setDbSubcategories([]);
      }
    };
    loadSubcategories();
  }, [formData.categoryId]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('bwagro_ad_draft', JSON.stringify(formData));
  }, [formData]);

  useEffect(() => {
    if (imageItems.length === 0 && Array.isArray(formData.images) && formData.images.length > 0) {
      setImageItems(formData.images.slice(0, 9).map((url: string, index: number) => ({
        id: `${Date.now()}-${index}`,
        previewUrl: url,
        publicUrl: url,
        storagePath: extractStoragePath(url) || undefined,
        uploading: false,
        progress: 100
      })));
    }
  }, [formData.images, imageItems.length]);

  useEffect(() => {
    return () => {
      imageItems.forEach(item => {
        if (item.previewUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
    };
  }, [imageItems]);

  const maskCep = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 5) return digits;
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  };

  const handleCepLookup = async (cleanCep: string) => {
    if (cleanCep.length === 8) {
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await response.json();
        if (!data.erro) {
          setFormData(prev => ({
            ...prev,
            location: { ...prev.location, cep: maskCep(cleanCep), city: data.localidade, state: data.uf }
          }));
        }
      } catch (e) { console.error("CEP error"); }
    }
  };

  const handleCepChange = (value: string) => {
    const masked = maskCep(value);
    setFormData(prev => ({
      ...prev,
      location: { ...prev.location, cep: masked }
    }));
    const cleanCep = masked.replace(/\D/g, '');
    if (cleanCep.length === 8) handleCepLookup(cleanCep);
  };

  const handleCepBlur = () => {
    const cleanCep = (formData.location?.cep || '').replace(/\D/g, '');
    if (cleanCep.length === 8) handleCepLookup(cleanCep);
  };

  const slugify = (value: string) => value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

  const resolveCategoryId = async () => {
    if (isUuid(formData.categoryId)) return formData.categoryId;
    if (!formData.categorySlug) {
      toast.error('Erro interno: Slug da categoria ausente. Recarregue a página.');
      return null;
    }
    const { data, error } = await supabase
      .from('categories')
      .select('id')
      .eq('slug', formData.categorySlug)
      .single();
    if (error || !data?.id) {
      toast.error('Categoria não encontrada no banco.');
      return null;
    }
    return data.id as string;
  };

  const resolveSubCategoryId = async (categoryId: string | null) => {
    if (!formData.subCategoryId) return null;
    if (isUuid(formData.subCategoryId)) return formData.subCategoryId;
    if (!categoryId) return null;

    const slug = formData.subCategoryId;
    const { data, error } = await supabase
      .from('subcategories')
      .select('id')
      .eq('category_id', categoryId)
      .eq('slug', slug)
      .limit(1)
      .maybeSingle();

    if (error || !data?.id) return null;
    return data.id as string;
  };

  const handleCategorySelect = async (cat: { id: string; name: string; slug: string }) => {
    setFormData(prev => ({
      ...prev,
      categoryId: cat.id,
      categorySlug: cat.slug,
      subCategoryId: '',
      subCategoryLabel: ''
    }));
    setCurrentStep('DETAILS');
  };

  const extractStoragePath = (publicUrl: string) => {
    const marker = '/ads-images/';
    const index = publicUrl.indexOf(marker);
    if (index === -1) return null;
    return publicUrl.substring(index + marker.length);
  };

  const ensureDraftAd = async (images: string[]) => {
    if (!user?.id) return null;
    if (draftIdRef.current) return draftIdRef.current;

    // Singleton pattern: se já está criando, aguarda o ID
    if (isCreatingDraft.current) {
      console.log('[Draft] Aguardando criação do rascunho...');
      // Aguarda até 5 segundos pelo ID (50 tentativas x 100ms)
      for (let i = 0; i < 50; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (draftIdRef.current) {
          console.log('[Draft] ID encontrado após aguardar:', draftIdRef.current);
          return draftIdRef.current;
        }
      }
      console.error('[Draft] Timeout ao aguardar ID do rascunho (5s)');
      return null;
    }

    // Bloquear outras tentativas
    isCreatingDraft.current = true;
    console.log('[Draft] Iniciando criação de rascunho único...');

    const numericPrice = parseFloat(String(formData.price || 0).replace(/[^0-9.,]/g, '').replace(/\./g, '').replace(',', '.'));
    const numericUnitPrice = parseFloat(String(formData.unitPrice || 0).replace(/[^0-9.,]/g, '').replace(/\./g, '').replace(',', '.'));
    const resolvedCategoryId = await resolveCategoryId();
    const resolvedSubCategoryId = await resolveSubCategoryId(resolvedCategoryId);

    if (!resolvedCategoryId) {
      isCreatingDraft.current = false;
      return null;
    }
    const payload = {
      title: formData.title || 'Rascunho',
      description: formData.description || 'Rascunho',
      price: Number.isNaN(numericPrice) ? 0 : numericPrice,
      unit_price: Number.isNaN(numericUnitPrice) ? 0 : numericUnitPrice,
      quantity: Number.isNaN(Number(formData.quantity)) ? 0 : Number(formData.quantity),
      unit: formData.unit || 'Unidade',
      currency: formData.currency || 'BRL',
      category_id: resolvedCategoryId,
      category_slug: formData.categorySlug,
      sub_category_id: resolvedSubCategoryId,
      sub_category_label: formData.subCategoryLabel || null,
      city: formData.location?.city || 'A definir',
      state: formData.location?.state || '--',
      cep: (formData.location?.cep || '').replace(/\D/g, '') || null,
      images,
      user_id: user.id,
      status: AdStatus.PENDING,
      is_premium: !!formData.isPremium,
      whatsapp: user?.whatsapp || user?.phone || null
    };

    const { data, error } = await supabase
      .from('announcements')
      .insert(payload)
      .select('id')
      .single();

    console.log('[Draft] Resposta do insert:', { data, error });
    if (error) {
      console.error('[Draft] Erro detalhado:', error.message, error.details, error.hint);
    }

    if (error) {
      isCreatingDraft.current = false;
      toast.error('Falha ao salvar rascunho.', { description: error.message });
      return null;
    }

    const newId = data?.id ?? null;
    if (newId) {
      draftIdRef.current = newId;
      setDraftAdId(newId);
      localStorage.setItem('bwagro_ad_draft_id', newId);
      console.log('[Draft] Rascunho criado com sucesso:', newId);
    }
    
    // Liberar bloqueio
    isCreatingDraft.current = false;
    return newId;
  };

  const compressImage = async (file: File) => {
    const options = {
      maxSizeMB: 1,
      maxWidthOrHeight: 1200,
      useWebWorker: true,
      initialQuality: 0.8,
      fileType: 'image/webp'
    };
    try {
      const compressed = await imageCompression(file, options);
      const nextName = file.name.replace(/\.[^/.]+$/, '.webp');
      const compressedFile = new File([compressed], nextName, { type: 'image/webp' });
      return compressedFile;
    } catch (err) {
      console.error('[Ads] Erro ao comprimir imagem:', err);
      return file;
    }
  };

  const syncDraftImages = async (images: string[]) => {
    const currentDraftId = await ensureDraftAd(images);
    if (!currentDraftId) {
      console.warn('[Ads] Rascunho não salvo, mas fotos permanecem no estado local.');
      return;
    }
    const { error } = await supabase
      .from('announcements')
      .update({ images })
      .eq('id', currentDraftId);

    if (error) {
      console.error('[Ads] Erro ao atualizar imagens do rascunho:', error);
    }
  };

  const handleImagesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!user?.id) {
      toast.error('Sessão inválida. Faça login novamente.');
      return;
    }

    const availableSlots = 9 - imageItems.length;
    const fileArray = Array.from(files).slice(0, Math.max(availableSlots, 0));
    
    console.log('[Debug Ads] Iniciando upload', { files: fileArray.length, categoryId: formData.categoryId });

    if (fileArray.length === 0) {
      toast.error('Limite de 9 imagens atingido.');
      return;
    }

    if (files.length > fileArray.length) {
      toast.info('Algumas imagens foram ignoradas para respeitar o limite de 9.');
    }

    // CRIAR PREVIEW INSTANTÂNEO ANTES DE QUALQUER AWAIT
    const previewItems = fileArray.map(file => ({
      id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 7)}`,
      previewUrl: URL.createObjectURL(file),
      uploading: true,
      progress: 0,
      originalFile: file
    }));

    if (isMountedRef.current) {
      setImageItems(prev => [...prev, ...previewItems]);
      setIsUploadingImages(true);
    }

    // VALIDAR CATEGORIA APÓS MOSTRAR PREVIEW
    if (!formData.categoryId) {
      const resolvedCategoryId = await resolveCategoryId();
      if (!resolvedCategoryId) {
        toast.error('Selecione uma categoria antes de enviar imagens.');
        if (isMountedRef.current) {
          setImageItems(prev => prev.filter(item => !previewItems.find(p => p.id === item.id)));
          setIsUploadingImages(false);
        }
        return;
      }
      setFormData(prev => ({ ...prev, categoryId: resolvedCategoryId }));
    }

    try {
      for (let i = 0; i < previewItems.length; i += 1) {
        const { id: itemId, originalFile } = previewItems[i];
        if (!originalFile) continue;

        const compressedFile = await compressImage(originalFile);
        const ensuredName = compressedFile.name.endsWith('.webp')
          ? compressedFile.name
          : `${compressedFile.name}.webp`;

        const progressTimer = setInterval(() => {
          if (!isMountedRef.current) {
            clearInterval(progressTimer);
            return;
          }
          // Agrupa atualização em um único render
          setImageItems(prev => {
            const updated = prev.map(item => 
              item.id === itemId && item.progress < 90
                ? { ...item, progress: Math.min(item.progress + 7, 90) }
                : item
            );
            return updated;
          });
        }, 300);

        const safeName = ensuredName.replace(/[^a-zA-Z0-9_.-]/g, '_');
        const userSlug = slugify(user?.name || user?.email || 'usuario');
        const categorySlug = formData.categorySlug || 'categoria';
        const subCategoryLabel = formData.subCategoryLabel || '';
        const subCategorySlug = subCategoryLabel ? slugify(subCategoryLabel) : 'outros';
        const filePath = `${userSlug}/${categorySlug}/${subCategorySlug}/${Date.now()}-${user.id}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from('ads-images')
          .upload(filePath, compressedFile, { upsert: false });

        if (uploadError) {
          console.error('[Ads] Erro ao enviar imagem:', uploadError);
          const isPermission = /permission|rls|not allowed|denied|unauthorized|400/i.test(uploadError.message || '');
          toast.error(
            isPermission ? 'Permissão negada no envio.' : 'Falha ao enviar imagem.',
            { description: isPermission ? 'Tente novamente ou verifique sua conexão.' : uploadError.message }
          );
          clearInterval(progressTimer);
          if (isMountedRef.current) {
            setImageItems(prev => prev.filter(item => item.id !== itemId));
          }
          continue;
        }

        const { data } = supabase.storage
          .from('ads-images')
          .getPublicUrl(filePath);

        if (data?.publicUrl) {
          clearInterval(progressTimer);
          if (isMountedRef.current) {
            setImageItems(prev => prev.map(item => item.id === itemId
              ? { ...item, uploading: false, publicUrl: data.publicUrl, storagePath: filePath, progress: 100 }
              : item
            ));

            setFormData(prev => {
              const nextImages = [...(prev.images || []), data.publicUrl];
              void syncDraftImages(nextImages);
              return { ...prev, images: nextImages };
            });
          }
        } else {
          clearInterval(progressTimer);
          if (isMountedRef.current) {
            setImageItems(prev => prev.filter(item => item.id !== itemId));
          }
        }
      }
    } catch (err: any) {
      console.error('[Ads] Erro inesperado no upload:', err);
      toast.error('Falha ao enviar imagens.', { description: 'Tente novamente.' });
    } finally {
      if (isMountedRef.current) {
        setIsUploadingImages(false);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setImageItems(prev => {
      const oldIndex = prev.findIndex(item => item.id === active.id);
      const newIndex = prev.findIndex(item => item.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const newItems = arrayMove(prev, oldIndex, newIndex);

      const orderedUrls = newItems
        .map(item => item.publicUrl)
        .filter(Boolean) as string[];

      setFormData(current => ({ ...current, images: orderedUrls }));
      void syncDraftImages(orderedUrls);
      return newItems;
    });
  };

  const handleRemoveImage = async (item: ImageItem) => {
    if (item.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(item.previewUrl);
    }

    setImageItems(prev => prev.filter(img => img.id !== item.id));

    if (item.publicUrl) {
      setFormData(prev => {
        const nextImages = (prev.images || []).filter((url: string) => url !== item.publicUrl);
        void syncDraftImages(nextImages);
        return { ...prev, images: nextImages };
      });
    }

    const storagePath = item.storagePath || (item.publicUrl ? extractStoragePath(item.publicUrl) : null);
    if (storagePath) {
      const { error } = await supabase.storage
        .from('ads-images')
        .remove([storagePath]);
      if (error) {
        console.error('[Ads] Erro ao remover imagem:', error);
      }
    }
  };

  const handleSubmitAd = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    
    console.log('[Publish] Iniciando publicação com dados:', {
      categoryId: formData.categoryId,
      technical: formData.technical,
      technicalFieldsSchemaLength: technicalFieldsSchema.length
    });
    
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) {
        console.error('[Ads] Erro ao obter usuário autenticado:', authError);
        toast.error('Não foi possível validar seu login.');
        return;
      }

      const authUserId = authData?.user?.id;
      const userId = authUserId || user?.id;

      if (!userId) {
        console.error('[Ads] user.id nulo, cancelando insert');
        toast.error('Sessão inválida. Faça login novamente.');
        return;
      }

      if (!formData.categoryId) {
        toast.error('Selecione uma categoria para continuar.');
        return;
      }

      const cleanCep = (formData.location?.cep || '').replace(/\D/g, '');
      const numericPrice = parseFloat(String(formData.price || 0).replace(/[^0-9.,]/g, '').replace(/\./g, '').replace(',', '.'));
      const numericUnitPrice = parseFloat(String(formData.unitPrice || 0).replace(/[^0-9.,]/g, '').replace(/\./g, '').replace(',', '.'));
      const resolvedCategoryId = await resolveCategoryId();
      const resolvedSubCategoryId = await resolveSubCategoryId(resolvedCategoryId);

      if (!resolvedCategoryId) {
        toast.error('Categoria inválida. Atualize a página e tente novamente.');
        return;
      }

      // Validar localização antes de publicar
      if (!formData.location?.city || formData.location.city === 'A definir' || !formData.location?.state || formData.location.state === '--') {
        toast.error('Preencha a localização completa antes de publicar.', { description: 'Informe o CEP para autocompletar cidade e estado.' });
        return;
      }

      const payload = {
        title: formData.title,
        description: formData.description,
        price: Number.isNaN(numericPrice) ? 0 : numericPrice,
        unit_price: Number.isNaN(numericUnitPrice) ? 0 : numericUnitPrice,
        quantity: Number.isNaN(Number(formData.quantity)) ? 0 : Number(formData.quantity),
        unit: formData.unit || 'Unidade',
        currency: formData.currency || 'BRL',
        category_id: resolvedCategoryId,
        category_slug: formData.categorySlug,
        sub_category_id: resolvedSubCategoryId,
        sub_category_label: formData.subCategoryLabel || null,
        city: formData.location?.city || null,
        state: formData.location?.state || null,
        cep: cleanCep || null,
        images: Array.isArray(formData.images) ? formData.images : [],
        user_id: userId,
        status: AdStatus.ACTIVE,
        is_premium: !!formData.isPremium,
        whatsapp: user?.whatsapp || user?.phone || null
      };

      let data = null;
      let error = null;

      // Se existe rascunho, SEMPRE usar update
      if (draftAdId) {
        console.log('[Publish] Atualizando rascunho para ACTIVE:', draftAdId);
        
        const updateResult = await supabase
          .from('announcements')
          .update({ ...payload, status: AdStatus.ACTIVE })
          .eq('id', draftAdId)
          .select('*')
          .maybeSingle();

        data = updateResult.data;
        error = updateResult.error;

        if (error) {
          console.error('[Publish] Erro no update:', error);
        }
      } else {
        // Sem rascunho, fazer insert direto
        console.log('[Publish] Criando novo anúncio (sem rascunho)');
        const insertResult = await supabase
          .from('announcements')
          .insert(payload)
          .select('*')
          .maybeSingle();

        data = insertResult.data;
        error = insertResult.error;

        if (error) {
          console.error('[Publish] Erro no insert:', error);
        }
      }

      console.log('[Publish] Resultado final:', { data, error });

      if (error) {
        toast.error('Erro ao publicar anúncio.', { description: error.message });
        return;
      }

      if (!data?.id) {
        toast.error('Erro ao obter ID do anúncio publicado.');
        return;
      }

      const announcementId = data.id;
      console.log('[Publish] Anúncio publicado com sucesso:', announcementId);
      console.log('[Debug] Dados técnicos para salvar:', formData.technical);
      console.log('[Debug] Schema de campos técnicos:', technicalFieldsSchema);

      // Salvar especificações técnicas na tabela announcement_technical_details
      if (technicalFieldsSchema.length > 0 && formData.technical) {
        // Limpar detalhes técnicos antigos (caso seja edição)
        const { error: deleteError } = await supabase
          .from('announcement_technical_details')
          .delete()
          .eq('announcement_id', announcementId);

        if (deleteError) {
          console.warn('[Publish] Aviso ao limpar detalhes antigos:', deleteError);
        } else {
          console.log('[Publish] Detalhes técnicos antigos removidos (se existiam)');
        }

        const technicalDetailsToInsert = technicalFieldsSchema
          .filter(field => {
            const hasValue = formData.technical[field.key] && String(formData.technical[field.key]).trim() !== '';
            console.log(`[Debug] Campo "${field.label}" (${field.key}):`, formData.technical[field.key], '| Incluir:', hasValue);
            return hasValue;
          })
          .map(field => ({
            announcement_id: announcementId,
            label: field.label,
            value: String(formData.technical[field.key]),
            icon_name: field.icon || 'Circle'
          }));

        console.log('[Debug] Detalhes técnicos a serem inseridos:', technicalDetailsToInsert);

        if (technicalDetailsToInsert.length > 0) {
          const { error: detailsError } = await supabase
            .from('announcement_technical_details')
            .insert(technicalDetailsToInsert);

          if (detailsError) {
            console.error('[Publish] Erro ao salvar especificações técnicas:', detailsError);
            toast.error('Erro ao salvar especificações técnicas', { description: detailsError.message });
          } else {
            console.log('[Publish] Especificações técnicas salvas com sucesso:', technicalDetailsToInsert.length, 'registros');
          }
        } else {
          console.log('[Publish] Nenhuma especificação técnica para salvar (campos vazios)');
        }
      } else {
        console.log('[Publish] Schema vazio ou dados técnicos não disponíveis');
      }

      localStorage.removeItem('bwagro_ad_draft');
      localStorage.removeItem('bwagro_ad_draft_id');
      setDraftAdId(null);
      setCurrentStep('SUCCESS');
      navigate('/minha-conta/anuncios');
    } catch (error: any) {
      console.error('[Publish] Erro inesperado ao publicar anúncio:', error);
      toast.error('Erro ao publicar anúncio', {
        description: error.message || 'Tente novamente mais tarde.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const steps: Step[] = ['CATEGORY', 'DETAILS', 'MEDIA', 'PRICING', 'REVIEW'];
  const currentStepIndex = steps.indexOf(currentStep);
  const handleBack = () => {
    if (currentStepIndex <= 0) return;
    setCurrentStep(steps[currentStepIndex - 1]);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'CATEGORY':
        return (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {(dbCategories.length > 0 ? dbCategories : CATEGORIES).map(cat => (
              <button
                key={cat.id}
                onClick={() => handleCategorySelect(cat)}
                className={`p-8 rounded-[2rem] border-2 transition-all text-center group ${formData.categorySlug === cat.slug ? 'border-green-600 bg-green-50 shadow-lg' : 'border-slate-100 hover:border-green-200 hover:bg-slate-50'}`}
              >
                {'icon' in cat ? (
                  <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">
                    {cat.icon || categoryIcons[cat.slug] || '📦'}
                  </div>
                ) : (
                  <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">
                    {CATEGORIES.find(base => base.slug === cat.slug)?.icon || categoryIcons[cat.slug] || '📦'}
                  </div>
                )}
                <div className="font-black text-slate-800">{cat.name}</div>
              </button>
            ))}
          </div>
        );

      case 'DETAILS':
        return (
          <div className="space-y-8 max-w-2xl mx-auto">
            <div className="grid grid-cols-1 gap-6">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Subcategoria</label>
                <select
                  value={formData.subCategoryId}
                  onChange={e => {
                    const selectedFromDb = dbSubcategories.find(sub => sub.id === e.target.value)
                    const selectedLabel = selectedFromDb
                      ? selectedFromDb.name
                      : (CATEGORIES.find(cat => cat.slug === formData.categorySlug)?.subcategories || [])
                        .find((sub: string) => slugify(sub) === e.target.value) || ''
                    setFormData({
                      ...formData,
                      subCategoryId: e.target.value,
                      subCategoryLabel: selectedLabel
                    })
                  }}
                  className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-green-600 outline-none"
                >
                  <option value="">Selecione uma subcategoria</option>
                  {dbSubcategories.length > 0 ? (
                    dbSubcategories.map(sub => (
                      <option key={sub.id} value={sub.id}>{sub.name}</option>
                    ))
                  ) : (
                    (CATEGORIES.find(cat => cat.slug === formData.categorySlug)?.subcategories || []).map((sub: string) => (
                      <option key={sub} value={slugify(sub)}>{sub}</option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Título do Anúncio</label>
                <input 
                  type="text" 
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                  className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-green-600 outline-none" 
                  placeholder="Ex: Trator John Deere 6125J - Único Dono"
                />
              </div>

              {/* Campos Dinâmicos baseados no Schema */}
              {technicalFieldsSchema.length > 0 && (
                <div>
                  <h3 className="text-sm font-black text-slate-700 mb-4">Especificações Técnicas</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {technicalFieldsSchema.map((field, index) => (
                      <div key={index}>
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                          {field.label}
                        </label>
                        {field.type === 'text' && (
                          <input 
                            type="text" 
                            value={formData.technical?.[field.key] || ''}
                            onChange={e => setFormData({...formData, technical: {...formData.technical, [field.key]: e.target.value}})}
                            className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-green-600 outline-none" 
                            placeholder={field.placeholder || ''}
                          />
                        )}
                        {field.type === 'number' && (
                          <input 
                            type="number" 
                            value={formData.technical?.[field.key] || ''}
                            onChange={e => setFormData({...formData, technical: {...formData.technical, [field.key]: e.target.value}})}
                            className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-green-600 outline-none" 
                            placeholder={field.placeholder || '0'}
                          />
                        )}
                        {field.type === 'select' && field.options && (
                          <select 
                            value={formData.technical?.[field.key] || ''}
                            onChange={e => setFormData({...formData, technical: {...formData.technical, [field.key]: e.target.value}})}
                            className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-green-600 outline-none"
                          >
                            <option value="">Selecione...</option>
                            {field.options.map((opt: string, i: number) => (
                              <option key={i} value={opt}>{opt}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Descrição Completa</label>
                <textarea 
                  rows={6}
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-green-600 outline-none resize-none" 
                  placeholder="Descreva detalhes do produto, histórico e condições de conservação..."
                ></textarea>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Informe a quantidade</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input
                    type="number"
                    min={1}
                    value={formData.quantity}
                    onChange={e => setFormData({ ...formData, quantity: Number(e.target.value) })}
                    className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-green-600 outline-none"
                    placeholder="1"
                  />
                  <select
                    value={formData.unit}
                    onChange={e => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-green-600 outline-none"
                  >
                    {['Unidade', 'Kg', 'Arroba', 'Litros', 'Toneladas', 'Cabeças'].map(unit => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={handleBack} className="w-full py-5 border border-slate-200 text-slate-600 rounded-2xl font-black hover:bg-slate-50 transition-all">Voltar</button>
              <button onClick={() => setCurrentStep('MEDIA')} className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black shadow-xl hover:bg-slate-800 transition-all">Próxima Etapa: Fotos</button>
            </div>
          </div>
        );

      case 'MEDIA':
        return (
          <div className="max-w-2xl mx-auto space-y-8">
            <label htmlFor="ad-images-input" className="border-4 border-dashed border-slate-100 rounded-[2.5rem] p-12 text-center hover:border-green-200 transition-colors bg-slate-50/50 cursor-pointer block relative">
              <div className="text-6xl mb-4">📸</div>
              <h3 className="text-lg font-black text-slate-800">Clique ou arraste suas fotos aqui</h3>
              <p className="text-slate-400 text-sm mt-2">Formatos aceitos: JPG, PNG. Tamanho máximo 5MB por foto.</p>
              <input
                id="ad-images-input"
                type="file"
                multiple
                accept="image/*"
                onChange={e => handleImagesSelected(e.target.files)}
                className="sr-only"
                ref={fileInputRef}
              />
              {isUploadingImages && (
                <p className="mt-3 text-xs text-slate-500">Enviando imagens...</p>
              )}
            </label>
            {imageItems.length > 0 && (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={imageItems.map(item => item.id)}>
                  <div className="grid grid-cols-3 gap-4">
                    {imageItems.map((item, index) => (
                      <SortableImageItem key={item.id} item={item} index={index} onRemove={handleRemoveImage} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={handleBack} className="w-full py-5 border border-slate-200 text-slate-600 rounded-2xl font-black hover:bg-slate-50 transition-all">Voltar</button>
              <button onClick={() => setCurrentStep('PRICING')} className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black shadow-xl hover:bg-slate-800 transition-all">Próxima Etapa: Preço e Local</button>
            </div>
          </div>
        );

      case 'PRICING':
        return (
          <div className="max-w-2xl mx-auto space-y-10">
            <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-6">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Valor Unitário (R$)</label>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-4">
                  <div className="relative">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 font-bold">R$</span>
                    <input 
                      type="number" 
                      value={formData.unitPrice}
                      onChange={e => setFormData({...formData, unitPrice: Number(e.target.value)})}
                      className="w-full bg-slate-50 border-none rounded-2xl pl-16 pr-6 py-5 text-2xl font-black text-slate-900 outline-none focus:ring-2 focus:ring-green-600" 
                      placeholder="0,00"
                    />
                  </div>
                  <input
                    value={formData.currency}
                    disabled
                    className="w-full bg-slate-100 border-none rounded-2xl px-4 py-5 text-sm font-bold text-slate-500"
                  />
                </div>
                <div className="mt-4 flex items-center gap-2">
                   <input type="checkbox" className="w-5 h-5 rounded border-slate-300 text-green-600 focus:ring-green-500" />
                   <span className="text-sm font-bold text-slate-600">Preço sob consulta / Aceita troca</span>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-50 grid grid-cols-2 gap-6">
                <div className="col-span-2">
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">CEP Localização</label>
                  <input 
                    type="text" 
                    maxLength={9}
                    value={formData.location.cep}
                    onChange={e => handleCepChange(e.target.value)}
                    onBlur={handleCepBlur}
                    className="w-full bg-slate-50 border-none rounded-xl px-6 py-4 focus:ring-2 focus:ring-green-600 outline-none" 
                    placeholder="00000-000"
                  />
                </div>
                <div>
                   <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Cidade</label>
                   <input
                     value={formData.location.city}
                     onChange={e => setFormData(prev => ({ ...prev, location: { ...prev.location, city: e.target.value } }))}
                     className="w-full bg-slate-100 border-none rounded-xl px-6 py-4 text-slate-700"
                     placeholder="Cidade"
                   />
                </div>
                <div>
                   <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Estado</label>
                   <input
                     value={formData.location.state}
                     onChange={e => setFormData(prev => ({ ...prev, location: { ...prev.location, state: e.target.value } }))}
                     className="w-full bg-slate-100 border-none rounded-xl px-6 py-4 text-slate-700"
                     placeholder="UF"
                     maxLength={2}
                   />
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={handleBack} className="w-full py-5 border border-slate-200 text-slate-600 rounded-2xl font-black hover:bg-slate-50 transition-all">Voltar</button>
              <button onClick={() => setCurrentStep('REVIEW')} className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black shadow-xl hover:bg-slate-800 transition-all">Revisar Anúncio</button>
            </div>
          </div>
        );

      case 'REVIEW':
        const previewAd = {
          ...formData,
          id: 'preview',
          status: AdStatus.ACTIVE,
          views: 0,
          createdAt: new Date().toISOString(),
          userId: 'u1',
          whatsapp: '11999999999',
          location: { city: formData.location.city || 'Cidade', state: formData.location.state || 'UF' }
        };
        return (
          <div className="flex flex-col lg:flex-row gap-12 items-start max-w-5xl mx-auto">
            <div className="flex-1 space-y-8">
              <div className="bg-green-50 p-8 rounded-[2rem] border border-green-100">
                <h3 className="text-xl font-black text-green-900 mb-2">Quase lá!</h3>
                <p className="text-green-700">Verifique se todas as informações estão corretas. Seu anúncio será publicado instantaneamente.</p>
              </div>

              {/* Alerta de limite atingido */}
              {!canCreateAd && subscription && (
                <div className="bg-red-50 border-2 border-red-200 p-6 rounded-2xl">
                  <div className="flex items-start gap-4">
                    <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-lg font-bold text-red-900 mb-2">Limite de anúncios atingido</h4>
                      <p className="text-sm text-red-800 mb-3">{adLimitMessage}</p>
                      <p className="text-xs text-red-700 mb-3">
                        <strong>Anúncios usados neste ciclo:</strong> {usage.adsUsed} de {usage.adsLimit}
                      </p>
                      <button
                        onClick={() => navigate('/planos')}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition text-sm"
                      >
                        Ver Planos
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <button 
                  onClick={async () => {
                    if (!canCreateAd) {
                      toast.error('Limite de anúncios atingido', {
                        description: adLimitMessage
                      });
                      return;
                    }
                    await handleSubmitAd();
                    await refreshUsage(); // Atualizar contadores após publicar
                  }}
                  className="w-full py-6 bg-green-700 text-white rounded-[2rem] font-black text-xl shadow-2xl shadow-green-900/20 hover:bg-green-800 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={isSubmitting || isUploadingImages || !canCreateAd}
                >
                  {isUploadingImages ? 'Aguardando uploads...' : isSubmitting ? 'Publicando...' : 'Publicar Anúncio Agora'}
                </button>
                <button onClick={handleBack} className="w-full py-4 text-slate-400 font-bold hover:text-slate-600 transition-all">Voltar</button>
              </div>
            </div>
            <div className="w-full lg:w-[400px]">
               <div className="sticky top-28">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 ml-2">Visualização no App</p>
                  <AdCard ad={previewAd as any} />
               </div>
            </div>
          </div>
        );

      case 'SUCCESS':
        return (
          <div className="max-w-xl mx-auto text-center py-20">
            <div className="w-32 h-32 bg-green-100 text-green-700 rounded-full flex items-center justify-center mx-auto mb-10 text-6xl shadow-xl shadow-green-100">
               ✅
            </div>
            <h1 className="text-4xl font-black text-slate-900 font-display mb-4">Anúncio Publicado!</h1>
            <p className="text-slate-500 text-lg mb-12">Seu anúncio já está no ar e visível para milhares de produtores rurais.</p>
            <div className="flex flex-col gap-4">
               <button onClick={() => navigate('/anuncios')} className="w-full py-5 bg-green-700 text-white rounded-2xl font-black shadow-lg">Ver Meus Anúncios</button>
               <button onClick={() => { setFormData({title: '', description: '', price: 0, location: {cep:'', city:'', state:''}, images:[]}); setCurrentStep('CATEGORY'); }} className="w-full py-5 border-2 border-slate-100 text-slate-600 rounded-2xl font-black">Anunciar Outro Produto</button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen pb-32">
      <div className="max-w-7xl mx-auto px-4 pt-10">
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-5 text-sm text-yellow-900">
          <strong className="block text-xs font-black uppercase tracking-widest mb-2">ATENÇÃO!</strong>
          <p>
            Preencha os dados do anúncio com veracidade. Informações falsas podem resultar em bloqueio do anúncio e da conta.
          </p>
        </div>
      </div>
      {/* Stepper Progress Header */}
      {currentStep !== 'SUCCESS' && (
        <div className="bg-white border-b border-gray-100 mb-12 py-8">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex justify-between items-center relative">
              {/* Progress Line */}
              <div className="absolute left-0 top-1/2 w-full h-1 bg-slate-100 -translate-y-1/2 z-0"></div>
              <div 
                className="absolute left-0 top-1/2 h-1 bg-green-600 -translate-y-1/2 z-0 transition-all duration-500"
                style={{ width: `${(currentStepIndex / (steps.length - 1)) * 100}%` }}
              ></div>
              
              {steps.map((s, i) => (
                <div key={s} className="relative z-10 flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${i <= currentStepIndex ? 'bg-green-600 text-white shadow-lg shadow-green-200 scale-110' : 'bg-white border-2 border-slate-100 text-slate-300'}`}>
                    {i + 1}
                  </div>
                  <span className={`hidden md:block absolute -bottom-8 whitespace-nowrap text-[10px] font-black uppercase tracking-widest ${i <= currentStepIndex ? 'text-green-700' : 'text-slate-300'}`}>
                    {s === 'CATEGORY' ? 'Categoria' : s === 'DETAILS' ? 'Dados' : s === 'MEDIA' ? 'Fotos' : s === 'PRICING' ? 'Preço' : 'Revisão'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4">
        {renderStep()}
      </div>
    </div>
  );
};

export default AdCreationView;
