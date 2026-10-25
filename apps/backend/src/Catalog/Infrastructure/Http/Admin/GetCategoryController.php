<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Http\Admin;

use App\Catalog\Application\Query\CategoryQueries;
use App\Catalog\Infrastructure\Http\CatalogJson;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\AsController;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Routing\Requirement\Requirement;

#[AsController]
final readonly class GetCategoryController
{
    public function __construct(private CategoryQueries $categories)
    {
    }

    #[Route('/admin/catalog/categories/{id}', name: 'admin_catalog_category', requirements: ['id' => Requirement::UUID], methods: ['GET'], format: 'json')]
    public function __invoke(string $id): JsonResponse
    {
        return new JsonResponse(CatalogJson::adminCategoryDetails($this->categories->byId($id)));
    }
}
