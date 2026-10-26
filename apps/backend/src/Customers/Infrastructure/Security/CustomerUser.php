<?php

declare(strict_types=1);

namespace App\Customers\Infrastructure\Security;

use App\Customers\Domain\Customer;
use Symfony\Component\Security\Core\User\UserInterface;

/**
 * The authenticated customer of a store API request (firewall store_api).
 */
final readonly class CustomerUser implements UserInterface
{
    public const string ROLE = 'ROLE_CUSTOMER';

    private function __construct(
        public string $id,
        public ?string $email,
        public bool $emailVerified,
    ) {
    }

    public static function of(Customer $customer): self
    {
        return new self($customer->id()->value, $customer->email(), $customer->emailVerified());
    }

    public function getRoles(): array
    {
        return [self::ROLE];
    }

    public function getUserIdentifier(): string
    {
        \assert('' !== $this->id);

        return $this->id;
    }
}
