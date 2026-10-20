import { describe, it, expect } from 'vitest';
import { SecretRedactor } from '@autoplay/shared';

describe('SecretRedactor', () => {
  it('should redact YouTube stream keys from strings', () => {
    const raw = 'Starting stream with key abcd-1234-efgh-5678 to rtmp://a.rtmp.youtube.com/live2';
    const redacted = SecretRedactor.redactString(raw);
    expect(redacted).not.toContain('abcd-1234-efgh-5678');
    expect(redacted).toContain('[REDACTED_KEY]');
  });

  it('should redact RTMP URLs with stream keys attached', () => {
    const raw = 'rtmp://a.rtmp.youtube.com/live2/mysecretkey1234567';
    const redacted = SecretRedactor.redactString(raw);
    expect(redacted).not.toContain('mysecretkey1234567');
    expect(redacted).toContain('[REDACTED_STREAM_KEY]');
  });

  it('should redact nested sensitive object fields', () => {
    const payload = {
      username: 'operator',
      streamKey: 'live_test_1234567890',
      nested: {
        password: 'superSecretPassword',
        publicField: 'safeValue'
      }
    };
    const redacted = SecretRedactor.redactObject(payload);
    expect(redacted.streamKey).toBe('[REDACTED]');
    expect(redacted.nested.password).toBe('[REDACTED]');
    expect(redacted.nested.publicField).toBe('safeValue');
  });

  it('should redact command-line argument arrays', () => {
    const args = ['-i', 'desktop', '-f', 'flv', 'rtmp://a.rtmp.youtube.com/live2/abcd-1234-efgh-5678'];
    const redactedArgs = SecretRedactor.redactArgs(args);
    expect(redactedArgs[4]).not.toContain('abcd-1234-efgh-5678');
  });
});
