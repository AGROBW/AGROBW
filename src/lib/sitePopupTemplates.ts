import { SitePopupAudience, SitePopupPageScope } from '../../types';

export interface SitePopupDraft {
  name: string;
  title: string;
  message: string;
  supportText: string;
  primaryButtonLabel: string;
  primaryButtonLink: string;
  delaySeconds: number;
  isActive: boolean;
  showOnce: boolean;
  audience: SitePopupAudience;
  pageScope: SitePopupPageScope;
  customPath: string;
  displayOrder: number;
  startsAt: string;
  endsAt: string;
}

export const SITE_POPUP_PLACEHOLDERS = [
  { key: '{nome_usuario}', label: 'Nome do usuario', example: 'Carlos Mendes' },
  { key: '{nome_plano}', label: 'Nome do plano', example: 'Plano Semente' },
  { key: '{link_cadastro}', label: 'Link de cadastro', example: '/cadastro' },
];

export const SITE_POPUP_SAMPLE_VALUES: Record<string, string> = {
  nome_usuario: 'Carlos Mendes',
  nome_plano: 'Plano Semente',
  link_cadastro: '/cadastro',
};

export const DEFAULT_SITE_POPUP_DRAFT: SitePopupDraft = {
  name: 'Boas-vindas | Plano Semente 30 dias',
  title: 'Teste a plataforma gratuitamente',
  message:
    'Ao realizar seu cadastro, voce podera utilizar gratuitamente o {nome_plano} por 30 dias para testar a plataforma.',
  supportText:
    'Crie sua conta para explorar anuncios, mensagens e os recursos iniciais da AGRO BW sem custo no periodo de teste.',
  primaryButtonLabel: 'Criar minha conta',
  primaryButtonLink: '/cadastro',
  delaySeconds: 6,
  isActive: false,
  showOnce: true,
  audience: 'visitors',
  pageScope: 'site',
  customPath: '',
  displayOrder: 0,
  startsAt: '',
  endsAt: '',
};

export const cloneSitePopupDraft = (draft: SitePopupDraft): SitePopupDraft =>
  JSON.parse(JSON.stringify(draft));

export const renderSitePopupText = (template: string, values: Record<string, string>) => {
  if (!template) return '';

  return Object.entries(values).reduce((accumulator, [key, value]) => {
    return accumulator.replaceAll(`{${key}}`, value);
  }, template);
};
