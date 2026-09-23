import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SELLER_STORE_CATALOG_MAX_PRODUCTS,
  SELLER_STORE_CATALOG_PRODUCTS_PER_PAGE,
} from '../sellerStoreCatalog/documentModel';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const migration = read('sql/expand_seller_store_catalog_capacity_2026-09-23.sql');
const validator = read('sql/VALIDATE_expand_seller_store_catalog_capacity_2026-09-23.sql');
const rollback = read('sql/ROLLBACK_expand_seller_store_catalog_capacity_2026-09-23.sql');
const panel = read('components/dashboard/SellerStoreCatalogPanel.tsx');
const hook = read('src/hooks/useSellerStoreCatalog.ts');

describe('Seller Store PDF Catalog capacity', () => {
  it('supports compact catalogs with up to 200 products', () => {
    expect(SELLER_STORE_CATALOG_MAX_PRODUCTS).toBe(200);
    expect(SELLER_STORE_CATALOG_PRODUCTS_PER_PAGE).toBe(6);
    expect(panel).toContain('announcements.slice(0, 200)');
    expect(hook).toContain('Selecione entre 1 e 200 anúncios ativos.');
  });

  it('updates both the table contract and the authoritative request RPC', () => {
    expect(migration).toContain('cardinality(announcement_ids) between 1 and 200');
    expect(migration).toContain("'v_requested_count > 100'");
    expect(migration).toContain("'v_requested_count > 200'");
    expect(validator).toContain('limite_tabela_200');
    expect(validator).toContain('limite_rpc_200');
  });

  it('refuses an unsafe rollback when exports above the old limit exist', () => {
    expect(rollback).toContain('ROLLBACK_REFUSED_CATALOGS_ABOVE_100');
    expect(rollback).toContain('cardinality(exports.announcement_ids) > 100');
  });
});
