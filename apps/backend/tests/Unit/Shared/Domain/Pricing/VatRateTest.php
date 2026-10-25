<?php

declare(strict_types=1);

namespace App\Tests\Unit\Shared\Domain\Pricing;

use App\Shared\Domain\Pricing\Money;
use App\Shared\Domain\Pricing\VatRate;
use PHPUnit\Framework\Attributes\TestWith;
use PHPUnit\Framework\TestCase;

final class VatRateTest extends TestCase
{
    #[TestWith(['8.13', 23, '10.00'])] // 9.9999 rounded up
    #[TestWith(['2.50', 23, '3.08'])] // 3.075: half up
    #[TestWith(['0.99', 23, '1.22'])] // 1.2177
    #[TestWith(['10.00', 8, '10.80'])]
    #[TestWith(['10.00', 5, '10.50'])]
    #[TestWith(['10.00', 0, '10.00'])]
    #[TestWith(['0.02', 23, '0.02'])] // 0.0246 rounded down
    #[TestWith(['0.04', 23, '0.05'])] // 0.0492 rounded up
    public function testRoundsTheUnitGrossPriceHalfUp(string $net, int $rate, string $gross): void
    {
        self::assertSame($gross, VatRate::from($rate)->grossUnitPrice(Money::fromDecimal($net))->toDecimal());
    }
}
