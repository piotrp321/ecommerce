<?php

declare(strict_types=1);

namespace App\Tests\Support\Contract;

use Opis\JsonSchema\CompliantValidator;
use Opis\JsonSchema\Errors\ErrorFormatter;
use Opis\JsonSchema\Validator;
use Symfony\Component\Yaml\Yaml;

/**
 * The API contract (docs/api/openapi.yaml, OpenAPI 3.1) loaded for the tests.
 *
 * Validates real responses against the documented operation: the status code must be
 * documented, the Content-Type must match, and the body must match the JSON Schema
 * (2020-12, the schema dialect of OpenAPI 3.1).
 */
final class OpenApiContract
{
    private const string DOCUMENT_ID = 'https://contract.test/openapi.json';
    private const array METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

    private static ?self $instance = null;

    /**
     * @param array<string, mixed> $spec
     */
    private function __construct(
        private readonly array $spec,
        private readonly Validator $validator,
    ) {
    }

    public static function get(): self
    {
        if (null === self::$instance) {
            $file = $_SERVER['OPENAPI_CONTRACT'] ?? $_ENV['OPENAPI_CONTRACT'] ?? '/contract/openapi.yaml';
            \assert(\is_string($file));
            if (!is_file($file)) {
                throw new \RuntimeException(\sprintf('API contract not found at "%s" (docs/api is mounted at /contract in the backend container; set OPENAPI_CONTRACT otherwise).', $file));
            }
            $spec = Yaml::parseFile($file);
            \assert(\is_array($spec));
            /** @var array<string, mixed> $spec */
            $validator = new CompliantValidator();
            $validator->setMaxErrors(10);
            $document = json_decode(json_encode($spec, \JSON_THROW_ON_ERROR), false, flags: \JSON_THROW_ON_ERROR);
            \assert(\is_object($document));
            $validator->resolver()?->registerRaw($document, self::DOCUMENT_ID);
            self::$instance = new self($spec, $validator);
        }

        return self::$instance;
    }

    /**
     * Documented operations as "METHOD /path/{}" (path parameters normalised to {}).
     *
     * @return list<string>
     */
    public function operations(): array
    {
        $operations = [];
        foreach ($this->paths() as $template => $item) {
            foreach (self::METHODS as $method) {
                if (isset($item[$method])) {
                    $operations[] = strtoupper($method).' '.self::normalise($template);
                }
            }
        }
        sort($operations);

        return $operations;
    }

    /**
     * Problems of a response against the contract; empty when it conforms.
     *
     * @return list<string>
     */
    public function validateResponse(string $method, string $path, int $status, ?string $contentType, string $body): array
    {
        $method = strtolower($method);
        $template = $this->matchTemplate($method, $path);
        if (null === $template) {
            return [\sprintf('operation %s %s is not documented', strtoupper($method), $path)];
        }

        $pointer = '/paths/'.self::escape($template).'/'.$method.'/responses';
        $responses = $this->at($pointer);
        $key = $this->responseKey($responses, $status);
        if (null === $key) {
            return [\sprintf('status %d is not documented for %s %s', $status, strtoupper($method), $template)];
        }
        $pointer .= '/'.self::escape($key);
        $response = $this->at($pointer);
        if (isset($response['$ref']) && \is_string($response['$ref'])) {
            $pointer = substr($response['$ref'], 1);
            $response = $this->at($pointer);
        }

        $content = $response['content'] ?? null;
        if (!\is_array($content) || [] === $content) {
            return '' === $body ? [] : [\sprintf('status %d of %s %s documents no body, got: %s', $status, strtoupper($method), $template, substr($body, 0, 200))];
        }

        $mediaType = strtolower(trim(explode(';', (string) $contentType)[0]));
        if (!isset($content[$mediaType])) {
            return [\sprintf('Content-Type "%s" is not documented for status %d of %s %s (documented: %s)', (string) $contentType, $status, strtoupper($method), $template, implode(', ', array_keys($content)))];
        }

        try {
            $data = json_decode($body, false, flags: \JSON_THROW_ON_ERROR);
        } catch (\JsonException $exception) {
            return [\sprintf('body of %s %s (HTTP %d) is not JSON: %s', strtoupper($method), $template, $status, $exception->getMessage())];
        }

        // JSON Pointer in a URI fragment must be percent-encoded (RFC 6901, section 6), e.g. "{id}".
        $fragment = implode('/', array_map(rawurlencode(...), explode('/', $pointer.'/content/'.self::escape($mediaType).'/schema')));
        $result = $this->validator->validate($data, self::DOCUMENT_ID.'#'.$fragment);
        $error = $result->error();
        if (null === $error) {
            return [];
        }

        $problems = [];
        foreach ((new ErrorFormatter())->format($error, true) as $location => $messages) {
            foreach ((array) $messages as $message) {
                $problems[] = \sprintf('%s %s (HTTP %d) body %s: %s', strtoupper($method), $template, $status, '' === $location ? '/' : $location, \is_string($message) ? $message : json_encode($message));
            }
        }

        return $problems;
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private function paths(): array
    {
        $paths = $this->spec['paths'] ?? [];
        \assert(\is_array($paths));
        /** @var array<string, array<string, mixed>> $paths */
        return $paths;
    }

    private function matchTemplate(string $method, string $path): ?string
    {
        foreach ($this->paths() as $template => $item) {
            if (!isset($item[$method])) {
                continue;
            }
            $regex = '#^'.preg_replace('#\\\\\{[^/]+?\\\\\}#', '[^/]+', preg_quote($template, '#')).'$#';
            if (1 === preg_match($regex, $path)) {
                return $template;
            }
        }

        return null;
    }

    /**
     * @param array<string, mixed> $responses
     */
    private function responseKey(array $responses, int $status): ?string
    {
        foreach ([(string) $status, substr((string) $status, 0, 1).'XX', 'default'] as $key) {
            if (\array_key_exists($key, $responses)) {
                return $key;
            }
        }

        return null;
    }

    /**
     * @return array<string, mixed>
     */
    private function at(string $pointer): array
    {
        $node = $this->spec;
        foreach (\array_slice(explode('/', $pointer), 1) as $segment) {
            $segment = str_replace(['~1', '~0'], ['/', '~'], $segment);
            \assert(\is_array($node) && \array_key_exists($segment, $node), 'Missing contract node '.$pointer);
            $node = $node[$segment];
        }
        \assert(\is_array($node));
        /** @var array<string, mixed> $node */
        return $node;
    }

    private static function escape(string $segment): string
    {
        return str_replace(['~', '/'], ['~0', '~1'], $segment);
    }

    private static function normalise(string $path): string
    {
        return (string) preg_replace('#\{[^/]+?\}#', '{}', $path);
    }

    public static function normalisePath(string $path): string
    {
        return self::normalise($path);
    }
}
