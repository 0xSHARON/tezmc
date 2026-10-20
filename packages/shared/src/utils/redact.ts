/**
 * Redacts stream keys, passwords, and authorization tokens from text strings, command lines, and objects.
 */
export class SecretRedactor {
  private static readonly SECRET_PATTERNS: RegExp[] = [
    // YouTube stream key patterns (format: 4 sets of 4 chars or alphanumeric dashes, e.g., abcd-1234-efgh-5678)
    /[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}(-[a-z0-9]{4})?/gi,
    // RTMP URL with embedded stream key
    /(rtmps?:\/\/[^\s\/]+\/[^\s\/]+\/)([a-zA-Z0-9_-]{10,})/gi,
    // Bearer tokens
    /(Bearer\s+)[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/gi,
    // Generic password/secret key-value assignments
    /(password|secret|streamKey|token|key|api_key|client_secret)=([^\s&]+)/gi
  ];

  public static redactString(input: string): string {
    if (!input || typeof input !== 'string') return input;

    let output = input;

    // Redact RTMP with stream key
    output = output.replace(
      /(rtmps?:\/\/[^\s\/]+\/[^\s\/]+\/)([a-zA-Z0-9_-]{10,})/gi,
      '$1[REDACTED_STREAM_KEY]'
    );

    // Redact generic key-values
    output = output.replace(
      /(password|secret|streamKey|token|key|api_key|client_secret)=([^\s&]+)/gi,
      '$1=[REDACTED]'
    );

    // Redact YouTube stream key blocks
    output = output.replace(
      /[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}(-[a-z0-9]{4})?/gi,
      '[REDACTED_KEY]'
    );

    return output;
  }

  public static redactObject<T>(obj: T): T {
    if (!obj || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map((item) => this.redactObject(item)) as unknown as T;
    }

    const result: Record<string, any> = {};
    const sensitiveKeys = new Set([
      'streamkey',
      'password',
      'secret',
      'token',
      'authorization',
      'youtube_stream_key',
      'jwt_secret',
      'encryption_key'
    ]);

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.has(lowerKey)) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'string') {
        result[key] = this.redactString(value);
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.redactObject(value);
      } else {
        result[key] = value;
      }
    }

    return result as T;
  }

  public static redactArgs(args: string[]): string[] {
    return args.map((arg) => this.redactString(arg));
  }
}
