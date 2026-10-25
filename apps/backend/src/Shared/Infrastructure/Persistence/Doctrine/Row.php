<?php

declare(strict_types=1);

namespace App\Shared\Infrastructure\Persistence\Doctrine;

/**
 * Typed access to values of a row fetched with DBAL, which are mixed.
 */
final class Row
{
    public static function string(mixed $value): string
    {
        if (!\is_string($value)) {
            throw new \UnexpectedValueException(\sprintf('Expected a string column value, got %s.', get_debug_type($value)));
        }

        return $value;
    }

    public static function nullableString(mixed $value): ?string
    {
        return null === $value ? null : self::string($value);
    }

    public static function int(mixed $value): int
    {
        if (\is_int($value)) {
            return $value;
        }
        if (\is_string($value) && 1 === preg_match('/^-?\d+$/', $value)) {
            return (int) $value;
        }

        throw new \UnexpectedValueException(\sprintf('Expected an integer column value, got %s.', get_debug_type($value)));
    }

    public static function bool(mixed $value): bool
    {
        if (!\is_bool($value)) {
            throw new \UnexpectedValueException(\sprintf('Expected a boolean column value, got %s.', get_debug_type($value)));
        }

        return $value;
    }
}
