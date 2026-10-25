<?php

declare(strict_types=1);

namespace App\Tests\Integration\Catalog\Infrastructure\Persistence;

use App\Tests\Support\DatabaseTestCase;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\DriverManager;
use Doctrine\DBAL\Exception\DriverException;

/**
 * The catalog_category_tree_guard trigger, exercised directly in SQL with two
 * independent connections, i.e. without the application checks. Deterministic:
 * the second connection uses a short lock_timeout instead of sleeping, so
 * "waits for the first transaction" shows up as SQLSTATE 55P03.
 */
final class CategoryTreeGuardTest extends DatabaseTestCase
{
    private const string LOCK_NOT_AVAILABLE = '55P03';
    private const string CHECK_VIOLATION = '23514';
    private const string SERIALIZATION_FAILURE = '40001';

    private Connection $first;
    private Connection $second;

    protected function setUp(): void
    {
        parent::setUp();
        $this->first = self::connection();
        $this->second = self::independentConnection($this->first);
        $this->second->executeStatement("SET lock_timeout = '500ms'");
    }

    protected function tearDown(): void
    {
        foreach ([$this->second, $this->first] as $connection) {
            while ($connection->isTransactionActive()) {
                $connection->rollBack();
            }
        }
        $this->second->close();
        $this->first->executeStatement('ALTER TABLE catalog_category ENABLE TRIGGER catalog_category_tree_guard');
        $this->first->executeStatement('RESET statement_timeout');
        parent::tearDown();
    }

    public function testConcurrentMovesCannotCreateACycle(): void
    {
        $this->categories(['x' => null, 'y' => null]);

        // Each move is valid on its own; together they would make x and y each other's parent.
        $this->first->beginTransaction();
        $this->move($this->first, 'x', 'y');

        $this->assertWaitsForTheFirstTransaction(fn () => $this->move($this->second, 'y', 'x'));

        $this->first->commit();
        $this->assertRejected(self::CHECK_VIOLATION, 'catalog_category_cycle', fn () => $this->move($this->second, 'y', 'x'));
        self::assertSame(['x' => 'y', 'y' => null], $this->parents());
    }

    public function testAMoveCannotDeepenABranchExtendedConcurrently(): void
    {
        $this->chain(9);
        $this->categories(['p' => null, 'q' => 'p']);

        // p with q moves to levels 9 and 10; a new child of q would be on level 11.
        $this->first->beginTransaction();
        $this->move($this->first, 'p', 'level-8');

        $this->assertWaitsForTheFirstTransaction(fn () => $this->insert($this->second, 'r', 'q'));

        $this->first->commit();
        $this->assertRejected(self::CHECK_VIOLATION, 'catalog_category_too_deep', fn () => $this->insert($this->second, 'r', 'q'));
    }

    public function testABranchCannotBeExtendedWhileItIsMovedDeeper(): void
    {
        $this->chain(9);
        $this->categories(['p' => null, 'q' => 'p']);

        // The other order: r is added under q first, then p moves to level 9.
        $this->first->beginTransaction();
        $this->insert($this->first, 'r', 'q');

        $this->assertWaitsForTheFirstTransaction(fn () => $this->move($this->second, 'p', 'level-8'));

        $this->first->commit();
        $this->assertRejected(self::CHECK_VIOLATION, 'catalog_category_too_deep', fn () => $this->move($this->second, 'p', 'level-8'));
    }

    public function testRefusesIsolationLevelsThatWouldReadAStaleTree(): void
    {
        $this->categories(['x' => null, 'y' => null]);

        $this->second->executeStatement('START TRANSACTION ISOLATION LEVEL REPEATABLE READ');

        $this->assertRejected(
            self::SERIALIZATION_FAILURE,
            'requires READ COMMITTED',
            fn () => $this->second->executeStatement("UPDATE catalog_category SET parent_id = (SELECT id FROM catalog_category WHERE slug = 'y') WHERE slug = 'x'"),
        );
    }

    public function testFailsAtOnceOnATreeThatIsAlreadyBroken(): void
    {
        // A cycle that the trigger would never allow, e.g. after a restore with triggers disabled.
        $this->first->executeStatement('ALTER TABLE catalog_category DISABLE TRIGGER catalog_category_tree_guard');
        $this->categories(['x' => null, 'y' => 'x', 'root' => null]);
        $this->move($this->first, 'x', 'y');
        $this->first->executeStatement('ALTER TABLE catalog_category ENABLE TRIGGER catalog_category_tree_guard');
        // Without cycle detection in the recursions this would loop (holding the lock) until the timeout.
        $this->first->executeStatement("SET statement_timeout = '2s'");

        $this->assertRejected(self::CHECK_VIOLATION, 'ancestors of', fn () => $this->insert($this->first, 'z', 'x'));
        $this->assertRejected(self::CHECK_VIOLATION, 'subcategories of', fn () => $this->move($this->first, 'x', 'root'));
    }

    /**
     * A second session to the same test database (not shared with Doctrine).
     */
    private static function independentConnection(Connection $connection): Connection
    {
        $params = $connection->getParams();
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

    /**
     * @param array<string, string|null> $categories slug => parent slug, parents first
     */
    private function categories(array $categories): void
    {
        foreach ($categories as $slug => $parent) {
            $this->insert($this->first, $slug, $parent);
        }
    }

    /**
     * Levels 1..$depth: level-1 is a root, level-N is a child of level-(N-1).
     */
    private function chain(int $depth): void
    {
        for ($level = 1; $level <= $depth; ++$level) {
            $this->insert($this->first, 'level-'.$level, 1 === $level ? null : 'level-'.($level - 1));
        }
    }

    private function insert(Connection $connection, string $slug, ?string $parent): void
    {
        $connection->executeStatement(
            'INSERT INTO catalog_category (id, slug, name, parent_id)
             VALUES (gen_random_uuid(), :slug, :slug, (SELECT id FROM catalog_category WHERE slug = :parent))',
            ['slug' => $slug, 'parent' => $parent],
        );
    }

    private function move(Connection $connection, string $slug, string $parent): void
    {
        $connection->executeStatement(
            'UPDATE catalog_category SET parent_id = (SELECT id FROM catalog_category WHERE slug = :parent) WHERE slug = :slug',
            ['slug' => $slug, 'parent' => $parent],
        );
    }

    /**
     * The tree guard of the second connection must wait for the first
     * transaction (the advisory lock) instead of deciding on its own.
     */
    private function assertWaitsForTheFirstTransaction(callable $write): void
    {
        $this->second->beginTransaction();
        try {
            $this->assertRejected(self::LOCK_NOT_AVAILABLE, 'lock timeout', $write);
        } finally {
            $this->second->rollBack();
        }
    }

    private function assertRejected(string $sqlState, string $message, callable $write): void
    {
        try {
            $write();
            self::fail(\sprintf('Expected SQLSTATE %s ("%s").', $sqlState, $message));
        } catch (DriverException $exception) {
            self::assertSame($sqlState, $exception->getSQLState(), $exception->getMessage());
            self::assertStringContainsString($message, $exception->getMessage());
        }
    }

    /**
     * @return array<string, string|null> slug => parent slug
     */
    private function parents(): array
    {
        $parents = [];
        foreach ($this->first->fetchAllAssociative(
            'SELECT c.slug, p.slug AS parent FROM catalog_category c LEFT JOIN catalog_category p ON p.id = c.parent_id ORDER BY c.slug',
        ) as $row) {
            \assert(\is_string($row['slug']) && (null === $row['parent'] || \is_string($row['parent'])));
            $parents[$row['slug']] = $row['parent'];
        }

        return $parents;
    }
}
