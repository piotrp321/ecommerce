<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Persistence\Doctrine;

use App\Catalog\Domain\Category\Category;
use App\Catalog\Domain\Category\CategoryId;
use App\Catalog\Domain\Category\CategoryNotEmpty;
use App\Catalog\Domain\Category\CategoryNotFound;
use App\Catalog\Domain\Category\CategoryRepository;
use App\Catalog\Domain\Category\DuplicateCategorySlug;
use App\Catalog\Domain\Slug;
use App\Catalog\Infrastructure\Persistence\Doctrine\Type\CategoryIdType;
use App\Catalog\Infrastructure\Persistence\Doctrine\Type\SlugType;
use Doctrine\DBAL\Exception\ForeignKeyConstraintViolationException;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Doctrine\ORM\EntityManagerInterface;

final readonly class DoctrineCategoryRepository implements CategoryRepository
{
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
        }
    }

    public function remove(Category $category): void
    {
        try {
            $this->entityManager->remove($category);
            $this->entityManager->flush();
        } catch (ForeignKeyConstraintViolationException) {
            // A product was assigned to the category after the application checked it.
            throw CategoryNotEmpty::withId($category->id());
        }
    }
}
