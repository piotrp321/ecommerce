<?php

declare(strict_types=1);

namespace App\Tests\Unit\Catalog\Domain\Product;

use App\Catalog\Domain\Category\CategoryId;
use App\Catalog\Domain\Product\Product;
use App\Catalog\Domain\Product\ProductId;
use App\Catalog\Domain\Product\Sku;
use App\Catalog\Domain\Slug;
use App\Shared\Domain\Exception\InvalidValue;
use App\Shared\Domain\Pricing\Money;
use App\Shared\Domain\Pricing\VatRate;
use PHPUnit\Framework\Attributes\TestWith;
use PHPUnit\Framework\TestCase;

final class ProductTest extends TestCase
{
    private \DateTimeImmutable $now;

    protected function setUp(): void
    {
        $this->now = new \DateTimeImmutable('2026-10-25 12:00:00');
    }

    public function testIsCreatedInactive(): void
    {
        $categoryId = CategoryId::generate();
        $product = $this->product(categoryId: $categoryId);

        self::assertFalse($product->isActive());
        self::assertSame('TEA-001', $product->sku()->value);
        self::assertSame('green-tea', $product->slug()->value);
        self::assertSame('Green tea', $product->name());
        self::assertSame('8.13', $product->netPrice()->toDecimal());
        self::assertSame(VatRate::Standard, $product->vatRate());
        self::assertSame($categoryId, $product->categoryId());
        self::assertEquals($this->now, $product->createdAt());
        self::assertEquals($this->now, $product->updatedAt());
    }

    public function testPresentsTheGrossPriceRoundedOnce(): void
    {
        self::assertSame('10.00', $this->product(netPrice: '8.13')->grossPrice()->toDecimal());
        self::assertSame('3.08', $this->product(netPrice: '2.50')->grossPrice()->toDecimal());
    }

    public function testTrimsTheNameAndEmptiesABlankDescription(): void
    {
        $product = $this->product(name: '  Green tea  ', description: "  \n ");

        self::assertSame('Green tea', $product->name());
        self::assertNull($product->description());
    }

    #[TestWith([''])]
    #[TestWith(['   '])]
    public function testRequiresAName(string $name): void
    {
        $this->expectException(InvalidValue::class);

        $this->product(name: $name);
    }

    public function testLimitsTheNameLength(): void
    {
        $this->product(name: str_repeat('ż', 200));

        $this->expectException(InvalidValue::class);

        $this->product(name: str_repeat('ż', 201));
    }

    #[TestWith(["Green\x00tea"])]
    #[TestWith(["Green\ttea"])]
    #[TestWith(["Green\ntea"])]
    #[TestWith(["Green\x7Ftea"])]
    #[TestWith(["Green \xC3\x28"])] // invalid UTF-8
    public function testRejectsControlCharactersInTheName(string $name): void
    {
        $this->expectException(InvalidValue::class);

        $this->product(name: $name);
    }

    public function testAllowsLineBreaksButNoOtherControlCharactersInTheDescription(): void
    {
        self::assertSame("Loose leaf\r\n\tfrom Japan", $this->product(description: "Loose leaf\r\n\tfrom Japan")->description());

        $this->expectException(InvalidValue::class);

        $this->product(description: "Loose\x00leaf");
    }

    public function testLimitsTheDescriptionLength(): void
    {
        $this->expectException(InvalidValue::class);

        $this->product(description: str_repeat('a', 10001));
    }

    #[TestWith(['0.00'])]
    #[TestWith(['10000000.00'])]
    public function testRejectsAZeroOrTooHighNetPrice(string $netPrice): void
    {
        $this->expectException(InvalidValue::class);

        $this->product(netPrice: $netPrice);
    }

    public function testAcceptsTheMaximumNetPrice(): void
    {
        self::assertSame('9999999.99', $this->product(netPrice: '9999999.99')->netPrice()->toDecimal());
    }

    public function testActivationAndDeactivationAreIdempotent(): void
    {
        $product = $this->product();
        $later = $this->now->modify('+1 hour');
        $evenLater = $this->now->modify('+2 hours');

        $product->activate($later);
        $product->activate($evenLater);
        self::assertTrue($product->isActive());
        self::assertEquals($later, $product->updatedAt());

        $product->deactivate($evenLater);
        $product->deactivate($evenLater->modify('+1 hour'));
        self::assertFalse($product->isActive());
        self::assertEquals($evenLater, $product->updatedAt());
    }

    public function testUpdatesTheEditableFieldsButKeepsTheSkuAndStatus(): void
    {
        $product = $this->product();
        $product->activate($this->now);
        $later = $this->now->modify('+1 day');

        $product->update(new Slug('black-tea'), 'Black tea', 'Strong', Money::fromDecimal('10.00'), VatRate::Reduced, null, $later);

        self::assertSame('TEA-001', $product->sku()->value);
        self::assertTrue($product->isActive());
        self::assertSame('black-tea', $product->slug()->value);
        self::assertSame('Black tea', $product->name());
        self::assertSame('Strong', $product->description());
        self::assertSame('10.80', $product->grossPrice()->toDecimal());
        self::assertNull($product->categoryId());
        self::assertEquals($this->now, $product->createdAt());
        self::assertEquals($later, $product->updatedAt());
    }

    public function testUpdateValidatesBeforeChangingAnything(): void
    {
        $product = $this->product();

        try {
            $product->update(new Slug('black-tea'), 'Black tea', null, Money::zero(), VatRate::Reduced, null, $this->now);
            self::fail('Expected an invalid price to be rejected.');
        } catch (InvalidValue) {
        }
        try {
            $product->update(new Slug('black-tea'), '', null, Money::fromDecimal('1.00'), VatRate::Reduced, null, $this->now);
            self::fail('Expected an empty name to be rejected.');
        } catch (InvalidValue) {
        }

        self::assertSame('green-tea', $product->slug()->value);
        self::assertSame('Green tea', $product->name());
        self::assertSame('8.13', $product->netPrice()->toDecimal());
    }

    private function product(
        string $name = 'Green tea',
        ?string $description = 'Loose leaf',
        string $netPrice = '8.13',
        ?CategoryId $categoryId = null,
    ): Product {
        return Product::create(
            ProductId::generate(),
            new Sku('TEA-001'),
            new Slug('green-tea'),
            $name,
            $description,
            Money::fromDecimal($netPrice),
            VatRate::Standard,
            $categoryId,
            $this->now,
        );
    }
}
