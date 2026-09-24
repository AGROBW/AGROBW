import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dashboard = readFileSync(
  resolve(process.cwd(), 'components/dashboard/SellerStoreDashboard.tsx'),
  'utf8',
);
const catalogPanel = readFileSync(
  resolve(process.cwd(), 'components/dashboard/SellerStoreCatalogPanel.tsx'),
  'utf8',
);

describe('Seller Store dashboard tabbed experience', () => {
  it('defines the five expected navigation categories with overview as the default', () => {
    expect(dashboard).toContain("useState<StoreDashboardTab>('overview')");
    expect(dashboard).toContain("label: 'Visão geral'");
    expect(dashboard).toContain("label: 'Vitrine'");
    expect(dashboard).toContain("label: 'Catálogo'");
    expect(dashboard).toContain("label: 'Aparência'");
    expect(dashboard).toContain("label: 'Publicação'");
  });

  it('connects accessible tabs and persistent panels with keyboard navigation', () => {
    expect(dashboard).toContain('role="tablist"');
    expect(dashboard).toContain('role="tab"');
    expect(dashboard).toContain('aria-selected={isActive}');
    expect(dashboard).toContain('aria-controls={`store-panel-${tab.id}`}');
    expect(dashboard).toContain("['ArrowLeft', 'ArrowRight', 'Home', 'End']");
    expect(dashboard).toContain('overflow-x-auto');

    for (const panel of ['overview', 'showcase', 'catalog', 'appearance', 'publication']) {
      expect(dashboard).toContain(`id="store-panel-${panel}"`);
      expect(dashboard).toContain(`hidden={activeTab !== '${panel}'}`);
    }
  });

  it('keeps critical status and pending information outside the active panel', () => {
    expect(dashboard).toContain('storeStatus.label');
    expect(dashboard).toContain('primaryAlert.message');
    expect(dashboard).toContain('appearanceIssueCount');
    expect(dashboard).toContain('showcaseIssueCount');
    expect(dashboard).toContain('publicationIssueCount');
  });

  it('preserves the existing save, publication, upload and showcase handlers', () => {
    expect(dashboard).toContain('onClick={handleSave}');
    expect(dashboard).toContain('onClick={handleSaveAnnouncementOrder}');
    expect(dashboard).toContain("uploadStoreAsset(event, 'logoUrl')");
    expect(dashboard).toContain("uploadStoreAsset(event, 'coverUrl')");
    expect(dashboard).toContain("uploadStoreAsset(event, 'coverMobileUrl')");
    expect(dashboard).toContain("handleChange('isActive', !formData.isActive)");
  });

  it('uses an on-demand preview and keeps the catalog mounted inside its tab', () => {
    expect(dashboard).toContain('isPreviewOpen ? (');
    expect(dashboard).toContain('aria-modal="true"');
    expect(dashboard).toContain('id="store-data-editor"');
    expect(dashboard).toContain('id="store-appearance-editor"');
    expect(dashboard.indexOf('id="store-panel-catalog"')).toBeLessThan(
      dashboard.indexOf('<SellerStoreCatalogPanel'),
    );
    expect(dashboard.indexOf('<SellerStoreCatalogPanel')).toBeLessThan(
      dashboard.indexOf('id="store-data-editor"'),
    );
    expect(dashboard.match(/<SellerStoreCatalogPanel/g)).toHaveLength(1);
    expect(dashboard).not.toContain('Monte a vitrine oficial do seu negócio no agro');
  });

  it('organizes the smart catalog as a guided responsive workspace', () => {
    expect(catalogPanel).toContain('Informações do catálogo');
    expect(catalogPanel).toContain('Aparência da capa');
    expect(catalogPanel).toContain('Produtos selecionados');
    expect(catalogPanel).toContain('Resumo do catálogo');
    expect(catalogPanel).toContain('Seus catálogos');
    expect(catalogPanel).toContain("xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.95fr)]");
    expect(catalogPanel).toContain('xl:sticky xl:top-5');
    expect(catalogPanel).toContain('onClick={() => void handleCreate()}');
    expect(catalogPanel).toContain('onClick={() => void handleDownload(catalog)}');
    expect(catalogPanel).toContain('onClick={() => void handleCancel(catalog.id)}');
  });

  it('paginates and filters large product selections without losing the 200 item contract', () => {
    expect(catalogPanel).toContain('const CATALOG_PRODUCT_LIMIT = 200');
    expect(catalogPanel).toContain('const CATALOG_PRODUCTS_PER_PAGE = 10');
    expect(catalogPanel).toContain('filteredAnnouncements');
    expect(catalogPanel).toContain('paginatedAnnouncements');
    expect(catalogPanel).toContain('Buscar por produto, cidade ou estado');
    expect(catalogPanel).toContain('Página {currentProductPage} de {productPageCount}');
    expect(catalogPanel).toContain('current.length < CATALOG_PRODUCT_LIMIT');
    expect(catalogPanel).not.toContain('current.length < 100');
  });
});
