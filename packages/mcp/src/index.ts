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
  type VerifiedMcpToken,
} from './auth';
