# Seller Store PDF Catalog - Stage 2

## Scope

This stage defines the deterministic document and the premium A4 print layout.
It does not claim queue jobs, render production PDFs, or upload files.

- Versioned `2026-09-21` document schema and `premium-v1` layout.
- Deterministic normalization from immutable Stage 1 snapshots.
- Cover, store introduction, inventory index, two-product detail pages, and back cover.
- Three price disclosure modes: show, hide, and consult.
- One QR code per announcement plus one QR code for the public store.
- Canonical links restricted to `agrobw.com.br` and subdomains.
- Plain-text normalization, HTML escaping, bounded copy, and HTTPS images only
  from AGRO BW or the official Supabase storage host.
- Stable pagination for one to one hundred announcements.
- A4 dimensions, print-safe colors, page numbers, and AGRO BW attribution.

## Document contract

`buildSellerStoreCatalogDocument` is pure: the same snapshot and explicit
`generatedAt` value always produce the same document. Network access, image
download, PDF conversion, retries, and storage belong to Stage 3.

`renderSellerStoreCatalogHtml` converts that document into self-contained print
HTML except for HTTPS images. It accepts an injectable QR factory so tests do
not depend on timing, network, or QR implementation details.

## Validation

1. Run `npm test -- --run src/lib/__tests__/sellerStoreCatalogStage2.test.ts`.
2. Run `node node_modules/vite-node/vite-node.mjs scripts/render-seller-store-catalog-preview.ts`.
3. Print the generated HTML to PDF with an A4-capable Chromium browser.
4. Render every PDF page to PNG with Poppler and inspect cover, index, product
   cards, QR codes, footer, page numbers, and back cover.
5. Run the complete test suite and `npm run build`.

## Stage 3 handoff

The worker must claim one queued export, rebuild this exact document from the
stored snapshots, fetch and validate external images, render the HTML to PDF,
upload to the private bucket, and atomically update status and storage metadata.
It must not reread mutable store or announcement rows while rendering.
