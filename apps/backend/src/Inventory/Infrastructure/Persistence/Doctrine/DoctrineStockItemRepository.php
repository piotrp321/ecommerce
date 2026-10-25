<?php

declare(strict_types=1);

namespace App\Inventory\Infrastructure\Persistence\Doctrine;

use App\Inventory\Domain\ConcurrentStockChange;
use App\Inventory\Domain\ProductId;
use App\Inventory\Domain\StockItem;
use App\Inventory\Domain\StockItemRepository;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Doctrine\ORM\EntityManagerInterface;

final readonly class DoctrineStockItemRepository implements StockItemRepository
{
    public function __construct(private EntityManagerInterface $entityManager)
    {
    }

    public function find(ProductId $productId): ?StockItem
    {
        return $this->entityManager->find(StockItem::class, $productId);
    }

    public function save(StockItem $stockItem): void
    {
        try {
            $this->entityManager->persist($stockItem);
            $this->entityManager->flush();
        } catch (UniqueConstraintViolationException) {
            throw ConcurrentStockChange::of($stockItem->productId());
        }
    }
}
