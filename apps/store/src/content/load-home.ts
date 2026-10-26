import type { CatalogSource } from '@/catalog/source';
import type { CategoryNode, Product } from '@/catalog/types';
import { editorialBanner as defaultBanner, featuredProductSlugs as defaultPicks } from './home';

type HomeCatalog = Pick<CatalogSource, 'isDemo' | 'listCategories' | 'getCategory' | 'getProduct' | 'listProducts'>;

const FEATURED_COUNT = 8;

export interface HomeData {
  categories: CategoryNode[];
  featured: Product[];
  /** The editorial banner, or `null` when its category is not in the catalog. */
  banner: typeof defaultBanner | null;
}

const firstByName = async (catalog: HomeCatalog): Promise<Product[]> =>
  (await catalog.listProducts({ sort: 'name', page: 1, perPage: FEATURED_COUNT })).items;

/**
 * Data of the home page. The editorial picks are slugs of the demo data, so only the demo
 * catalog uses them (missing picks are skipped, the first products by name fill in when
 * none is left). The API catalog features its first active products by name (ADR-0009).
 * The banner is hidden when its category is missing.
 */
export async function loadHomeData(
  catalog: HomeCatalog,
  { picks = defaultPicks, banner = defaultBanner }: { picks?: readonly string[]; banner?: typeof defaultBanner } = {},
): Promise<HomeData> {
  const pickedProducts = async (): Promise<Product[]> => {
    const picked = await Promise.all(picks.map((slug) => catalog.getProduct(slug)));
    const found = picked.filter((product) => product !== null).slice(0, FEATURED_COUNT);
    return found.length > 0 ? found : firstByName(catalog);
  };

  const [categories, bannerCategory, featured] = await Promise.all([
    catalog.listCategories(),
    catalog.getCategory(banner.categorySlug),
    catalog.isDemo ? pickedProducts() : firstByName(catalog),
  ]);

  return { categories, featured, banner: bannerCategory ? { ...banner, categorySlug: bannerCategory.slug } : null };
}
