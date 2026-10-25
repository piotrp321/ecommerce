<?php

declare(strict_types=1);

namespace App\Shared\Infrastructure\Http;

use App\Shared\Domain\Exception\Conflict;
use App\Shared\Domain\Exception\InvalidValue;
use App\Shared\Domain\Exception\NotFound;
use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Event\ExceptionEvent;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\Validator\Exception\ValidationFailedException;

/**
 * Renders errors of the JSON API as RFC 9457 problem details:
 * - domain exceptions: their messages are written for API clients, so they
 *   are shown in every environment (404, 409, 422),
 * - request validation: 422 with the list of violations,
 * - other client errors (4xx) of JSON routes: the HTTP exception message.
 * Server errors stay with Symfony's error handling (no details in production).
 */
#[AsEventListener]
final class ApiExceptionSubscriber
{
    public function __invoke(ExceptionEvent $event): void
    {
        $exception = $event->getThrowable();
        $status = match (true) {
            $exception instanceof NotFound => Response::HTTP_NOT_FOUND,
            $exception instanceof Conflict => Response::HTTP_CONFLICT,
            $exception instanceof InvalidValue => Response::HTTP_UNPROCESSABLE_ENTITY,
            default => null,
        };
        if (null !== $status) {
            $event->setResponse(Problem::response($status, $exception->getMessage()));

            return;
        }

        if (!$exception instanceof HttpExceptionInterface || 'json' !== $event->getRequest()->getRequestFormat()) {
            return;
        }
        $status = $exception->getStatusCode();
        if ($status >= 500) {
            return;
        }

        $validation = $exception->getPrevious();
        $response = $validation instanceof ValidationFailedException
            ? $this->validationProblem($status, $validation)
            : Problem::response($status, $exception->getMessage());
        $response->headers->add($exception->getHeaders());
        $event->setResponse($response);
    }

    private function validationProblem(int $status, ValidationFailedException $exception): JsonResponse
    {
        $violations = [];
        foreach ($exception->getViolations() as $violation) {
            $violations[] = ['propertyPath' => $violation->getPropertyPath(), 'title' => (string) $violation->getMessage()];
        }

        return Problem::response(
            $status,
            implode("\n", array_map(static fn (array $v): string => $v['propertyPath'].': '.$v['title'], $violations)),
            extra: ['violations' => $violations],
        );
    }
}
