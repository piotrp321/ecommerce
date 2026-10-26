<?php

declare(strict_types=1);

namespace App\Backoffice\Domain;

use App\Shared\Domain\Exception\InvalidValue;
use App\Shared\Domain\Identity\ExternalIdentity;

/**
 * An administrator of the back office. Accounts and roles live in the identity
 * provider (realm "admin"): the roles come from each access token and are not
 * stored here. The shop keeps a copy of the profile and can block an
 * administrator locally, which denies access whatever the token says.
 */
final class AdminUser
{
    public const int EMAIL_MAX_LENGTH = 254;

    private string $issuer;
    private string $subject;
    private ?string $email;
    private bool $emailVerified;
    private AdminUserStatus $status = AdminUserStatus::Active;
    private \DateTimeImmutable $updatedAt;

    private function __construct(
        private readonly AdminUserId $id,
        ExternalIdentity $identity,
        ?string $email,
        bool $emailVerified,
        private readonly \DateTimeImmutable $createdAt,
    ) {
        $this->issuer = $identity->issuer;
        $this->subject = $identity->subject;
        [$this->email, $this->emailVerified] = self::profile($email, $emailVerified);
        $this->updatedAt = $createdAt;
    }

    /**
     * The administrator seen for the first time (just-in-time registration).
     */
    public static function register(AdminUserId $id, ExternalIdentity $identity, ?string $email, bool $emailVerified, \DateTimeImmutable $now): self
    {
        return new self($id, $identity, $email, $emailVerified, $now);
    }

    /**
     * Copies the profile from the identity provider.
     *
     * @return bool whether anything changed (and needs saving)
     */
    public function syncProfile(?string $email, bool $emailVerified, \DateTimeImmutable $now): bool
    {
        [$email, $emailVerified] = self::profile($email, $emailVerified);
        if ($email === $this->email && $emailVerified === $this->emailVerified) {
            return false;
        }
        $this->email = $email;
        $this->emailVerified = $emailVerified;
        $this->updatedAt = $now;

        return true;
    }

    public function block(\DateTimeImmutable $now): void
    {
        if (AdminUserStatus::Blocked !== $this->status) {
            $this->status = AdminUserStatus::Blocked;
            $this->updatedAt = $now;
        }
    }

    public function isBlocked(): bool
    {
        return AdminUserStatus::Blocked === $this->status;
    }

    public function id(): AdminUserId
    {
        return $this->id;
    }

    public function identity(): ExternalIdentity
    {
        return new ExternalIdentity($this->issuer, $this->subject);
    }

    public function email(): ?string
    {
        return $this->email;
    }

    public function emailVerified(): bool
    {
        return $this->emailVerified;
    }

    public function status(): AdminUserStatus
    {
        return $this->status;
    }

    public function createdAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function updatedAt(): \DateTimeImmutable
    {
        return $this->updatedAt;
    }

    /**
     * An empty e-mail means none; without an e-mail nothing is verified.
     *
     * @return array{?string, bool}
     */
    private static function profile(?string $email, bool $emailVerified): array
    {
        $email = null === $email ? null : trim($email);
        if ('' === $email || null === $email) {
            return [null, false];
        }
        if (\strlen($email) > self::EMAIL_MAX_LENGTH) {
            throw new InvalidValue(\sprintf('An e-mail address can have at most %d characters.', self::EMAIL_MAX_LENGTH));
        }

        return [$email, $emailVerified];
    }
}
