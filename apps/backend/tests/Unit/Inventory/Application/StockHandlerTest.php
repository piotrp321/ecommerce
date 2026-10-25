<?php

declare(strict_types=1);

namespace App\Tests\Unit\Inventory\Application;

use App\Inventory\Application\KnownProducts;
use App\Inventory\Application\StockHandler;
use App\Inventory\Domain\UnknownProduct;
use App\Shared\Domain\Exception\InvalidValue;
use App\Tests\Support\Inventory\InMemoryStockItemRepository;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Clock\MockClock;

final class StockHandlerTest extends TestCase
{
    private const string PRODUCT = '0192f0c4-7c2a-7c51-9b1e-2f3c4d5e6f70';

    private StockHandler $handler;

    protected function setUp(): void
    {
        $repository = new InMemoryStockItemRepository();
        $knownProducts = $this->createStub(KnownProducts::class);
        $knownProducts->method('exists')->willReturnCallback(static fn (string $id): bool => self::PRODUCT === $id);

        $this->handler = new StockHandler($repository, $repository, $knownProducts, new MockClock());
    }

    public function testAKnownProductWithoutStockHasNothingOnHand(): void
    {
        $level = $this->handler->get(self::PRODUCT);

        self::assertSame(0, $level->onHand);
        self::assertSame(0, $level->available());
    }

    public function testSetsAndChangesTheQuantityOnHand(): void
    {
        self::assertSame(5, $this->handler->setOnHand(self::PRODUCT, 5)->onHand);

        $level = $this->handler->setOnHand(self::PRODUCT, 2);

        self::assertSame(2, $level->onHand);
        self::assertSame(2, $level->available());
        self::assertSame(2, $this->handler->get(self::PRODUCT)->onHand);
    }

    public function testRejectsANegativeQuantity(): void
    {
        $this->expectException(InvalidValue::class);

        $this->handler->setOnHand(self::PRODUCT, -1);
    }

    public function testRejectsAnUnknownProduct(): void
    {
        $this->expectException(UnknownProduct::class);

        $this->handler->setOnHand('0192f0c4-7c2a-7c51-9b1e-000000000000', 1);
    }
}
