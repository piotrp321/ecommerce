<?php

declare(strict_types=1);

namespace App\Tests\Integration\Catalog\Infrastructure\Persistence;

use App\Catalog\Domain\Category\Category;
use App\Catalog\Domain\Category\CategoryId;
use App\Catalog\Domain\Category\CategoryNotEmpty;
use App\Catalog\Domain\Category\CategoryRepository;
use App\Catalog\Domain\Category\DuplicateCategorySlug;
use App\Catalog\Domain\Product\ProductRepository;
use App\Catalog\Domain\Slug;
use App\Tests\Support\Catalog\CatalogFixtures;
use App\Tests\Support\DatabaseTestCase;

final class DoctrineCategoryRepositoryTest extends DatabaseTestCase
{
    private CategoryRepository $categories;
    private CatalogFixtures $fixtures;

    protected function setUp(): void
    {
        parent::setUp();
        $this->categories = self::service(CategoryRepository::class);
        $this->fixtures = new CatalogFixtures(self::service(ProductRepository::class), $this->categories);
    }

    public function testStoresLoadsAndRemovesACategory(): void
    {
        $category = $this->fixtures->category('tea', 'Tea');
        self::entityManager()->clear();

        $loaded = $this->categories->get($category->id());
        self::assertSame('tea', $loaded->slug()->value);
        self::assertSame('Tea', $loaded->name());
        self::assertTrue($this->categories->slugExists(new Slug('tea')));
        self::assertFalse($this->categories->slugExists(new Slug('tea'), except: $category->id()));

        $this->categories->remove($loaded);

        self::assertFalse($this->categories->exists($category->id()));
    }

    public function testTheDatabaseRejectsADuplicateSlugMissedByTheApplication(): void
    {
        $this->fixtures->category('tea');

        $this->expectException(DuplicateCategorySlug::class);

        $this->categories->save(Category::create(CategoryId::generate(), new Slug('tea'), 'Tea'));
    }

    public function testTheForeignKeyKeepsACategoryWithProducts(): void
    {
        $category = $this->fixtures->category('tea');
        $this->fixtures->product('TEA-001', category: $category);

        $this->expectException(CategoryNotEmpty::class);

        $this->categories->remove($category);
    }
}
