<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Persistence\Doctrine;

use App\Catalog\Application\Query\CategoryFinder;
use App\Catalog\Application\Query\CategoryRecord;
use App\Shared\Infrastructure\Persistence\Doctrine\Row;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Query\QueryBuilder;
use Symfony\Component\Uid\Uuid;

final readonly class DbalCategoryFinder implements CategoryFinder
{
    public function __construct(private Connection $connection)
    {
    }

    public function all(): array
    {
        return array_values(array_map(
            $this->record(...),
            $this->select()->orderBy('c.name')->addOrderBy('c.id')->fetchAllAssociative(),
        ));
    }

    public function byId(string $id): ?CategoryRecord
    {
        if (!Uuid::isValid($id)) {
            return null;
        }
        $row = $this->select()->where('c.id = :id')->setParameter('id', $id)->fetchAssociative();

        return false === $row ? null : $this->record($row);
    }

    public function bySlug(string $slug): ?CategoryRecord
    {
        $row = $this->select()->where('c.slug = :slug')->setParameter('slug', $slug)->fetchAssociative();

        return false === $row ? null : $this->record($row);
    }

    private function select(): QueryBuilder
    {
        return $this->connection->createQueryBuilder()
            ->select('c.id', 'c.slug', 'c.name', 'COUNT(p.id) AS product_count')
            ->from('catalog_category', 'c')
            ->leftJoin('c', 'catalog_product', 'p', 'p.category_id = c.id')
            ->groupBy('c.id');
    }

    /**
     * @param array<string, mixed> $row
     */
    private function record(array $row): CategoryRecord
    {
        return new CategoryRecord(
            Row::string($row['id']),
            Row::string($row['slug']),
            Row::string($row['name']),
            Row::int($row['product_count']),
        );
    }
}
