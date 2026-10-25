<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Http\Admin;

use App\Catalog\Application\Query\CategoryQueries;
use App\Catalog\Infrastructure\Http\CatalogJson;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\AsController;
use Symfony\Component\Routing\Attribute\Route;

#[AsController]
final readonly class ListCategoriesController
{
    public function __construct(private CategoryQueries $categories)
    {
    }

    #[Route('/admin/catalog/categories', name: 'admin_catalog_categories', methods: ['GET'], format: 'json')]
    public function __invoke(): JsonResponse
    {
        return new JsonResponse(['items' => array_map(CatalogJson::adminCategoryNode(...), $this->categories->tree())]);
    }
}
