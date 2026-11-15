import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const VERSION = 1;

/**
 * Session persistence for restarts.
 *
 * A relay restart used to end every in-progress push, even though MediaMTX
 * (and the browser publishing to it) kept running. Persisting the sessions lets
 * the new process re-attach its ffmpeg to the same MediaMTX paths, so the WHIP
 * URL a host is already publishing to keeps working.
 *
 * A record contains the destination, which includes the provider stream key.
 * That is why the file is encrypted (AES-256-GCM, random IV per record) with a
 * key derived from `RELAY_STATE_KEY`, written 0600, and only enabled when the
 * operator asks for it. Losing the key means losing the ability to recover
 * sessions — never the ability to start new ones.
 */
export class SessionStore {
  #path;
  #key;

  constructor({ path, key }) {
    if (!path) throw new Error("RELAY_STATE_FILE is required for persistence");
    if (!key) {
      throw new Error(
        "RELAY_STATE_KEY is required for persistence: session records hold stream keys",
      );
    }
    this.#path = path;
    this.#key = createHash("sha256").update(String(key)).digest();
  }

  async load() {
    let raw;
    try {
      raw = await readFile(this.#path, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
    const parsed = JSON.parse(raw);
    if (parsed?.version !== VERSION || !Array.isArray(parsed.sessions)) {
      throw new Error("session state file has an unexpected shape");
    }
    return parsed.sessions.map((sealed) => this.#open(String(sealed)));
  }

  async save(sessions) {
    const payload = JSON.stringify({
      version: VERSION,
      sessions: sessions.map((session) => this.#seal(session)),
    });
    await mkdir(dirname(this.#path), { recursive: true });
    const temporary = `${this.#path}.${process.pid}.tmp`;
    // 0600: only the relay user can read what is inside.
    await writeFile(temporary, payload, { mode: 0o600 });
    await rename(temporary, this.#path);
  }

  #seal(session) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    const body = Buffer.concat([
      cipher.update(JSON.stringify(session), "utf8"),
      cipher.final(),
    ]);
    return [
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      body.toString("base64url"),
    ].join(".");
  }

  #open(sealed) {
    const [iv, tag, body] = sealed.split(".");
    if (!iv || !tag || !body) throw new Error("session record is unreadable");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.#key,
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(body, "base64url")),
        decipher.final(),
      ]).toString("utf8"),
    );
  }
}
