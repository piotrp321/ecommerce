<?php

declare(strict_types=1);

namespace App\Tests\Unit\Catalog\Domain\Category;

use App\Catalog\Domain\Category\Category;
use App\Catalog\Domain\Category\CategoryCycle;
use App\Catalog\Domain\Category\CategoryId;
use App\Catalog\Domain\Category\CategoryPlacement;
use App\Catalog\Domain\Category\CategoryTooDeep;
use App\Catalog\Domain\Slug;
use App\Shared\Domain\Exception\InvalidValue;
use App\Tests\Support\Catalog\InMemoryCategoryRepository;
use PHPUnit\Framework\TestCase;

final class CategoryPlacementTest extends TestCase
{
    private InMemoryCategoryRepository $categories;
    private CategoryPlacement $placement;

    protected function setUp(): void
    {
        $this->categories = new InMemoryCategoryRepository();
        $this->placement = new CategoryPlacement($this->categories);
    }

    public function testAllowsARootAndAnExistingParent(): void
    {
        $electronics = $this->category('electronics');

        $this->placement->assertCanPlace(CategoryId::generate(), null);
        $this->placement->assertCanPlace(CategoryId::generate(), $electronics);
        $this->expectNotToPerformAssertions();
    }

    public function testRejectsAnUnknownParent(): void
    {
        $this->expectException(InvalidValue::class);

        $this->placement->assertCanPlace(CategoryId::generate(), CategoryId::generate());
    }

    public function testRejectsTheCategoryAsItsOwnParent(): void
    {
        $phones = $this->category('phones');

        $this->expectException(CategoryCycle::class);

        $this->placement->assertCanPlace($phones, $phones);
    }

    public function testRejectsADescendantAsTheParent(): void
    {
        $electronics = $this->category('electronics');
        $phones = $this->category('phones', $electronics);
        $smartphones = $this->category('smartphones', $phones);

        foreach ([$phones, $smartphones] as $descendant) {
            try {
                $this->placement->assertCanPlace($electronics, $descendant);
                self::fail('Expected a cycle to be rejected.');
            } catch (CategoryCycle $exception) {
                self::assertStringContainsString('subcategories', $exception->getMessage());
            }
        }
    }

    public function testAllowsMovingASubtreeToASiblingBranch(): void
    {
        $electronics = $this->category('electronics');
        $phones = $this->category('phones', $electronics);
        $this->category('smartphones', $phones);
        $audio = $this->category('audio', $electronics);

        $this->placement->assertCanPlace($phones, $audio);
        $this->expectNotToPerformAssertions();
    }

    public function testLimitsTheDepthOfTheTree(): void
    {
        $parent = $this->category('level-1');
        for ($level = 2; $level < CategoryPlacement::MAX_DEPTH; ++$level) {
            $parent = $this->category('level-'.$level, $parent);
        }

        // A leaf on the deepest allowed level is fine...
        $this->placement->assertCanPlace(CategoryId::generate(), $parent);
        // ...one level deeper is not.
        $deepest = $this->category('level-'.CategoryPlacement::MAX_DEPTH, $parent);
        $this->expectException(CategoryTooDeep::class);
        $this->placement->assertCanPlace(CategoryId::generate(), $deepest);
    }

    public function testCountsTheHeightOfTheMovedSubtree(): void
    {
        $parent = $this->category('level-1');
        for ($level = 2; $level < CategoryPlacement::MAX_DEPTH; ++$level) {
            $parent = $this->category('level-'.$level, $parent);
        }
        $branch = $this->category('branch');
        $this->category('leaf', $branch);

        // "branch" and its child would land on levels MAX_DEPTH and MAX_DEPTH + 1.
        $this->expectException(CategoryTooDeep::class);

        $this->placement->assertCanPlace($branch, $parent);
    }

    private function category(string $slug, ?CategoryId $parent = null): CategoryId
    {
        $category = Category::create(CategoryId::generate(), new Slug($slug), ucfirst($slug), $parent);
        $this->categories->save($category);

        return $category->id();
    }
}
