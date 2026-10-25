<?php

declare(strict_types=1);

namespace App\Tests\Unit\Shared\Domain\Identity;

use App\Catalog\Domain\Category\CategoryId;
use App\Catalog\Domain\Product\ProductId;
use App\Shared\Domain\Exception\InvalidValue;
use PHPUnit\Framework\TestCase;

final class UuidIdentifierTest extends TestCase
{
    public function testGeneratesTimeOrderedUuids(): void
    {
        $id = ProductId::generate();

        self::assertMatchesRegularExpression('/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $id->value);
        self::assertFalse($id->equals(ProductId::generate()));
    }

    public function testNormalisesToLowercase(): void
    {
        $id = ProductId::fromString('0192F0C4-7C2A-7C51-9B1E-2F3C4D5E6F70');

        self::assertSame('0192f0c4-7c2a-7c51-9b1e-2f3c4d5e6f70', (string) $id);
        self::assertTrue($id->equals(ProductId::fromString('0192f0c4-7c2a-7c51-9b1e-2f3c4d5e6f70')));
    }

    public function testIdentifiersOfDifferentTypesAreNotEqual(): void
    {
        $value = '0192f0c4-7c2a-7c51-9b1e-2f3c4d5e6f70';

        self::assertFalse(ProductId::fromString($value)->equals(CategoryId::fromString($value)));
    }

    public function testRejectsInvalidUuids(): void
    {
        $this->expectException(InvalidValue::class);

        ProductId::fromString('not-a-uuid');
    }
}
