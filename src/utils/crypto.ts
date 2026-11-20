function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function getSubtleCrypto(): SubtleCrypto {
  const g = globalThis as unknown as { crypto?: Crypto };
  if (!g.crypto?.subtle) {
    throw new Error('Web Crypto SubtleCrypto API is unavailable in this environment.');
  }
  return g.crypto.subtle;
}

function getRandomBytes(length: number): Uint8Array {
  const g = globalThis as unknown as { crypto?: Crypto };
  if (!g.crypto?.getRandomValues) {
    throw new Error('Web Crypto getRandomValues is unavailable in this environment.');
  }
  const out = new Uint8Array(length);
  g.crypto.getRandomValues(out);
  return out;
}

async function deriveAesKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const subtle = getSubtleCrypto();
  const encoder = new TextEncoder();
  const keyMaterial = await subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function sha256Hex(text: string): Promise<string> {
  const subtle = getSubtleCrypto();
  const data = new TextEncoder().encode(text);
  const digest = await subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface EncryptedPayload {
  saltB64: string;
  ivB64: string;
  ciphertextB64: string;
  checksumSha256: string;
  sizeBytes: number;
}

export async function encryptDocumentContent(
  plaintext: string,
  passphrase: string
): Promise<EncryptedPayload> {
  if (!passphrase || passphrase.length < 4) {
    throw new Error('Passphrase must be at least 4 characters long.');
  }
  const subtle = getSubtleCrypto();
  const salt = getRandomBytes(16);
  const iv = getRandomBytes(12);
  const key = await deriveAesKey(passphrase, salt);
  const encoded = new TextEncoder().encode(plaintext);

  const encryptedBuf = await subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    encoded
  );

  const ciphertextB64 = bytesToBase64(new Uint8Array(encryptedBuf));
  const checksumSha256 = await sha256Hex(ciphertextB64);

  return {
    saltB64: bytesToBase64(salt),
    ivB64: bytesToBase64(iv),
    ciphertextB64,
    checksumSha256,
    sizeBytes: encoded.byteLength,
  };
}

export async function decryptDocumentContent(
  payload: { saltB64: string; ivB64: string; ciphertextB64: string },
  passphrase: string
): Promise<string> {
  if (!passphrase) {
    throw new Error('Passphrase is required to decrypt.');
  }
  const subtle = getSubtleCrypto();
  const salt = base64ToBytes(payload.saltB64);
  const iv = base64ToBytes(payload.ivB64);
  const ciphertext = base64ToBytes(payload.ciphertextB64);
  const key = await deriveAesKey(passphrase, salt);

  try {
    const decryptedBuf = await subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    );
    return new TextDecoder().decode(decryptedBuf);
  } catch {
    throw new Error('Decryption failed. Verify your vault passphrase.');
  }
}
