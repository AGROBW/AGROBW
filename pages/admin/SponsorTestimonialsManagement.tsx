import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Edit3, Eye, EyeOff, GripVertical, Loader2, Plus, Quote, Save, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../src/lib/supabaseClient';
import { appError } from '../../src/utils/appLogger';

type SponsorTestimonialStatus = 'draft' | 'published';

interface SponsorTestimonialRecord {
  id: string;
  company_name: string;
  contact_name: string;
  role_title: string | null;
  segment: string | null;
  location_label: string | null;
  testimonial: string;
  avatar_url: string | null;
  highlight_metric: string | null;
  status: SponsorTestimonialStatus;
  display_order: number;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
}

const emptyForm = {
  id: null as string | null,
  companyName: '',
  contactName: '',
  roleTitle: '',
  segment: '',
  locationLabel: '',
  testimonial: '',
  avatarUrl: '',
  highlightMetric: '',
  status: 'draft' as SponsorTestimonialStatus,
  displayOrder: '0',
  isFeatured: false,
};

const statusLabelMap: Record<SponsorTestimonialStatus, string> = {
  draft: 'Rascunho',
  published: 'Publicado',
};

const TESTIMONIAL_MAX_LENGTH = 420;
const HIGHLIGHT_METRIC_MAX_LENGTH = 80;

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const SponsorTestimonialsManagement: React.FC = () => {
  const [testimonials, setTestimonials] = useState<SponsorTestimonialRecord[]>([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const publishedCount = useMemo(
    () => testimonials.filter((item) => item.status === 'published').length,
    [testimonials],
  );

  const featuredPublishedCount = useMemo(
    () => testimonials.filter((item) => item.status === 'published' && item.is_featured).length,
    [testimonials],
  );
  const testimonialLength = form.testimonial.trim().length;
  const highlightMetricLength = form.highlightMetric.trim().length;
  const previewCompanyName = form.companyName.trim() || 'Empresa anunciante';
  const previewContactName = form.contactName.trim() || 'Nome do contato';
  const previewRoleLine = [form.roleTitle.trim(), previewCompanyName].filter(Boolean).join(' - ');
  const previewAvatarUrl = form.avatarUrl.trim() || 'https://i.pravatar.cc/80?u=bwagro-sponsor-testimonial-preview';
  const previewMetric = form.highlightMetric.trim();
  const previewSegment = form.segment.trim();
  const previewLocation = form.locationLabel.trim();
  const previewText =
    form.testimonial.trim() ||
    'Seu relato vai aparecer aqui em tempo real. Use um texto direto, com resultado concreto e linguagem simples.';

  const loadTestimonials = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('sponsor_testimonials')
        .select('*')
        .order('is_featured', { ascending: false })
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTestimonials((data || []) as SponsorTestimonialRecord[]);
    } catch (error) {
      appError('SponsorTestimonialsManagement', 'Erro ao carregar relatos da Vitrine Premium', {
        error,
      });
      toast.error('Nao foi possivel carregar os relatos agora.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTestimonials();
  }, []);

  const fillForm = (testimonial: SponsorTestimonialRecord) => {
    setForm({
      id: testimonial.id,
      companyName: testimonial.company_name,
      contactName: testimonial.contact_name,
      roleTitle: testimonial.role_title || '',
      segment: testimonial.segment || '',
      locationLabel: testimonial.location_label || '',
      testimonial: testimonial.testimonial,
      avatarUrl: testimonial.avatar_url || '',
      highlightMetric: testimonial.highlight_metric || '',
      status: testimonial.status,
      displayOrder: String(testimonial.display_order ?? 0),
      isFeatured: testimonial.is_featured,
    });
  };

  const resetForm = () => {
    setForm({ ...emptyForm });
  };

  const handleAvatarUpload = async (file: File) => {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error('Selecione uma imagem JPG, PNG ou WEBP para o relato.');
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      toast.error('A imagem do relato deve ter no maximo 3MB.');
      return;
    }

    try {
      setUploadingAvatar(true);
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const filePath = `sponsor-testimonials/avatar-${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage.from('layout_assets').upload(filePath, file, {
        upsert: true,
        contentType: file.type,
        cacheControl: '3600',
      });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('layout_assets').getPublicUrl(filePath);
      setForm((current) => ({ ...current, avatarUrl: data.publicUrl }));
      toast.success('Imagem do relato enviada com sucesso.');
    } catch (error) {
      appError('SponsorTestimonialsManagement', 'Erro ao enviar imagem do relato', { error });
      toast.error('Nao foi possivel enviar a imagem agora.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.companyName.trim() || !form.contactName.trim() || !form.testimonial.trim()) {
      toast.error('Preencha empresa, contato e depoimento para continuar.');
      return;
    }

    if (testimonialLength > TESTIMONIAL_MAX_LENGTH) {
      toast.error(`O depoimento deve ter no maximo ${TESTIMONIAL_MAX_LENGTH} caracteres.`);
      return;
    }

    if (highlightMetricLength > HIGHLIGHT_METRIC_MAX_LENGTH) {
      toast.error(`A metrica destaque deve ter no maximo ${HIGHLIGHT_METRIC_MAX_LENGTH} caracteres.`);
      return;
    }

    const payload = {
      company_name: form.companyName.trim(),
      contact_name: form.contactName.trim(),
      role_title: form.roleTitle.trim() || null,
      segment: form.segment.trim() || null,
      location_label: form.locationLabel.trim() || null,
      testimonial: form.testimonial.trim(),
      avatar_url: form.avatarUrl.trim() || null,
      highlight_metric: form.highlightMetric.trim() || null,
      status: form.status,
      display_order: Number(form.displayOrder || 0),
      is_featured: form.isFeatured,
    };

    try {
      setSaving(true);

      if (form.id) {
        const { error } = await supabase.from('sponsor_testimonials').update(payload).eq('id', form.id);
        if (error) throw error;
        toast.success('Relato atualizado com sucesso.');
      } else {
        const { error } = await supabase.from('sponsor_testimonials').insert(payload);
        if (error) throw error;
        toast.success('Relato criado com sucesso.');
      }

      resetForm();
      await loadTestimonials();
    } catch (error) {
      appError('SponsorTestimonialsManagement', 'Erro ao salvar relato da Vitrine Premium', {
        error,
        testimonialId: form.id,
      });
      toast.error('Nao foi possivel salvar o relato agora.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (testimonial: SponsorTestimonialRecord) => {
    const nextStatus: SponsorTestimonialStatus =
      testimonial.status === 'published' ? 'draft' : 'published';

    try {
      const { error } = await supabase
        .from('sponsor_testimonials')
        .update({ status: nextStatus })
        .eq('id', testimonial.id);

      if (error) throw error;
      toast.success(nextStatus === 'published' ? 'Relato publicado.' : 'Relato movido para rascunho.');
      await loadTestimonials();
    } catch (error) {
      appError('SponsorTestimonialsManagement', 'Erro ao alterar status do relato', {
        error,
        testimonialId: testimonial.id,
      });
      toast.error('Nao foi possivel atualizar o status agora.');
    }
  };

  const handleDelete = async (testimonial: SponsorTestimonialRecord) => {
    try {
      setDeletingId(testimonial.id);
      const { error } = await supabase.from('sponsor_testimonials').delete().eq('id', testimonial.id);
      if (error) throw error;
      toast.success('Relato excluido com sucesso.');
      if (form.id === testimonial.id) {
        resetForm();
      }
      await loadTestimonials();
    } catch (error) {
      appError('SponsorTestimonialsManagement', 'Erro ao excluir relato', {
        error,
        testimonialId: testimonial.id,
      });
      toast.error('Nao foi possivel excluir o relato agora.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleMove = async (testimonial: SponsorTestimonialRecord, direction: 'up' | 'down') => {
    const orderedRows = [...testimonials].sort((a, b) => {
      if (a.display_order !== b.display_order) {
        return a.display_order - b.display_order;
      }
      return a.created_at.localeCompare(b.created_at);
    });

    const currentIndex = orderedRows.findIndex((item) => item.id === testimonial.id);
    if (currentIndex < 0) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= orderedRows.length) return;

    const target = orderedRows[targetIndex];

    try {
      const { error } = await supabase
        .from('sponsor_testimonials')
        .upsert(
          [
            { id: testimonial.id, display_order: target.display_order },
            { id: target.id, display_order: testimonial.display_order },
          ],
          { onConflict: 'id' },
        );

      if (error) throw error;
      toast.success(direction === 'up' ? 'Relato movido para cima.' : 'Relato movido para baixo.');
      await loadTestimonials();
    } catch (error) {
      appError('SponsorTestimonialsManagement', 'Erro ao reordenar relatos', {
        error,
        testimonialId: testimonial.id,
        direction,
      });
      toast.error('Nao foi possivel reordenar os relatos agora.');
    }
  };

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.35)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">
              Vitrine Premium
            </p>
            <h1 className="mt-2 text-3xl font-black text-slate-950">Relatos dos anunciantes</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-500">
              Cadastre relatos reais para a secao "O que dizem nossos anunciantes". A landing publica
              vai mostrar primeiro os publicados e, entre eles, os destacados.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              Priorize cases reais, com numero concreto e texto curto
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Total</p>
              <p className="mt-2 text-2xl font-black text-slate-950">{testimonials.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Publicados</p>
              <p className="mt-2 text-2xl font-black text-slate-950">{publishedCount}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Destaques</p>
              <p className="mt-2 text-2xl font-black text-slate-950">{featuredPublishedCount}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-8 xl:grid-cols-[1.05fr_1.35fr]">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.35)]">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">
                Cadastro
              </p>
              <h2 className="mt-2 text-2xl font-black text-slate-950">
                {form.id ? 'Editar relato' : 'Novo relato'}
              </h2>
            </div>
            {form.id ? (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-600 transition-colors hover:bg-slate-50"
              >
                Novo cadastro
              </button>
            ) : null}
          </div>

          <form className="space-y-4" onSubmit={handleSave}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Empresa *</span>
                <input
                  type="text"
                  value={form.companyName}
                  onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-emerald-300 focus:bg-white"
                  placeholder="Agro Maquinas Sul"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Contato *</span>
                <input
                  type="text"
                  value={form.contactName}
                  onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-emerald-300 focus:bg-white"
                  placeholder="Carlos Mendonca"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Cargo</span>
                <input
                  type="text"
                  value={form.roleTitle}
                  onChange={(event) => setForm((current) => ({ ...current, roleTitle: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-emerald-300 focus:bg-white"
                  placeholder="Diretor Comercial"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Segmento</span>
                <input
                  type="text"
                  value={form.segment}
                  onChange={(event) => setForm((current) => ({ ...current, segment: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-emerald-300 focus:bg-white"
                  placeholder="Maquinas agricolas"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Cidade / Estado</span>
                <input
                  type="text"
                  value={form.locationLabel}
                  onChange={(event) => setForm((current) => ({ ...current, locationLabel: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-emerald-300 focus:bg-white"
                  placeholder="Rio Verde/GO"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Metrica destaque</span>
                <input
                  type="text"
                  value={form.highlightMetric}
                  onChange={(event) => setForm((current) => ({ ...current, highlightMetric: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-emerald-300 focus:bg-white"
                  placeholder="+42 contatos em 30 dias"
                />
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Use um ganho objetivo e direto.</span>
                  <span className={highlightMetricLength > HIGHLIGHT_METRIC_MAX_LENGTH ? 'font-black text-rose-600' : ''}>
                    {highlightMetricLength}/{HIGHLIGHT_METRIC_MAX_LENGTH}
                  </span>
                </div>
              </label>
            </div>

            <label className="space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Foto / logo</span>
              <div className="rounded-[1.6rem] border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    {form.avatarUrl ? (
                      <img src={form.avatarUrl} alt="Preview do relato" className="h-full w-full object-cover" />
                    ) : (
                      <Quote className="h-6 w-6 text-slate-300" />
                    )}
                  </div>

                  <div className="flex-1">
                    <div className="flex flex-wrap gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition-colors hover:bg-slate-100">
                        {uploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {uploadingAvatar ? 'Enviando...' : 'Enviar imagem'}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) {
                              void handleAvatarUpload(file);
                            }
                            event.currentTarget.value = '';
                          }}
                        />
                      </label>

                      {form.avatarUrl ? (
                        <button
                          type="button"
                          onClick={() => setForm((current) => ({ ...current, avatarUrl: '' }))}
                          className="rounded-2xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-black text-rose-600 transition-colors hover:bg-rose-50"
                        >
                          Remover
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-3 text-xs leading-6 text-slate-500">
                      Use imagem quadrada, preferencialmente 400x400 px. Tambem funciona com URL externa, se preferir.
                    </p>
                  </div>
                </div>

                <input
                  type="url"
                  value={form.avatarUrl}
                  onChange={(event) => setForm((current) => ({ ...current, avatarUrl: event.target.value }))}
                  className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-emerald-300"
                  placeholder="https://..."
                />
              </div>
            </label>

            <label className="space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Depoimento *</span>
              <textarea
                value={form.testimonial}
                onChange={(event) => setForm((current) => ({ ...current, testimonial: event.target.value }))}
                rows={6}
                className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-700 outline-none transition-colors focus:border-emerald-300 focus:bg-white"
                placeholder="Conte o resultado real obtido com a Vitrine Premium."
              />
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Melhor performance com textos curtos, especificos e com resultado verificavel.</span>
                <span className={testimonialLength > TESTIMONIAL_MAX_LENGTH ? 'font-black text-rose-600' : ''}>
                  {testimonialLength}/{TESTIMONIAL_MAX_LENGTH}
                </span>
              </div>
            </label>

            <div className="grid gap-4 md:grid-cols-[0.7fr_0.7fr_1fr]">
              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Status</span>
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value as SponsorTestimonialStatus,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-emerald-300 focus:bg-white"
                >
                  <option value="draft">Rascunho</option>
                  <option value="published">Publicado</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Ordem</span>
                <input
                  type="number"
                  min="0"
                  value={form.displayOrder}
                  onChange={(event) => setForm((current) => ({ ...current, displayOrder: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-emerald-300 focus:bg-white"
                />
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5">
                <input
                  type="checkbox"
                  checked={form.isFeatured}
                  onChange={(event) => setForm((current) => ({ ...current, isFeatured: event.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm font-black text-slate-700">Marcar como destaque</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-black text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {form.id ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {saving ? 'Salvando...' : form.id ? 'Salvar alteracoes' : 'Cadastrar relato'}
            </button>
          </form>

          <div className="mt-8 rounded-[1.8rem] border border-slate-200 bg-slate-50 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Preview ao vivo</p>
                <p className="mt-1 text-sm text-slate-500">Assim o card tende a aparecer na Vitrine Premium.</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${
                  form.status === 'published'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {statusLabelMap[form.status]}
              </span>
            </div>

            <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_8px_30px_-10px_rgba(15,23,42,0.12)]">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-slate-600">
                  Case real
                </div>
                {form.isFeatured ? (
                  <div className="inline-flex rounded-full bg-amber-100 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-amber-700">
                    Relato em destaque
                  </div>
                ) : null}
                {previewMetric ? (
                  <div className="inline-flex rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">
                    {previewMetric}
                  </div>
                ) : null}
              </div>

              <Quote className="mt-5 h-8 w-8 text-emerald-600" />
              <p className="mt-5 text-sm leading-8 text-slate-600">"{previewText}"</p>

              <div className="mt-5 flex flex-wrap gap-2">
                {previewSegment ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                    {previewSegment}
                  </span>
                ) : null}
                {previewLocation ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                    {previewLocation}
                  </span>
                ) : null}
              </div>

              <div className="mt-5 flex items-center gap-3">
                <img
                  src={previewAvatarUrl}
                  alt={previewContactName}
                  className="h-11 w-11 rounded-full border-2 border-slate-100 object-cover"
                />
                <div>
                  <p className="font-black text-slate-950">{previewContactName}</p>
                  <p className="text-xs text-slate-400">{previewRoleLine}</p>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.35)]">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">
                Lista atual
              </p>
              <h2 className="mt-2 text-2xl font-black text-slate-950">Relatos cadastrados</h2>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-[240px] items-center justify-center">
              <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-emerald-600" />
            </div>
          ) : testimonials.length === 0 ? (
            <div className="rounded-[1.8rem] border border-dashed border-slate-200 bg-slate-50 px-6 py-16 text-center">
              <Quote className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-4 text-sm font-black text-slate-700">Nenhum relato cadastrado ainda.</p>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                Cadastre os primeiros cases reais para dar mais credibilidade a Vitrine Premium.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {testimonials.map((testimonial) => (
                <article
                  key={testimonial.id}
                  className="rounded-[1.8rem] border border-slate-200 bg-slate-50 p-5"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <GripVertical className="h-4 w-4 text-slate-300" />
                        <span className="text-lg font-black text-slate-950">{testimonial.company_name}</span>
                        <span
                          className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${
                            testimonial.status === 'published'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {statusLabelMap[testimonial.status]}
                        </span>
                        {testimonial.is_featured ? (
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-amber-700">
                            Destaque
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
                        <span>{testimonial.contact_name}</span>
                        {testimonial.role_title ? <span>- {testimonial.role_title}</span> : null}
                        {testimonial.segment ? <span>- {testimonial.segment}</span> : null}
                        {testimonial.location_label ? <span>- {testimonial.location_label}</span> : null}
                      </div>

                      {testimonial.highlight_metric ? (
                        <div className="mt-4 inline-flex rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700">
                          {testimonial.highlight_metric}
                        </div>
                      ) : null}

                      <p className="mt-4 text-sm leading-7 text-slate-600">"{testimonial.testimonial}"</p>

                      <div className="mt-4 grid gap-3 text-xs text-slate-400 sm:grid-cols-3">
                        <div>
                          <p className="font-black uppercase tracking-[0.14em] text-slate-400">Ordem</p>
                          <p className="mt-1 text-sm font-semibold text-slate-600">{testimonial.display_order}</p>
                        </div>
                        <div>
                          <p className="font-black uppercase tracking-[0.14em] text-slate-400">Criado em</p>
                          <p className="mt-1 text-sm font-semibold text-slate-600">{formatDateTime(testimonial.created_at)}</p>
                        </div>
                        <div>
                          <p className="font-black uppercase tracking-[0.14em] text-slate-400">Atualizado em</p>
                          <p className="mt-1 text-sm font-semibold text-slate-600">{formatDateTime(testimonial.updated_at)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 xl:w-[240px] xl:justify-end">
                      <button
                        type="button"
                        onClick={() => void handleMove(testimonial, 'up')}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition-colors hover:bg-slate-100"
                      >
                        <ArrowUp className="h-4 w-4" />
                        Subir
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleMove(testimonial, 'down')}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition-colors hover:bg-slate-100"
                      >
                        <ArrowDown className="h-4 w-4" />
                        Descer
                      </button>
                      <button
                        type="button"
                        onClick={() => fillForm(testimonial)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition-colors hover:bg-slate-100"
                      >
                        <Edit3 className="h-4 w-4" />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(testimonial)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition-colors hover:bg-slate-100"
                      >
                        {testimonial.status === 'published' ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                        {testimonial.status === 'published' ? 'Despublicar' : 'Publicar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(testimonial)}
                        disabled={deletingId === testimonial.id}
                        className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-black text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Trash2 className="h-4 w-4" />
                        {deletingId === testimonial.id ? 'Excluindo...' : 'Excluir'}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default SponsorTestimonialsManagement;
