begin;

insert into public.terms_page_content (
  id,
  last_updated_date,
  section1_title,
  section1_content,
  section2_title,
  section2_content,
  section3_title,
  section3_content,
  section4_title,
  section4_content,
  section5_title,
  section5_content,
  section6_title,
  section6_content,
  last_updated_by
)
values (
  '00000000-0000-0000-0000-000000000002',
  '25 de Maio de 2026',
  '1. Escopo, aceite e papel da plataforma',
  $terms_s1$
A BWAGRO é uma plataforma digital voltada ao agronegócio para divulgação de anúncios, operação de lojas parceiras, contratação de planos, troca de mensagens e aproximação entre usuários. Ao acessar, criar conta ou utilizar qualquer recurso da plataforma, o usuário declara que leu e concorda com estes Termos de Uso e com a Política de Privacidade.

A BWAGRO não compra, não vende e não assume a posse dos bens anunciados. A plataforma atua como ambiente de divulgação, organização de informações, moderação e apoio operacional. A conclusão do negócio depende exclusivamente das partes envolvidas.
$terms_s1$,
  '2. Cadastro, conta e veracidade das informações',
  $terms_s2$
Para utilizar recursos como publicar anúncios, contratar planos, operar loja parceira, enviar documentos de verificação ou interagir por mensagens, o usuário deve manter cadastro correto, completo e atualizado. O acesso é pessoal e intransferível, e a senha deve ser guardada com segurança.

O usuário responde por todas as atividades realizadas em sua conta e deve informar imediatamente qualquer uso indevido, suspeita de fraude ou acesso não autorizado. A BWAGRO pode solicitar confirmação de identidade, complementar dados cadastrais, bloquear alterações sensíveis ou suspender funcionalidades quando houver inconsistências, duplicidade documental, risco operacional ou determinação legal.
$terms_s2$,
  '3. Regras de anúncios, moderação e verificações',
  $terms_s3$
Todo anúncio deve refletir a realidade do bem, serviço ou oportunidade ofertada. O anunciante é integralmente responsável pelo título, descrição, preço, imagens, vídeos, documentos, disponibilidade, localização, categoria escolhida e demais dados publicados.

Não é permitido publicar conteúdo ilícito, enganoso, ofensivo, duplicado de forma indevida, com indícios de fraude, com links externos ou contatos em locais proibidos pelas regras da plataforma, ou que viole direitos de terceiros. A BWAGRO pode aplicar filtros automáticos, revisão manual, bloqueio preventivo, envio para análise, rejeição, remoção, limitação de alcance, cancelamento de destaque, exigência de documentos ou suspensão da conta.

Recursos como selo verificado, loja parceira, destaque em Home, destaque em Categoria, vitrine premium e edições sob análise dependem do cumprimento das políticas internas, das regras comerciais vigentes e da disponibilidade técnica da plataforma.
$terms_s3$,
  '4. Planos, destaques, cobranças e reembolsos',
  $terms_s4$
A plataforma pode oferecer modalidade gratuita e modalidades pagas, incluindo planos recorrentes, boosters, vitrines, destaques e outros recursos de exposição ou conversão. Os valores, benefícios, limites, prazos, elegibilidade e condições promocionais são os descritos na página comercial vigente no momento da contratação.

O pagamento de um plano ou destaque não garante venda, lead, volume mínimo de visualizações nem resultado comercial específico. Recursos pagos podem possuir prazo próprio, regras de cooldown, limite de uso, dependência de aprovação do anúncio e perda do benefício quando houver violação das políticas da plataforma.

Pedidos de cancelamento, estorno ou reembolso serão tratados conforme a política comercial aplicável, a legislação de consumo e o histórico de utilização efetiva do recurso contratado.
$terms_s4$,
  '5. Condutas proibidas e propriedade intelectual',
  $terms_s5$
É proibido utilizar a BWAGRO para fraude, raspagem automatizada de dados, engenharia reversa, envio massivo de mensagens, contorno de moderação, uso indevido de identidade visual de terceiros, tentativa de burlar planos, captação irregular de contatos ou qualquer prática que prejudique usuários, parceiros ou a integridade do sistema.

A marca BWAGRO, seu software, layout, base visual, textos institucionais e demais ativos da plataforma pertencem aos respectivos titulares. O usuário continua titular do conteúdo que enviar, mas declara possuir autorização para publicação e concede à BWAGRO licença de uso necessária para hospedagem, exibição, distribuição, moderação e promoção do anúncio dentro do ecossistema da plataforma.
$terms_s5$,
  '6. Responsabilidade, sanções e atualizações',
  $terms_s6$
A BWAGRO não garante qualidade, procedência, titularidade, regularidade documental, entrega, pagamento, adimplemento ou conclusão de negócios entre usuários. Sempre recomendamos verificação presencial, conferência documental e uso de meios seguros antes da contratação.

A plataforma poderá advertir, restringir funcionalidades, remover anúncios, reprovar verificações, reter publicações para análise, cancelar benefícios, suspender ou encerrar contas em caso de descumprimento destes Termos, suspeita de fraude, risco reputacional, exigência legal ou operacional.

Estes Termos podem ser atualizados a qualquer tempo. Havendo alterações relevantes, a BWAGRO poderá exigir novo aceite para continuidade do uso. Dúvidas ou solicitações podem ser encaminhadas para suporte@bwagro.com.br.
$terms_s6$,
  null
)
on conflict (id) do update set
  last_updated_date = excluded.last_updated_date,
  section1_title = excluded.section1_title,
  section1_content = excluded.section1_content,
  section2_title = excluded.section2_title,
  section2_content = excluded.section2_content,
  section3_title = excluded.section3_title,
  section3_content = excluded.section3_content,
  section4_title = excluded.section4_title,
  section4_content = excluded.section4_content,
  section5_title = excluded.section5_title,
  section5_content = excluded.section5_content,
  section6_title = excluded.section6_title,
  section6_content = excluded.section6_content,
  last_updated_by = excluded.last_updated_by;

insert into public.privacy_page_content (
  id,
  last_updated_date,
  section1_title,
  section1_content,
  section2_title,
  section2_content,
  section3_title,
  section3_content,
  section4_title,
  section4_content,
  section5_title,
  section5_content,
  section6_title,
  section6_content,
  last_updated_by
)
values (
  '00000000-0000-0000-0000-000000000003',
  '25 de Maio de 2026',
  '1. Dados que Coletamos',
  $privacy_s1$
Coletamos os dados necessários para operar a BWAGRO com segurança e viabilizar os serviços contratados. Isso pode incluir dados cadastrais e de autenticação, informações de perfil, CPF ou CNPJ, telefone, endereço, cidade, estado, dados de anúncios, imagens, vídeos, informações comerciais da loja parceira, mensagens trocadas pela plataforma, registros de leads, dados de assinatura e histórico de atendimento.

Também podemos tratar documentos enviados para verificação de conta, imagem ou PDF submetidos ao fluxo de OCR, registros de aceite jurídico, dados técnicos de acesso, logs de segurança, identificadores de sessão e informações de uso da plataforma.
$privacy_s1$,
  '2. Finalidades e bases legais do tratamento',
  $privacy_s2$
Utilizamos dados pessoais para criar e manter contas, publicar anúncios, processar planos e destaques, habilitar chats e leads, enviar notificações operacionais, permitir verificação documental, prevenir fraude, atender solicitações do titular, cumprir obrigações legais e aprimorar a experiência de navegação.

As bases legais podem variar conforme a situação, incluindo execução de contrato, procedimentos preliminares, cumprimento de obrigação legal ou regulatória, exercício regular de direitos, legítimo interesse para segurança e operação da plataforma e, quando aplicável, consentimento do titular.
$privacy_s2$,
  '3. Compartilhamento e operadores envolvidos',
  $privacy_s3$
A BWAGRO não comercializa dados pessoais. O compartilhamento ocorre apenas dentro do necessário para prestar os serviços, cumprir exigências legais e proteger a plataforma. Dependendo do fluxo, dados podem ser tratados por fornecedores de infraestrutura, autenticação, banco de dados, storage, envio de e-mail, mensageria, processamento de pagamento, analytics, OCR ou suporte operacional.

Além disso, certas informações do anunciante precisam ser exibidas a terceiros para viabilizar a finalidade do marketplace, como nome, cidade, estado, dados públicos do anúncio e canais de contato liberados pelo próprio fluxo da plataforma. Também poderemos compartilhar dados com autoridades públicas, órgãos reguladores, escritórios jurídicos ou parceiros antifraude quando houver base legal para isso.
$privacy_s3$,
  '4. Cookies, armazenamento local e analytics',
  $privacy_s4$
Utilizamos cookies e tecnologias semelhantes, além de recursos de localStorage e sessionStorage, para manter login, lembrar preferências, registrar sessões, proteger fluxos críticos e medir uso da plataforma. Algumas dessas tecnologias são estritamente necessárias para o funcionamento de cadastro, painel do usuário, segurança, notificações, drafts e analytics internos.

A Política de Cookies detalha melhor as categorias utilizadas, sua finalidade e os controles disponíveis ao titular. Configurações do navegador ou do dispositivo podem impactar parte das funcionalidades da plataforma.
$privacy_s4$,
  '5. Retenção, segurança e direitos do titular',
  $privacy_s5$
Os dados são mantidos pelo tempo necessário para cumprir as finalidades desta Política, respeitar prazos de defesa, auditoria, prevenção a fraude, rastreabilidade de consentimentos e obrigações legais ou regulatórias. O prazo de retenção pode variar conforme a natureza do dado e o recurso utilizado na plataforma.

Adotamos medidas técnicas e administrativas compatíveis com o porte e os riscos da operação, incluindo autenticação, segregação de acessos, políticas de permissão, registros de auditoria, monitoramento e mecanismos de proteção na infraestrutura utilizada.

Nos termos da LGPD, o titular pode solicitar confirmação de tratamento, acesso, correção, anonimização quando cabível, portabilidade, eliminação de dados tratados com base em consentimento, informação sobre compartilhamentos e revisão de decisões exclusivamente automatizadas, observadas as limitações legais e técnicas aplicáveis.
$privacy_s5$,
  '6. Canal de privacidade e documentos de verificação',
  $privacy_s6$
Documentos enviados para verificação cadastral, selo ou validação de conta podem passar por análise manual e, em certos casos, por extração automatizada de texto para conferência preliminar. A aprovação ou rejeição do documento não elimina a possibilidade de revisão adicional quando houver suspeita de fraude, inconsistência ou exigência regulatória.

Solicitações relacionadas à privacidade, aos direitos do titular ou a esta Política podem ser encaminhadas para privacidade@bwagro.com.br. Sempre que possível, responderemos dentro de prazo razoável e conforme as exigências da LGPD e da regulamentação aplicável.
$privacy_s6$,
  null
)
on conflict (id) do update set
  last_updated_date = excluded.last_updated_date,
  section1_title = excluded.section1_title,
  section1_content = excluded.section1_content,
  section2_title = excluded.section2_title,
  section2_content = excluded.section2_content,
  section3_title = excluded.section3_title,
  section3_content = excluded.section3_content,
  section4_title = excluded.section4_title,
  section4_content = excluded.section4_content,
  section5_title = excluded.section5_title,
  section5_content = excluded.section5_content,
  section6_title = excluded.section6_title,
  section6_content = excluded.section6_content,
  last_updated_by = excluded.last_updated_by;

insert into public.institutional_pages (
  title,
  slug,
  content,
  meta_title,
  meta_description,
  is_published,
  last_updated_by
)
values (
  'Política de Cookies',
  'politica-de-cookies',
  $cookies_html$
<h1>Política de Cookies</h1>
<p>Esta Política explica como a BWAGRO utiliza cookies, identificadores de sessão, armazenamento local e tecnologias semelhantes para operar o site, proteger a conta do usuário e medir o uso da plataforma.</p>

<h2>1. O que são cookies e tecnologias semelhantes</h2>
<p>Cookies são pequenos arquivos armazenados no navegador. A plataforma também pode utilizar <strong>localStorage</strong>, <strong>sessionStorage</strong> e identificadores técnicos para manter sessões, preferências e registros operacionais.</p>

<h2>2. Categorias utilizadas pela BWAGRO</h2>
<ul>
  <li><strong>Estritamente necessários:</strong> autenticação, segurança da sessão, recuperação de senha, prevenção a abuso, proteção de formulários e funcionamento básico do painel.</li>
  <li><strong>Funcionais:</strong> preferências de navegação, rascunhos, estado de algumas telas, personalização de componentes e continuidade de fluxos.</li>
  <li><strong>Analíticos e de medição:</strong> registros internos de páginas, presença, origem de tráfego, desempenho de páginas e interação geral com o produto.</li>
</ul>

<h2>3. Para que usamos essas tecnologias</h2>
<p>Usamos essas tecnologias para manter o usuário autenticado, proteger áreas restritas, lembrar preferências, melhorar estabilidade, medir interesse em conteúdos e entender o desempenho da plataforma. Em certos fluxos, essas tecnologias também ajudam a manter contexto de navegação, campanhas, convites e etapas temporárias do usuário.</p>

<h2>4. Cookies de terceiros e operadores</h2>
<p>Alguns dados técnicos podem ser tratados por fornecedores contratados para infraestrutura, autenticação, analytics, envio de e-mail, processamento de pagamento ou suporte. Esses operadores tratam dados dentro do limite necessário para execução do serviço.</p>

<h2>5. Como controlar cookies</h2>
<p>O usuário pode revisar permissões do navegador, limpar armazenamento local e remover cookies diretamente no dispositivo. A desativação de tecnologias estritamente necessárias pode afetar login, segurança, formulários, notificações e outras funções essenciais da BWAGRO.</p>

<h2>6. Atualizações desta Política</h2>
<p>Esta Política pode ser revisada para refletir mudanças técnicas, regulatórias ou operacionais. Em caso de dúvida sobre cookies, sessão ou tecnologias semelhantes, entre em contato com <a href="mailto:privacidade@bwagro.com.br">privacidade@bwagro.com.br</a>.</p>
$cookies_html$,
  'Política de Cookies - BWAGRO',
  'Entenda como a BWAGRO utiliza cookies, sessões, armazenamento local e tecnologias semelhantes.',
  true,
  null
),
(
  'Política de Preços, Planos, Cancelamento e Reembolso',
  'politica-de-precos',
  $pricing_html$
<h1>Política de Preços, Planos, Cancelamento e Reembolso</h1>
<p>Esta Política organiza as regras comerciais aplicáveis à contratação de planos, destaques, boosters, vitrines e demais recursos pagos da BWAGRO.</p>

<h2>1. Oferta comercial e preços vigentes</h2>
<p>Os preços, benefícios, limites, prazos, periodicidade e condições promocionais dos serviços pagos são os divulgados nas páginas comerciais e fluxos de contratação vigentes no momento da compra. A BWAGRO poderá atualizar preços e estrutura de planos para novas contratações, preservando os direitos já constituídos conforme a oferta aceita e a legislação aplicável.</p>

<h2>2. O que pode estar incluído em um plano</h2>
<p>Um plano pode incluir, conforme a oferta vigente, franquias de anúncios, recursos de loja parceira, visibilidade ampliada, janelas de contato, boosters, destaque em Home, destaque em Categoria, suporte comercial ou outras funcionalidades premium. Nem todo recurso está disponível em todo plano.</p>

<h2>3. Recursos de exposição e destaque</h2>
<p>Destaques e boosters possuem prazo, regras de uso, elegibilidade e, em alguns casos, cooldown para reutilização do mesmo tipo de destaque após o encerramento do período anterior. O pagamento do recurso amplia a exposição contratada, mas não garante venda, lead, visualização mínima ou qualquer desempenho específico.</p>

<h2>4. Aprovação, suspensão e perda de benefício</h2>
<p>Se o anúncio estiver em análise, for rejeitado, removido, suspenso por violação de regra, ficar indisponível por irregularidade ou deixar de cumprir requisitos da plataforma, a BWAGRO poderá suspender o benefício associado enquanto durar a causa impeditiva. Em situações de fraude, abuso ou violação contratual, o recurso pago poderá ser cancelado sem obrigação de manutenção da exposição comercial indevida.</p>

<h2>5. Cancelamento e reembolso</h2>
<p>Solicitações de cancelamento, estorno ou reembolso serão avaliadas conforme a legislação aplicável, o tipo de produto contratado, o momento do pedido e o nível de utilização do recurso. Pedidos feitos dentro do prazo legal, quando cabível, poderão ser analisados de forma diferenciada, especialmente se o benefício ainda não tiver sido consumido de maneira relevante.</p>

<h2>6. Renovação, vencimento e suporte comercial</h2>
<p>Ao término do período contratado, o acesso aos recursos pagos poderá ser encerrado, reduzido ou convertido para a modalidade gratuita ou básica aplicável ao produto. O usuário deve acompanhar a vigência do plano, seus prazos e alertas operacionais. Dúvidas comerciais, cancelamentos e tratativas de cobrança podem ser encaminhados para <a href="mailto:suporte@bwagro.com.br">suporte@bwagro.com.br</a>.</p>
$pricing_html$,
  'Política de Preços - BWAGRO',
  'Consulte as regras comerciais da BWAGRO sobre preços, planos, cancelamento, destaques e reembolso.',
  true,
  null
)
on conflict (slug) do update set
  title = excluded.title,
  content = excluded.content,
  meta_title = excluded.meta_title,
  meta_description = excluded.meta_description,
  is_published = excluded.is_published,
  last_updated_by = excluded.last_updated_by;

commit;
