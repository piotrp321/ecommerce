<?php

declare(strict_types=1);

namespace App\Catalog\Application\Query;

/**
 * How many units of a product can be sold. Units held by reservations
 * (Milestone 4) are not available: available = onHand - reserved (spec R7).
 */
final readonly class Availability
{
    public function __construct(
        public int $onHand,
        public int $reserved,
        public int $available,
    ) {
    }

    public static function none(): self
    {
        return new self(0, 0, 0);
    }

    public function isInStock(): bool
    {
        return $this->available > 0;
    }
}
