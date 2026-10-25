<?php

declare(strict_types=1);

namespace App\Catalog\Domain\Category;

use App\Catalog\Domain\Slug;
use App\Shared\Domain\Exception\InvalidValue;

/**
 * A group of products. Categories are flat (no hierarchy); a product belongs to
 * at most one category.
 */
final class Category
{
    public const int NAME_MAX_LENGTH = 100;

    private string $name;

    private function __construct(
        private readonly CategoryId $id,
        private Slug $slug,
        string $name,
    ) {
        $this->name = self::validName($name);
    }

    public static function create(CategoryId $id, Slug $slug, string $name): self
    {
        return new self($id, $slug, $name);
    }

    public function update(Slug $slug, string $name): void
    {
        $this->name = self::validName($name);
        $this->slug = $slug;
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

    private static function validName(string $name): string
    {
        $name = trim($name);
        if ('' === $name || mb_strlen($name) > self::NAME_MAX_LENGTH) {
            throw new InvalidValue(\sprintf('A category name must have 1 to %d characters.', self::NAME_MAX_LENGTH));
        }

        return $name;
    }
}
