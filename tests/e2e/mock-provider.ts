import http from "node:http";

// D-172: a local stand-in for Anthropic's Messages API, for the end-to-end
// and load tests (the app reaches it through AI_CLAUDE_BASE_URL, which only
// accepts https or this machine). 300 ms per call. First call: asks for
// approvals_waiting_for_me; second: answers "Answer for <name>: <n> waiting."
// using the tool result and the name in the app's instructions, so a reply
// reaching the wrong person would show. GET /stats gives the peak number of
// calls in flight.
export const MOCK_PROVIDER_PORT = 4011;
let inFlight = 0;
let peak = 0;
let calls = 0;

export function startMockProvider(): Promise<http.Server> {
  const server = http.createServer((request, response) => {
    if (request.method === "GET" && request.url === "/stats") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ peak, calls, inFlight }));
      return;
    }
    if (request.method === "POST" && request.url === "/stats/reset") {
      peak = 0;
      calls = 0;
      response.writeHead(204).end();
      return;
    }
    let raw = "";
    request.on("data", (chunk) => (raw += chunk));
    request.on("end", () => {
      inFlight += 1;
      calls += 1;
      peak = Math.max(peak, inFlight);
      setTimeout(() => {
        inFlight -= 1;
        try {
          const body = JSON.parse(raw) as { system: string; messages: { content: unknown }[] };
          const name = /You are helping (.+?)\. Today/.exec(body.system)?.[1] ?? "?";
          const last = body.messages[body.messages.length - 1]!;
          const content = Array.isArray(last.content) ? (last.content as { type?: string; content?: string }[]) : null;
          response.writeHead(200, { "content-type": "application/json" });
          if (content?.[0]?.type === "tool_result") {
            const data = JSON.parse(content[0].content ?? "{}").data ?? {};
            response.end(JSON.stringify({ model: "mock-claude", content: [{ type: "text", text: `Answer for ${name}: ${data.pending ?? "?"} waiting.` }], usage: { input_tokens: 30, output_tokens: 8 } }));
          } else {
            response.end(JSON.stringify({ model: "mock-claude", content: [{ type: "tool_use", id: "tu1", name: "approvals_waiting_for_me", input: {} }], usage: { input_tokens: 20, output_tokens: 4 } }));
          }
        } catch {
          response.writeHead(400).end("{}");
        }
      }, 300);
    });
  });
  server.unref(); // never keeps the test runner alive
  return new Promise((resolve) => server.listen(MOCK_PROVIDER_PORT, "127.0.0.1", () => resolve(server)));
}
