<?php

declare(strict_types=1);

namespace App\Tests\Integration\Catalog\Infrastructure\Persistence;

use App\Catalog\Infrastructure\Persistence\Doctrine\CatalogSchemaListener;
use App\Tests\Support\DatabaseTestCase;
use Doctrine\DBAL\Exception\DriverException;
use Doctrine\DBAL\Schema\ForeignKeyConstraint;
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

    public function testTheForeignKeysOfReferencesByIdExist(): void
    {
        $schema = self::connection()->createSchemaManager();
        $name = static fn (ForeignKeyConstraint $key): ?string => $key->getObjectName()?->getIdentifier()->getValue();

        self::assertSame(
            [CatalogSchemaListener::PRODUCT_CATEGORY_FOREIGN_KEY],
            array_map($name, $schema->introspectTableForeignKeyConstraintsByUnquotedName('catalog_product')),
        );
        self::assertSame(
            [CatalogSchemaListener::CATEGORY_PARENT_FOREIGN_KEY],
            array_map($name, $schema->introspectTableForeignKeyConstraintsByUnquotedName('catalog_category')),
        );
    }

    public function testTheTreeGuardRejectsCyclesWrittenDirectly(): void
    {
        $connection = self::connection();
        $connection->executeStatement(
            "INSERT INTO catalog_category (id, slug, name, parent_id) VALUES
             ('0192f0c4-0000-7000-8000-000000000001', 'a', 'A', NULL),
             ('0192f0c4-0000-7000-8000-000000000002', 'b', 'B', '0192f0c4-0000-7000-8000-000000000001')",
        );

        $this->expectCheckViolation(
            "UPDATE catalog_category SET parent_id = '0192f0c4-0000-7000-8000-000000000002' WHERE id = '0192f0c4-0000-7000-8000-000000000001'",
        );
        $this->expectCheckViolation(
            "UPDATE catalog_category SET parent_id = id WHERE id = '0192f0c4-0000-7000-8000-000000000002'",
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
