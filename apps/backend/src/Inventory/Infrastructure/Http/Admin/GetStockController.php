<?php

declare(strict_types=1);

namespace App\Inventory\Infrastructure\Http\Admin;

use App\Inventory\Application\StockHandler;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\AsController;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Routing\Requirement\Requirement;

#[AsController]
final readonly class GetStockController
{
    public function __construct(private StockHandler $stock)
    {
    }

    #[Route('/admin/inventory/stock/{productId}', name: 'admin_inventory_stock', requirements: ['productId' => Requirement::UUID], methods: ['GET'], format: 'json')]
    public function __invoke(string $productId): JsonResponse
    {
        return new JsonResponse(StockJson::level($this->stock->get($productId)));
    }
}
