import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { decryptDocumentContent, encryptDocumentContent, sha256Hex } from './crypto';

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
}

test('AES-256-GCM encryption and decryption roundtrip succeeds', async () => {
  const sensitiveText = 'CNA Bargaining Unit Proposal - RN Staffing Ratio 1:4 ICU Addendum';
  const passphrase = 'union-vault-strong-key';

  const encrypted = await encryptDocumentContent(sensitiveText, passphrase);
  assert.ok(encrypted.ciphertextB64.length > 0);
  assert.equal(encrypted.checksumSha256.length, 64);

  const decrypted = await decryptDocumentContent(encrypted, passphrase);
  assert.equal(decrypted, sensitiveText);
});

test('AES-256-GCM rejects incorrect vault passphrase', async () => {
  const encrypted = await encryptDocumentContent('Confidential PPC Minutes', 'correct-passphrase');
  await assert.rejects(
    async () => decryptDocumentContent(encrypted, 'wrong-passphrase'),
    /Decryption failed/
  );
});

test('SHA-256 produces deterministic 64-char hex digest', async () => {
  const hash1 = await sha256Hex('CNA-2026');
  const hash2 = await sha256Hex('CNA-2026');
  assert.equal(hash1, hash2);
  assert.equal(hash1.length, 64);
});
