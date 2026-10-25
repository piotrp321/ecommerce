<?php

declare(strict_types=1);

namespace App\Tests\Integration\Catalog\Infrastructure\Persistence;

use App\Catalog\Application\Query\ProductCriteria;
use App\Catalog\Application\Query\ProductFinder;
use App\Catalog\Application\Query\ProductRecord;
use App\Catalog\Application\Query\ProductSort;
use App\Catalog\Application\Query\ProductStatusFilter;
use App\Catalog\Domain\Category\CategoryRepository;
use App\Catalog\Domain\Product\ProductRepository;
use App\Shared\Domain\Pricing\VatRate;
use App\Tests\Support\Catalog\CatalogFixtures;
use App\Tests\Support\DatabaseTestCase;

final class DbalProductFinderTest extends DatabaseTestCase
{
    private ProductFinder $finder;
    private CatalogFixtures $fixtures;

    protected function setUp(): void
    {
        parent::setUp();
        $this->finder = self::service(ProductFinder::class);
        $this->fixtures = new CatalogFixtures(self::service(ProductRepository::class), self::service(CategoryRepository::class));
    }

    public function testReadsAllFieldsWithTheCategory(): void
    {
        $category = $this->fixtures->category('tea', 'Tea');
        $product = $this->fixtures->product('TEA-001', 'green-tea', 'Green tea', '8.13', VatRate::Reduced, $category);

        $record = $this->finder->byId($product->id()->value);

        self::assertNotNull($record);
        self::assertSame($product->id()->value, $record->id);
        self::assertSame('TEA-001', $record->sku);
        self::assertSame('green-tea', $record->slug);
        self::assertSame('Green tea', $record->name);
        self::assertNull($record->description);
        self::assertSame('8.13', $record->netPrice->toDecimal());
        self::assertSame(VatRate::Reduced, $record->vatRate);
        self::assertSame($category->id()->value, $record->category?->id);
        self::assertSame('tea', $record->category->slug);
        self::assertSame('Tea', $record->category->name);
        self::assertTrue($record->active);
        self::assertSame($product->createdAt()->getTimestamp(), $record->createdAt->getTimestamp());
    }

    public function testFindsOnlyActiveProductsBySlug(): void
    {
        $this->fixtures->product('TEA-001', 'green-tea');
        $this->fixtures->product('TEA-002', 'black-tea', active: false);

        self::assertNotNull($this->finder->activeBySlug('green-tea'));
        self::assertNull($this->finder->activeBySlug('black-tea'));
        self::assertNull($this->finder->activeBySlug('missing'));
        self::assertNull($this->finder->byId('not-a-uuid'));
    }

    public function testFiltersByStatusCategoryAndSearch(): void
    {
        $tea = $this->fixtures->category('tea');
        $coffee = $this->fixtures->category('coffee');
        $this->fixtures->product('TEA-001', name: 'Green tea', category: $tea);
        $this->fixtures->product('TEA-002', name: 'Black tea', category: $tea, active: false);
        $this->fixtures->product('COF-001', name: 'Espresso 100%', category: $coffee);
        $this->fixtures->product('MUG-001', name: 'Mug');

        self::assertSame(['Espresso 100%', 'Green tea', 'Mug'], $this->names(status: ProductStatusFilter::Active));
        self::assertSame(['Black tea'], $this->names(status: ProductStatusFilter::Inactive));
        self::assertSame(['Black tea', 'Green tea'], $this->names(categorySlug: 'tea'));
        self::assertSame(['Black tea', 'Green tea'], $this->names(categoryId: $tea->id()->value));
        self::assertSame([], $this->names(categoryId: 'not-a-uuid'));
        self::assertSame([], $this->names(categorySlug: 'missing'));
        self::assertSame(['Black tea', 'Green tea'], $this->names(search: 'TEA'));
        self::assertSame(['Espresso 100%'], $this->names(search: 'cof-'));
        // LIKE wildcards in the search term are literal characters.
        self::assertSame(['Espresso 100%'], $this->names(search: '0%'));
        self::assertSame([], $this->names(search: '_'));
    }

    public function testSortsNamesByPolishRules(): void
    {
        foreach (['Zegar', 'apple', 'Łyżka', 'ćma', 'Cukier', 'Lampa', 'Ćwiek'] as $i => $name) {
            $this->fixtures->product('P-'.$i, name: $name);
        }

        self::assertSame(['apple', 'Cukier', 'ćma', 'Ćwiek', 'Lampa', 'Łyżka', 'Zegar'], $this->names());
    }

    public function testACategoryFilterIncludesAllSubcategories(): void
    {
        $electronics = $this->fixtures->category('electronics');
        $phones = $this->fixtures->category('phones', parent: $electronics);
        $smartphones = $this->fixtures->category('smartphones', parent: $phones);
        $this->fixtures->product('TV', name: 'TV', category: $electronics);
        $this->fixtures->product('DECT', name: 'DECT phone', category: $phones);
        $this->fixtures->product('PIXEL', name: 'Pixel', category: $smartphones);
        $this->fixtures->product('BOOK', name: 'Book');

        self::assertSame(['DECT phone', 'Pixel', 'TV'], $this->names(categorySlug: 'electronics'));
        self::assertSame(['DECT phone', 'Pixel'], $this->names(categoryId: $phones->id()->value));
        self::assertSame(['Pixel'], $this->names(categorySlug: 'smartphones'));
    }

    public function testSortsByGrossPriceAndPaginates(): void
    {
        // Gross prices: 12.30, 10.80, 11.00 (net order differs from gross order).
        $this->fixtures->product('A', name: 'A', netPrice: '10.00', vatRate: VatRate::Standard, createdAt: '2026-10-01');
        $this->fixtures->product('B', name: 'B', netPrice: '10.00', vatRate: VatRate::Reduced, createdAt: '2026-10-02');
        $this->fixtures->product('C', name: 'C', netPrice: '11.00', vatRate: VatRate::Zero, createdAt: '2026-10-03');

        self::assertSame(['B', 'C', 'A'], $this->names(sort: ProductSort::PriceAscending));
        self::assertSame(['A', 'C', 'B'], $this->names(sort: ProductSort::PriceDescending));
        self::assertSame(['C', 'B', 'A'], $this->names(sort: ProductSort::Newest));

        $page = $this->finder->search(new ProductCriteria(page: 2, perPage: 2));
        self::assertSame(['C'], array_map(static fn (ProductRecord $p): string => $p->name, $page->items));
        self::assertSame(3, $page->totalItems);
        self::assertSame(2, $page->totalPages());

        // The most expensive allowed product: net × 123 does not fit a 32-bit integer.
        $this->fixtures->product('D', name: 'D', netPrice: '9999999.99', vatRate: VatRate::Standard, createdAt: '2026-10-04');
        self::assertSame(['D', 'A', 'C', 'B'], $this->names(sort: ProductSort::PriceDescending));
        self::assertSame(['B', 'C', 'A', 'D'], $this->names(sort: ProductSort::PriceAscending));

        $beyond = $this->finder->search(new ProductCriteria(page: 3, perPage: 2));
        self::assertSame([], $beyond->items);
        self::assertSame(4, $beyond->totalItems);
    }

    /**
     * @return list<string>
     */
    private function names(
        ProductStatusFilter $status = ProductStatusFilter::All,
        ?string $categorySlug = null,
        ?string $categoryId = null,
        ?string $search = null,
        ProductSort $sort = ProductSort::Name,
    ): array {
        $page = $this->finder->search(new ProductCriteria($status, $categorySlug, $categoryId, $search, $sort));

        return array_map(static fn (ProductRecord $product): string => $product->name, $page->items);
    }
}
