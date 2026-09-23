# Seller Store Catalog - Visual Stage 3 QA

## Automated matrix

Run the catalog test suites and build:

```powershell
$env:VITE_SUPABASE_URL='https://example.supabase.co'
$env:VITE_SUPABASE_ANON_KEY='test-anon-key'
npx vitest run src/lib/__tests__/sellerStoreCatalog*.test.ts
npm run build
```

Generate the real PDF matrix with an installed Chromium-compatible browser:

```powershell
$env:CATALOG_QA_BROWSER_EXECUTABLE='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run catalog:qa
```

The command creates scenarios with 1, 2, 5, 20, and 100 announcements under
`output/pdf/catalog-qa`, plus `manifest.json` with expected page counts and measured
overflow. The two-product scenario also validates a store without cover or logo.
The 20-product scenario uses long titles for every item and a store description at
the 680-character contract limit.
All images are embedded before rendering, network requests are blocked, and Chromium
uses print media just like the production worker.

## Acceptance checklist

- Every PDF is A4 portrait and has the page count recorded in the manifest.
- Covers preserve the source image for left, center, and right alignment.
- Catalogs with up to four products omit the index and render one product per page.
- Larger catalogs include the index and never render more than two products per page.
- Long titles and descriptions do not overlap prices, badges, QR codes, or footers.
- Missing images show the branded placeholder and do not fail generation.
- `show`, `consult`, and `hide` price policies do not leak an unintended numeric price.
- `maxOverflowPx` is at most 1 px in every manifest entry. The guard measures the
  store introduction, complete index grid, index cards, and product cards. The
  command fails instead of producing an accepted manifest when commercial content
  reaches the footer.
- First and last page, an index page, a single-product page, and a double-product page
  pass PNG visual inspection without clipping or unexpected blank pages.
