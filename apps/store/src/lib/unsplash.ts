import type { CatalogImage } from '@/catalog/types';

/** A photo from Unsplash (https://unsplash.com/license), credited by its page on the site. */
export function unsplash(photo: string, page: string, alt: string): CatalogImage {
  return {
    url: `https://images.unsplash.com/${photo}`,
    alt,
    sourceUrl: `https://unsplash.com/photos/${page}`,
  };
}
