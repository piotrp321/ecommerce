<?php

declare(strict_types=1);

namespace App\Tests\Integration\Catalog\Infrastructure\Persistence;

use App\Catalog\Application\Query\CategoryFinder;
use App\Catalog\Application\Query\CategoryRecord;
use App\Catalog\Domain\Category\Category;
use App\Catalog\Domain\Category\CategoryRepository;
use App\Catalog\Domain\Product\ProductRepository;
use App\Tests\Support\Catalog\CatalogFixtures;
use App\Tests\Support\DatabaseTestCase;

final class DbalCategoryFinderTest extends DatabaseTestCase
{
    private CategoryFinder $finder;
    private Category $electronics;
    private Category $phones;
    private Category $smartphones;
    private Category $books;

    protected function setUp(): void
    {
        parent::setUp();
        $this->finder = self::service(CategoryFinder::class);
        $fixtures = new CatalogFixtures(self::service(ProductRepository::class), self::service(CategoryRepository::class));
        $this->electronics = $fixtures->category('electronics', 'Electronics');
        $this->phones = $fixtures->category('phones', 'Phones', $this->electronics);
        $this->smartphones = $fixtures->category('smartphones', 'Smartphones', $this->phones);
        $fixtures->category('audio', 'Audio', $this->electronics);
        $this->books = $fixtures->category('books', 'Books');
        $fixtures->product('PHONE-1', category: $this->smartphones);
        $fixtures->product('PHONE-2', category: $this->smartphones, active: false);
        $fixtures->product('BOOK-1', category: $this->books);
    }

    public function testListsTheWholeTreeWithParentsAndDirectProductCounts(): void
    {
        self::assertSame(
            [
                ['audio', 'electronics', 0],
                ['books', null, 1],
                ['electronics', null, 0],
                ['phones', 'electronics', 0],
                ['smartphones', 'phones', 2],
            ],
            $this->summary($this->finder->all()),
        );
    }

    public function testReadsASubtree(): void
    {
        self::assertSame(
            [['audio', 'electronics', 0], ['electronics', null, 0], ['phones', 'electronics', 0], ['smartphones', 'phones', 2]],
            $this->summary($this->finder->subtree($this->electronics->id()->value)),
        );
        self::assertSame([['smartphones', 'phones', 2]], $this->summary($this->finder->subtree($this->smartphones->id()->value)));
        self::assertSame([], $this->finder->subtree('not-a-uuid'));
    }

    public function testReadsAncestorsFromTheRoot(): void
    {
        self::assertSame(
            ['electronics', 'phones'],
            array_map(static fn (CategoryRecord $c): string => $c->slug, $this->finder->ancestors($this->smartphones->id()->value)),
        );
        self::assertSame([], $this->finder->ancestors($this->electronics->id()->value));
    }

    public function testFindsSingleCategories(): void
    {
        self::assertSame($this->electronics->id()->value, $this->finder->byId($this->phones->id()->value)?->parentId);
        self::assertSame(1, $this->finder->bySlug('books')?->productCount);
        self::assertNull($this->finder->bySlug('missing'));
        self::assertNull($this->finder->byId('not-a-uuid'));
    }

    /**
     * @param list<CategoryRecord> $records
     *
     * @return list<array{string, ?string, int}>
     */
    private function summary(array $records): array
    {
        $slugs = [];
        foreach ($this->finder->all() as $record) {
            $slugs[$record->id] = $record->slug;
        }

        return array_map(
            static fn (CategoryRecord $c): array => [$c->slug, null === $c->parentId ? null : $slugs[$c->parentId], $c->productCount],
            $records,
        );
    }
}
