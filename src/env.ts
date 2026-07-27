import type { Room } from "./room";

export interface Env {
  ASSETS: Fetcher;
  ROOM: DurableObjectNamespace<Room>;
  SESSION_RATE_LIMITER: RateLimit;
  WS_RATE_LIMITER: RateLimit;
  READ_RATE_LIMITER: RateLimit;
  ARCHIVE?: R2Bucket;
  MODERATOR_TOKEN?: string;
}
