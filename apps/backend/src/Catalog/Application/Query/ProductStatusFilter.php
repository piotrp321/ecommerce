<?php

declare(strict_types=1);

namespace App\Catalog\Application\Query;

enum ProductStatusFilter: string
{
    case All = 'all';
    case Active = 'active';
    case Inactive = 'inactive';
}
