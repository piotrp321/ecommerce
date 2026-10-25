import { unsplash } from '@/lib/unsplash';
import type { CatalogImage, CategoryNode, Product, PublicPrice } from '../types';

// SAMPLE DATA for the store UI until the catalog API is connected. Products, prices and
// availability are made up and must not be presented as a real catalog (the layout shows
// a demo notice and the pages are not indexed while this source is active).
// Gross prices are written down as the backend would return them: the store never
// calculates VAT or availability itself.
// Photos: Unsplash (https://unsplash.com/license), free to use; sourceUrl credits each photo.

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const gross = (amount: string): PublicPrice => ({ gross: { amount, currency: 'PLN' }, vatRate: 23 });

const category = (n: number, slug: string, name: string, children: CategoryNode[] = []): CategoryNode => ({
  id: id(n),
  slug,
  name,
  children,
});

// Siblings ordered by name, as the API returns them.
export const demoCategoryTree: CategoryNode[] = [
  category(100, 'akcesoria', 'Akcesoria', [
    category(101, 'torby-i-plecaki', 'Torby i plecaki'),
    category(102, 'zegarki', 'Zegarki'),
  ]),
  category(200, 'dom-i-wnetrze', 'Dom i wnętrze', [
    category(201, 'ceramika', 'Ceramika'),
    category(202, 'oswietlenie', 'Oświetlenie'),
    category(203, 'tekstylia', 'Tekstylia'),
  ]),
  category(300, 'elektronika', 'Elektronika', [
    category(310, 'audio', 'Audio', [category(311, 'glosniki', 'Głośniki'), category(312, 'sluchawki', 'Słuchawki')]),
    category(320, 'fotografia', 'Fotografia'),
    category(330, 'inteligentny-dom', 'Inteligentny dom'),
  ]),
  category(400, 'kuchnia', 'Kuchnia', [category(401, 'kawa-i-herbata', 'Kawa i herbata')]),
];

interface ProductSeed {
  slug: string;
  name: string;
  category: string;
  price: string;
  inStock: boolean;
  description: string;
  image: CatalogImage;
}

const seeds: ProductSeed[] = [
  {
    slug: 'sluchawki-bezprzewodowe-aria',
    name: 'Słuchawki bezprzewodowe Aria',
    category: 'sluchawki',
    price: '599.00',
    inStock: true,
    description:
      'Lekkie słuchawki nauszne z miękkimi poduszkami i składanym pałąkiem. Do codziennej pracy, podróży i długich sesji z muzyką.',
    image: unsplash('photo-1505740420928-5e560c06d30e', 'flatlay-photography-of-wireless-headphones-PDX_a_82obo', 'Białe słuchawki bezprzewodowe na jasnym tle'),
  },
  {
    slug: 'sluchawki-nauszne-nocturne',
    name: 'Słuchawki nauszne Nocturne',
    category: 'sluchawki',
    price: '449.00',
    inStock: true,
    description: 'Matowe, czarne słuchawki o zamkniętej konstrukcji, które dobrze odcinają od hałasu biura i komunikacji miejskiej.',
    image: unsplash('photo-1585298723682-7115561c51b7', 'black-and-white-photo-of-headphones-oXXc-s5nNy8', 'Czarne słuchawki nauszne na ciemnym tle'),
  },
  {
    slug: 'sluchawki-studio-cream',
    name: 'Słuchawki Studio Cream',
    category: 'sluchawki',
    price: '729.00',
    inStock: false,
    description: 'Kremowe słuchawki z obszytym pałąkiem i wyraźną sceną dźwiękową. Wersja limitowana.',
    image: unsplash('photo-1766338055584-5ffe426a7e57', 'cream-colored-headphones-resting-on-an-open-book-BShMIbt__LM', 'Kremowe słuchawki leżące na otwartej książce'),
  },
  {
    slug: 'sluchawki-pastel',
    name: 'Słuchawki Pastel',
    category: 'sluchawki',
    price: '349.00',
    inStock: true,
    description: 'Pastelowe, lekkie słuchawki z długim czasem pracy na baterii i wygodnym etui.',
    image: unsplash('photo-1613040809024-b4ef7ba99bc3', 'pink-and-white-wireless-headphones-Zam8TvEgN5o', 'Różowo-białe słuchawki bezprzewodowe'),
  },
  {
    slug: 'glosnik-przenosny-pebble',
    name: 'Głośnik przenośny Pebble',
    category: 'glosniki',
    price: '279.00',
    inStock: true,
    description: 'Kompaktowy głośnik o obłym kształcie. Mieści się w torbie, a gra pełnym dźwiękiem na tarasie i w kuchni.',
    image: unsplash('photo-1582978571763-2d039e56f0c3', 'white-and-silver-portable-speaker-on-brown-wooden-table-gbG65gRAGx4', 'Biało-srebrny głośnik przenośny na drewnianym stole'),
  },
  {
    slug: 'glosnik-terra',
    name: 'Głośnik Terra',
    category: 'glosniki',
    price: '389.00',
    inStock: false,
    description: 'Wytrzymały głośnik w aluminiowej obudowie, z mocnym basem i odpornością na zachlapania.',
    image: unsplash('photo-1507878566509-a0dbe19677a5', 'selective-focus-photography-of-black-and-gray-portable-speaker-VSYq9nS-fY0', 'Czarno-szary głośnik przenośny na parapecie'),
  },
  {
    slug: 'aparat-dalmierzowy-retro-35',
    name: 'Aparat dalmierzowy Retro 35',
    category: 'fotografia',
    price: '1249.00',
    inStock: true,
    description: 'Odnowiony aparat małoobrazkowy z dalmierzem, metalowym korpusem i jasnym obiektywem stałoogniskowym.',
    image: unsplash('photo-1510127034890-ba27508e9f1c', 'black-and-gray-film-camera-near-printed-photos-F3Dde_9thd8', 'Czarno-srebrny aparat obok wydrukowanych zdjęć'),
  },
  {
    slug: 'aparat-analogowy-kadr',
    name: 'Aparat analogowy Kadr',
    category: 'fotografia',
    price: '899.00',
    inStock: true,
    description: 'Lustrzanka na film 35 mm w brązowej okleinie. Dobra na początek przygody z fotografią analogową.',
    image: unsplash('photo-1520549233664-03f65c1d1327', 'brown-and-gray-slr-camera-on-white-surface-lFnMKEZT4zk', 'Brązowo-szara lustrzanka analogowa na białym tle'),
  },
  {
    slug: 'aparat-analogowy-podroznik',
    name: 'Aparat analogowy Podróżnik',
    category: 'fotografia',
    price: '1590.00',
    inStock: false,
    description: 'Klasyczna lustrzanka z metalowym korpusem, z rolką filmu na start. Egzemplarz kolekcjonerski.',
    image: unsplash('photo-1452587925148-ce544e77e70d', 'black-and-grey-dslr-camera-near-several-photos-on-brown-map-mj2NwYH3wBA', 'Aparat analogowy i zdjęcia na mapie'),
  },
  {
    slug: 'lampa-biurkowa-arc',
    name: 'Lampa biurkowa Arc',
    category: 'oswietlenie',
    price: '459.00',
    inStock: true,
    description: 'Lampa z miedzianym kloszem i regulowanym ramieniem. Skupione, ciepłe światło do pracy przy biurku.',
    image: unsplash('photo-1551380701-5dd33d5b5d06', 'black-wooden-desk-and-brown-desk-lamp-lrRaEBnR79Y', 'Miedziana lampa biurkowa na czarnej komodzie'),
  },
  {
    slug: 'lampka-nocna-dab',
    name: 'Lampka nocna Dąb',
    category: 'oswietlenie',
    price: '319.00',
    inStock: true,
    description: 'Lampka z dębową podstawą i lnianym abażurem, dająca ciepłe, rozproszone światło.',
    image: unsplash('photo-1769255119650-f658d3dbc397', 'a-modern-lamp-with-a-wooden-base-glows-softly-VdrwI_63-Po', 'Nowoczesna lampka z drewnianą podstawą świecąca ciepłym światłem'),
  },
  {
    slug: 'lampa-stolowa-mosiadz',
    name: 'Lampa stołowa Mosiądz',
    category: 'oswietlenie',
    price: '689.00',
    inStock: true,
    description: 'Elegancka lampa w kolorze szczotkowanego mosiądzu, do salonu i sypialni.',
    image: unsplash('photo-1542728928-1413d1894ed1', 'gold-table-almp-VDPauwJ_sHo', 'Złota lampa stołowa'),
  },
  {
    slug: 'zestaw-wazonow-glina',
    name: 'Zestaw wazonów Glina (3 szt.)',
    category: 'ceramika',
    price: '239.00',
    inStock: true,
    description: 'Trzy wazony z naturalnej gliny w różnych wysokościach. Pięknie wyglądają razem, także bez kwiatów.',
    image: unsplash('photo-1631125915902-d8abe9225ff2', '3-brown-clay-vases-on-white-concrete-table-zeGT9j4ltRA', 'Trzy brązowe gliniane wazony na betonowym stole'),
  },
  {
    slug: 'wazon-bialy-kamien',
    name: 'Wazon Biały Kamień',
    category: 'ceramika',
    price: '159.00',
    inStock: true,
    description: 'Matowy, biały wazon o kamiennej fakturze, toczony ręcznie w małej pracowni.',
    image: unsplash('photo-1612196808214-b8e1d6145a8c', 'white-ceramic-vase-on-brown-wooden-table-WUrXahlyjBo', 'Biały ceramiczny wazon na drewnianym stole'),
  },
  {
    slug: 'kubek-recznie-toczony',
    name: 'Kubek ręcznie toczony',
    category: 'ceramika',
    price: '89.00',
    inStock: true,
    description: 'Rustykalny kubek z kamionki o pojemności 300 ml. Każdy egzemplarz jest nieco inny.',
    image: unsplash('photo-1782351094137-14cef7134c18', 'a-rustic-handmade-ceramic-cup-on-a-wooden-table-n9I_Xp7nyCk', 'Rustykalny ręcznie robiony kubek na drewnianym stole'),
  },
  {
    slug: 'kubek-mech',
    name: 'Kubek Mech',
    category: 'ceramika',
    price: '79.00',
    inStock: false,
    description: 'Nakrapiany zielony kubek z kamionki, szkliwiony od środka i z zewnątrz.',
    image: unsplash('photo-1782351076283-73aa35f76058', 'a-speckled-green-ceramic-cup-on-a-wooden-table-BGEqCc-bQHg', 'Nakrapiany zielony kubek na drewnianym stole'),
  },
  {
    slug: 'poduszka-lniana',
    name: 'Poduszka lniana',
    category: 'tekstylia',
    price: '149.00',
    inStock: true,
    description: 'Poszewka z lnu pranego z wypełnieniem, 45 × 45 cm. Miękka w dotyku od pierwszego dnia.',
    image: unsplash('photo-1617597193786-a3afcf869f23', 'white-and-brown-throw-pillow-on-white-couch-wIcn6k6nPwo', 'Biało-brązowa poduszka na białej sofie'),
  },
  {
    slug: 'pled-welniany-krata',
    name: 'Pled wełniany Krata',
    category: 'tekstylia',
    price: '329.00',
    inStock: true,
    description: 'Ciepły pled z wełny w klasyczną kratę, 130 × 180 cm.',
    image: unsplash('photo-1730705123286-fc037477e7dd', 'a-close-up-of-a-blanket-with-a-check-pattern-8Cc-WEcHDhY', 'Zbliżenie na koc w kratę'),
  },
  {
    slug: 'zestaw-pledow-warstwy',
    name: 'Zestaw pledów Warstwy',
    category: 'tekstylia',
    price: '499.00',
    inStock: false,
    description: 'Trzy pledy w stonowanych kolorach, do łączenia na sofie i łóżku.',
    image: unsplash('photo-1734553529922-bc020a21643b', 'a-stack-of-blankets-sitting-on-top-of-each-other-WB7wXI8S0SE', 'Stos złożonych koców'),
  },
  {
    slug: 'kawa-ziarnista-etiopia',
    name: 'Kawa ziarnista Etiopia, 1 kg',
    category: 'kawa-i-herbata',
    price: '119.00',
    inStock: true,
    description: 'Jasno palona arabika z nutami jagód i kwiatów. Do przelewu i ekspresu ciśnieniowego.',
    image: unsplash('photo-1524350876685-274059332603', 'shallow-focus-photography-of-coffee-beans-in-sack-obV_LM0KjxY', 'Ziarna kawy w jutowym worku'),
  },
  {
    slug: 'zestaw-herbat-sypanych',
    name: 'Zestaw herbat sypanych',
    category: 'kawa-i-herbata',
    price: '99.00',
    inStock: true,
    description: 'Sześć gatunków herbaty liściastej: od zielonej sencha po aromatyczną czarną.',
    image: unsplash('photo-1563822249366-3efb23b8e0c9', 'tea-leaves-on-silver-spoons-xdD-x2Y2SPI', 'Herbaty sypane na srebrnych łyżeczkach'),
  },
  {
    slug: 'drip-do-kawy-z-dzbankiem',
    name: 'Drip do kawy z dzbankiem',
    category: 'kawa-i-herbata',
    price: '189.00',
    inStock: true,
    description: 'Szklany zestaw do parzenia kawy metodą przelewową, na 2–4 filiżanki.',
    image: unsplash('photo-1442512595331-e89e73853f31', 'person-filling-glass-container-TYIzeCiZ_60', 'Parzenie kawy metodą przelewową do szklanego dzbanka'),
  },
  {
    slug: 'zegarek-grafit',
    name: 'Zegarek Grafit',
    category: 'zegarki',
    price: '899.00',
    inStock: true,
    description: 'Czarny zegarek z matową tarczą i miękkim silikonowym paskiem. Lekki, wodoszczelny do 5 ATM.',
    image: unsplash('photo-1786217414328-e8a1428014fe', 'black-wristwatch-on-river-stones-tBolmPeAdkI', 'Czarny zegarek z szarym paskiem na kamykach'),
  },
  {
    slug: 'zegarek-minimal',
    name: 'Zegarek Minimal',
    category: 'zegarki',
    price: '649.00',
    inStock: true,
    description: 'Minimalistyczny zegarek z białą tarczą, cienką kopertą i skórzanym paskiem. Pasuje do każdej okazji.',
    image: unsplash('photo-1524592094714-0f0654e20314', 'person-holding-analog-watch-xfNeB1stZ_0', 'Dłoń trzymająca zegarek z białą tarczą'),
  },
  {
    slug: 'plecak-skorzany-cognac',
    name: 'Plecak skórzany Cognac',
    category: 'torby-i-plecaki',
    price: '749.00',
    inStock: true,
    description: 'Plecak ze skóry licowej w kolorze koniaku, z przegrodą na laptopa 14".',
    image: unsplash('photo-1622560480605-d83c853bc5c3', 'brown-leather-backpack-on-white-surface-3o-X8WJOP5E', 'Brązowy skórzany plecak na białym tle'),
  },
  {
    slug: 'torba-plocienna-eko',
    name: 'Torba płócienna Eko',
    category: 'torby-i-plecaki',
    price: '69.00',
    inStock: true,
    description: 'Pojemna torba z grubej bawełny organicznej, na zakupy i na co dzień.',
    image: unsplash('photo-1544816155-12df9643f363', 'beige-eco-bag-1Pgq9ZpIatI', 'Beżowa torba płócienna'),
  },
  {
    slug: 'torba-skorzana-shopper',
    name: 'Torba skórzana Shopper',
    category: 'torby-i-plecaki',
    price: '559.00',
    inStock: false,
    description: 'Czarna torba typu shopper z miękkiej skóry, z wewnętrzną kieszenią na zamek.',
    image: unsplash('photo-1578237493287-8d4d2b03591a', 'black-leather-tote-bag-TK-rrTgYqzo', 'Czarna skórzana torba'),
  },
];

function findRef(slug: string, nodes: CategoryNode[]): CategoryNode | undefined {
  for (const node of nodes) {
    if (node.slug === slug) return node;
    const found = findRef(slug, node.children);
    if (found) return found;
  }
  return undefined;
}

export const demoProducts: Product[] = seeds.map((seed, index) => {
  const node = findRef(seed.category, demoCategoryTree);
  if (!node) throw new Error(`Unknown demo category "${seed.category}"`);

  return {
    id: id(1000 + index),
    sku: `DEMO-${String(index + 1).padStart(3, '0')}`,
    slug: seed.slug,
    name: seed.name,
    description: seed.description,
    price: gross(seed.price),
    category: { id: node.id, slug: node.slug, name: node.name },
    inStock: seed.inStock,
    image: seed.image,
  };
});
