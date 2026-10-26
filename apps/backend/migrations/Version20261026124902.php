<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Backoffice: administrators identified by their external identity (issuer +
 * subject of the identity provider), with a local status. Generated with
 * doctrine:migrations:diff; the CHECK constraint is added by hand (DBAL does
 * not compare it, so it does not show up in later diffs).
 */
final class Version20261026124902 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Backoffice: administrators identified by issuer and subject';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE backoffice_admin_user (issuer VARCHAR(255) NOT NULL, subject VARCHAR(255) NOT NULL, email VARCHAR(254) DEFAULT NULL, email_verified BOOLEAN NOT NULL, status VARCHAR(16) NOT NULL, created_at TIMESTAMP(0) WITH TIME ZONE NOT NULL, updated_at TIMESTAMP(0) WITH TIME ZONE NOT NULL, id UUID NOT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE UNIQUE INDEX backoffice_admin_user_identity_key ON backoffice_admin_user (issuer, subject)');
        // Values of AdminUserStatus.
        $this->addSql("ALTER TABLE backoffice_admin_user ADD CONSTRAINT backoffice_admin_user_status_check CHECK (status IN ('active', 'blocked'))");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE backoffice_admin_user');
    }
}
