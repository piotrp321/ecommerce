<?php

declare(strict_types=1);

namespace App\Catalog\Application\Product;

use App\Catalog\Domain\Product\DuplicateProductSlug;
use App\Catalog\Domain\Product\DuplicateSku;
use App\Catalog\Domain\Product\Product;
use App\Catalog\Domain\Product\ProductId;
use App\Catalog\Domain\Product\ProductRepository;
use App\Catalog\Domain\Product\Sku;
use App\Catalog\Domain\Slug;
use App\Shared\Domain\Pricing\Money;
use Psr\Clock\ClockInterface;

/**
 * Use cases of product management.
 */
final readonly class ProductHandler
{
    public function __construct(
        private ProductRepository $products,
        private ProductInput $input,
        private ClockInterface $clock,
    ) {
    }

    public function create(CreateProduct $command): ProductId
    {
        $sku = new Sku($command->sku);
        $slug = new Slug($command->slug);
        $product = Product::create(
            ProductId::generate(),
            $sku,
            $slug,
            $command->name,
            $command->description,
            Money::fromDecimal($command->netPrice),
            $this->input->vatRate($command->vatRate),
            $this->input->existingCategory($command->categoryId),
            $this->clock->now(),
        );

        if ($this->products->skuExists($sku)) {
            throw DuplicateSku::of($sku);
        }
        if ($this->products->slugExists($slug)) {
            throw DuplicateProductSlug::of($slug);
        }
        $this->products->save($product);

        return $product->id();
    }

    public function update(UpdateProduct $command): void
    {
        $product = $this->products->get(ProductId::fromString($command->productId));
        $slug = new Slug($command->slug);

        $product->update(
            $slug,
            $command->name,
            $command->description,
            Money::fromDecimal($command->netPrice),
            $this->input->vatRate($command->vatRate),
            $this->input->existingCategory($command->categoryId),
            $this->clock->now(),
        );

        if ($this->products->slugExists($slug, except: $product->id())) {
            throw DuplicateProductSlug::of($slug);
        }
        $this->products->save($product);
    }

    /**
     * Puts the product on sale; idempotent.
     */
    public function activate(string $productId): void
    {
        $product = $this->products->get(ProductId::fromString($productId));
        $product->activate($this->clock->now());
        $this->products->save($product);
    }

    /**
     * Withdraws the product from sale (spec R6); idempotent.
     */
    public function deactivate(string $productId): void
    {
        $product = $this->products->get(ProductId::fromString($productId));
        $product->deactivate($this->clock->now());
        $this->products->save($product);
    }
}
