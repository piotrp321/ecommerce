<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Persistence\Doctrine;

use App\Catalog\Application\Query\CategoryFinder;
use App\Catalog\Application\Query\CategoryRecord;
use App\Shared\Infrastructure\Persistence\Doctrine\Row;
use Doctrine\DBAL\Connection;
use Symfony\Component\Uid\Uuid;

/**
 * Category tree read model. The whole tree is one plain query (the table is
 * small); subtrees and ancestors use recursive queries over the parent_id index.
 */
final readonly class DbalCategoryFinder implements CategoryFinder
{
    private const string COLUMNS = 'c.id, c.slug, c.name, c.parent_id,
        (SELECT COUNT(*) FROM catalog_product p WHERE p.category_id = c.id) AS product_count';

    public function __construct(private Connection $connection)
    {
    }

    public function all(): array
    {
        return $this->records('SELECT '.self::COLUMNS.' FROM catalog_category c ORDER BY c.name, c.id');
    }

    public function subtree(string $id): array
    {
        if (!Uuid::isValid($id)) {
            return [];
        }

        return $this->records(
            'WITH RECURSIVE subtree(id) AS (
                 SELECT id FROM catalog_category WHERE id = :id
                 UNION
                 SELECT c.id FROM catalog_category c JOIN subtree s ON c.parent_id = s.id
             )
             SELECT '.self::COLUMNS.' FROM catalog_category c JOIN subtree USING (id) ORDER BY c.name, c.id',
            ['id' => $id],
        );
    }

    public function ancestors(string $id): array
    {
        if (!Uuid::isValid($id)) {
            return [];
        }

        return $this->records(
            'WITH RECURSIVE ancestors(id, parent_id, distance) AS (
                 SELECT parent.id, parent.parent_id, 1
                 FROM catalog_category child JOIN catalog_category parent ON parent.id = child.parent_id
                 WHERE child.id = :id
                 UNION ALL
                 SELECT c.id, c.parent_id, a.distance + 1
                 FROM catalog_category c JOIN ancestors a ON c.id = a.parent_id
             ) CYCLE id SET is_cycle USING path
             SELECT '.self::COLUMNS.' FROM catalog_category c JOIN ancestors a USING (id) WHERE NOT a.is_cycle ORDER BY a.distance DESC',
            ['id' => $id],
        );
    }

    public function byId(string $id): ?CategoryRecord
    {
        if (!Uuid::isValid($id)) {
            return null;
        }

        return $this->records('SELECT '.self::COLUMNS.' FROM catalog_category c WHERE c.id = :id', ['id' => $id])[0] ?? null;
    }

    public function bySlug(string $slug): ?CategoryRecord
    {
        return $this->records('SELECT '.self::COLUMNS.' FROM catalog_category c WHERE c.slug = :slug', ['slug' => $slug])[0] ?? null;
    }

    /**
     * @param array<string, string> $parameters
     *
     * @return list<CategoryRecord>
     */
    private function records(string $sql, array $parameters = []): array
    {
        return array_map(
            static fn (array $row): CategoryRecord => new CategoryRecord(
                Row::string($row['id']),
                Row::string($row['slug']),
                Row::string($row['name']),
                Row::nullableString($row['parent_id']),
                Row::int($row['product_count']),
            ),
            $this->connection->fetchAllAssociative($sql, $parameters),
        );
    }
}
