<?php

declare(strict_types=1);

namespace App\Inventory\Domain;

use App\Shared\Domain\Exception\InvalidValue;

/**
 * Physical stock of one product. Reservations (Milestone 4) will be counted
 * separately, so that available = onHand - reserved (spec R7).
 */
final class StockItem
{
    public const int MAX_ON_HAND = 1_000_000;

    private int $onHand;

    private function __construct(
        private readonly ProductId $productId,
        int $onHand,
        private \DateTimeImmutable $updatedAt,
    ) {
        $this->onHand = self::validOnHand($onHand);
    }

    public static function create(ProductId $productId, int $onHand, \DateTimeImmutable $now): self
    {
        return new self($productId, $onHand, $now);
    }

    /**
     * Sets the quantity counted in the warehouse.
     */
    public function setOnHand(int $onHand, \DateTimeImmutable $now): void
    {
        $this->onHand = self::validOnHand($onHand);
        $this->updatedAt = $now;
    }

    public function productId(): ProductId
    {
        return $this->productId;
    }

    public function onHand(): int
    {
        return $this->onHand;
    }

    public function updatedAt(): \DateTimeImmutable
    {
        return $this->updatedAt;
    }

    private static function validOnHand(int $onHand): int
    {
        if ($onHand < 0 || $onHand > self::MAX_ON_HAND) {
            throw new InvalidValue(\sprintf('The quantity on hand must be between 0 and %d.', self::MAX_ON_HAND));
        }

        return $onHand;
    }
}
