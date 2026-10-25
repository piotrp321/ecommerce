<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Persistence\Doctrine;

use Doctrine\Bundle\DoctrineBundle\Attribute\AsDoctrineListener;
use Doctrine\DBAL\Schema\ForeignKeyConstraint;
use Doctrine\DBAL\Schema\TableEditor;
use Doctrine\ORM\Tools\Event\GenerateSchemaEventArgs;
use Doctrine\ORM\Tools\ToolEvents;

/**
 * Adds the foreign keys of references by id (no ORM associations between
 * aggregates) to the schema generated from the mapping, so migrations:diff and
 * schema validation stay in sync with the database:
 * - product → category,
 * - category → parent category.
 * Deleting a category that still has products or subcategories fails (CategoryNotEmpty).
 */
#[AsDoctrineListener(event: ToolEvents::postGenerateSchema)]
final class CatalogSchemaListener
{
    public const string PRODUCT_CATEGORY_FOREIGN_KEY = 'catalog_product_category_id_fkey';
    public const string CATEGORY_PARENT_FOREIGN_KEY = 'catalog_category_parent_id_fkey';

    public function postGenerateSchema(GenerateSchemaEventArgs $args): void
    {
        $schema = $args->getSchema();
        if (!$schema->hasTable('catalog_product') || !$schema->hasTable('catalog_category')) {
            return;
        }

        $args->setSchema($schema->edit()
            ->modifyTableByUnquotedName('catalog_product', static function (TableEditor $table): void {
                $table->addForeignKeyConstraint(self::foreignKey(self::PRODUCT_CATEGORY_FOREIGN_KEY, 'category_id'));
            })
            ->modifyTableByUnquotedName('catalog_category', static function (TableEditor $table): void {
                $table->addForeignKeyConstraint(self::foreignKey(self::CATEGORY_PARENT_FOREIGN_KEY, 'parent_id'));
            })
            ->create());
    }

    /**
     * @param non-empty-string $name
     * @param non-empty-string $column
     */
    private static function foreignKey(string $name, string $column): ForeignKeyConstraint
    {
        return ForeignKeyConstraint::editor()
            ->setUnquotedName($name)
            ->setUnquotedReferencingColumnNames($column)
            ->setUnquotedReferencedTableName('catalog_category')
            ->setUnquotedReferencedColumnNames('id')
            ->create();
    }
}
