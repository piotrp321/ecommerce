<?php

declare(strict_types=1);

namespace App\Inventory\Infrastructure\Http\Admin;

use App\Inventory\Application\StockHandler;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\AsController;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Routing\Requirement\Requirement;

#[AsController]
final readonly class SetStockController
{
    public function __construct(private StockHandler $stock)
    {
    }

    #[Route('/admin/inventory/stock/{productId}', name: 'admin_inventory_stock_set', requirements: ['productId' => Requirement::UUID], methods: ['PUT'], format: 'json')]
    public function __invoke(string $productId, #[MapRequestPayload(acceptFormat: 'json')] StockPayload $payload): JsonResponse
    {
        return new JsonResponse(StockJson::level($this->stock->setOnHand($productId, $payload->onHand)));
    }
}
