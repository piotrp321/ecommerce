<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Persistence\Doctrine;

use App\Catalog\Domain\Category\CategoryId;
use App\Catalog\Domain\Product\DuplicateProductSlug;
use App\Catalog\Domain\Product\DuplicateSku;
use App\Catalog\Domain\Product\Product;
use App\Catalog\Domain\Product\ProductId;
use App\Catalog\Domain\Product\ProductNotFound;
use App\Catalog\Domain\Product\ProductRepository;
use App\Catalog\Domain\Product\Sku;
use App\Catalog\Domain\Slug;
use App\Catalog\Infrastructure\Persistence\Doctrine\Type\CategoryIdType;
use App\Catalog\Infrastructure\Persistence\Doctrine\Type\ProductIdType;
use App\Catalog\Infrastructure\Persistence\Doctrine\Type\SkuType;
use App\Catalog\Infrastructure\Persistence\Doctrine\Type\SlugType;
use App\Shared\Domain\Exception\InvalidValue;
use Doctrine\DBAL\Exception\ForeignKeyConstraintViolationException;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Doctrine\ORM\EntityManagerInterface;

final readonly class DoctrineProductRepository implements ProductRepository
{
    public function __construct(private EntityManagerInterface $entityManager)
    {
    }

    public function get(ProductId $id): Product
    {
        return $this->entityManager->find(Product::class, $id) ?? throw ProductNotFound::withId($id);
    }

    public function exists(ProductId $id): bool
    {
        return $this->any('p.id = :value', $id, ProductIdType::NAME);
    }

    public function skuExists(Sku $sku): bool
    {
        return $this->any('p.sku = :value', $sku, SkuType::NAME);
    }

    public function slugExists(Slug $slug, ?ProductId $except = null): bool
    {
        $query = $this->entityManager->createQueryBuilder()
            ->select('1')
            ->from(Product::class, 'p')
            ->where('p.slug = :slug')
            ->setParameter('slug', $slug, SlugType::NAME)
            ->setMaxResults(1);
        if (null !== $except) {
            $query->andWhere('p.id <> :except')->setParameter('except', $except, ProductIdType::NAME);
        }

        return null !== $query->getQuery()->getOneOrNullResult();
    }

    public function existsInCategory(CategoryId $categoryId): bool
    {
        return $this->any('p.categoryId = :value', $categoryId, CategoryIdType::NAME);
    }

    public function save(Product $product): void
    {
        try {
            $this->entityManager->persist($product);
            $this->entityManager->flush();
        } catch (ForeignKeyConstraintViolationException) {
            // The category was deleted after the application checked it.
            throw new InvalidValue(\sprintf('Category "%s" does not exist.', $product->categoryId()));
        } catch (UniqueConstraintViolationException $exception) {
            // A concurrent request took the SKU or slug after the application checked it.
            throw match (true) {
                str_contains($exception->getMessage(), 'catalog_product_sku_key') => DuplicateSku::of($product->sku()),
                str_contains($exception->getMessage(), 'catalog_product_slug_key') => DuplicateProductSlug::of($product->slug()),
                default => $exception,
            };
        }
    }

    private function any(string $condition, mixed $value, string $type): bool
    {
        return null !== $this->entityManager->createQueryBuilder()
            ->select('1')
            ->from(Product::class, 'p')
            ->where($condition)
            ->setParameter('value', $value, $type)
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();
    }
}
