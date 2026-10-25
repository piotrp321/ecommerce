<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Persistence\Doctrine;

use App\Catalog\Application\Query\CategoryRef;
use App\Catalog\Application\Query\Page;
use App\Catalog\Application\Query\ProductCriteria;
use App\Catalog\Application\Query\ProductFinder;
use App\Catalog\Application\Query\ProductRecord;
use App\Catalog\Application\Query\ProductSort;
use App\Catalog\Application\Query\ProductStatusFilter;
use App\Shared\Domain\Pricing\Money;
use App\Shared\Domain\Pricing\VatRate;
use App\Shared\Infrastructure\Persistence\Doctrine\Row;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\ParameterType;
use Doctrine\DBAL\Query\QueryBuilder;
use Doctrine\DBAL\Types\Types;
use Symfony\Component\Uid\Uuid;

/**
 * Product read model straight from the tables: one query for a page plus one
 * count, with the category joined in.
 */
final readonly class DbalProductFinder implements ProductFinder
{
    /**
     * Same formula as VatRate::grossUnitPrice(), in integer arithmetic. BIGINT:
     * net_price × 123 exceeds INT for net prices above ~174 592 PLN.
     */
    private const string GROSS_PRICE = '(p.net_price::bigint * (100 + p.vat_rate) + 50) / 100';

    /** Products of a category (selected by %s) and of all its descendants. */
    private const string IN_SUBTREE = 'p.category_id IN (
        WITH RECURSIVE subtree(id) AS (
            SELECT id FROM catalog_category WHERE %s
            UNION
            SELECT c.id FROM catalog_category c JOIN subtree s ON c.parent_id = s.id
        )
        SELECT id FROM subtree
    )';

    public function __construct(private Connection $connection)
    {
    }

    public function search(ProductCriteria $criteria): Page
    {
        $query = $this->select();
        $this->filter($query, $criteria);

        $count = (clone $query)->select('COUNT(*)')->fetchOne();

        match ($criteria->sort) {
            ProductSort::Name => $query->orderBy('p.name')->addOrderBy('p.id'),
            ProductSort::PriceAscending => $query->orderBy(self::GROSS_PRICE)->addOrderBy('p.id'),
            ProductSort::PriceDescending => $query->orderBy(self::GROSS_PRICE, 'DESC')->addOrderBy('p.id'),
            ProductSort::Newest => $query->orderBy('p.created_at', 'DESC')->addOrderBy('p.id', 'DESC'),
        };
        $rows = $query
            ->setFirstResult($criteria->offset())
            ->setMaxResults($criteria->perPage)
            ->fetchAllAssociative();

        return new Page(
            array_values(array_map($this->record(...), $rows)),
            $criteria->page,
            $criteria->perPage,
            Row::int($count),
        );
    }

    public function byId(string $id): ?ProductRecord
    {
        if (!Uuid::isValid($id)) {
            return null;
        }
        $row = $this->select()->where('p.id = :id')->setParameter('id', $id)->fetchAssociative();

        return false === $row ? null : $this->record($row);
    }

    public function activeBySlug(string $slug): ?ProductRecord
    {
        $row = $this->select()
            ->where('p.slug = :slug AND p.active')
            ->setParameter('slug', $slug)
            ->fetchAssociative();

        return false === $row ? null : $this->record($row);
    }

    private function select(): QueryBuilder
    {
        return $this->connection->createQueryBuilder()
            ->select(
                'p.id', 'p.sku', 'p.slug', 'p.name', 'p.description', 'p.net_price', 'p.vat_rate',
                'p.active', 'p.created_at', 'p.updated_at',
                'c.id AS category_id', 'c.slug AS category_slug', 'c.name AS category_name',
            )
            ->from('catalog_product', 'p')
            ->leftJoin('p', 'catalog_category', 'c', 'c.id = p.category_id');
    }

    private function filter(QueryBuilder $query, ProductCriteria $criteria): void
    {
        match ($criteria->status) {
            ProductStatusFilter::All => null,
            ProductStatusFilter::Active => $query->andWhere('p.active'),
            ProductStatusFilter::Inactive => $query->andWhere('NOT p.active'),
        };
        if (null !== $criteria->categorySlug) {
            $query->andWhere(\sprintf(self::IN_SUBTREE, 'slug = :categorySlug'))
                ->setParameter('categorySlug', $criteria->categorySlug);
        }
        if (null !== $criteria->categoryId) {
            if (!Uuid::isValid($criteria->categoryId)) {
                $query->andWhere('FALSE');
            } else {
                $query->andWhere(\sprintf(self::IN_SUBTREE, 'id = :categoryId'))
                    ->setParameter('categoryId', $criteria->categoryId);
            }
        }
        if (null !== $criteria->search) {
            $pattern = '%'.addcslashes($criteria->search, '%_\\').'%';
            $query->andWhere('(p.name ILIKE :search OR p.sku ILIKE :search)')
                ->setParameter('search', $pattern, ParameterType::STRING);
        }
    }

    /**
     * @param array<string, mixed> $row
     */
    private function record(array $row): ProductRecord
    {
        $categoryId = Row::nullableString($row['category_id']);

        return new ProductRecord(
            Row::string($row['id']),
            Row::string($row['sku']),
            Row::string($row['slug']),
            Row::string($row['name']),
            Row::nullableString($row['description']),
            Money::ofMinorUnits(Row::int($row['net_price'])),
            VatRate::from(Row::int($row['vat_rate'])),
            null === $categoryId ? null : new CategoryRef(
                $categoryId,
                Row::string($row['category_slug']),
                Row::string($row['category_name']),
            ),
            Row::bool($row['active']),
            $this->dateTime($row['created_at']),
            $this->dateTime($row['updated_at']),
        );
    }

    private function dateTime(mixed $value): \DateTimeImmutable
    {
        $dateTime = $this->connection->convertToPHPValue($value, Types::DATETIMETZ_IMMUTABLE);
        \assert($dateTime instanceof \DateTimeImmutable);

        return $dateTime;
    }
}
