<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Milestone 2: Catalog (products, flat categories) and Inventory (stock items).
 * Generated with doctrine:migrations:diff; the CHECK constraints are added by
 * hand (DBAL does not compare them, so they do not show up in later diffs).
 */
final class Version20261025085703 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Catalog products and categories, Inventory stock items';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE catalog_category (slug VARCHAR(120) NOT NULL, name VARCHAR(100) NOT NULL, id UUID NOT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE UNIQUE INDEX catalog_category_slug_key ON catalog_category (slug)');
        $this->addSql('CREATE TABLE catalog_product (sku VARCHAR(64) NOT NULL, slug VARCHAR(120) NOT NULL, name VARCHAR(200) NOT NULL, description TEXT DEFAULT NULL, net_price INT NOT NULL, vat_rate SMALLINT NOT NULL, category_id UUID DEFAULT NULL, active BOOLEAN NOT NULL, created_at TIMESTAMP(0) WITH TIME ZONE NOT NULL, updated_at TIMESTAMP(0) WITH TIME ZONE NOT NULL, id UUID NOT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE INDEX catalog_product_category_id_idx ON catalog_product (category_id)');
        $this->addSql('CREATE UNIQUE INDEX catalog_product_sku_key ON catalog_product (sku)');
        $this->addSql('CREATE UNIQUE INDEX catalog_product_slug_key ON catalog_product (slug)');
        $this->addSql('CREATE TABLE inventory_stock_item (on_hand INT NOT NULL, updated_at TIMESTAMP(0) WITH TIME ZONE NOT NULL, product_id UUID NOT NULL, PRIMARY KEY (product_id))');
        $this->addSql('ALTER TABLE catalog_product ADD CONSTRAINT catalog_product_category_id_fkey FOREIGN KEY (category_id) REFERENCES catalog_category (id)');

        // Domain invariants enforced by the database as well (spec R11, R12).
        $this->addSql('ALTER TABLE catalog_product ADD CONSTRAINT catalog_product_net_price_check CHECK (net_price BETWEEN 1 AND 999999999)');
        $this->addSql('ALTER TABLE catalog_product ADD CONSTRAINT catalog_product_vat_rate_check CHECK (vat_rate IN (0, 5, 8, 23))');
        $this->addSql('ALTER TABLE inventory_stock_item ADD CONSTRAINT inventory_stock_item_on_hand_check CHECK (on_hand >= 0)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE catalog_product DROP CONSTRAINT catalog_product_category_id_fkey');
        $this->addSql('DROP TABLE catalog_category');
        $this->addSql('DROP TABLE catalog_product');
        $this->addSql('DROP TABLE inventory_stock_item');
    }
}
