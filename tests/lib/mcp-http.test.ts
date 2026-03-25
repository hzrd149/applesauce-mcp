import { assertEquals } from "jsr:@std/assert";
import { createMCPHttpRequestHandler } from "../../src/lib/mcp-http.ts";

Deno.test("creates a transport for initialize and reuses it by session", async () => {
  const connectCalls: string[] = [];
  const handledRequests: string[] = [];
  const createdTransports: Array<{
    sessionId?: string;
    onclose?: () => void;
    start(): Promise<void>;
    send(): Promise<void>;
    close(): Promise<void>;
    handleRequest(request: Request): Promise<Response>;
  }> = [];

  const handler = createMCPHttpRequestHandler({
    createServer: () => ({
      connect: async (transport) => {
        connectCalls.push(transport.sessionId ?? "pending");
      },
    }),
    createTransport: ({ onsessioninitialized }) => {
      const transport = {
        sessionId: undefined as string | undefined,
        onclose: undefined as (() => void) | undefined,
        async start(): Promise<void> {},
        async send(): Promise<void> {},
        async close(): Promise<void> {},
        async handleRequest(request: Request): Promise<Response> {
          handledRequests.push(request.headers.get("mcp-session-id") ?? "none");
          if (!this.sessionId) {
            this.sessionId = "session-1";
            await onsessioninitialized(this.sessionId);
          }

          return new Response("ok", { status: 200 });
        },
      };

      createdTransports.push(transport);
      return transport;
    },
  });

  const initializeRequest = new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0.0" },
      },
    }),
  });

  const toolRequest = new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-session-id": "session-1",
      "mcp-protocol-version": "2025-03-26",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    }),
  });

  const initializeResponse = await handler(initializeRequest);
  const toolResponse = await handler(toolRequest);

  assertEquals(initializeResponse.status, 200);
  assertEquals(toolResponse.status, 200);
  assertEquals(createdTransports.length, 1);
  assertEquals(connectCalls.length, 1);
  assertEquals(handledRequests, ["none", "session-1"]);
});

Deno.test("rejects non-initialize requests without a session id", async () => {
  const handler = createMCPHttpRequestHandler({
    createServer: () => ({
      connect: async () => {},
    }),
    createTransport: () => ({
      start: async () => {},
      send: async () => {},
      close: async () => {},
      handleRequest: async () => new Response("ok"),
    }),
  });

  const response = await handler(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    }),
  );

  assertEquals(response.status, 400);
  assertEquals(
    await response.text(),
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Bad Request: No valid session ID provided",
      },
      id: null,
    }),
  );
});

Deno.test("removes session transport after close", async () => {
  let createdTransport:
    | {
      sessionId?: string;
      onclose?: () => void;
      start(): Promise<void>;
      send(): Promise<void>;
      close(): Promise<void>;
      handleRequest(request: Request): Promise<Response>;
    }
    | undefined;

  const handler = createMCPHttpRequestHandler({
    createServer: () => ({
      connect: async () => {},
    }),
    createTransport: ({ onsessioninitialized }) => {
      createdTransport = {
        sessionId: undefined,
        onclose: undefined,
        async start(): Promise<void> {},
        async send(): Promise<void> {},
        async close(): Promise<void> {},
        async handleRequest(): Promise<Response> {
          if (!this.sessionId) {
            this.sessionId = "session-1";
            await onsessioninitialized(this.sessionId);
          }

          return new Response("ok", { status: 200 });
        },
      };

      return createdTransport;
    },
  });

  await handler(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" },
        },
      }),
    }),
  );

  createdTransport?.onclose?.();

  const response = await handler(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-session-id": "session-1",
        "mcp-protocol-version": "2025-03-26",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    }),
  );

  assertEquals(response.status, 404);
});
