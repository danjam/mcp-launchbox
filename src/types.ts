export interface Game {
  readonly ID: string;
  readonly Title: string;
  readonly Platform: string;
  readonly Developer: string;
  readonly Publisher: string;
  readonly Genre: string;
  readonly ReleaseDate: string;
  readonly Notes: string;
  readonly Source: string;
  readonly Series: string;
  readonly PlayMode: string;
  readonly Rating: string;
  readonly MaxPlayers: string;
  readonly CommunityStarRating: number;
  readonly StarRating: number;
  readonly Status: string;
  readonly Favorite: boolean;
  readonly DatabaseID: string;
  readonly Hide: boolean;
  readonly Broken: boolean;
  readonly PlayCount: number;
  readonly PlayTime: number;
  readonly LastPlayedDate: string;
  readonly DateAdded: string;
  readonly Installed: boolean;
  readonly Completed: boolean;
  readonly Progress: string;
}

export type RequestId = string | number;

export type ToolResult = { ok: true; text: string } | { ok: false; message: string };

export type ToolHandler = (args: Record<string, unknown>) => ToolResult | Promise<ToolResult>;

export interface MCPToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  annotations?: MCPToolAnnotations;
}

export interface MCPRequest {
  jsonrpc: '2.0';
  id?: RequestId;
  method: string;
  params?: Record<string, unknown>;
}

export type MCPResponse =
  | { jsonrpc: '2.0'; id: RequestId; result: unknown }
  | { jsonrpc: '2.0'; id: RequestId | null; error: { code: number; message: string } };
