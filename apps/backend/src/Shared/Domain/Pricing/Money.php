<?php

declare(strict_types=1);

namespace App\Shared\Domain\Pricing;

use App\Shared\Domain\Exception\InvalidValue;

/**
 * Non-negative amount in PLN, kept in grosze (1/100 PLN) as an integer:
 * no floats anywhere in price calculations (spec 3.4).
 */
final readonly class Money
{
    public const string CURRENCY = 'PLN';

    private function __construct(public int $minorUnits)
    {
    }

    public static function ofMinorUnits(int $minorUnits): self
    {
        if ($minorUnits < 0) {
            throw new InvalidValue('An amount cannot be negative.');
        }

        return new self($minorUnits);
    }

    public static function zero(): self
    {
        return new self(0);
    }

    /**
     * Parses a decimal string with exactly two fractional digits, e.g. "8.13".
     */
    public static function fromDecimal(string $amount): self
    {
        if (1 !== preg_match('/^(0|[1-9]\d{0,8})\.(\d{2})$/', $amount, $matches)) {
            throw new InvalidValue(\sprintf('"%s" is not an amount with two decimal places, e.g. "10.00".', $amount));
        }

        return new self((int) $matches[1] * 100 + (int) $matches[2]);
    }

    public function toDecimal(): string
    {
        return \sprintf('%d.%02d', intdiv($this->minorUnits, 100), $this->minorUnits % 100);
    }

    public function add(self $other): self
    {
        return self::ofMinorUnits(self::checked($this->minorUnits + $other->minorUnits));
    }

    public function subtract(self $other): self
    {
        return self::ofMinorUnits($this->minorUnits - $other->minorUnits);
    }

    public function multiply(int $factor): self
    {
        if ($factor < 0) {
            throw new InvalidValue('An amount cannot be multiplied by a negative number.');
        }

        return new self(self::checked($this->minorUnits * $factor));
    }

    public function equals(self $other): bool
    {
        return $this->minorUnits === $other->minorUnits;
    }

    public function isZero(): bool
    {
        return 0 === $this->minorUnits;
    }

    private static function checked(int|float $result): int
    {
        // Integer overflow turns the result into a float.
        if (!\is_int($result)) {
            throw new InvalidValue('The amount is out of range.');
        }

        return $result;
    }
}
