<?php

declare(strict_types=1);

namespace App\Catalog\Application\Query;

/**
 * A category with its subcategories (recursively).
 */
final readonly class CategoryNode
{
    /**
     * @param list<CategoryNode> $children ordered by name
     */
    public function __construct(
        public CategoryRecord $category,
        public array $children,
    ) {
    }

    /**
     * Builds trees from flat records: nodes whose parent is not among the
     * records become roots (the whole tree, or the root of a subtree).
     *
     * @param list<CategoryRecord> $records ordered by name
     *
     * @return list<CategoryNode>
     */
    public static function forest(array $records): array
    {
        $ids = [];
        $children = [];
        foreach ($records as $record) {
            $ids[$record->id] = true;
            $children[$record->parentId ?? ''][] = $record;
        }

        $roots = array_filter($records, static fn (CategoryRecord $r): bool => null === $r->parentId || !isset($ids[$r->parentId]));

        return array_values(array_map(static fn (CategoryRecord $r): self => self::build($r, $children), $roots));
    }

    /**
     * @param array<string, list<CategoryRecord>> $children
     */
    private static function build(CategoryRecord $record, array $children): self
    {
        return new self(
            $record,
            array_map(static fn (CategoryRecord $child): self => self::build($child, $children), $children[$record->id] ?? []),
        );
    }
}
