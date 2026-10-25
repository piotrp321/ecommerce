<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Inventory;

use App\Catalog\Domain\Product\ProductId;
use App\Catalog\Domain\Product\ProductRepository;
use App\Inventory\Application\KnownProducts;

/**
 * Adapter: answers Inventory's KnownProducts port from the Catalog, which owns products.
 */
final readonly class CatalogKnownProducts implements KnownProducts
{
    public function __construct(private ProductRepository $products)
    {
    }

    public function exists(string $productId): bool
    {
        return $this->products->exists(ProductId::fromString($productId));
    }
}
