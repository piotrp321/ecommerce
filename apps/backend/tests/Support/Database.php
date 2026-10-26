<?php

declare(strict_types=1);

namespace App\Tests\Support;

use Doctrine\DBAL\Connection;

final class Database
{
    /**
     * Removes the data of all modules (the schema comes from migrations).
     */
    public static function reset(Connection $connection): void
    {
        $connection->executeStatement('TRUNCATE catalog_product, catalog_category, inventory_stock_item, customers_customer, backoffice_admin_user');
    }
}
