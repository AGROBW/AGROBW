import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dashboard = readFileSync(
  resolve(process.cwd(), 'components/dashboard/SellerStoreDashboard.tsx'),
  'utf8',
);

describe('Seller Store dashboard tabbed experience', () => {
  it('defines the four expected navigation categories with overview as the default', () => {
    expect(dashboard).toContain("useState<StoreDashboardTab>('overview')");
    expect(dashboard).toContain("label: 'Visão geral'");
    expect(dashboard).toContain("label: 'Vitrine'");
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

    for (const panel of ['overview', 'showcase', 'appearance', 'publication']) {
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

  it('uses an on-demand preview and keeps the full editors below the compact module', () => {
    expect(dashboard).toContain('isPreviewOpen ? (');
    expect(dashboard).toContain('aria-modal="true"');
    expect(dashboard).toContain('id="store-data-editor"');
    expect(dashboard).toContain('id="store-appearance-editor"');
    expect(dashboard.indexOf('id="store-data-editor"')).toBeLessThan(
      dashboard.indexOf('<SellerStoreCatalogPanel'),
    );
    expect(dashboard).not.toContain('Monte a vitrine oficial do seu negócio no agro');
  });
});
