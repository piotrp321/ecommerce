<?php

declare(strict_types=1);

namespace App\Tests\Unit\Inventory\Application;

use App\Inventory\Application\StockLevel;
use PHPUnit\Framework\TestCase;

final class StockLevelTest extends TestCase
{
    public function testReservedUnitsAreNotAvailable(): void
    {
        self::assertSame(3, (new StockLevel('id', 5, 2))->available());
        self::assertSame(0, (new StockLevel('id', 2, 2))->available());
    }
}
