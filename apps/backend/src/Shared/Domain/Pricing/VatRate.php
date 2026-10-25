<?php

declare(strict_types=1);

namespace App\Shared\Domain\Pricing;

/**
 * VAT rates allowed in the shop (spec R12), in percent. "zw." is outside the MVP.
 */
enum VatRate: int
{
    case Standard = 23;
    case Reduced = 8;
    case SuperReduced = 5;
    case Zero = 0;

    /**
     * Unit gross price: round_half_up(net × (1 + rate)), the only rounding of a
     * line (spec 3.4, step 2). Integer arithmetic on grosze.
     */
    public function grossUnitPrice(Money $netUnitPrice): Money
    {
        $scaled = $netUnitPrice->multiply(100 + $this->value)->minorUnits;

        return Money::ofMinorUnits(intdiv($scaled + 50, 100));
    }
}
