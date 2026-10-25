<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Http\Admin;

use App\Catalog\Application\Category\CategoryHandler;
use App\Catalog\Application\Query\CategoryQueries;
use App\Catalog\Infrastructure\Http\CatalogJson;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Attribute\AsController;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Routing\Generator\UrlGeneratorInterface;

#[AsController]
final readonly class CreateCategoryController
{
    public function __construct(
        private CategoryHandler $handler,
        private CategoryQueries $categories,
        private UrlGeneratorInterface $urls,
    ) {
    }

    #[Route('/admin/catalog/categories', name: 'admin_catalog_category_create', methods: ['POST'], format: 'json')]
    public function __invoke(#[MapRequestPayload(acceptFormat: 'json')] CategoryPayload $payload): JsonResponse
    {
        $id = $this->handler->create($payload->slug, $payload->name, $payload->parentId);

        return new JsonResponse(
            CatalogJson::adminCategoryDetails($this->categories->byId($id->value)),
            Response::HTTP_CREATED,
            // A relative reference stays correct behind the /api prefix of the edge proxy.
            ['Location' => $this->urls->generate('admin_catalog_category', ['id' => $id->value], UrlGeneratorInterface::RELATIVE_PATH)],
        );
    }
}
