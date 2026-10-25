/**
 * DEMO DATA. Fictional products and categories for reviewing the panel before
 * the catalog API is available. Gross prices are written here by hand (as the
 * backend would return them); the panel never calculates VAT.
 */
import type { VatRate } from '../api/types';

export interface DemoCategoryRecord {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
}

export interface DemoProductRecord {
  id: string;
  sku: string;
  slug: string;
  name: string;
  description: string | null;
  netPrice: string;
  vatRate: VatRate;
  /** As returned by the backend; `null` after a price change in the demo. */
  grossPrice: string | null;
  categoryId: string | null;
  active: boolean;
  onHand: number;
  reserved: number;
  createdAt: string;
  updatedAt: string;
}

export function demoId(prefix: 'a' | 'c' | 'd', n: number): string {
  return `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

const categoryTree: [slug: string, name: string, parent: string | null][] = [
  ['elektronika', 'Elektronika', null],
  ['laptopy', 'Laptopy', 'elektronika'],
  ['smartfony', 'Smartfony', 'elektronika'],
  ['akcesoria', 'Akcesoria', 'elektronika'],
  ['audio', 'Audio', 'elektronika'],
  ['dom-i-ogrod', 'Dom i ogród', null],
  ['kuchnia', 'Kuchnia', 'dom-i-ogrod'],
  ['oswietlenie', 'Oświetlenie', 'dom-i-ogrod'],
  ['ogrod', 'Ogród', 'dom-i-ogrod'],
  ['sport', 'Sport', null],
  ['rowery', 'Rowery', 'sport'],
  ['fitness', 'Fitness', 'sport'],
  ['ksiazki', 'Książki', null],
  ['wyprzedaz', 'Wyprzedaż', null],
];

const categoryIds = new Map(categoryTree.map(([slug], index) => [slug, demoId('c', index + 1)]));

function categoryId(slug: string | null): string | null {
  return slug === null ? null : (categoryIds.get(slug) ?? null);
}

export function demoCategories(): DemoCategoryRecord[] {
  return categoryTree.map(([slug, name, parent]) => ({
    id: categoryId(slug) ?? '',
    slug,
    name,
    parentId: categoryId(parent),
  }));
}

function p(
  n: number,
  sku: string,
  name: string,
  slug: string,
  category: string | null,
  netPrice: string,
  vatRate: VatRate,
  grossPrice: string,
  onHand: number,
  reserved: number,
  active: boolean,
  description: string | null,
): DemoProductRecord {
  const createdAt = new Date(Date.UTC(2026, 8, 1 + n, 9, n % 60)).toISOString();

  return {
    id: demoId('a', n),
    sku,
    slug,
    name,
    description,
    netPrice,
    vatRate,
    grossPrice,
    categoryId: categoryId(category),
    active,
    onHand,
    reserved,
    createdAt,
    updatedAt: createdAt,
  };
}

export function demoProducts(): DemoProductRecord[] {
  return [
    p(1, 'LAP-ZEN-14', 'Laptop Zenbook 14 OLED', 'laptop-zenbook-14-oled', 'laptopy', '4064.23', 23, '4999.00', 12, 2, true, 'Ultralekki laptop 14" z ekranem OLED 2,8K.'),
    p(2, 'LAP-THINK-E16', 'Laptop ThinkPad E16 Gen 2', 'laptop-thinkpad-e16-gen-2', 'laptopy', '3251.22', 23, '3999.00', 4, 1, true, 'Biznesowy laptop 16" z klawiaturą numeryczną.'),
    p(3, 'LAP-AIR-13', 'Laptop Air 13 M3', 'laptop-air-13-m3', 'laptopy', '5690.24', 23, '6999.00', 0, 0, true, null),
    p(4, 'LAP-GAME-17', 'Laptop gamingowy Predator 17', 'laptop-gamingowy-predator-17', 'laptopy', '7316.26', 23, '8999.00', 3, 0, false, 'Model wycofywany z oferty.'),
    p(5, 'PHN-PIX-9', 'Smartfon Pixel 9 128 GB', 'smartfon-pixel-9-128-gb', 'smartfony', '3089.43', 23, '3800.00', 25, 4, true, 'Czysty Android, 7 lat aktualizacji.'),
    p(6, 'PHN-GAL-S25', 'Smartfon Galaxy S25 256 GB', 'smartfon-galaxy-s25-256-gb', 'smartfony', '3657.72', 23, '4499.00', 18, 0, true, null),
    p(7, 'PHN-MOTO-G85', 'Smartfon Moto G85', 'smartfon-moto-g85', 'smartfony', '1056.10', 23, '1299.00', 2, 0, true, 'Budżetowy smartfon z ekranem pOLED.'),
    p(8, 'ACC-CHG-65W', 'Ładowarka GaN 65 W USB-C', 'ladowarka-gan-65-w-usb-c', 'akcesoria', '162.60', 23, '200.00', 140, 10, true, 'Trzy porty, obsługa PD 3.0.'),
    p(9, 'ACC-CBL-2M', 'Kabel USB-C 2 m 100 W', 'kabel-usb-c-2-m-100-w', 'akcesoria', '48.78', 23, '60.00', 320, 0, true, null),
    p(10, 'ACC-CASE-P9', 'Etui silikonowe do Pixel 9', 'etui-silikonowe-do-pixel-9', 'akcesoria', '73.17', 23, '90.00', 0, 0, false, null),
    p(11, 'ACC-PB-20K', 'Powerbank 20 000 mAh', 'powerbank-20-000-mah', 'akcesoria', '121.14', 23, '149.00', 5, 0, true, 'Szybkie ładowanie 22,5 W.'),
    p(12, 'AUD-BUDS-PRO', 'Słuchawki bezprzewodowe Buds Pro', 'sluchawki-bezprzewodowe-buds-pro', 'audio', '650.41', 23, '800.00', 37, 3, true, 'Aktywna redukcja szumów.'),
    p(13, 'AUD-SPK-GO4', 'Głośnik przenośny Go 4', 'glosnik-przenosny-go-4', 'audio', '203.25', 23, '250.00', 1, 0, true, null),
    p(14, 'KIT-KETTLE-17', 'Czajnik elektryczny 1,7 l', 'czajnik-elektryczny-1-7-l', 'kuchnia', '129.27', 23, '159.00', 44, 0, true, 'Regulacja temperatury 40–100 °C.'),
    p(15, 'KIT-PAN-28', 'Patelnia granitowa 28 cm', 'patelnia-granitowa-28-cm', 'kuchnia', '113.82', 23, '140.00', 60, 5, true, null),
    p(16, 'KIT-KNIFE-SET', 'Zestaw noży kuchennych 5 el.', 'zestaw-nozy-kuchennych-5-el', 'kuchnia', '243.09', 23, '299.00', 0, 0, true, 'Stal nierdzewna, blok z drewna bukowego.'),
    p(17, 'KIT-COFFEE-01', 'Ekspres przelewowy z termosem', 'ekspres-przelewowy-z-termosem', 'kuchnia', '349.59', 23, '430.00', 9, 0, false, null),
    p(18, 'LGT-LED-E27', 'Żarówka LED E27 9 W (3 szt.)', 'zarowka-led-e27-9-w-3-szt', 'oswietlenie', '32.52', 23, '40.00', 500, 0, true, null),
    p(19, 'LGT-DESK-01', 'Lampka biurkowa z regulacją barwy', 'lampka-biurkowa-z-regulacja-barwy', 'oswietlenie', '186.18', 23, '229.00', 14, 0, true, 'Ściemnianie i trzy tryby barwy światła.'),
    p(20, 'LGT-STRIP-5M', 'Taśma LED RGB 5 m', 'tasma-led-rgb-5-m', 'oswietlenie', '89.43', 23, '110.00', 3, 0, true, null),
    p(21, 'GRD-HOSE-25', 'Wąż ogrodowy 25 m', 'waz-ogrodowy-25-m', 'ogrod', '97.56', 23, '120.00', 22, 0, true, null),
    p(22, 'GRD-SEED-HERB', 'Nasiona ziół – zestaw 6 odmian', 'nasiona-ziol-zestaw-6-odmian', 'ogrod', '22.22', 8, '24.00', 75, 0, true, 'Bazylia, mięta, tymianek, oregano, kolendra, natka.'),
    p(23, 'BIK-MTB-29', 'Rower górski MTB 29"', 'rower-gorski-mtb-29', 'rowery', '2438.21', 23, '2999.00', 6, 1, true, 'Rama aluminiowa, osprzęt 1×12.'),
    p(24, 'BIK-CITY-28', 'Rower miejski 28" z koszykiem', 'rower-miejski-28-z-koszykiem', 'rowery', '1625.20', 23, '1999.00', 0, 0, true, null),
    p(25, 'BIK-HELM-M', 'Kask rowerowy, rozmiar M', 'kask-rowerowy-rozmiar-m', 'rowery', '162.60', 23, '200.00', 31, 0, true, null),
    p(26, 'FIT-MAT-6', 'Mata do jogi 6 mm', 'mata-do-jogi-6-mm', 'fitness', '81.30', 23, '100.00', 48, 0, true, null),
    p(27, 'FIT-DB-2X5', 'Hantle 2 × 5 kg', 'hantle-2-x-5-kg', 'fitness', '130.08', 23, '160.00', 4, 0, true, null),
    p(28, 'FIT-BAND-SET', 'Gumy oporowe – zestaw 5 szt.', 'gumy-oporowe-zestaw-5-szt', 'fitness', '48.77', 23, '59.99', 0, 0, false, null),
    p(29, 'BOK-DDD', 'Domain-Driven Design. Zapanuj nad złożonym systemem', 'domain-driven-design', 'ksiazki', '128.57', 5, '135.00', 15, 0, true, 'Klasyka modelowania dziedziny.'),
    p(30, 'BOK-CLEAN-ARCH', 'Czysta architektura', 'czysta-architektura', 'ksiazki', '85.71', 5, '90.00', 27, 2, true, null),
    p(31, 'BOK-REFACTOR', 'Refaktoryzacja. Ulepszanie struktury istniejącego kodu', 'refaktoryzacja', 'ksiazki', '104.76', 5, '110.00', 2, 0, true, null),
    p(32, 'BOK-PRAG-PROG', 'Pragmatyczny programista', 'pragmatyczny-programista', 'ksiazki', '76.19', 5, '80.00', 11, 0, true, null),
    p(33, 'EBK-TS-HANDBOOK', 'TypeScript w praktyce (e-book)', 'typescript-w-praktyce-e-book', 'ksiazki', '45.53', 23, '56.00', 9999, 0, true, 'Publikacja elektroniczna.'),
    p(34, 'GFT-CARD-100', 'Karta podarunkowa 100 zł', 'karta-podarunkowa-100-zl', null, '100.00', 0, '100.00', 1000, 0, true, 'Bon bez VAT (rozliczany przy realizacji).'),
    p(35, 'ACC-MOUSE-MX', 'Mysz bezprzewodowa MX', 'mysz-bezprzewodowa-mx', 'akcesoria', '365.04', 23, '449.00', 19, 0, true, null),
    p(36, 'ACC-KB-MECH', 'Klawiatura mechaniczna 75%', 'klawiatura-mechaniczna-75', 'akcesoria', '406.50', 23, '500.00', 7, 0, true, null),
  ];
}
