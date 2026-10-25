<?php

declare(strict_types=1);

namespace App\Inventory\Application;

/**
 * Stock of a product as published to other modules.
 */
final readonly class StockLevel
{
    public function __construct(
        public string $productId,
        public int $onHand,
        public int $reserved,
    ) {
    }

    public static function empty(string $productId): self
    {
        return new self($productId, 0, 0);
    }

    /**
     * Units that can still be sold (spec R7).
     */
    public function available(): int
    {
        return max(0, $this->onHand - $this->reserved);
    }
}
