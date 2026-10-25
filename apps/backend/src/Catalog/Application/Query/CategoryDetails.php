<?php

declare(strict_types=1);

namespace App\Catalog\Application\Query;

/**
 * A category with its subtree and its path from the root (breadcrumbs).
 */
final readonly class CategoryDetails
{
    /**
     * @param list<CategoryRecord> $ancestors from the root down to the parent
     */
    public function __construct(
        public CategoryNode $node,
        public array $ancestors,
    ) {
    }
}
