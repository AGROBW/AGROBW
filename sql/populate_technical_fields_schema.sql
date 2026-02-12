-- Script para popular technical_fields_schema nas categorias
-- Este schema define quais campos técnicos devem ser exibidos dinamicamente para cada categoria

-- Categoria: Máquinas (exemplo com maquinas-equipamentos, tratores-agricolas, etc)
UPDATE categories 
SET technical_fields_schema = '[
  {
    "key": "ano",
    "label": "Ano",
    "type": "number",
    "icon": "Calendar",
    "placeholder": "Ex: 2024"
  },
  {
    "key": "horas_uso",
    "label": "Horas de Uso",
    "type": "number",
    "icon": "Gauge",
    "placeholder": "Ex: 5000"
  },
  {
    "key": "marca",
    "label": "Marca",
    "type": "text",
    "icon": "Package",
    "placeholder": "Ex: John Deere"
  },
  {
    "key": "modelo",
    "label": "Modelo",
    "type": "text",
    "icon": "Settings",
    "placeholder": "Ex: 6125J"
  },
  {
    "key": "potencia",
    "label": "Potência (CV)",
    "type": "number",
    "icon": "Zap",
    "placeholder": "Ex: 125"
  },
  {
    "key": "estado_conservacao",
    "label": "Estado de Conservação",
    "type": "select",
    "icon": "Activity",
    "options": ["Novo", "Semi-novo", "Usado", "Para restauração"]
  }
]'::jsonb
WHERE slug IN ('maquinas', 'maquinas-equipamentos', 'tratores-agricolas', 'colheitadeiras-colhedoras');

-- Categoria: Animais
UPDATE categories 
SET technical_fields_schema = '[
  {
    "key": "raca",
    "label": "Raça",
    "type": "text",
    "icon": "Circle",
    "placeholder": "Ex: Nelore"
  },
  {
    "key": "quantidade",
    "label": "Quantidade",
    "type": "number",
    "icon": "Layers",
    "placeholder": "Ex: 50"
  },
  {
    "key": "peso_medio",
    "label": "Peso Médio (kg)",
    "type": "number",
    "icon": "Weight",
    "placeholder": "Ex: 450"
  },
  {
    "key": "idade_media",
    "label": "Idade Média (meses)",
    "type": "number",
    "icon": "Calendar",
    "placeholder": "Ex: 24"
  },
  {
    "key": "vacinacao",
    "label": "Vacinação em Dia",
    "type": "select",
    "icon": "ShieldCheck",
    "options": ["Sim", "Não", "Parcial"]
  }
]'::jsonb
WHERE slug = 'animais';

-- Categoria: Insumos
UPDATE categories 
SET technical_fields_schema = '[
  {
    "key": "tipo",
    "label": "Tipo",
    "type": "text",
    "icon": "Package",
    "placeholder": "Ex: Fertilizante NPK"
  },
  {
    "key": "composicao",
    "label": "Composição",
    "type": "text",
    "icon": "Layers",
    "placeholder": "Ex: 10-10-10"
  },
  {
    "key": "volume",
    "label": "Volume (L ou kg)",
    "type": "number",
    "icon": "Box",
    "placeholder": "Ex: 1000"
  },
  {
    "key": "validade",
    "label": "Validade",
    "type": "text",
    "icon": "Calendar",
    "placeholder": "Ex: 12/2026"
  }
]'::jsonb
WHERE slug IN ('insumos', 'fertilizantes-agricolas');

-- Categoria: Imóveis Rurais
UPDATE categories 
SET technical_fields_schema = '[
  {
    "key": "area_total",
    "label": "Área Total (hectares)",
    "type": "number",
    "icon": "Ruler",
    "placeholder": "Ex: 500"
  },
  {
    "key": "area_produtiva",
    "label": "Área Produtiva (hectares)",
    "type": "number",
    "icon": "Layers",
    "placeholder": "Ex: 400"
  },
  {
    "key": "tipo_solo",
    "label": "Tipo de Solo",
    "type": "text",
    "icon": "Circle",
    "placeholder": "Ex: Latossolo Vermelho"
  },
  {
    "key": "recursos_hidricos",
    "label": "Recursos Hídricos",
    "type": "text",
    "icon": "Droplet",
    "placeholder": "Ex: 3 açudes, rio perene"
  },
  {
    "key": "infraestrutura",
    "label": "Infraestrutura",
    "type": "text",
    "icon": "Settings",
    "placeholder": "Ex: Casa sede, galpão, cercas"
  }
]'::jsonb
WHERE slug IN ('imoveis', 'imoveis-rurais', 'fazendas');

-- Categoria: Sementes
UPDATE categories 
SET technical_fields_schema = '[
  {
    "key": "cultivar",
    "label": "Cultivar",
    "type": "text",
    "icon": "Package",
    "placeholder": "Ex: Intacta RR2 PRO"
  },
  {
    "key": "safra",
    "label": "Safra",
    "type": "text",
    "icon": "Calendar",
    "placeholder": "Ex: 2024/2025"
  },
  {
    "key": "germinacao",
    "label": "Taxa de Germinação (%)",
    "type": "number",
    "icon": "Activity",
    "placeholder": "Ex: 85"
  },
  {
    "key": "peso_mil_sementes",
    "label": "Peso de Mil Sementes (g)",
    "type": "number",
    "icon": "Weight",
    "placeholder": "Ex: 180"
  }
]'::jsonb
WHERE slug IN ('sementes', 'seeds');

-- Verificar resultados
SELECT 
  id,
  name,
  slug,
  jsonb_array_length(technical_fields_schema) as num_campos
FROM categories
WHERE technical_fields_schema IS NOT NULL
ORDER BY name;
