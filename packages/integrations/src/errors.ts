export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export class AuthExpiredError extends ProviderError {
  constructor(provider: string) {
    super(provider, "Authentication expired or invalid", 401);
    this.name = "AuthExpiredError";
  }
}

export class RateLimitedError extends ProviderError {
  constructor(
    provider: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(provider, "Provider rate limit reached", 429);
    this.name = "RateLimitedError";
  }
}

export class ProviderUnavailableError extends ProviderError {
  constructor(provider: string, statusCode: number) {
    super(provider, "Provider temporarily unavailable", statusCode);
    this.name = "ProviderUnavailableError";
  }
}

export class InvalidResponseError extends ProviderError {
  constructor(provider: string, message: string) {
    super(provider, message);
    this.name = "InvalidResponseError";
  }
}
