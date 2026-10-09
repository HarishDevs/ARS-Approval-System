// #14 correlation ids. The middleware gives every request an id (or keeps a
// well-formed one from Cloudflare / the caller), passes it to the server
// code in the request headers and returns it in the response, so a user's
// "reference" can be found in the server log. Edge-safe (no Node imports).
export const REQUEST_ID_HEADER = "x-request-id";
const VALID = /^[A-Za-z0-9-]{8,64}$/;

export function pickRequestId(incoming: string | null, make: () => string = () => crypto.randomUUID()): string {
  return incoming && VALID.test(incoming) ? incoming : make();
}
