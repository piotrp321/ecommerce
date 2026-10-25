<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Http\Admin;

use App\Catalog\Application\Query\ProductQueries;
use App\Catalog\Infrastructure\Http\CatalogJson;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\AsController;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Routing\Requirement\Requirement;

#[AsController]
final readonly class GetProductController
{
    public function __construct(private ProductQueries $products)
    {
    }

    #[Route('/admin/catalog/products/{id}', name: 'admin_catalog_product', requirements: ['id' => Requirement::UUID], methods: ['GET'], format: 'json')]
    public function __invoke(string $id): JsonResponse
    {
        return new JsonResponse(CatalogJson::adminProduct($this->products->byId($id)));
    }
}
