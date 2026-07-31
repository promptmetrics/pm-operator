export {
  createCommunityMcpServer,
  createMcpHandler,
  type CommunityMcpServerOptions,
  type McpHandlerConfig,
  type McpLogger,
} from './server';

export {
  registerTools,
  searchPostsSchema,
  getUserProfileSchema,
  listLeaderboardsSchema,
  summarizeThreadSchema,
  type McpToolServices,
  type McpContext,
  type SearchPostsInput,
  type GetUserProfileInput,
  type ListLeaderboardsInput,
  type SummarizeThreadInput,
} from './tools';

export {
  registerResources,
  type McpResourceServices,
} from './resources';

export {
  verifyMcpOAuthToken,
  REQUIRED_READ_SCOPE,
  TOKEN_ISSUER,
  TOKEN_AUDIENCE,
  type VerifiedMcpToken,
  type McpClientInfo,
  type LookupMcpClient,
  type McpAuthOptions,
} from './auth';
