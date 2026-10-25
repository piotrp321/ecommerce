<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Http\Admin;

use App\Catalog\Application\Category\CategoryHandler;
use App\Catalog\Application\Query\CategoryQueries;
use App\Catalog\Infrastructure\Http\CatalogJson;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\AsController;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Routing\Requirement\Requirement;
use Symfony\Component\Serializer\Normalizer\AbstractNormalizer;

#[AsController]
final readonly class MoveCategoryController
{
    public function __construct(
        private CategoryHandler $handler,
        private CategoryQueries $categories,
    ) {
    }

    /**
     * Moves the category with its subtree to another branch (or to the root level).
     */
    #[Route('/admin/catalog/categories/{id}/move', name: 'admin_catalog_category_move', requirements: ['id' => Requirement::UUID], methods: ['POST'], format: 'json')]
    public function __invoke(
        string $id,
        // parentId must be sent explicitly: a missing field must not mean "move to the root".
        #[MapRequestPayload(acceptFormat: 'json', serializationContext: [AbstractNormalizer::REQUIRE_ALL_PROPERTIES => true])]
        MovePayload $payload,
    ): JsonResponse {
        $this->handler->move($id, $payload->parentId);

        return new JsonResponse(CatalogJson::adminCategoryDetails($this->categories->byId($id)));
    }
}
