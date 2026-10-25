<?php

declare(strict_types=1);

namespace App\Tests\Functional\Shared\Infrastructure\Persistence;

use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

/**
 * The application connects with separate parameters (no DSN), so passwords may
 * contain characters that have a meaning in URLs.
 */
final class DatabaseConnectionTest extends KernelTestCase
{
    private const string ROLE = 'connection_test_special_password';
    private const string PASSWORD = "p@ss:w/rd#?%&=+ \$!'\"\\;ząż";

    /** @var array<string, array{mixed, mixed}> */
    private array $originalEnv = [];

    protected function setUp(): void
    {
        $this->dropRole();
        $admin = $this->connection();
        $admin->executeStatement(\sprintf(
            'CREATE ROLE %s LOGIN PASSWORD %s',
            self::ROLE,
            $admin->quote(self::PASSWORD),
        ));
        self::ensureKernelShutdown();
    }

    protected function tearDown(): void
    {
        $this->restoreEnv();
        self::ensureKernelShutdown();
        $this->dropRole();
        parent::tearDown();
    }

    public function testConnectsWithPasswordContainingSpecialCharacters(): void
    {
        $this->overrideEnv('DATABASE_USER', self::ROLE);
        $this->overrideEnv('DATABASE_PASSWORD', self::PASSWORD);

        $connection = $this->connection();

        self::assertSame(self::ROLE, $connection->fetchOne('SELECT current_user'));
    }

    private function connection(): Connection
    {
        return self::getContainer()->get('doctrine.dbal.default_connection');
    }

    private function dropRole(): void
    {
        $this->connection()->executeStatement(\sprintf('DROP ROLE IF EXISTS %s', self::ROLE));
        self::ensureKernelShutdown();
    }

    private function overrideEnv(string $name, string $value): void
    {
        $this->originalEnv[$name] = [$_ENV[$name] ?? null, $_SERVER[$name] ?? null];
        $_ENV[$name] = $_SERVER[$name] = $value;
    }

    private function restoreEnv(): void
    {
        foreach ($this->originalEnv as $name => [$env, $server]) {
            if (null === $env) {
                unset($_ENV[$name]);
            } else {
                $_ENV[$name] = $env;
            }
            if (null === $server) {
                unset($_SERVER[$name]);
            } else {
                $_SERVER[$name] = $server;
            }
        }
        $this->originalEnv = [];
    }
}
