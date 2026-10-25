<?php

declare(strict_types=1);

namespace App\Tests\Unit\Catalog\Application\Query;

use App\Catalog\Application\Query\Availability;
use App\Catalog\Application\Query\Page;
use App\Catalog\Application\Query\ProductAvailability;
use App\Catalog\Application\Query\ProductCriteria;
use App\Catalog\Application\Query\ProductFinder;
use App\Catalog\Application\Query\ProductQueries;
use App\Catalog\Application\Query\ProductRecord;
use App\Catalog\Domain\Product\ProductNotFound;
use App\Shared\Domain\Pricing\Money;
use App\Shared\Domain\Pricing\VatRate;
use PHPUnit\Framework\TestCase;

final class ProductQueriesTest extends TestCase
{
    public function testLooksUpTheAvailabilityOfAWholePageAtOnce(): void
    {
        $first = $this->record('0192f0c4-7c2a-7c51-9b1e-000000000001', '8.13');
        $second = $this->record('0192f0c4-7c2a-7c51-9b1e-000000000002', '2.50');
        $finder = $this->createStub(ProductFinder::class);
        $finder->method('search')->willReturn(new Page([$first, $second], 1, 20, 2));
        $availability = $this->createMock(ProductAvailability::class);
        $availability->expects(self::once())
            ->method('forProducts')
            ->with([$first->id, $second->id])
            ->willReturn([$first->id => new Availability(5, 2, 3)]);

        $page = (new ProductQueries($finder, $availability))->search(new ProductCriteria());

        self::assertCount(2, $page->items);
        self::assertSame(2, $page->totalItems);
        self::assertSame('10.00', $page->items[0]->grossPrice->toDecimal());
        self::assertSame(3, $page->items[0]->availability->available);
        self::assertSame('3.08', $page->items[1]->grossPrice->toDecimal());
        self::assertFalse($page->items[1]->availability->isInStock());
    }

    public function testReportsAMissingActiveProduct(): void
    {
        $finder = $this->createStub(ProductFinder::class);
        $finder->method('activeBySlug')->willReturn(null);

        $this->expectException(ProductNotFound::class);

        (new ProductQueries($finder, $this->createStub(ProductAvailability::class)))->activeBySlug('green-tea');
    }

    private function record(string $id, string $netPrice): ProductRecord
    {
        $now = new \DateTimeImmutable();

        return new ProductRecord($id, 'SKU', 'slug', 'Name', null, Money::fromDecimal($netPrice), VatRate::Standard, null, true, $now, $now);
    }
}
