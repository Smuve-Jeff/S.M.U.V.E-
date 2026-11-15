/**
 * Minimal MediaMTX control client.
 *
 * Each session gets its own publish path, created through the config API and
 * served over WHIP. The path is deleted when the session ends, which is what
 * makes the browser's publish URL single-use.
 */
export class MediaMtxClient {
  #apiUrl;
  #fetch;
  #token;

  constructor({ apiUrl, token = "", fetchImpl = fetch }) {
    if (!apiUrl) throw new Error("MEDIAMTX_API_URL is required");
    this.#apiUrl = String(apiUrl).replace(/\/+$/, "");
    this.#token = token;
    this.#fetch = fetchImpl;
  }

  /** `source: publisher` means "accept a publisher", nothing is pulled. */
  async addPath(id) {
    await this.#request("POST", `/v3/config/paths/add/${encodeURIComponent(id)}`, {
      source: "publisher",
      sourceOnDemand: false,
    });
  }

  async deletePath(id) {
    try {
      await this.#request(
        "DELETE",
        `/v3/config/paths/delete/${encodeURIComponent(id)}`,
      );
    } catch (error) {
      // A path that is already gone is the state we wanted.
      if (error?.status === 404) return;
      throw error;
    }
  }

  async #request(method, path, body) {
    const headers = {};
    if (this.#token) headers.Authorization = `Bearer ${this.#token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const response = await this.#fetch(`${this.#apiUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const error = new Error(
        `MediaMTX ${method} ${path} failed (${response.status})${
          detail ? `: ${detail.slice(0, 200)}` : ""
        }`,
      );
      error.status = response.status;
      throw error;
    }
  }
}
