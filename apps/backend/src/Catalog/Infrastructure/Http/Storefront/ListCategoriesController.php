<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Http\Storefront;

use App\Catalog\Application\Query\CategoryFinder;
use App\Catalog\Infrastructure\Http\CatalogJson;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\AsController;
use Symfony\Component\Routing\Attribute\Route;

#[AsController]
final readonly class ListCategoriesController
{
    public function __construct(private CategoryFinder $categories)
    {
    }

    #[Route('/catalog/categories', name: 'catalog_categories', methods: ['GET'], format: 'json')]
    public function __invoke(): JsonResponse
    {
        return new JsonResponse(['items' => array_map(CatalogJson::publicCategory(...), $this->categories->all())]);
    }
}
