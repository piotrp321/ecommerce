<?php

declare(strict_types=1);

namespace App\Customers\Infrastructure\Security;

use App\Customers\Application\ProvisionCustomer;
use App\Shared\Domain\Exception\InvalidValue;
use App\Shared\Domain\Identity\ExternalIdentity;
use Symfony\Component\Security\Core\Exception\UnsupportedUserException;
use Symfony\Component\Security\Core\Exception\UserNotFoundException;
use Symfony\Component\Security\Core\User\AttributesBasedUserProviderInterface;
use Symfony\Component\Security\Core\User\UserInterface;

/**
 * The customer of a verified store access token: the identifier is its `sub`,
 * the attributes are its claims. Every valid token of the store realm belongs
 * to a customer, registered on the first request (ProvisionCustomer).
 *
 * @implements AttributesBasedUserProviderInterface<CustomerUser>
 */
final readonly class CustomerUserProvider implements AttributesBasedUserProviderInterface
{
    public function __construct(private ProvisionCustomer $provisionCustomer)
    {
    }

    /**
     * @param array<string, mixed> $attributes the claims of the verified token
     */
    public function loadUserByIdentifier(string $identifier, array $attributes = []): CustomerUser
    {
        $issuer = $attributes['iss'] ?? null;
        if (!\is_string($issuer)) {
            // Only access tokens identify customers (stateless API, no sessions).
            throw new UserNotFoundException('A customer is identified by an access token only.');
        }
        $email = $attributes['email'] ?? null;

        try {
            $customer = ($this->provisionCustomer)(
                new ExternalIdentity($issuer, $identifier),
                \is_string($email) ? $email : null,
                true === ($attributes['email_verified'] ?? null),
            );
        } catch (InvalidValue $exception) {
            throw new UserNotFoundException('The token does not identify a valid customer.', previous: $exception);
        }

        return CustomerUser::of($customer);
    }

    public function refreshUser(UserInterface $user): UserInterface
    {
        throw new UnsupportedUserException('The store API is stateless: there is no user to refresh.');
    }

    public function supportsClass(string $class): bool
    {
        return CustomerUser::class === $class;
    }
}
