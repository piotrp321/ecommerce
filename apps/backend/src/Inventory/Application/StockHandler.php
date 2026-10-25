<?php

declare(strict_types=1);

namespace App\Inventory\Application;

use App\Inventory\Domain\ProductId;
use App\Inventory\Domain\StockItem;
use App\Inventory\Domain\StockItemRepository;
use App\Inventory\Domain\UnknownProduct;
use Psr\Clock\ClockInterface;

/**
 * Use cases of stock management.
 */
final readonly class StockHandler
{
    public function __construct(
        private StockItemRepository $stockItems,
        private StockLevels $stockLevels,
        private KnownProducts $knownProducts,
        private ClockInterface $clock,
    ) {
    }

    /**
     * @throws UnknownProduct
     */
    public function setOnHand(string $productId, int $onHand): StockLevel
    {
        $id = $this->knownProduct($productId);
        $now = $this->clock->now();

        $stockItem = $this->stockItems->find($id);
        if (null === $stockItem) {
            $stockItem = StockItem::create($id, $onHand, $now);
        } else {
            $stockItem->setOnHand($onHand, $now);
        }
        $this->stockItems->save($stockItem);

        return $this->stockLevel($id);
    }

    /**
     * A known product without a stock item has nothing on hand.
     *
     * @throws UnknownProduct
     */
    public function get(string $productId): StockLevel
    {
        return $this->stockLevel($this->knownProduct($productId));
    }

    private function knownProduct(string $productId): ProductId
    {
        $id = ProductId::fromString($productId);
        if (!$this->knownProducts->exists($id->value)) {
            throw UnknownProduct::withId($id);
        }

        return $id;
    }

    private function stockLevel(ProductId $id): StockLevel
    {
        return $this->stockLevels->forProducts([$id->value])[$id->value] ?? StockLevel::empty($id->value);
    }
}
