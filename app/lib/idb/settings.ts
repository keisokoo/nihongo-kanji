import { db } from "./db";
import type { EncryptedSecret, Settings, SettingsRow } from "./types";

/**
 * AES-GCM encryption with a non-extractable wrapping key stored in IDB.
 *
 * Threat model — what this protects against:
 * - DevTools "Application → IndexedDB" inspector showing raw keys
 * - Casual access to a shared device / OS-level backup
 * - Bytes-on-disk forensics (IDB files contain ciphertext, not plaintext)
 *
 * What it does NOT protect against:
 * - XSS / supply-chain attack — same-origin JS can call subtle.decrypt
 *   with the stored CryptoKey just like the app does
 * - Memory dumps / hostile browser extensions with same-origin permissions
 */

const DEFAULT_PUBLIC: Settings = {
  anthropicApiKey: null,
  geminiApiKey: null,
  seedInstalled: false,
  seedInstalledAt: null,
  updatedAt: new Date(0),
};

async function getOrCreateWrappingKey(): Promise<CryptoKey> {
  const d = db();
  const row = await d.settings.get(1);
  if (row?.wrappingKey) return row.wrappingKey;

  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    /* extractable */ false,
    ["encrypt", "decrypt"],
  );
  const next: SettingsRow = {
    id: 1,
    anthropicApiKey: row?.anthropicApiKey ?? null,
    geminiApiKey: row?.geminiApiKey ?? null,
    wrappingKey: key,
    seedInstalled: row?.seedInstalled ?? false,
    seedInstalledAt: row?.seedInstalledAt ?? null,
    updatedAt: new Date(),
  };
  await d.settings.put(next);
  return key;
}

async function encryptString(
  plain: string,
  key: CryptoKey,
): Promise<EncryptedSecret> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plain),
  );
  return { iv, ciphertext: new Uint8Array(ciphertext) };
}

async function decryptString(
  secret: EncryptedSecret,
  key: CryptoKey,
): Promise<string> {
  // Cast through ArrayBuffer to satisfy TS's strict variant on BufferSource.
  const iv = new Uint8Array(secret.iv).slice().buffer as ArrayBuffer;
  const ct = new Uint8Array(secret.ciphertext).slice().buffer as ArrayBuffer;
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(plain);
}

async function loadRow(): Promise<SettingsRow | null> {
  return (await db().settings.get(1)) ?? null;
}

export async function loadSettings(): Promise<Settings> {
  const row = await loadRow();
  if (!row) return DEFAULT_PUBLIC;

  let anthropicApiKey: string | null = null;
  let geminiApiKey: string | null = null;
  if (row.wrappingKey) {
    if (row.anthropicApiKey) {
      try {
        anthropicApiKey = await decryptString(
          row.anthropicApiKey,
          row.wrappingKey,
        );
      } catch (err) {
        console.error("[settings] anthropic decrypt failed:", err);
      }
    }
    if (row.geminiApiKey) {
      try {
        geminiApiKey = await decryptString(
          row.geminiApiKey,
          row.wrappingKey,
        );
      } catch (err) {
        console.error("[settings] gemini decrypt failed:", err);
      }
    }
  }

  return {
    anthropicApiKey,
    geminiApiKey,
    seedInstalled: row.seedInstalled,
    seedInstalledAt: row.seedInstalledAt,
    updatedAt: row.updatedAt,
  };
}

export type SettingsPatch = Partial<{
  anthropicApiKey: string | null;
  geminiApiKey: string | null;
  seedInstalled: boolean;
  seedInstalledAt: Date | null;
}>;

export async function saveSettings(patch: SettingsPatch): Promise<Settings> {
  const d = db();
  const wrappingKey = await getOrCreateWrappingKey();
  const row = (await loadRow())!; // getOrCreateWrappingKey ensures it exists

  let anthropicEnc: EncryptedSecret | null = row.anthropicApiKey;
  if (Object.prototype.hasOwnProperty.call(patch, "anthropicApiKey")) {
    const v = patch.anthropicApiKey;
    anthropicEnc = v ? await encryptString(v, wrappingKey) : null;
  }

  let geminiEnc: EncryptedSecret | null = row.geminiApiKey;
  if (Object.prototype.hasOwnProperty.call(patch, "geminiApiKey")) {
    const v = patch.geminiApiKey;
    geminiEnc = v ? await encryptString(v, wrappingKey) : null;
  }

  const next: SettingsRow = {
    id: 1,
    anthropicApiKey: anthropicEnc,
    geminiApiKey: geminiEnc,
    wrappingKey,
    seedInstalled:
      patch.seedInstalled !== undefined ? patch.seedInstalled : row.seedInstalled,
    seedInstalledAt:
      patch.seedInstalledAt !== undefined
        ? patch.seedInstalledAt
        : row.seedInstalledAt,
    updatedAt: new Date(),
  };
  await d.settings.put(next);
  return loadSettings();
}

export async function markSeedInstalled(): Promise<void> {
  await saveSettings({ seedInstalled: true, seedInstalledAt: new Date() });
}

/** Quick boolean — "is the app initialized for use?". */
export async function isInitialized(): Promise<boolean> {
  const row = await loadRow();
  return !!row?.seedInstalled;
}
