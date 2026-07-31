const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function importEncryptionKey(encodedKey: string): Promise<CryptoKey> {
  let key: Uint8Array<ArrayBuffer>;
  try {
    key = base64ToBytes(encodedKey);
  } catch {
    throw new Error("TOKEN_ENCRYPTION_KEY must be valid base64 encoding.");
  }
  if (key.byteLength !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  return crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encrypt(secret: string, encodedKey: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await importEncryptionKey(encodedKey),
    encoder.encode(secret),
  );
  return `v1.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`;
}

export async function decrypt(payload: string, encodedKey: string): Promise<string> {
  const [version, ivValue, ciphertextValue] = payload.split(".");
  if (version !== "v1" || !ivValue || !ciphertextValue) {
    throw new Error("Unsupported encrypted token format.");
  }
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivValue) },
    await importEncryptionKey(encodedKey),
    base64ToBytes(ciphertextValue),
  );
  return decoder.decode(plaintext);
}

export function randomBase64Url(byteLength = 32): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(byteLength)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64(new Uint8Array(digest))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
