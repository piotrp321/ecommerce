<?php

declare(strict_types=1);

namespace App\Catalog\Application\Query;

use App\Catalog\Domain\Product\ProductId;
use App\Catalog\Domain\Product\ProductNotFound;

/**
 * Product read side: combines the product read model with availability from
 * Inventory, using one availability lookup per page.
 */
final readonly class ProductQueries
{
    public function __construct(
        private ProductFinder $finder,
        private ProductAvailability $availability,
    ) {
    }

    /**
     * @return Page<ProductView>
     */
    public function search(ProductCriteria $criteria): Page
    {
        $page = $this->finder->search($criteria);
        $availability = $this->availability->forProducts(
            array_map(static fn (ProductRecord $product): string => $product->id, $page->items),
        );

        return $page->map(fn (ProductRecord $product): ProductView => $this->view($product, $availability));
    }

    /**
     * @throws ProductNotFound
     */
    public function byId(string $id): ProductView
    {
        $product = $this->finder->byId($id) ?? throw ProductNotFound::withId(ProductId::fromString($id));

        return $this->view($product, $this->availability->forProducts([$product->id]));
    }

    /**
     * Only active products are visible to customers.
     *
     * @throws ProductNotFound
     */
    public function activeBySlug(string $slug): ProductView
    {
        $product = $this->finder->activeBySlug($slug) ?? throw ProductNotFound::withSlug($slug);

        return $this->view($product, $this->availability->forProducts([$product->id]));
    }

    /**
     * @param array<string, Availability> $availability
     */
    private function view(ProductRecord $product, array $availability): ProductView
    {
        return new ProductView(
            $product,
            $product->vatRate->grossUnitPrice($product->netPrice),
            $availability[$product->id] ?? Availability::none(),
        );
    }
}
