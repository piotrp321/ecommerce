<?php

declare(strict_types=1);

namespace App\Catalog\Domain;

use App\Shared\Domain\Exception\InvalidValue;

/**
 * Rules for user-entered text: valid UTF-8 without control characters
 * (PostgreSQL would silently cut a string at NUL).
 */
final class PlainText
{
    /**
     * A single line: no control characters at all.
     */
    public static function assertLine(string $value, string $field): void
    {
        if (1 !== preg_match('/^[^\x00-\x1F\x7F]*$/uD', $value)) {
            throw new InvalidValue(\sprintf('The %s must be valid text without control characters.', $field));
        }
    }

    /**
     * Multi-line text: tabs and line breaks are allowed.
     */
    public static function assertText(string $value, string $field): void
    {
        if (1 !== preg_match('/^[^\x00-\x08\x0B\x0C\x0E-\x1F\x7F]*$/uD', $value)) {
            throw new InvalidValue(\sprintf('The %s must be valid text without control characters.', $field));
        }
    }
}
