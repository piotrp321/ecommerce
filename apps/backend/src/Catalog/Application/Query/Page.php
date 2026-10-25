<?php

declare(strict_types=1);

namespace App\Catalog\Application\Query;

/**
 * One page of a result list.
 *
 * @template T
 */
final readonly class Page
{
    /**
     * @param list<T> $items
     */
    public function __construct(
        public array $items,
        public int $page,
        public int $perPage,
        public int $totalItems,
    ) {
    }

    public function totalPages(): int
    {
        return (int) ceil($this->totalItems / $this->perPage);
    }

    /**
     * @template U
     *
     * @param callable(T): U $map
     *
     * @return self<U>
     */
    public function map(callable $map): self
    {
        return new self(array_map($map, $this->items), $this->page, $this->perPage, $this->totalItems);
    }
}
