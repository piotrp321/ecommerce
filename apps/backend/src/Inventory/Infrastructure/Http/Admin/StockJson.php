<?php

declare(strict_types=1);

namespace App\Inventory\Infrastructure\Http\Admin;

use App\Inventory\Application\StockLevel;

final class StockJson
{
    /**
     * @return array{productId: string, onHand: int, reserved: int, available: int}
     */
    public static function level(StockLevel $level): array
    {
        return [
            'productId' => $level->productId,
            'onHand' => $level->onHand,
            'reserved' => $level->reserved,
            'available' => $level->available(),
        ];
    }
}
