import { unsplash } from '@/lib/unsplash';
import type { CatalogImage } from '@/catalog/types';

// Editorial content of the home page (copy and photos chosen by the store, not catalog
// data). Category names and links still come from the catalog; a category missing here is
// simply shown without a photo.

export const heroImage: CatalogImage = unsplash(
  'photo-1758565811178-6341e9999f48',
  'modern-living-room-with-large-windows-overlooking-nature-aDtv0uDomA0',
  'Jasny, nowoczesny salon z dużymi oknami z widokiem na zieleń',
);

export const categoryVisuals: Record<string, { image: CatalogImage; tagline: string }> = {
  'dom-i-wnetrze': {
    image: unsplash('photo-1609081144289-eacc3108cd03', 'white-sofa-near-brown-wooden-chair-nQBc6clG3X4', 'Biała sofa obok drewnianego krzesła'),
    tagline: 'Ceramika, światło i tkaniny',
  },
  elektronika: {
    image: unsplash(
      'photo-1583394838336-acd977736f90',
      'black-and-silver-headphones-on-white-surface-LSNJ-pltdu8',
      'Czarno-srebrne słuchawki na białym tle',
    ),
    tagline: 'Dźwięk i fotografia',
  },
  kuchnia: {
    image: unsplash(
      'photo-1617228069096-4638a7ffc906',
      'modern-kitchen-with-island-and-large-window-VgyN_CWXQVM',
      'Nowoczesna kuchnia z wyspą i dużym oknem',
    ),
    tagline: 'Kawa, herbata i codzienne rytuały',
  },
  akcesoria: {
    image: unsplash('photo-1575201046471-082b5c1a1e79', 'blue-leather-backpack-sOBmw-2o8GU', 'Niebieski skórzany plecak'),
    tagline: 'Zegarki, torby i plecaki',
  },
};

export const editorialBanner = {
  categorySlug: 'kawa-i-herbata',
  eyebrow: 'Poranny rytuał',
  title: 'Kawa parzona powoli',
  text: 'Ziarna jasno palone, szklany drip i ręcznie toczone kubki: wszystko, czego potrzeba do spokojnego początku dnia.',
  image: unsplash(
    'photo-1758221052634-33f352d1318b',
    'hot-water-pouring-into-a-pour-over-coffee-filter-a0v-gPTSopg',
    'Gorąca woda wlewana do filtra z kawą',
  ),
};

/** Products picked for the home page, in this order; slugs the catalog no longer has are skipped. */
export const featuredProductSlugs = [
  'sluchawki-bezprzewodowe-aria',
  'lampa-biurkowa-arc',
  'zestaw-wazonow-glina',
  'zegarek-grafit',
  'plecak-skorzany-cognac',
  'kawa-ziarnista-etiopia',
  'glosnik-przenosny-pebble',
  'pled-welniany-krata',
];
