export interface Game {
  ID: string;
  Title: string;
  Platform: string;
  Developer: string;
  Publisher: string;
  Genre: string;
  ReleaseDate: string;
  Notes: string;
  Source: string;
  Series: string;
  PlayMode: string;
  Rating: string;
  MaxPlayers: string;
  CommunityStarRating: number;
  StarRating: number;
  Status: string;
  Favorite: boolean;
  DatabaseID: string;
  Hide: boolean;
  Broken: boolean;
  PlayCount: number;
  PlayTime: number;
  LastPlayedDate: string;
  DateAdded: string;
  Installed: boolean;
  Completed: boolean;
  Progress: string;
}

export type RequestId = string | number;

export type ToolResult = { ok: true; text: string } | { ok: false; message: string };

export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface MCPRequest {
  jsonrpc: '2.0';
  id?: RequestId;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: RequestId | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}
