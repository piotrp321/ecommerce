<?php

declare(strict_types=1);

namespace App\Tests\Unit\Catalog\Application\Query;

use App\Catalog\Application\Query\CategoryNode;
use App\Catalog\Application\Query\CategoryRecord;
use PHPUnit\Framework\TestCase;

final class CategoryNodeTest extends TestCase
{
    public function testBuildsNestedTreesFromFlatRecords(): void
    {
        $records = [
            new CategoryRecord('a', 'audio', 'Audio', 'e', 0),
            new CategoryRecord('b', 'books', 'Books', null, 2),
            new CategoryRecord('e', 'electronics', 'Electronics', null, 0),
            new CategoryRecord('p', 'phones', 'Phones', 'e', 1),
            new CategoryRecord('s', 'smartphones', 'Smartphones', 'p', 3),
        ];

        self::assertSame(
            ['books' => [], 'electronics' => ['audio' => [], 'phones' => ['smartphones' => []]]],
            self::slugs(CategoryNode::forest($records)),
        );
    }

    public function testTheRootOfASubtreeMayHaveAParentOutsideTheRecords(): void
    {
        $records = [
            new CategoryRecord('p', 'phones', 'Phones', 'e', 1),
            new CategoryRecord('s', 'smartphones', 'Smartphones', 'p', 3),
        ];

        self::assertSame(['phones' => ['smartphones' => []]], self::slugs(CategoryNode::forest($records)));
    }

    /**
     * @param list<CategoryNode> $nodes
     *
     * @return array<string, mixed>
     */
    private static function slugs(array $nodes): array
    {
        $slugs = [];
        foreach ($nodes as $node) {
            $slugs[$node->category->slug] = self::slugs($node->children);
        }

        return $slugs;
    }
}
