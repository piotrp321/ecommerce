<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Customers: customers of the store, identified by their external identity
 * (issuer + subject of the identity provider). Generated with doctrine:migrations:diff.
 */
final class Version20261026124901 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Customers: customers identified by issuer and subject';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE customers_customer (issuer VARCHAR(255) NOT NULL, subject VARCHAR(255) NOT NULL, email VARCHAR(254) DEFAULT NULL, email_verified BOOLEAN NOT NULL, created_at TIMESTAMP(0) WITH TIME ZONE NOT NULL, updated_at TIMESTAMP(0) WITH TIME ZONE NOT NULL, id UUID NOT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE UNIQUE INDEX customers_customer_identity_key ON customers_customer (issuer, subject)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE customers_customer');
    }
}
