<?php

declare(strict_types=1);

namespace App\Tests\Integration\Catalog\Infrastructure\Persistence;

use App\Catalog\Application\Query\CategoryFinder;
use App\Catalog\Application\Query\CategoryRecord;
use App\Catalog\Domain\Category\CategoryRepository;
use App\Catalog\Domain\Product\ProductRepository;
use App\Tests\Support\Catalog\CatalogFixtures;
use App\Tests\Support\DatabaseTestCase;

final class DbalCategoryFinderTest extends DatabaseTestCase
{
    public function testListsCategoriesByNameWithProductCounts(): void
    {
        $fixtures = new CatalogFixtures(self::service(ProductRepository::class), self::service(CategoryRepository::class));
        $tea = $fixtures->category('tea', 'Tea');
        $fixtures->category('coffee', 'Coffee');
        $fixtures->product('TEA-001', category: $tea);
        $fixtures->product('TEA-002', category: $tea, active: false);
        $finder = self::service(CategoryFinder::class);

        self::assertEquals(
            [['coffee', 'Coffee', 0], ['tea', 'Tea', 2]],
            array_map(static fn (CategoryRecord $c): array => [$c->slug, $c->name, $c->productCount], $finder->all()),
        );
        self::assertSame('tea', $finder->byId($tea->id()->value)?->slug);
        self::assertSame(2, $finder->bySlug('tea')?->productCount);
        self::assertNull($finder->bySlug('missing'));
        self::assertNull($finder->byId('not-a-uuid'));
    }
}
