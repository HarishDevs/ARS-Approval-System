// Browser helpers shared by the sign-in, set-password and forgot-password
// screens. Responses use the API envelope from lib/http/api-response.
export type ApiBody<T> = { success: true; data: T } | { success: false; error: { code: string; message: string } };

export async function postJson<T>(url: string, body: unknown): Promise<ApiBody<T>> {
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return (await response.json()) as ApiBody<T>;
  } catch {
    return { success: false, error: { code: "NETWORK", message: "Something went wrong. Please try again." } };
  }
}
