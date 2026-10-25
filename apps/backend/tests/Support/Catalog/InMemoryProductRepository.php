<?php

declare(strict_types=1);

namespace App\Tests\Support\Catalog;

use App\Catalog\Domain\Category\CategoryId;
use App\Catalog\Domain\Product\Product;
use App\Catalog\Domain\Product\ProductId;
use App\Catalog\Domain\Product\ProductNotFound;
use App\Catalog\Domain\Product\ProductRepository;
use App\Catalog\Domain\Product\Sku;
use App\Catalog\Domain\Slug;

final class InMemoryProductRepository implements ProductRepository
{
    /** @var array<string, Product> */
    private array $products = [];

    public function get(ProductId $id): Product
    {
        return $this->products[$id->value] ?? throw ProductNotFound::withId($id);
    }

    public function exists(ProductId $id): bool
    {
        return isset($this->products[$id->value]);
    }

    public function skuExists(Sku $sku): bool
    {
        return [] !== array_filter($this->products, static fn (Product $p): bool => $p->sku()->equals($sku));
    }

    public function slugExists(Slug $slug, ?ProductId $except = null): bool
    {
        return [] !== array_filter(
            $this->products,
            static fn (Product $p): bool => $p->slug()->equals($slug) && !(null !== $except && $p->id()->equals($except)),
        );
    }

    public function existsInCategory(CategoryId $categoryId): bool
    {
        return [] !== array_filter($this->products, static fn (Product $p): bool => $p->categoryId()?->equals($categoryId) ?? false);
    }

    public function save(Product $product): void
    {
        $this->products[$product->id()->value] = $product;
    }
}
