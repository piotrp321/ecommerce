<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Http\Admin;

use App\Catalog\Application\Query\ProductQueries;
use App\Catalog\Infrastructure\Http\CatalogJson;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\AsController;
use Symfony\Component\HttpKernel\Attribute\MapQueryString;
use Symfony\Component\Routing\Attribute\Route;

#[AsController]
final readonly class ListProductsController
{
    public function __construct(private ProductQueries $products)
    {
    }

    #[Route('/admin/catalog/products', name: 'admin_catalog_products', methods: ['GET'], format: 'json')]
    public function __invoke(
        #[MapQueryString(validationFailedStatusCode: 422)] ProductListQuery $query = new ProductListQuery(),
    ): JsonResponse {
        return new JsonResponse(CatalogJson::page($this->products->search($query->criteria()), CatalogJson::adminProduct(...)));
    }
}
