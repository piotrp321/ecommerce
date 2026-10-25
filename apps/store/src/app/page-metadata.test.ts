import { generateMetadata as categoryMetadata } from './kategoria/[slug]/page';
import { generateMetadata as productMetadata } from './produkt/[slug]/page';
import { generateMetadata as productsMetadata } from './produkty/page';

// generateMetadata of the catalog pages, run against the demo catalog.
const listing = (searchParams: Record<string, string> = {}) =>
  ({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) }) as PageProps<'/produkty'>;
const category = (slug: string, searchParams: Record<string, string> = {}) =>
  ({ params: Promise.resolve({ slug }), searchParams: Promise.resolve(searchParams) }) as PageProps<'/kategoria/[slug]'>;
const product = (slug: string) =>
  ({ params: Promise.resolve({ slug }), searchParams: Promise.resolve({}) }) as PageProps<'/produkt/[slug]'>;

describe('metadata of the catalog pages', () => {
  it('all products: canonical without default parameters, page number in the title', async () => {
    expect(await productsMetadata(listing())).toMatchObject({
      title: 'Wszystkie produkty',
      alternates: { canonical: '/produkty' },
    });
    expect(await productsMetadata(listing({ sortowanie: 'cena-rosnaco', strona: '2' }))).toMatchObject({
      title: 'Wszystkie produkty, strona 2',
      alternates: { canonical: '/produkty?sortowanie=cena-rosnaco&strona=2' },
    });
  });

  it('category: name, path in the description and canonical URL', async () => {
    expect(await categoryMetadata(category('sluchawki', { sortowanie: 'nazwa' }))).toEqual({
      title: 'Słuchawki',
      description: 'Produkty z kategorii Elektronika › Audio › Słuchawki.',
      alternates: { canonical: '/kategoria/sluchawki' },
    });
  });

  it('pages past the last one are not indexed (nofollow with demo data) and have no canonical URL', async () => {
    const all = await productsMetadata(listing({ strona: '99' }));
    const audio = await categoryMetadata(category('audio', { strona: '2' }));

    for (const metadata of [all, audio]) {
      expect(metadata.robots).toEqual({ index: false, follow: false });
      expect(metadata).not.toHaveProperty('alternates');
    }
  });

  it('product: name, description, canonical URL and a resized Open Graph photo', async () => {
    const metadata = await productMetadata(product('lampa-biurkowa-arc'));

    expect(metadata).toMatchObject({ title: 'Lampa biurkowa Arc', alternates: { canonical: '/produkt/lampa-biurkowa-arc' } });
    expect(metadata.description).toContain('miedzianym kloszem');
    expect(JSON.stringify(metadata.openGraph)).toContain('w=1200');
  });

  it('unknown slugs get no metadata (the page answers 404)', async () => {
    expect(await categoryMetadata(category('nie-ma'))).toEqual({});
    expect(await productMetadata(product('nie-ma'))).toEqual({});
  });
});
