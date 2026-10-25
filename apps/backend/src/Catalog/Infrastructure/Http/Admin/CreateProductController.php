<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Http\Admin;

use App\Catalog\Application\Product\CreateProduct;
use App\Catalog\Application\Product\ProductHandler;
use App\Catalog\Application\Query\ProductQueries;
use App\Catalog\Infrastructure\Http\CatalogJson;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Attribute\AsController;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Routing\Generator\UrlGeneratorInterface;

#[AsController]
final readonly class CreateProductController
{
    public function __construct(
        private ProductHandler $handler,
        private ProductQueries $products,
        private UrlGeneratorInterface $urls,
    ) {
    }

    #[Route('/admin/catalog/products', name: 'admin_catalog_product_create', methods: ['POST'], format: 'json')]
    public function __invoke(
        #[MapRequestPayload(acceptFormat: 'json', validationGroups: ['Default', 'create'])] ProductPayload $payload,
    ): JsonResponse {
        $id = $this->handler->create(new CreateProduct(
            (string) $payload->sku,
            $payload->slug,
            $payload->name,
            $payload->description,
            $payload->netPrice,
            $payload->vatRate,
            $payload->categoryId,
        ));

        return new JsonResponse(
            CatalogJson::adminProduct($this->products->byId($id->value)),
            Response::HTTP_CREATED,
            // A relative reference stays correct behind the /api prefix of the edge proxy.
            ['Location' => $this->urls->generate('admin_catalog_product', ['id' => $id->value], UrlGeneratorInterface::RELATIVE_PATH)],
        );
    }
}
