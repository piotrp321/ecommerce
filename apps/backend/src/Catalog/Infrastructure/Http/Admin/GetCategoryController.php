<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Http\Admin;

use App\Catalog\Application\Query\CategoryFinder;
use App\Catalog\Domain\Category\CategoryId;
use App\Catalog\Domain\Category\CategoryNotFound;
use App\Catalog\Infrastructure\Http\CatalogJson;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\AsController;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Routing\Requirement\Requirement;

#[AsController]
final readonly class GetCategoryController
{
    public function __construct(private CategoryFinder $categories)
    {
    }

    #[Route('/admin/catalog/categories/{id}', name: 'admin_catalog_category', requirements: ['id' => Requirement::UUID], methods: ['GET'], format: 'json')]
    public function __invoke(string $id): JsonResponse
    {
        $category = $this->categories->byId($id) ?? throw CategoryNotFound::withId(CategoryId::fromString($id));

        return new JsonResponse(CatalogJson::adminCategory($category));
    }
}
