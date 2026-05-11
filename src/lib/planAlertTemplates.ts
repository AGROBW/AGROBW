import {
  GrowthConversionTemplates,
  GrowthConversionTriggerKey,
  PlanAlertTemplate,
  RenewalNotificationStageKey,
  RenewalNotificationTemplates,
} from '../../types';

export const PLAN_ALERT_PLACEHOLDERS = [
  { key: '{nome_usuario}', label: 'Nome do usuario', example: 'Carlos Mendes' },
  { key: '{nome_plano}', label: 'Nome do plano', example: 'Loja Parceira' },
  { key: '{data_vencimento}', label: 'Data de vencimento', example: '18/05/2026' },
  { key: '{dias_restantes}', label: 'Dias restantes', example: '3' },
  { key: '{link_upgrade}', label: 'Link de upgrade', example: '/minha-conta/meu-plano?source=growth' },
  { key: '{titulo_anuncio}', label: 'Titulo do anuncio', example: 'Trator John Deere 6125J' },
  { key: '{visualizacoes}', label: 'Visualizacoes', example: '24' },
  { key: '{categoria_rank}', label: 'Posicao na categoria', example: '2' },
  { key: '{tipo_recurso}', label: 'Recurso principal', example: 'destaque Home/Categoria' },
];

export const GROWTH_TEMPLATE_LABELS: Record<GrowthConversionTriggerKey, { title: string; description: string }> = {
  high_views: {
    title: 'Alta visibilidade',
    description: 'Quando o anuncio ja acumulou views suficientes para merecer impulso.',
  },
  top_category: {
    title: 'Topo da categoria',
    description: 'Quando o anuncio esta entre os mais vistos da categoria.',
  },
  no_leads: {
    title: 'Muitas views sem contato',
    description: 'Quando ha exposicao alta, mas ainda sem conversao em contato.',
  },
  expiring: {
    title: 'Expirando em breve',
    description: 'Quando o anuncio esta proximo do vencimento com tracao relevante.',
  },
  plan_limit: {
    title: 'Plano limita exposicao',
    description: 'Quando o anuncio ja tem interesse e o plano atual limita recursos.',
  },
};

export const RENEWAL_TEMPLATE_LABELS: Record<RenewalNotificationStageKey, { title: string; description: string }> = {
  seven_days: {
    title: '7 dias antes',
    description: 'Aviso preventivo com tempo para renovar sem pressa.',
  },
  three_days: {
    title: '3 dias antes',
    description: 'Reforco de urgencia moderada proximo ao vencimento.',
  },
  one_day: {
    title: '1 dia antes',
    description: 'Ultimo lembrete antes da data final do plano.',
  },
  expiration_day: {
    title: 'No dia do vencimento',
    description: 'Aviso de urgencia maxima no proprio dia do vencimento.',
  },
  expired: {
    title: 'Apos expirar',
    description: 'Mensagem de retomada depois que o plano venceu.',
  },
};

export const DEFAULT_GROWTH_CONVERSION_TEMPLATES: GrowthConversionTemplates = {
  high_views: {
    subject: 'Seu anuncio esta ganhando tracao na AGRO BW',
    title: 'Oportunidade AGRO BW: anuncio com boa tracao',
    message:
      'Seu anuncio "{titulo_anuncio}" ja acumulou {visualizacoes} visualizacoes. Destaca-lo agora pode ajudar a transformar audiencia em contatos.',
    supportText:
      'Seu plano atual pode estar limitando a exposicao maxima desse resultado. Avalie um upgrade para aproveitar melhor o momento.',
    cta: 'Ver planos e impulsionar',
    link: '/minha-conta/meu-plano?source=growth',
  },
  top_category: {
    subject: 'Seu anuncio esta em evidencia na categoria',
    title: 'Oportunidade AGRO BW: anuncio em evidencia na categoria',
    message:
      'Seu anuncio "{titulo_anuncio}" esta entre os mais vistos da categoria. Um destaque pode acelerar contatos e ampliar a exposicao.',
    supportText:
      'Aparecer entre os primeiros do ranking e um bom sinal para reforcar sua estrategia comercial agora.',
    cta: 'Comprar destaque',
    link: '/minha-conta/meu-plano?source=growth',
  },
  no_leads: {
    subject: 'Seu anuncio esta atraindo publico, mas ainda sem conversao',
    title: 'Oportunidade AGRO BW: alta audiencia sem conversao',
    message:
      'Seu anuncio "{titulo_anuncio}" ja acumulou {visualizacoes} visualizacoes e ainda nao recebeu contatos. Um plano com destaque pode aumentar suas chances de conversao.',
    supportText:
      'Ajustar seu plano neste momento pode ajudar a transformar interesse em oportunidade comercial concreta.',
    cta: 'Ver planos com mais alcance',
    link: '/minha-conta/meu-plano?source=growth',
  },
  expiring: {
    subject: 'Seu anuncio esta perto do vencimento',
    title: 'Oportunidade AGRO BW: anuncio perto do vencimento',
    message:
      'Seu anuncio "{titulo_anuncio}" expira em {dias_restantes} dia(s) e ja chamou atencao de compradores. Aproveite o momento para reforcar a exposicao.',
    supportText:
      'Se o anuncio perder ritmo agora, voce pode desperdiçar um bom momento de interesse do mercado.',
    cta: 'Renovar estrategia do anuncio',
    link: '/minha-conta/meu-plano?source=growth',
  },
  plan_limit: {
    subject: 'Seu plano atual esta limitando seu potencial de exposicao',
    title: 'Oportunidade AGRO BW: seu plano limita a exposicao',
    message:
      'Seu anuncio "{titulo_anuncio}" ja esta gerando interesse, mas o plano atual nao libera {tipo_recurso}. Fazer upgrade agora pode ampliar o alcance.',
    supportText:
      'Voce ja tem sinais reais de interesse. O ajuste de plano pode destravar mais exposicao e acelerar conversoes.',
    cta: 'Fazer upgrade agora',
    link: '/minha-conta/meu-plano?source=growth',
  },
};

export const DEFAULT_RENEWAL_NOTIFICATION_TEMPLATES: RenewalNotificationTemplates = {
  seven_days: {
    subject: 'Seu plano expira em 7 dias',
    title: 'Renovacao AGRO BW: seu plano expira em 7 dias',
    message:
      'Seu plano "{nome_plano}" expira em {dias_restantes} dias, em {data_vencimento}. Renove com antecedencia para manter anuncios, destaques e beneficios ativos sem interrupcao.',
    supportText:
      'Organizar a renovacao agora ajuda a manter sua operacao e sua exposicao comercial sem pausa.',
    cta: 'Renovar com antecedencia',
    link: '/minha-conta/meu-plano?source=renewal',
  },
  three_days: {
    subject: 'Seu plano expira em 3 dias',
    title: 'Renovacao AGRO BW: seu plano expira em 3 dias',
    message:
      'Seu plano "{nome_plano}" expira em {dias_restantes} dias, em {data_vencimento}. Vale revisar a renovacao agora para nao perder sua exposicao na plataforma.',
    supportText:
      'Esse e um bom momento para confirmar a renovacao e evitar perda de ritmo nos seus anuncios.',
    cta: 'Revisar renovacao',
    link: '/minha-conta/meu-plano?source=renewal',
  },
  one_day: {
    subject: 'Seu plano vence amanha',
    title: 'Renovacao AGRO BW: seu plano expira amanha',
    message:
      'Seu plano "{nome_plano}" vence amanha, em {data_vencimento}. Garanta a renovacao para continuar com acesso aos recursos pagos sem pausa.',
    supportText:
      'Se voce renovar hoje, evita qualquer interrupcao nos beneficios e no acompanhamento dos seus resultados.',
    cta: 'Renovar hoje',
    link: '/minha-conta/meu-plano?source=renewal',
  },
  expiration_day: {
    subject: 'Seu plano vence hoje',
    title: 'Renovacao AGRO BW: seu plano vence hoje',
    message:
      'Seu plano "{nome_plano}" vence hoje. Renove agora para nao interromper seus beneficios e a exposicao dos seus anuncios.',
    supportText:
      'Uma renovacao ainda hoje ajuda a preservar continuidade operacional e acesso aos recursos do plano.',
    cta: 'Renovar agora',
    link: '/minha-conta/meu-plano?source=renewal',
  },
  expired: {
    subject: 'Seu plano expirou',
    title: 'Renovacao AGRO BW: seu plano expirou',
    message:
      'Seu plano "{nome_plano}" ja expirou em {data_vencimento}. Reative a assinatura para recuperar recursos pagos, exposicao e continuidade operacional.',
    supportText:
      'Enquanto o plano permanecer vencido, voce pode perder alcance, recursos premium e novas oportunidades de conversao.',
    cta: 'Reativar assinatura',
    link: '/minha-conta/meu-plano?source=renewal',
  },
};

export const GROWTH_SAMPLE_VALUES: Record<string, string> = {
  nome_usuario: 'Carlos Mendes',
  nome_plano: 'Basico',
  data_vencimento: '18/05/2026',
  dias_restantes: '3',
  link_upgrade: '/minha-conta/meu-plano?source=growth',
  titulo_anuncio: 'Trator John Deere 6125J',
  visualizacoes: '24',
  categoria_rank: '2',
  tipo_recurso: 'destaques Home/Categoria',
};

export const RENEWAL_SAMPLE_VALUES: Record<string, string> = {
  nome_usuario: 'Carlos Mendes',
  nome_plano: 'Loja Parceira',
  data_vencimento: '18/05/2026',
  dias_restantes: '3',
  link_upgrade: '/minha-conta/meu-plano?source=renewal',
  titulo_anuncio: 'Trator John Deere 6125J',
  visualizacoes: '24',
  categoria_rank: '2',
  tipo_recurso: 'destaques Home/Categoria',
};

export const clonePlanAlertTemplate = (template: PlanAlertTemplate): PlanAlertTemplate =>
  JSON.parse(JSON.stringify(template));

export const cloneTemplateSet = <T extends GrowthConversionTemplates | RenewalNotificationTemplates>(templates: T): T =>
  JSON.parse(JSON.stringify(templates));

export const mergeTemplateWithDefault = (
  maybeTemplate: Partial<PlanAlertTemplate> | null | undefined,
  fallback: PlanAlertTemplate,
): PlanAlertTemplate => ({
  subject: maybeTemplate?.subject ?? fallback.subject,
  title: maybeTemplate?.title ?? fallback.title,
  message: maybeTemplate?.message ?? fallback.message,
  supportText: maybeTemplate?.supportText ?? fallback.supportText,
  cta: maybeTemplate?.cta ?? fallback.cta,
  link: maybeTemplate?.link ?? fallback.link,
});

export const mergeGrowthTemplates = (
  maybeTemplates: Partial<Record<GrowthConversionTriggerKey, Partial<PlanAlertTemplate>>> | null | undefined,
): GrowthConversionTemplates => ({
  high_views: mergeTemplateWithDefault(maybeTemplates?.high_views, DEFAULT_GROWTH_CONVERSION_TEMPLATES.high_views),
  top_category: mergeTemplateWithDefault(maybeTemplates?.top_category, DEFAULT_GROWTH_CONVERSION_TEMPLATES.top_category),
  no_leads: mergeTemplateWithDefault(maybeTemplates?.no_leads, DEFAULT_GROWTH_CONVERSION_TEMPLATES.no_leads),
  expiring: mergeTemplateWithDefault(maybeTemplates?.expiring, DEFAULT_GROWTH_CONVERSION_TEMPLATES.expiring),
  plan_limit: mergeTemplateWithDefault(maybeTemplates?.plan_limit, DEFAULT_GROWTH_CONVERSION_TEMPLATES.plan_limit),
});

export const mergeRenewalTemplates = (
  maybeTemplates: Partial<Record<RenewalNotificationStageKey, Partial<PlanAlertTemplate>>> | null | undefined,
): RenewalNotificationTemplates => ({
  seven_days: mergeTemplateWithDefault(maybeTemplates?.seven_days, DEFAULT_RENEWAL_NOTIFICATION_TEMPLATES.seven_days),
  three_days: mergeTemplateWithDefault(maybeTemplates?.three_days, DEFAULT_RENEWAL_NOTIFICATION_TEMPLATES.three_days),
  one_day: mergeTemplateWithDefault(maybeTemplates?.one_day, DEFAULT_RENEWAL_NOTIFICATION_TEMPLATES.one_day),
  expiration_day: mergeTemplateWithDefault(
    maybeTemplates?.expiration_day,
    DEFAULT_RENEWAL_NOTIFICATION_TEMPLATES.expiration_day,
  ),
  expired: mergeTemplateWithDefault(maybeTemplates?.expired, DEFAULT_RENEWAL_NOTIFICATION_TEMPLATES.expired),
});

export const renderPlanAlertText = (template: string, values: Record<string, string>) => {
  if (!template) return '';

  return Object.entries(values).reduce((accumulator, [key, value]) => {
    return accumulator.replaceAll(`{${key}}`, value);
  }, template);
};
