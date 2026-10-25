<?php

declare(strict_types=1);

namespace App\Catalog\Domain\Product;

use App\Catalog\Domain\Category\CategoryId;
use App\Catalog\Domain\Slug;
use App\Shared\Domain\Exception\InvalidValue;
use App\Shared\Domain\Pricing\Money;
use App\Shared\Domain\Pricing\VatRate;

/**
 * A product offered by the shop. The source of its price is the unit net price
 * in PLN and the assigned VAT rate (spec R11, R12). Products are never deleted:
 * withdrawing one from sale means deactivating it (spec R6).
 */
final class Product
{
    public const int NAME_MAX_LENGTH = 200;
    public const int DESCRIPTION_MAX_LENGTH = 10000;
    /** 9 999 999.99 PLN */
    public const int NET_PRICE_MAX = 999_999_999;

    private string $name;
    private ?string $description;
    private bool $active = false;
    private \DateTimeImmutable $updatedAt;

    private function __construct(
        private readonly ProductId $id,
        private readonly Sku $sku,
        private Slug $slug,
        string $name,
        ?string $description,
        private Money $netPrice,
        private VatRate $vatRate,
        private ?CategoryId $categoryId,
        private readonly \DateTimeImmutable $createdAt,
    ) {
        $this->name = self::validName($name);
        $this->description = self::validDescription($description);
        self::assertValidPrice($netPrice);
        $this->updatedAt = $createdAt;
    }

    /**
     * A new product is inactive: it goes on sale only when activated explicitly.
     */
    public static function create(
        ProductId $id,
        Sku $sku,
        Slug $slug,
        string $name,
        ?string $description,
        Money $netPrice,
        VatRate $vatRate,
        ?CategoryId $categoryId,
        \DateTimeImmutable $now,
    ): self {
        return new self($id, $sku, $slug, $name, $description, $netPrice, $vatRate, $categoryId, $now);
    }

    public function update(
        Slug $slug,
        string $name,
        ?string $description,
        Money $netPrice,
        VatRate $vatRate,
        ?CategoryId $categoryId,
        \DateTimeImmutable $now,
    ): void {
        // Validate everything first, so a rejected update changes nothing.
        $name = self::validName($name);
        $description = self::validDescription($description);
        self::assertValidPrice($netPrice);

        $this->slug = $slug;
        $this->name = $name;
        $this->description = $description;
        $this->netPrice = $netPrice;
        $this->vatRate = $vatRate;
        $this->categoryId = $categoryId;
        $this->updatedAt = $now;
    }

    public function activate(\DateTimeImmutable $now): void
    {
        if (!$this->active) {
            $this->active = true;
            $this->updatedAt = $now;
        }
    }

    public function deactivate(\DateTimeImmutable $now): void
    {
        if ($this->active) {
            $this->active = false;
            $this->updatedAt = $now;
        }
    }

    public function id(): ProductId
    {
        return $this->id;
    }

    public function sku(): Sku
    {
        return $this->sku;
    }

    public function slug(): Slug
    {
        return $this->slug;
    }

    public function name(): string
    {
        return $this->name;
    }

    public function description(): ?string
    {
        return $this->description;
    }

    public function netPrice(): Money
    {
        return $this->netPrice;
    }

    public function vatRate(): VatRate
    {
        return $this->vatRate;
    }

    /**
     * Price presented to B2C customers (spec R13).
     */
    public function grossPrice(): Money
    {
        return $this->vatRate->grossUnitPrice($this->netPrice);
    }

    public function categoryId(): ?CategoryId
    {
        return $this->categoryId;
    }

    public function isActive(): bool
    {
        return $this->active;
    }

    public function createdAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function updatedAt(): \DateTimeImmutable
    {
        return $this->updatedAt;
    }

    private static function validName(string $name): string
    {
        $name = trim($name);
        if ('' === $name || mb_strlen($name) > self::NAME_MAX_LENGTH) {
            throw new InvalidValue(\sprintf('A product name must have 1 to %d characters.', self::NAME_MAX_LENGTH));
        }

        return $name;
    }

    private static function validDescription(?string $description): ?string
    {
        $description = null === $description ? null : trim($description);
        if ('' === $description) {
            return null;
        }
        if (null !== $description && mb_strlen($description) > self::DESCRIPTION_MAX_LENGTH) {
            throw new InvalidValue(\sprintf('A product description can have at most %d characters.', self::DESCRIPTION_MAX_LENGTH));
        }

        return $description;
    }

    private static function assertValidPrice(Money $netPrice): void
    {
        if ($netPrice->isZero() || $netPrice->minorUnits > self::NET_PRICE_MAX) {
            throw new InvalidValue('The net price must be between 0.01 and 9999999.99 PLN.');
        }
    }
}
