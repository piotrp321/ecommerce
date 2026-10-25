<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Http\Storefront;

use App\Catalog\Application\Query\ProductQueries;
use App\Catalog\Domain\Slug;
use App\Catalog\Infrastructure\Http\CatalogJson;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\AsController;
use Symfony\Component\Routing\Attribute\Route;

#[AsController]
final readonly class GetProductController
{
    public function __construct(private ProductQueries $products)
    {
    }

    /**
     * Inactive products are not found (spec R6: withdrawn from sale).
     */
    #[Route('/catalog/products/{slug}', name: 'catalog_product', requirements: ['slug' => Slug::PATTERN], methods: ['GET'], format: 'json')]
    public function __invoke(string $slug): JsonResponse
    {
        return new JsonResponse(CatalogJson::publicProduct($this->products->activeBySlug($slug)));
    }
}
