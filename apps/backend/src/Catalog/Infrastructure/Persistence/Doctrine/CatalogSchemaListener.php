<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Persistence\Doctrine;

use Doctrine\Bundle\DoctrineBundle\Attribute\AsDoctrineListener;
use Doctrine\DBAL\Schema\ForeignKeyConstraint;
use Doctrine\DBAL\Schema\TableEditor;
use Doctrine\ORM\Tools\Event\GenerateSchemaEventArgs;
use Doctrine\ORM\Tools\ToolEvents;

/**
 * Adds the product → category foreign key to the schema generated from the
 * mapping. Product references its category by id (no ORM association between
 * aggregates), so Doctrine would not create the key itself; declaring it here
 * keeps migrations:diff and schema validation in sync with the database.
 * Deleting a category that still has products fails (CategoryNotEmpty).
 */
#[AsDoctrineListener(event: ToolEvents::postGenerateSchema)]
final class CatalogSchemaListener
{
    public const string PRODUCT_CATEGORY_FOREIGN_KEY = 'catalog_product_category_id_fkey';

    public function postGenerateSchema(GenerateSchemaEventArgs $args): void
    {
        $schema = $args->getSchema();
        if (!$schema->hasTable('catalog_product') || !$schema->hasTable('catalog_category')) {
            return;
        }

        $args->setSchema($schema->edit()->modifyTableByUnquotedName(
            'catalog_product',
            static function (TableEditor $table): void {
                $table->addForeignKeyConstraint(
                    ForeignKeyConstraint::editor()
                        ->setUnquotedName(self::PRODUCT_CATEGORY_FOREIGN_KEY)
                        ->setUnquotedReferencingColumnNames('category_id')
                        ->setUnquotedReferencedTableName('catalog_category')
                        ->setUnquotedReferencedColumnNames('id')
                        ->create(),
                );
            },
        )->create());
    }
}
