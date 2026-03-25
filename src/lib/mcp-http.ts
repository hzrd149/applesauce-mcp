import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export interface MCPHttpTransport extends Transport {
  sessionId?: string;
  handleRequest(request: Request): Promise<Response>;
}

export interface MCPHttpServer {
  connect(transport: MCPHttpTransport): Promise<void>;
}

interface CreateTransportOptions {
  sessionIdGenerator: () => string;
  onsessioninitialized: (sessionId: string) => void | Promise<void>;
}

export interface MCPHttpHandlerOptions {
  createServer: () => MCPHttpServer;
  createTransport: (options: CreateTransportOptions) => MCPHttpTransport;
}

/**
 * Create a Streamable HTTP request handler that maintains one transport per MCP session.
 */
export function createMCPHttpRequestHandler(
  options: MCPHttpHandlerOptions,
): (request: Request) => Promise<Response> {
  const transports = new Map<string, MCPHttpTransport>();

  return async (request: Request): Promise<Response> => {
    const sessionId = request.headers.get("mcp-session-id");
    const existingTransport = sessionId ? transports.get(sessionId) : undefined;

    if (existingTransport) {
      return await existingTransport.handleRequest(request);
    }

    if (sessionId) {
      return createJsonRpcErrorResponse(404, -32001, "Session not found");
    }

    if (request.method !== "POST") {
      return createJsonRpcErrorResponse(
        400,
        -32000,
        "Bad Request: No valid session ID provided",
      );
    }

    const body = await parseRequestBody(request);
    if (!isInitializePayload(body)) {
      return createJsonRpcErrorResponse(
        400,
        -32000,
        "Bad Request: No valid session ID provided",
      );
    }

    let transport: MCPHttpTransport;
    transport = options.createTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (initializedSessionId) => {
        transports.set(initializedSessionId, transport);
      },
    });

    const previousOnClose = transport.onclose;
    transport.onclose = () => {
      previousOnClose?.();
      const activeSessionId = transport.sessionId;
      if (activeSessionId) {
        transports.delete(activeSessionId);
      }
    };

    const server = options.createServer();
    await server.connect(transport);

    return await transport.handleRequest(request);
  };
}

async function parseRequestBody(request: Request): Promise<unknown> {
  try {
    return await request.clone().json();
  } catch {
    return undefined;
  }
}

function isInitializePayload(body: unknown): boolean {
  if (Array.isArray(body)) {
    return body.some((message) => isInitializeRequest(message));
  }

  return isInitializeRequest(body);
}

function createJsonRpcErrorResponse(
  status: number,
  code: number,
  message: string,
): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code, message },
      id: null,
    }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}
