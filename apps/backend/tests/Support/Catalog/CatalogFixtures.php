<?php

declare(strict_types=1);

namespace App\Tests\Support\Catalog;

use App\Catalog\Domain\Category\Category;
use App\Catalog\Domain\Category\CategoryId;
use App\Catalog\Domain\Category\CategoryRepository;
use App\Catalog\Domain\Product\Product;
use App\Catalog\Domain\Product\ProductId;
use App\Catalog\Domain\Product\ProductRepository;
use App\Catalog\Domain\Product\Sku;
use App\Catalog\Domain\Slug;
use App\Shared\Domain\Pricing\Money;
use App\Shared\Domain\Pricing\VatRate;

/**
 * Builds catalog data through the domain and the real repositories.
 */
final readonly class CatalogFixtures
{
    public function __construct(
        private ProductRepository $products,
        private CategoryRepository $categories,
    ) {
    }

    public function category(string $slug, ?string $name = null): Category
    {
        $category = Category::create(CategoryId::generate(), new Slug($slug), $name ?? ucfirst($slug));
        $this->categories->save($category);

        return $category;
    }

    public function product(
        string $sku,
        ?string $slug = null,
        ?string $name = null,
        string $netPrice = '10.00',
        VatRate $vatRate = VatRate::Standard,
        ?Category $category = null,
        bool $active = true,
        string $createdAt = '2026-10-25 12:00:00',
    ): Product {
        $now = new \DateTimeImmutable($createdAt);
        $product = Product::create(
            ProductId::generate(),
            new Sku($sku),
            new Slug($slug ?? strtolower($sku)),
            $name ?? $sku,
            null,
            Money::fromDecimal($netPrice),
            $vatRate,
            $category?->id(),
            $now,
        );
        if ($active) {
            $product->activate($now);
        }
        $this->products->save($product);

        return $product;
    }
}
