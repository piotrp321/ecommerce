<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Milestone 2: Catalog (products, category tree) and Inventory (stock items).
 * Generated with doctrine:migrations:diff; the CHECK constraints and the tree
 * guard trigger are added by hand (DBAL does not compare them, so they do not
 * show up in later diffs).
 */
final class Version20261025085703 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Catalog products and category tree, Inventory stock items';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE catalog_category (slug VARCHAR(120) NOT NULL, name VARCHAR(100) NOT NULL, parent_id UUID DEFAULT NULL, id UUID NOT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE INDEX catalog_category_parent_id_idx ON catalog_category (parent_id)');
        $this->addSql('CREATE UNIQUE INDEX catalog_category_slug_key ON catalog_category (slug)');
        $this->addSql('CREATE TABLE catalog_product (sku VARCHAR(64) NOT NULL, slug VARCHAR(120) NOT NULL, name VARCHAR(200) NOT NULL, description TEXT DEFAULT NULL, net_price INT NOT NULL, vat_rate SMALLINT NOT NULL, category_id UUID DEFAULT NULL, active BOOLEAN NOT NULL, created_at TIMESTAMP(0) WITH TIME ZONE NOT NULL, updated_at TIMESTAMP(0) WITH TIME ZONE NOT NULL, id UUID NOT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE INDEX catalog_product_category_id_idx ON catalog_product (category_id)');
        $this->addSql('CREATE UNIQUE INDEX catalog_product_sku_key ON catalog_product (sku)');
        $this->addSql('CREATE UNIQUE INDEX catalog_product_slug_key ON catalog_product (slug)');
        $this->addSql('CREATE TABLE inventory_stock_item (on_hand INT NOT NULL, updated_at TIMESTAMP(0) WITH TIME ZONE NOT NULL, product_id UUID NOT NULL, PRIMARY KEY (product_id))');
        $this->addSql('ALTER TABLE catalog_category ADD CONSTRAINT catalog_category_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES catalog_category (id)');
        $this->addSql('ALTER TABLE catalog_product ADD CONSTRAINT catalog_product_category_id_fkey FOREIGN KEY (category_id) REFERENCES catalog_category (id)');

        // Domain invariants enforced by the database as well (spec R11, R12).
        $this->addSql('ALTER TABLE catalog_product ADD CONSTRAINT catalog_product_net_price_check CHECK (net_price BETWEEN 1 AND 999999999)');
        $this->addSql('ALTER TABLE catalog_product ADD CONSTRAINT catalog_product_vat_rate_check CHECK (vat_rate IN (0, 5, 8, 23))');
        $this->addSql('ALTER TABLE inventory_stock_item ADD CONSTRAINT inventory_stock_item_on_hand_check CHECK (on_hand >= 0)');

        // The category tree must stay acyclic and at most 10 levels deep
        // (CategoryPlacement::MAX_DEPTH) even when changes run at the same time:
        // each would pass the application check on its own. The advisory lock
        // serialises changes of parent_id; in READ COMMITTED (the default, which
        // this relies on) every query of this function then sees the changes
        // committed before it. Moves to the root level need no check.
        $this->addSql(<<<'SQL'
            CREATE FUNCTION catalog_category_tree_guard() RETURNS trigger LANGUAGE plpgsql AS $$
            DECLARE
                parent_level integer;
                subtree_height integer;
            BEGIN
                IF NEW.parent_id IS NULL THEN
                    RETURN NEW;
                END IF;
                PERFORM pg_advisory_xact_lock(hashtext('catalog_category_tree'));

                IF NEW.parent_id = NEW.id OR EXISTS (
                    WITH RECURSIVE ancestors(id, parent_id) AS (
                        SELECT id, parent_id FROM catalog_category WHERE id = NEW.parent_id
                        UNION
                        SELECT c.id, c.parent_id FROM catalog_category c JOIN ancestors a ON c.id = a.parent_id
                    )
                    SELECT 1 FROM ancestors WHERE id = NEW.id
                ) THEN
                    RAISE EXCEPTION 'catalog_category_cycle: category % cannot be placed under %', NEW.id, NEW.parent_id
                        USING ERRCODE = 'check_violation';
                END IF;

                -- No cycle from here on, so the recursions below terminate.
                WITH RECURSIVE ancestors(id, parent_id) AS (
                    SELECT id, parent_id FROM catalog_category WHERE id = NEW.parent_id
                    UNION ALL
                    SELECT c.id, c.parent_id FROM catalog_category c JOIN ancestors a ON c.id = a.parent_id
                )
                SELECT count(*) INTO parent_level FROM ancestors;

                WITH RECURSIVE subtree(id, level) AS (
                    SELECT c.id, 1 FROM catalog_category c WHERE c.parent_id = NEW.id
                    UNION ALL
                    SELECT c.id, s.level + 1 FROM catalog_category c JOIN subtree s ON c.parent_id = s.id
                )
                SELECT COALESCE(max(level), 0) INTO subtree_height FROM subtree;

                IF parent_level + 1 + subtree_height > 10 THEN
                    RAISE EXCEPTION 'catalog_category_too_deep: category % under % would exceed 10 levels', NEW.id, NEW.parent_id
                        USING ERRCODE = 'check_violation';
                END IF;
                RETURN NEW;
            END
            $$
            SQL);
        $this->addSql('CREATE TRIGGER catalog_category_tree_guard BEFORE INSERT OR UPDATE OF parent_id ON catalog_category FOR EACH ROW EXECUTE FUNCTION catalog_category_tree_guard()');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE catalog_product DROP CONSTRAINT catalog_product_category_id_fkey');
        $this->addSql('DROP TABLE catalog_category');
        $this->addSql('DROP FUNCTION IF EXISTS catalog_category_tree_guard()');
        $this->addSql('DROP TABLE catalog_product');
        $this->addSql('DROP TABLE inventory_stock_item');
    }
}
