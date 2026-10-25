<?php

declare(strict_types=1);

namespace App\Tests\Unit\Catalog\Application\Product;

use App\Catalog\Application\Product\CreateProduct;
use App\Catalog\Application\Product\ProductHandler;
use App\Catalog\Application\Product\ProductInput;
use App\Catalog\Application\Product\UpdateProduct;
use App\Catalog\Domain\Category\Category;
use App\Catalog\Domain\Category\CategoryId;
use App\Catalog\Domain\Product\DuplicateProductSlug;
use App\Catalog\Domain\Product\DuplicateSku;
use App\Catalog\Domain\Product\ProductId;
use App\Catalog\Domain\Product\ProductNotFound;
use App\Catalog\Domain\Slug;
use App\Shared\Domain\Exception\InvalidValue;
use App\Shared\Domain\Pricing\VatRate;
use App\Tests\Support\Catalog\InMemoryCategoryRepository;
use App\Tests\Support\Catalog\InMemoryProductRepository;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Clock\MockClock;

final class ProductHandlerTest extends TestCase
{
    private InMemoryProductRepository $products;
    private InMemoryCategoryRepository $categories;
    private MockClock $clock;
    private ProductHandler $handler;

    protected function setUp(): void
    {
        $this->products = new InMemoryProductRepository();
        $this->categories = new InMemoryCategoryRepository();
        $this->clock = new MockClock('2026-10-25 12:00:00');
        $this->handler = new ProductHandler($this->products, new ProductInput($this->categories), $this->clock);
    }

    public function testCreatesAnInactiveProduct(): void
    {
        $category = $this->category();

        $id = $this->handler->create($this->createCommand(categoryId: $category->value));

        $product = $this->products->get($id);
        self::assertFalse($product->isActive());
        self::assertSame('TEA-001', $product->sku()->value);
        self::assertSame(VatRate::Standard, $product->vatRate());
        self::assertTrue($category->equals($product->categoryId() ?? CategoryId::generate()));
        self::assertEquals($this->clock->now(), $product->createdAt());
    }

    public function testRejectsADuplicateSku(): void
    {
        $this->handler->create($this->createCommand());

        $this->expectException(DuplicateSku::class);

        $this->handler->create($this->createCommand(slug: 'other'));
    }

    public function testRejectsADuplicateSlug(): void
    {
        $this->handler->create($this->createCommand());

        $this->expectException(DuplicateProductSlug::class);

        $this->handler->create($this->createCommand(sku: 'TEA-002'));
    }

    public function testRejectsAnUnknownCategory(): void
    {
        $this->expectException(InvalidValue::class);
        $this->expectExceptionMessage('does not exist');

        $this->handler->create($this->createCommand(categoryId: CategoryId::generate()->value));
    }

    public function testRejectsAVatRateOutsideTheSpecification(): void
    {
        $this->expectException(InvalidValue::class);

        $this->handler->create($this->createCommand(vatRate: 7));
    }

    public function testUpdatesAProductAndKeepsItsOwnSlug(): void
    {
        $id = $this->handler->create($this->createCommand());
        $this->clock->modify('+1 hour');

        $this->handler->update(new UpdateProduct($id->value, 'green-tea', 'Green tea XL', null, '12.00', 8, null));

        $product = $this->products->get($id);
        self::assertSame('Green tea XL', $product->name());
        self::assertSame('12.96', $product->grossPrice()->toDecimal());
        self::assertEquals($this->clock->now(), $product->updatedAt());
    }

    public function testRejectsAnUpdateToASlugOfAnotherProduct(): void
    {
        $id = $this->handler->create($this->createCommand());
        $this->handler->create($this->createCommand(sku: 'TEA-002', slug: 'black-tea'));

        $this->expectException(DuplicateProductSlug::class);

        $this->handler->update(new UpdateProduct($id->value, 'black-tea', 'Green tea', null, '8.13', 23, null));
    }

    public function testUpdateOfAMissingProductFails(): void
    {
        $this->expectException(ProductNotFound::class);

        $this->handler->update(new UpdateProduct(ProductId::generate()->value, 'tea', 'Tea', null, '1.00', 23, null));
    }

    public function testActivatesAndDeactivates(): void
    {
        $id = $this->handler->create($this->createCommand());

        $this->handler->activate($id->value);
        self::assertTrue($this->products->get($id)->isActive());

        $this->handler->deactivate($id->value);
        self::assertFalse($this->products->get($id)->isActive());
    }

    public function testActivationOfAMissingProductFails(): void
    {
        $this->expectException(ProductNotFound::class);

        $this->handler->activate(ProductId::generate()->value);
    }

    private function category(): CategoryId
    {
        $category = Category::create(CategoryId::generate(), new Slug('tea'), 'Tea');
        $this->categories->save($category);

        return $category->id();
    }

    private function createCommand(
        string $sku = 'TEA-001',
        string $slug = 'green-tea',
        int $vatRate = 23,
        ?string $categoryId = null,
    ): CreateProduct {
        return new CreateProduct($sku, $slug, 'Green tea', null, '8.13', $vatRate, $categoryId);
    }
}
