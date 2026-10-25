<?php

declare(strict_types=1);

namespace App\Shared\Domain\Pricing;

use App\Shared\Domain\Exception\InvalidValue;

/**
 * Prices of a line (product × quantity) calculated as in spec 3.4:
 * the unit gross price is rounded once, then everything is exact.
 * Guarantees grossUnit × quantity = gross and net + vat = gross.
 */
final readonly class LinePrice
{
    private function __construct(
        public Money $netUnit,
        public VatRate $vatRate,
        public int $quantity,
        public Money $grossUnit,
        public Money $net,
        public Money $vat,
        public Money $gross,
    ) {
    }

    public static function calculate(Money $netUnit, VatRate $vatRate, int $quantity): self
    {
        if ($quantity < 1) {
            throw new InvalidValue('The quantity must be at least 1.');
        }

        $grossUnit = $vatRate->grossUnitPrice($netUnit);
        $gross = $grossUnit->multiply($quantity);
        $net = $netUnit->multiply($quantity);

        return new self($netUnit, $vatRate, $quantity, $grossUnit, $net, $gross->subtract($net), $gross);
    }
}
