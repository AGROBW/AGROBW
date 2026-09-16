import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'pages/AdCreationView.tsx'), 'utf8');

describe('AdCreationView dynamic taxonomy', () => {
  it('consulta o contrato atual de icones das categorias', () => {
    expect(source).toContain(".select('id,name,slug,parent_group_slug,icon_name,technical_fields_schema')");
    expect(source).not.toContain(".select('id,name,slug,parent_group_slug,icon,technical_fields_schema')");
  });

  it('aguarda categorias e resolve a edicao pelo catalogo dinamico', () => {
    expect(source).toContain('categoryCatalogLoading || dbCategoriesLoading');
    expect(source).toContain('resolveAnnouncementEditTaxonomy({');
    expect(source).toContain('categoryId: requestedCategoryId');
  });
});
