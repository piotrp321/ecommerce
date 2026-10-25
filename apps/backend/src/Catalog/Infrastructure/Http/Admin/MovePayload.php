<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Http\Admin;

use Symfony\Component\Validator\Constraints as Assert;

final readonly class MovePayload
{
    public function __construct(
        /** The new parent, or null to make the category a root. */
        #[Assert\Uuid]
        public ?string $parentId,
    ) {
    }
}
