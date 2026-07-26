import type { Room } from "./room";

export interface Env {
  ASSETS: Fetcher;
  ROOM: DurableObjectNamespace<Room>;
  ARCHIVE: R2Bucket;
  MODERATOR_TOKEN?: string;
}
