<?php

declare(strict_types=1);

namespace App\Tests\Unit\Shared\Domain\Pricing;

use App\Shared\Domain\Exception\InvalidValue;
use App\Shared\Domain\Pricing\Money;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\TestWith;
use PHPUnit\Framework\TestCase;

final class MoneyTest extends TestCase
{
    #[TestWith(['0.00', 0])]
    #[TestWith(['0.01', 1])]
    #[TestWith(['8.13', 813])]
    #[TestWith(['10.50', 1050])]
    #[TestWith(['999999999.99', 99999999999])]
    public function testParsesAndFormatsDecimalAmounts(string $decimal, int $minorUnits): void
    {
        $money = Money::fromDecimal($decimal);

        self::assertSame($minorUnits, $money->minorUnits);
        self::assertSame($decimal, $money->toDecimal());
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function malformedAmounts(): iterable
    {
        yield 'no decimals' => ['10'];
        yield 'one decimal' => ['10.5'];
        yield 'three decimals' => ['10.005'];
        yield 'comma' => ['10,00'];
        yield 'negative' => ['-1.00'];
        yield 'leading zero' => ['01.00'];
        yield 'exponent' => ['1e3'];
        yield 'too large' => ['1000000000.00'];
        yield 'empty' => [''];
        yield 'whitespace' => [' 1.00'];
    }

    #[DataProvider('malformedAmounts')]
    public function testRejectsMalformedAmounts(string $amount): void
    {
        $this->expectException(InvalidValue::class);

        Money::fromDecimal($amount);
    }

    public function testRejectsNegativeAmounts(): void
    {
        $this->expectException(InvalidValue::class);

        Money::ofMinorUnits(-1);
    }

    public function testArithmetic(): void
    {
        $amount = Money::ofMinorUnits(1000);

        self::assertSame(1250, $amount->add(Money::ofMinorUnits(250))->minorUnits);
        self::assertSame(750, $amount->subtract(Money::ofMinorUnits(250))->minorUnits);
        self::assertSame(3000, $amount->multiply(3)->minorUnits);
        self::assertTrue($amount->multiply(0)->isZero());
        self::assertTrue($amount->equals(Money::fromDecimal('10.00')));
    }

    public function testSubtractionCannotGoBelowZero(): void
    {
        $this->expectException(InvalidValue::class);

        Money::ofMinorUnits(1)->subtract(Money::ofMinorUnits(2));
    }

    public function testRejectsOverflow(): void
    {
        $this->expectException(InvalidValue::class);

        Money::ofMinorUnits(\PHP_INT_MAX)->multiply(2);
    }
}
