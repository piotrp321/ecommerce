<?php

declare(strict_types=1);

namespace App\Tests\Integration\Catalog\Infrastructure\Persistence;

use App\Catalog\Infrastructure\Persistence\Doctrine\CatalogSchemaListener;
use App\Tests\Support\DatabaseTestCase;
use Doctrine\DBAL\Exception\DriverException;
use Doctrine\ORM\Tools\SchemaValidator;

final class SchemaTest extends DatabaseTestCase
{
    public function testTheMigrationsMatchTheMapping(): void
    {
        $validator = new SchemaValidator(self::entityManager());

        self::assertSame([], $validator->validateMapping());
        // The migrations bundle hides its own table only in console commands.
        $changes = array_filter(
            $validator->getUpdateSchemaList(),
            static fn (string $sql): bool => !str_contains($sql, 'doctrine_migration_versions'),
        );

        self::assertSame([], $changes, 'Generate a migration with doctrine:migrations:diff.');
    }

    public function testTheProductCategoryForeignKeyExists(): void
    {
        $foreignKeys = self::connection()->createSchemaManager()->introspectTableForeignKeyConstraintsByUnquotedName('catalog_product');

        self::assertSame(
            [CatalogSchemaListener::PRODUCT_CATEGORY_FOREIGN_KEY],
            array_map(static fn ($key): ?string => $key->getObjectName()?->getIdentifier()->getValue(), $foreignKeys),
        );
    }

    public function testTheDatabaseRejectsAVatRateOutsideTheSpecification(): void
    {
        $this->expectCheckViolation(
            "INSERT INTO catalog_product (id, sku, slug, name, net_price, vat_rate, active, created_at, updated_at)
             VALUES (gen_random_uuid(), 'X', 'x', 'X', 100, 7, true, now(), now())",
        );
    }

    public function testTheDatabaseRejectsANegativeStock(): void
    {
        $this->expectCheckViolation(
            'INSERT INTO inventory_stock_item (product_id, on_hand, updated_at) VALUES (gen_random_uuid(), -1, now())',
        );
    }

    private function expectCheckViolation(string $sql): void
    {
        try {
            self::connection()->executeStatement($sql);
            self::fail('Expected a CHECK constraint violation.');
        } catch (DriverException $exception) {
            self::assertSame('23514', $exception->getSQLState());
        }
    }
}
