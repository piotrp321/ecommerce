import type { CatalogSource } from '@/catalog/source';
import type { CategoryNode, Product } from '@/catalog/types';
import { editorialBanner as defaultBanner, featuredProductSlugs as defaultPicks } from './home';

type HomeCatalog = Pick<CatalogSource, 'listCategories' | 'getCategory' | 'getProduct' | 'listProducts'>;

const FEATURED_COUNT = 8;

export interface HomeData {
  categories: CategoryNode[];
  featured: Product[];
  /** The editorial banner, or `null` when its category is not in the catalog. */
  banner: typeof defaultBanner | null;
}

/**
 * Data of the home page. The editorial picks refer to catalog slugs that may not exist
 * (e.g. after switching from the demo data to the API): missing picks are skipped, the
 * first products by name fill in when none is left, and the banner is hidden when its
 * category is missing.
 */
export async function loadHomeData(
  catalog: HomeCatalog,
  { picks = defaultPicks, banner = defaultBanner }: { picks?: readonly string[]; banner?: typeof defaultBanner } = {},
): Promise<HomeData> {
  const [categories, bannerCategory, ...picked] = await Promise.all([
    catalog.listCategories(),
    catalog.getCategory(banner.categorySlug),
    ...picks.map((slug) => catalog.getProduct(slug)),
  ]);
  let featured = picked.filter((product) => product !== null).slice(0, FEATURED_COUNT);
  if (featured.length === 0) {
    featured = (await catalog.listProducts({ sort: 'name', page: 1, perPage: FEATURED_COUNT })).items;
  }

  return { categories, featured, banner: bannerCategory ? { ...banner, categorySlug: bannerCategory.slug } : null };
}
