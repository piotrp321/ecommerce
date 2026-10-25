<?php

declare(strict_types=1);

namespace App\Catalog\Domain\Product;

use App\Catalog\Domain\Category\CategoryId;
use App\Catalog\Domain\Slug;

interface ProductRepository
{
    /**
     * @throws ProductNotFound
     */
    public function get(ProductId $id): Product;

    public function exists(ProductId $id): bool;

    public function skuExists(Sku $sku): bool;

    /**
     * Whether another product than $except already uses the slug.
     */
    public function slugExists(Slug $slug, ?ProductId $except = null): bool;

    public function existsInCategory(CategoryId $categoryId): bool;

    /**
     * Persists the product immediately.
     *
     * @throws DuplicateSku         when the SKU is taken (also by a concurrent request)
     * @throws DuplicateProductSlug when the slug is taken (also by a concurrent request)
     */
    public function save(Product $product): void;
}
