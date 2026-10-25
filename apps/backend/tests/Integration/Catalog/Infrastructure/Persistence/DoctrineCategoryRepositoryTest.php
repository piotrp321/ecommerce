<?php

declare(strict_types=1);

namespace App\Tests\Integration\Catalog\Infrastructure\Persistence;

use App\Catalog\Domain\Category\Category;
use App\Catalog\Domain\Category\CategoryCycle;
use App\Catalog\Domain\Category\CategoryId;
use App\Catalog\Domain\Category\CategoryNotEmpty;
use App\Catalog\Domain\Category\CategoryPlacement;
use App\Catalog\Domain\Category\CategoryTooDeep;
use App\Catalog\Domain\Category\CategoryRepository;
use App\Catalog\Domain\Category\DuplicateCategorySlug;
use App\Catalog\Domain\Product\ProductRepository;
use App\Catalog\Domain\Slug;
use App\Shared\Domain\Exception\InvalidValue;
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

    public function testStoresTheParentAndAnswersTreeQuestions(): void
    {
        $electronics = $this->fixtures->category('electronics');
        $phones = $this->fixtures->category('phones', parent: $electronics);
        $smartphones = $this->fixtures->category('smartphones', parent: $phones);
        self::entityManager()->clear();

        self::assertTrue($phones->id()->equals($this->categories->get($smartphones->id())->parentId() ?? CategoryId::generate()));
        self::assertEquals([$phones->id(), $electronics->id()], $this->categories->ancestorIds($smartphones->id()));
        self::assertSame([], $this->categories->ancestorIds($electronics->id()));
        self::assertSame(2, $this->categories->subtreeHeight($electronics->id()));
        self::assertSame(1, $this->categories->subtreeHeight($phones->id()));
        self::assertSame(0, $this->categories->subtreeHeight($smartphones->id()));
        self::assertTrue($this->categories->hasChildren($electronics->id()));
        self::assertFalse($this->categories->hasChildren($smartphones->id()));
    }

    public function testTheForeignKeyKeepsACategoryWithSubcategories(): void
    {
        $electronics = $this->fixtures->category('electronics');
        $this->fixtures->category('phones', parent: $electronics);

        $this->expectException(CategoryNotEmpty::class);

        $this->categories->remove($electronics);
    }

    public function testTheDatabaseRejectsACycleMissedByTheApplication(): void
    {
        $electronics = $this->fixtures->category('electronics');
        $phones = $this->fixtures->category('phones', parent: $electronics);
        $smartphones = $this->fixtures->category('smartphones', parent: $phones);

        // As if a concurrent request had passed the application check.
        $electronics->moveTo($smartphones->id());

        $this->expectException(CategoryCycle::class);

        $this->categories->save($electronics);
    }

    public function testTheDatabaseRejectsATooDeepTreeMissedByTheApplication(): void
    {
        $parent = null;
        for ($level = 1; $level <= CategoryPlacement::MAX_DEPTH; ++$level) {
            $parent = $this->fixtures->category('level-'.$level, parent: $parent);
        }
        self::assertCount(CategoryPlacement::MAX_DEPTH - 1, $this->categories->ancestorIds($parent->id()));

        $this->expectException(CategoryTooDeep::class);

        $this->categories->save(Category::create(CategoryId::generate(), new Slug('too-deep'), 'Too deep', $parent->id()));
    }

    public function testTheDatabaseCountsTheMovedSubtreeTowardsTheDepth(): void
    {
        $parent = null;
        for ($level = 1; $level < CategoryPlacement::MAX_DEPTH; ++$level) {
            $parent = $this->fixtures->category('level-'.$level, parent: $parent);
        }
        $branch = $this->fixtures->category('branch');
        $this->fixtures->category('leaf', parent: $branch);

        // Branch on level MAX_DEPTH, its child one level deeper.
        $branch->moveTo($parent->id());

        $this->expectException(CategoryTooDeep::class);

        $this->categories->save($branch);
    }

    public function testTheDatabaseRejectsAnUnknownParentMissedByTheApplication(): void
    {
        $this->expectException(InvalidValue::class);

        $this->categories->save(Category::create(CategoryId::generate(), new Slug('phones'), 'Phones', CategoryId::generate()));
    }
}
