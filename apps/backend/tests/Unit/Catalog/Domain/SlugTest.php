<?php

declare(strict_types=1);

namespace App\Tests\Unit\Catalog\Domain;

use App\Catalog\Domain\Slug;
use App\Shared\Domain\Exception\InvalidValue;
use PHPUnit\Framework\Attributes\TestWith;
use PHPUnit\Framework\TestCase;

final class SlugTest extends TestCase
{
    #[TestWith(['tea'])]
    #[TestWith(['green-tea-100g'])]
    #[TestWith(['a1'])]
    public function testAcceptsValidSlugs(string $value): void
    {
        self::assertSame($value, (new Slug($value))->value);
    }

    #[TestWith([''])]
    #[TestWith(['Tea'])]
    #[TestWith(['green tea'])]
    #[TestWith(['-tea'])]
    #[TestWith(['tea-'])]
    #[TestWith(['green--tea'])]
    #[TestWith(['herbata-zółta'])]
    #[TestWith(["tea\n"])]
    public function testRejectsInvalidSlugs(string $value): void
    {
        $this->expectException(InvalidValue::class);

        new Slug($value);
    }

    public function testRejectsTooLongSlugs(): void
    {
        new Slug(str_repeat('a', 120));

        $this->expectException(InvalidValue::class);

        new Slug(str_repeat('a', 121));
    }
}
