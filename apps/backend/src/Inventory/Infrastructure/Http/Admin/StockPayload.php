<?php

declare(strict_types=1);

namespace App\Inventory\Infrastructure\Http\Admin;

use App\Inventory\Domain\StockItem;
use Symfony\Component\Validator\Constraints as Assert;

final readonly class StockPayload
{
    public function __construct(
        #[Assert\Range(min: 0, max: StockItem::MAX_ON_HAND)]
        public int $onHand,
    ) {
    }
}
