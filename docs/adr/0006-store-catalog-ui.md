# ADR-0006: Store catalog UI

- Status: accepted
- Date: 2026-10-25

## Context

The store ([ADR-0003](0003-store-nextjs.md)) gets its first real interface: a home page, a category tree, product listings (filtered by a category and its subcategories, sorted, paginated) and product pages. Constraints:

- The catalog API (Milestone 2, [ADR-0005](0005-catalog-inventory-and-admin-api-access.md)) is described by [`docs/api/openapi.yaml`](../api/openapi.yaml). The store is not connected to it yet, and `packages/sdk` with generated types comes only in stage 5.
- Prices, VAT and availability are business logic of the backend; the store only presents them.
- The UI should look like a modern e-commerce store and use technology common in React/Next.js projects, without large dependencies.
- Demo data must not pass for a real catalog.
- The production image serves `.next/standalone` and `.next/static` only (no `public/`), and `infra/` is not changed by this work.

## Decision

1. **UI stack.**
   - Tailwind CSS v4 through `@tailwindcss/postcss`, design tokens as CSS variables in `src/app/globals.css` (shadcn/ui naming, one light theme).
   - shadcn/ui components copied into `apps/store/src/components/ui` only when used (button, badge, skeleton, breadcrumb, pagination, sheet), with `components.json` for the CLI. Runtime dependencies: `@radix-ui/react-slot`, `@radix-ui/react-dialog`, `class-variance-authority`, `clsx`, `tailwind-merge`. No shared `packages/ui` yet.
   - Lucide React for icons; `tw-animate-css` for the sheet animations.
   - Fonts through `next/font/google` (Geist, Instrument Serif), downloaded at build time and self-hosted: no requests to Google at runtime.

2. **Rendering.**
   - Server Components everywhere; client components only for the category sheet (Radix dialog) and the error boundaries.
   - Sorting and pagination are links with query parameters (`?sortowanie=cena-rosnaco&strona=2`): they work without JavaScript and every listing state has its own URL. Default values are omitted, so each page has one canonical URL.
   - Category and product pages load the entity before anything streams, so an unknown slug answers HTTP 404. Only the product results (and related products) stream in behind skeletons. `loading.tsx` is used only for `/produkty`, where no 404 is possible. Listing pages past the last one get `noindex` and no canonical URL.
   - Root `error.tsx` and `global-error.tsx` (the root layout loads the category tree).

3. **Data source behind an interface.**
   - `src/catalog/source.ts` defines `CatalogSource` with one method per public catalog operation of the contract (`listCategories`, `getCategory`, `listProducts`, `getProduct`). `src/catalog/index.ts` is the only place that chooses the implementation; pages and components never import the demo data.
   - `src/catalog/types.ts` mirrors the preliminary contract as interim types, to be replaced by `packages/sdk`. The only store-side addition is an optional `image`, which the contract does not have yet.
   - The demo implementation emulates the query parameters (subtree filter, sort, pagination). Gross prices and `inStock` are stored as the backend would return them; the store never calculates VAT or availability. Amounts stay decimal strings and are formatted with `Intl.NumberFormat` without float arithmetic.
   - `STORE_DEMO_DELAY_MS` (server-side, optional) adds artificial latency to inspect loading states.

4. **Demo data is labelled.** While the demo source is active, every page shows a notice ("Wersja demonstracyjna…"), metadata has `robots: noindex, nofollow`, SKUs start with `DEMO-` and the product page says ordering is not available yet.

5. **Images.** Demo photos come from Unsplash (Unsplash License: free use, no permission needed). They are referenced by URL and resized by the Unsplash CDN through a custom `next/image` loader (`src/lib/image-loader.ts`); the store server neither fetches nor stores them, and nothing is added to the repository or the image. Photos with visible brand logos are not used. Each photo links to its source page.

## Consequences

- Connecting the API means adding an HTTP `CatalogSource` (backend address in a runtime server-side variable) and switching `src/catalog/index.ts`; the UI stays unchanged.
- The root layout reads the category tree, and Next.js prerenders `/_not-found` at build time. With the HTTP source, that read must not require the backend during `next build` (render the 404 page dynamically or tolerate a missing tree).
- **Proposals for the backend contract** (not changed here): product and category images; optionally a featured/merchandising flag instead of the store's own list in `src/content/home.ts`. Until then, `src/content/load-home.ts` skips picks the catalog does not have, falls back to the first products by name and hides the banner when its category is missing.
- Images depend on an external CDN. A future CSP has to allow `images.unsplash.com`, or the photos move to the store's own storage.
- The canonical URLs are relative until the store knows its public URL (`metadataBase`), which comes with the production domain configuration.
- New dependencies change the shared `pnpm-lock.yaml`. Conflicts with parallel work on `apps/admin` are resolved by taking the other branch's lockfile and running `pnpm install` again, not by editing the file by hand.
