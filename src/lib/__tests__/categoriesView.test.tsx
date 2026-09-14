import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../hooks/useCategoryCounts', () => ({
  useCategoryCounts: () => ({
    getCountForCategory: () => 3,
    hasLoadedRealCounts: true,
    categoryGroupsLoading: false,
    categoryGroups: [
      {
        slug: 'aeronaves',
        name: 'Aeronaves',
        iconName: 'plane',
        children: [
          { slug: 'avioes-agricolas', name: 'Avioes agricolas' },
          { slug: 'helicopteros', name: 'Helicopteros' },
        ],
      },
    ],
  }),
}));

vi.mock('../../hooks/useCategoryGroupImages', () => ({
  useCategoryGroupImages: () => ({ images: {}, isLoading: false }),
}));

vi.mock('../../contexts/LayoutContext', () => ({
  useLayout: () => ({
    settings: { primaryColor: '#16a34a', secondaryColor: '#0f172a' },
  }),
}));

vi.mock('../../lib/categoryVisuals', () => ({
  getCategoryIconComponent: () => (props: React.SVGProps<SVGSVGElement>) => <svg {...props} />,
}));

vi.mock('../../../components/SeoHead', () => ({ default: () => null }));
vi.mock('../../../components/StructuredData', () => ({ default: () => null }));

import CategoriesView from '../../../pages/CategoriesView';

describe('CategoriesView', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('mantem os cards compactos sem exibir suas subcategorias', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <CategoriesView />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain('Aeronaves');
    expect(container.textContent).toContain('Ver tudo em Aeronaves');
    expect(container.textContent).not.toContain('Avioes agricolas');
    expect(container.textContent).not.toContain('Helicopteros');
    expect(container.querySelector('[href*="subcategoria="]')).toBeNull();
    expect(container.querySelectorAll('[href="/anuncios?categoria=aeronaves"]')).toHaveLength(2);
  });
});
