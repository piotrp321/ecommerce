<?php

declare(strict_types=1);

namespace App\Tests\Integration\Catalog\Infrastructure\Persistence;

use App\Catalog\Domain\Category\CategoryId;
use App\Catalog\Domain\Category\CategoryRepository;
use App\Catalog\Domain\Product\DuplicateProductSlug;
use App\Catalog\Domain\Product\DuplicateSku;
use App\Catalog\Domain\Product\Product;
use App\Catalog\Domain\Product\ProductId;
use App\Catalog\Domain\Product\ProductNotFound;
use App\Catalog\Domain\Product\ProductRepository;
use App\Catalog\Domain\Product\Sku;
use App\Catalog\Domain\Slug;
use App\Shared\Domain\Exception\InvalidValue;
use App\Shared\Domain\Pricing\Money;
use App\Shared\Domain\Pricing\VatRate;
use App\Tests\Support\Catalog\CatalogFixtures;
use App\Tests\Support\DatabaseTestCase;

final class DoctrineProductRepositoryTest extends DatabaseTestCase
{
    private ProductRepository $products;
    private CatalogFixtures $fixtures;

    protected function setUp(): void
    {
        parent::setUp();
        $this->products = self::service(ProductRepository::class);
        $this->fixtures = new CatalogFixtures($this->products, self::service(CategoryRepository::class));
    }

    public function testStoresAndLoadsAProduct(): void
    {
        $category = $this->fixtures->category('tea');
        $saved = $this->fixtures->product('TEA-001', 'green-tea', 'Green tea', '8.13', VatRate::Reduced, $category, createdAt: '2026-10-25 12:34:56+02:00');
        self::entityManager()->clear();

        $loaded = $this->products->get($saved->id());

        self::assertNotSame($saved, $loaded);
        self::assertTrue($saved->id()->equals($loaded->id()));
        self::assertSame('TEA-001', $loaded->sku()->value);
        self::assertSame('green-tea', $loaded->slug()->value);
        self::assertSame('Green tea', $loaded->name());
        self::assertTrue(Money::fromDecimal('8.13')->equals($loaded->netPrice()));
        self::assertSame(VatRate::Reduced, $loaded->vatRate());
        self::assertTrue($category->id()->equals($loaded->categoryId() ?? CategoryId::generate()));
        self::assertTrue($loaded->isActive());
        self::assertSame($saved->createdAt()->getTimestamp(), $loaded->createdAt()->getTimestamp());
    }

    public function testReportsAMissingProduct(): void
    {
        $this->expectException(ProductNotFound::class);

        $this->products->get(ProductId::generate());
    }

    public function testAnswersExistenceQuestions(): void
    {
        $category = $this->fixtures->category('tea');
        $product = $this->fixtures->product('TEA-001', 'green-tea', category: $category);
        $other = $this->fixtures->product('TEA-002', 'black-tea');

        self::assertTrue($this->products->exists($product->id()));
        self::assertFalse($this->products->exists(ProductId::generate()));
        self::assertTrue($this->products->skuExists(new Sku('TEA-001')));
        self::assertFalse($this->products->skuExists(new Sku('TEA-003')));
        self::assertTrue($this->products->slugExists(new Slug('green-tea')));
        self::assertFalse($this->products->slugExists(new Slug('green-tea'), except: $product->id()));
        self::assertTrue($this->products->slugExists(new Slug('green-tea'), except: $other->id()));
        self::assertTrue($this->products->existsInCategory($category->id()));
        self::assertFalse($this->products->existsInCategory(CategoryId::generate()));
    }

    public function testTheDatabaseRejectsADuplicateSkuMissedByTheApplication(): void
    {
        $this->fixtures->product('TEA-001', 'green-tea');

        $this->expectException(DuplicateSku::class);

        $this->products->save($this->newProduct('TEA-001', 'other-tea'));
    }

    public function testTheDatabaseRejectsADuplicateSlugMissedByTheApplication(): void
    {
        $this->fixtures->product('TEA-001', 'green-tea');

        $this->expectException(DuplicateProductSlug::class);

        $this->products->save($this->newProduct('TEA-002', 'green-tea'));
    }

    public function testTheDatabaseRejectsACategoryDeletedAfterTheApplicationCheckedIt(): void
    {
        $this->expectException(InvalidValue::class);

        $this->products->save($this->newProduct('TEA-001', 'green-tea', CategoryId::generate()));
    }

    private function newProduct(string $sku, string $slug, ?CategoryId $categoryId = null): Product
    {
        return Product::create(
            ProductId::generate(),
            new Sku($sku),
            new Slug($slug),
            'Tea',
            null,
            Money::fromDecimal('1.00'),
            VatRate::Standard,
            $categoryId,
            new \DateTimeImmutable(),
        );
    }
}
