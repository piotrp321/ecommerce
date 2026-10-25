<?php

declare(strict_types=1);

namespace App\Tests\Unit\Catalog\Application\Category;

use App\Catalog\Application\Category\CategoryHandler;
use App\Catalog\Domain\Category\CategoryId;
use App\Catalog\Domain\Category\CategoryNotEmpty;
use App\Catalog\Domain\Category\CategoryNotFound;
use App\Catalog\Domain\Category\DuplicateCategorySlug;
use App\Catalog\Domain\Product\Product;
use App\Catalog\Domain\Product\ProductId;
use App\Catalog\Domain\Product\Sku;
use App\Catalog\Domain\Slug;
use App\Shared\Domain\Pricing\Money;
use App\Shared\Domain\Pricing\VatRate;
use App\Tests\Support\Catalog\InMemoryCategoryRepository;
use App\Tests\Support\Catalog\InMemoryProductRepository;
use PHPUnit\Framework\TestCase;

final class CategoryHandlerTest extends TestCase
{
    private InMemoryCategoryRepository $categories;
    private InMemoryProductRepository $products;
    private CategoryHandler $handler;

    protected function setUp(): void
    {
        $this->categories = new InMemoryCategoryRepository();
        $this->products = new InMemoryProductRepository();
        $this->handler = new CategoryHandler($this->categories, $this->products);
    }

    public function testCreatesAndUpdatesACategory(): void
    {
        $id = $this->handler->create('tea', 'Tea');
        $this->handler->update($id->value, 'tea', 'Teas');

        self::assertSame('Teas', $this->categories->get($id)->name());
    }

    public function testRejectsADuplicateSlug(): void
    {
        $this->handler->create('tea', 'Tea');

        $this->expectException(DuplicateCategorySlug::class);

        $this->handler->create('tea', 'Other tea');
    }

    public function testRejectsAnUpdateToASlugOfAnotherCategory(): void
    {
        $id = $this->handler->create('tea', 'Tea');
        $this->handler->create('coffee', 'Coffee');

        $this->expectException(DuplicateCategorySlug::class);

        $this->handler->update($id->value, 'coffee', 'Tea');
    }

    public function testDeletesAnEmptyCategory(): void
    {
        $id = $this->handler->create('tea', 'Tea');

        $this->handler->delete($id->value);

        self::assertFalse($this->categories->exists($id));
    }

    public function testDoesNotDeleteACategoryWithProducts(): void
    {
        $id = $this->handler->create('tea', 'Tea');
        $this->products->save(Product::create(
            ProductId::generate(),
            new Sku('TEA-001'),
            new Slug('green-tea'),
            'Green tea',
            null,
            Money::fromDecimal('8.13'),
            VatRate::Standard,
            $id,
            new \DateTimeImmutable(),
        ));

        $this->expectException(CategoryNotEmpty::class);

        $this->handler->delete($id->value);
    }

    public function testDeletingAMissingCategoryFails(): void
    {
        $this->expectException(CategoryNotFound::class);

        $this->handler->delete(CategoryId::generate()->value);
    }
}
