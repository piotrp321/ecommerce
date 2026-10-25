<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Http\Admin;

use App\Catalog\Application\Category\CategoryHandler;
use App\Catalog\Application\Query\CategoryFinder;
use App\Catalog\Domain\Category\CategoryId;
use App\Catalog\Domain\Category\CategoryNotFound;
use App\Catalog\Infrastructure\Http\CatalogJson;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\AsController;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Routing\Requirement\Requirement;

#[AsController]
final readonly class UpdateCategoryController
{
    public function __construct(
        private CategoryHandler $handler,
        private CategoryFinder $categories,
    ) {
    }

    #[Route('/admin/catalog/categories/{id}', name: 'admin_catalog_category_update', requirements: ['id' => Requirement::UUID], methods: ['PUT'], format: 'json')]
    public function __invoke(string $id, #[MapRequestPayload(acceptFormat: 'json')] CategoryPayload $payload): JsonResponse
    {
        $this->handler->update($id, $payload->slug, $payload->name);
        $category = $this->categories->byId($id) ?? throw CategoryNotFound::withId(CategoryId::fromString($id));

        return new JsonResponse(CatalogJson::adminCategory($category));
    }
}
