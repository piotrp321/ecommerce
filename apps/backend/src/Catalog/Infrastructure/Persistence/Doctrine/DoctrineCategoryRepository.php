<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Persistence\Doctrine;

use App\Catalog\Domain\Category\Category;
use App\Catalog\Domain\Category\CategoryCycle;
use App\Catalog\Domain\Category\CategoryId;
use App\Catalog\Domain\Category\CategoryNotEmpty;
use App\Catalog\Domain\Category\CategoryNotFound;
use App\Catalog\Domain\Category\CategoryPlacement;
use App\Catalog\Domain\Category\CategoryRepository;
use App\Catalog\Domain\Category\CategoryTooDeep;
use App\Catalog\Domain\Category\DuplicateCategorySlug;
use App\Catalog\Domain\Slug;
use App\Catalog\Infrastructure\Persistence\Doctrine\Type\CategoryIdType;
use App\Catalog\Infrastructure\Persistence\Doctrine\Type\SlugType;
use App\Shared\Domain\Exception\InvalidValue;
use App\Shared\Infrastructure\Persistence\Doctrine\Row;
use Doctrine\DBAL\Exception\DriverException;
use Doctrine\DBAL\Exception\ForeignKeyConstraintViolationException;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Doctrine\ORM\EntityManagerInterface;

final readonly class DoctrineCategoryRepository implements CategoryRepository
{
    /** Raised by the catalog_category_tree_guard trigger (see the migration). */
    private const string CYCLE_ERROR = 'catalog_category_cycle';
    private const string TOO_DEEP_ERROR = 'catalog_category_too_deep';
    private const string ISOLATION_ERROR = 'catalog_category_tree_guard requires READ COMMITTED';

    public function __construct(private EntityManagerInterface $entityManager)
    {
    }

    public function get(CategoryId $id): Category
    {
        return $this->entityManager->find(Category::class, $id) ?? throw CategoryNotFound::withId($id);
    }

    public function exists(CategoryId $id): bool
    {
        return null !== $this->entityManager->createQueryBuilder()
            ->select('1')
            ->from(Category::class, 'c')
            ->where('c.id = :id')
            ->setParameter('id', $id, CategoryIdType::NAME)
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();
    }

    public function slugExists(Slug $slug, ?CategoryId $except = null): bool
    {
        $query = $this->entityManager->createQueryBuilder()
            ->select('1')
            ->from(Category::class, 'c')
            ->where('c.slug = :slug')
            ->setParameter('slug', $slug, SlugType::NAME)
            ->setMaxResults(1);
        if (null !== $except) {
            $query->andWhere('c.id <> :except')->setParameter('except', $except, CategoryIdType::NAME);
        }

        return null !== $query->getQuery()->getOneOrNullResult();
    }

    public function ancestorIds(CategoryId $id): array
    {
        // CYCLE stops the recursion should a cycle ever exist (the trigger prevents them).
        $ids = $this->entityManager->getConnection()->fetchFirstColumn(
            'WITH RECURSIVE ancestors(id, parent_id, distance) AS (
                 SELECT parent.id, parent.parent_id, 1
                 FROM catalog_category child JOIN catalog_category parent ON parent.id = child.parent_id
                 WHERE child.id = :id
                 UNION ALL
                 SELECT c.id, c.parent_id, a.distance + 1
                 FROM catalog_category c JOIN ancestors a ON c.id = a.parent_id
             ) CYCLE id SET is_cycle USING path
             SELECT id FROM ancestors WHERE NOT is_cycle ORDER BY distance',
            ['id' => $id->value],
        );

        return array_map(static fn (mixed $value): CategoryId => CategoryId::fromString(Row::string($value)), $ids);
    }

    public function subtreeHeight(CategoryId $id): int
    {
        return Row::int($this->entityManager->getConnection()->fetchOne(
            'WITH RECURSIVE subtree(id, level) AS (
                 SELECT id, 0 FROM catalog_category WHERE id = :id
                 UNION ALL
                 SELECT c.id, s.level + 1 FROM catalog_category c JOIN subtree s ON c.parent_id = s.id
             ) CYCLE id SET is_cycle USING path
             SELECT COALESCE(MAX(level), 0) FROM subtree WHERE NOT is_cycle',
            ['id' => $id->value],
        ));
    }

    public function hasChildren(CategoryId $id): bool
    {
        return false !== $this->entityManager->getConnection()->fetchOne(
            'SELECT 1 FROM catalog_category WHERE parent_id = :id LIMIT 1',
            ['id' => $id->value],
        );
    }

    public function save(Category $category): void
    {
        try {
            $this->entityManager->persist($category);
            $this->entityManager->flush();
        } catch (UniqueConstraintViolationException $exception) {
            if (str_contains($exception->getMessage(), 'catalog_category_slug_key')) {
                throw DuplicateCategorySlug::of($category->slug());
            }
            throw $exception;
        } catch (ForeignKeyConstraintViolationException) {
            // The parent was deleted after the application checked it.
            throw new InvalidValue(\sprintf('Parent category "%s" does not exist.', $category->parentId()));
        } catch (DriverException $exception) {
            // A concurrent change made the new parent a descendant of this category,
            // or made the branch deeper after the application checked it.
            $parentId = $category->parentId();
            if (null !== $parentId && str_contains($exception->getMessage(), self::CYCLE_ERROR)) {
                throw CategoryCycle::underDescendant($category->id(), $parentId);
            }
            if (null !== $parentId && str_contains($exception->getMessage(), self::TOO_DEEP_ERROR)) {
                throw CategoryTooDeep::under($parentId, CategoryPlacement::MAX_DEPTH);
            }
            if (str_contains($exception->getMessage(), self::ISOLATION_ERROR)) {
                // A configuration error of the server, not of the request.
                throw new \LogicException('Category tree changes must run in READ COMMITTED transactions.', 0, $exception);
            }
            throw $exception;
        }
    }

    public function remove(Category $category): void
    {
        try {
            $this->entityManager->remove($category);
            $this->entityManager->flush();
        } catch (ForeignKeyConstraintViolationException) {
            // A product or subcategory was added after the application checked it.
            throw CategoryNotEmpty::withId($category->id());
        }
    }
}
