<?php

declare(strict_types=1);

namespace App\Catalog\Domain\Category;

use App\Catalog\Domain\Slug;
use App\Shared\Domain\Exception\InvalidValue;

/**
 * A group of products in a tree: a category is either a root or has a parent
 * (adjacency list). A product belongs to at most one category.
 *
 * The rules that need the whole tree (no cycles, maximum depth) are checked by
 * CategoryPlacement before the parent is set.
 */
final class Category
{
    public const int NAME_MAX_LENGTH = 100;

    private string $name;

    private function __construct(
        private readonly CategoryId $id,
        private Slug $slug,
        string $name,
        private ?CategoryId $parentId,
    ) {
        $this->name = self::validName($name);
        self::assertNotOwnParent($id, $parentId);
    }

    public static function create(CategoryId $id, Slug $slug, string $name, ?CategoryId $parentId = null): self
    {
        return new self($id, $slug, $name, $parentId);
    }

    public function update(Slug $slug, string $name): void
    {
        $this->name = self::validName($name);
        $this->slug = $slug;
    }

    /**
     * Moves the category (with its whole subtree) under another parent, or to the root level.
     */
    public function moveTo(?CategoryId $parentId): void
    {
        self::assertNotOwnParent($this->id, $parentId);
        $this->parentId = $parentId;
    }

    public function id(): CategoryId
    {
        return $this->id;
    }

    public function slug(): Slug
    {
        return $this->slug;
    }

    public function name(): string
    {
        return $this->name;
    }

    public function parentId(): ?CategoryId
    {
        return $this->parentId;
    }

    private static function validName(string $name): string
    {
        $name = trim($name);
        if ('' === $name || mb_strlen($name) > self::NAME_MAX_LENGTH) {
            throw new InvalidValue(\sprintf('A category name must have 1 to %d characters.', self::NAME_MAX_LENGTH));
        }

        return $name;
    }

    private static function assertNotOwnParent(CategoryId $id, ?CategoryId $parentId): void
    {
        if (null !== $parentId && $parentId->equals($id)) {
            throw CategoryCycle::ownParent($id);
        }
    }
}
