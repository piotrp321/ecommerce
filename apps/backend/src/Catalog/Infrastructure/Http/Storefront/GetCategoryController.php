<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Http\Storefront;

use App\Catalog\Application\Query\CategoryQueries;
use App\Catalog\Domain\Slug;
use App\Catalog\Infrastructure\Http\CatalogJson;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\AsController;
use Symfony\Component\Routing\Attribute\Route;

#[AsController]
final readonly class GetCategoryController
{
    public function __construct(private CategoryQueries $categories)
    {
    }

    /**
     * A category with its subtree and its ancestors (breadcrumbs).
     */
    #[Route('/catalog/categories/{slug}', name: 'catalog_category', requirements: ['slug' => Slug::PATTERN], methods: ['GET'], format: 'json')]
    public function __invoke(string $slug): JsonResponse
    {
        return new JsonResponse(CatalogJson::publicCategoryDetails($this->categories->bySlug($slug)));
    }
}
