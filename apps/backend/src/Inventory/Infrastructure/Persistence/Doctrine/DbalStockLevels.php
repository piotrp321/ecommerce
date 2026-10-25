<?php

declare(strict_types=1);

namespace App\Inventory\Infrastructure\Persistence\Doctrine;

use App\Inventory\Application\StockLevel;
use App\Inventory\Application\StockLevels;
use Doctrine\DBAL\ArrayParameterType;
use App\Shared\Infrastructure\Persistence\Doctrine\Row;
use Doctrine\DBAL\Connection;
use Symfony\Component\Uid\Uuid;

final readonly class DbalStockLevels implements StockLevels
{
    public function __construct(private Connection $connection)
    {
    }

    public function forProducts(array $productIds): array
    {
        $productIds = array_values(array_filter(array_unique($productIds), Uuid::isValid(...)));
        if ([] === $productIds) {
            return [];
        }

        // Reservations do not exist yet (Milestone 4); then "reserved" will be
        // their sum and stay part of this single query.
        $rows = $this->connection->fetchAllAssociative(
            'SELECT product_id, on_hand, 0 AS reserved FROM inventory_stock_item WHERE product_id IN (?)',
            [$productIds],
            [ArrayParameterType::STRING],
        );

        $levels = [];
        foreach ($rows as $row) {
            $id = Row::string($row['product_id']);
            $levels[$id] = new StockLevel($id, Row::int($row['on_hand']), Row::int($row['reserved']));
        }

        return $levels;
    }
}
