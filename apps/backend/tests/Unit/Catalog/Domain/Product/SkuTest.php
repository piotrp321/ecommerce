<?php

declare(strict_types=1);

namespace App\Tests\Unit\Catalog\Domain\Product;

use App\Catalog\Domain\Product\Sku;
use App\Shared\Domain\Exception\InvalidValue;
use PHPUnit\Framework\Attributes\TestWith;
use PHPUnit\Framework\TestCase;

final class SkuTest extends TestCase
{
    #[TestWith(['TEA-001'])]
    #[TestWith(['A'])]
    #[TestWith(['X_1-2'])]
    public function testAcceptsValidSkus(string $value): void
    {
        self::assertSame($value, (new Sku($value))->value);
    }

    #[TestWith([''])]
    #[TestWith(['tea-001'])]
    #[TestWith(['-TEA'])]
    #[TestWith(['TEA 001'])]
    #[TestWith(["TEA\n"])]
    public function testRejectsInvalidSkus(string $value): void
    {
        $this->expectException(InvalidValue::class);

        new Sku($value);
    }

    public function testRejectsTooLongSkus(): void
    {
        new Sku(str_repeat('A', 64));

        $this->expectException(InvalidValue::class);

        new Sku(str_repeat('A', 65));
    }
}
