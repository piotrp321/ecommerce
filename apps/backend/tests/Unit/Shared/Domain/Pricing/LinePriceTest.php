<?php

declare(strict_types=1);

namespace App\Tests\Unit\Shared\Domain\Pricing;

use App\Shared\Domain\Exception\InvalidValue;
use App\Shared\Domain\Pricing\LinePrice;
use App\Shared\Domain\Pricing\Money;
use App\Shared\Domain\Pricing\VatRate;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Reference examples P1–P5 from docs/specs/01-placing-order.md, section 3.4 (AC8).
 */
final class LinePriceTest extends TestCase
{
    /**
     * @return iterable<string, array{string, VatRate, int, string, string, string, string}>
     */
    public static function referenceExamples(): iterable
    {
        // netUnit, VAT, quantity, grossUnit, gross, net, vat
        yield 'P1' => ['8.13', VatRate::Standard, 3, '10.00', '30.00', '24.39', '5.61'];
        yield 'P2' => ['2.50', VatRate::Standard, 1, '3.08', '3.08', '2.50', '0.58'];
        yield 'P3' => ['10.00', VatRate::Reduced, 2, '10.80', '21.60', '20.00', '1.60'];
        yield 'P4' => ['10.00', VatRate::Zero, 1, '10.00', '10.00', '10.00', '0.00'];
        yield 'P5' => ['0.99', VatRate::Standard, 3, '1.22', '3.66', '2.97', '0.69'];
    }

    #[DataProvider('referenceExamples')]
    public function testMatchesTheSpecificationExamples(
        string $netUnit,
        VatRate $vatRate,
        int $quantity,
        string $grossUnit,
        string $gross,
        string $net,
        string $vat,
    ): void {
        $line = LinePrice::calculate(Money::fromDecimal($netUnit), $vatRate, $quantity);

        self::assertSame($grossUnit, $line->grossUnit->toDecimal());
        self::assertSame($gross, $line->gross->toDecimal());
        self::assertSame($net, $line->net->toDecimal());
        self::assertSame($vat, $line->vat->toDecimal());
        self::assertTrue($line->grossUnit->multiply($quantity)->equals($line->gross));
        self::assertTrue($line->net->add($line->vat)->equals($line->gross));
    }

    public function testRejectsQuantityBelowOne(): void
    {
        $this->expectException(InvalidValue::class);

        LinePrice::calculate(Money::fromDecimal('1.00'), VatRate::Standard, 0);
    }
}
