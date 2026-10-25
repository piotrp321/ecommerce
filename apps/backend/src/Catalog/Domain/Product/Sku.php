<?php

declare(strict_types=1);

namespace App\Catalog\Domain\Product;

use App\Shared\Domain\Exception\InvalidValue;

/**
 * Stock keeping unit: the shop's own product code, unique and immutable.
 */
final readonly class Sku implements \Stringable
{
    public const string PATTERN = '[A-Z0-9][A-Z0-9_-]{0,63}';

    public function __construct(public string $value)
    {
        if (1 !== preg_match('/^'.self::PATTERN.'$/D', $value)) {
            throw new InvalidValue(\sprintf('"%s" is not a valid SKU: use uppercase letters, digits, "-" and "_", at most 64 characters.', $value));
        }
    }

    public function equals(self $other): bool
    {
        return $this->value === $other->value;
    }

    public function __toString(): string
    {
        return $this->value;
    }
}
