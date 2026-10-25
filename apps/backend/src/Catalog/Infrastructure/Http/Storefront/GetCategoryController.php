<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Http\Storefront;

use App\Catalog\Application\Query\CategoryFinder;
use App\Catalog\Domain\Category\CategoryNotFound;
use App\Catalog\Domain\Slug;
use App\Catalog\Infrastructure\Http\CatalogJson;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\AsController;
use Symfony\Component\Routing\Attribute\Route;

#[AsController]
final readonly class GetCategoryController
{
    public function __construct(private CategoryFinder $categories)
    {
    }

    #[Route('/catalog/categories/{slug}', name: 'catalog_category', requirements: ['slug' => Slug::PATTERN], methods: ['GET'], format: 'json')]
    public function __invoke(string $slug): JsonResponse
    {
        $category = $this->categories->bySlug($slug) ?? throw CategoryNotFound::withSlug($slug);

        return new JsonResponse(CatalogJson::publicCategory($category));
    }
}
