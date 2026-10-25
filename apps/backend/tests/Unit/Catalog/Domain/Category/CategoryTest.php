<?php

declare(strict_types=1);

namespace App\Tests\Unit\Catalog\Domain\Category;

use App\Catalog\Domain\Category\Category;
use App\Catalog\Domain\Category\CategoryId;
use App\Catalog\Domain\Slug;
use App\Shared\Domain\Exception\InvalidValue;
use PHPUnit\Framework\TestCase;

final class CategoryTest extends TestCase
{
    public function testIsCreatedAndUpdated(): void
    {
        $category = Category::create(CategoryId::generate(), new Slug('tea'), ' Tea ');
        self::assertSame('Tea', $category->name());

        $category->update(new Slug('teas'), 'Teas');

        self::assertSame('teas', $category->slug()->value);
        self::assertSame('Teas', $category->name());
    }

    public function testRequiresAName(): void
    {
        $this->expectException(InvalidValue::class);

        Category::create(CategoryId::generate(), new Slug('tea'), ' ');
    }

    public function testLimitsTheNameLength(): void
    {
        $this->expectException(InvalidValue::class);

        Category::create(CategoryId::generate(), new Slug('tea'), str_repeat('a', 101));
    }

    public function testInvalidUpdateChangesNothing(): void
    {
        $category = Category::create(CategoryId::generate(), new Slug('tea'), 'Tea');

        try {
            $category->update(new Slug('teas'), '');
            self::fail('Expected an empty name to be rejected.');
        } catch (InvalidValue) {
        }

        self::assertSame('tea', $category->slug()->value);
    }
}
