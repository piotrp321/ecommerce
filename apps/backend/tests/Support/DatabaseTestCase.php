<?php

declare(strict_types=1);

namespace App\Tests\Support;

use Doctrine\DBAL\Connection;
use Doctrine\DBAL\DriverManager;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

/**
 * Kernel test on the test database, emptied before each test.
 */
abstract class DatabaseTestCase extends KernelTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        self::bootKernel();
        Database::reset(self::connection());
    }

    protected static function connection(): Connection
    {
        return self::getContainer()->get('doctrine.dbal.default_connection');
    }

    /**
     * Another session to the same test database, independent of Doctrine's
     * connection (e.g. a concurrent request). The caller closes it.
     */
    protected static function secondConnection(): Connection
    {
        $params = self::connection()->getParams();
        $value = static function (string $key) use ($params): string {
            \assert(isset($params[$key]) && (\is_string($params[$key]) || \is_int($params[$key])));

            return (string) $params[$key];
        };

        return DriverManager::getConnection([
            'driver' => 'pdo_pgsql',
            'host' => $value('host'),
            'port' => (int) $value('port'),
            'dbname' => $value('dbname'),
            'user' => $value('user'),
            'password' => $value('password'),
        ]);
    }

    protected static function entityManager(): EntityManagerInterface
    {
        return self::getContainer()->get('doctrine.orm.entity_manager');
    }

    /**
     * @template T of object
     *
     * @param class-string<T> $id
     *
     * @return T
     */
    protected static function service(string $id): object
    {
        $service = self::getContainer()->get($id);
        \assert($service instanceof $id);

        return $service;
    }
}
