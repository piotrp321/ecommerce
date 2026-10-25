<?php

declare(strict_types=1);

namespace App\Catalog\Application\Query;

enum ProductSort: string
{
    case Name = 'name';
    /** By gross price, cheapest first. */
    case PriceAscending = 'price';
    case PriceDescending = '-price';
    case Newest = 'newest';
}
