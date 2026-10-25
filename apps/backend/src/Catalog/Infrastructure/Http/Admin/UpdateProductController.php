<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Http\Admin;

use App\Catalog\Application\Product\ProductHandler;
use App\Catalog\Application\Product\UpdateProduct;
use App\Catalog\Application\Query\ProductQueries;
use App\Catalog\Infrastructure\Http\CatalogJson;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\AsController;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Routing\Requirement\Requirement;

#[AsController]
final readonly class UpdateProductController
{
    public function __construct(
        private ProductHandler $handler,
        private ProductQueries $products,
    ) {
    }

    #[Route('/admin/catalog/products/{id}', name: 'admin_catalog_product_update', requirements: ['id' => Requirement::UUID], methods: ['PUT'], format: 'json')]
    public function __invoke(
        string $id,
        #[MapRequestPayload(acceptFormat: 'json', validationGroups: ['Default', 'update'])] ProductPayload $payload,
    ): JsonResponse {
        $this->handler->update(new UpdateProduct(
            $id,
            $payload->slug,
            $payload->name,
            $payload->description,
            $payload->netPrice,
            $payload->vatRate,
            $payload->categoryId,
        ));

        return new JsonResponse(CatalogJson::adminProduct($this->products->byId($id)));
    }
}
