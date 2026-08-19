interface Env {
  ASSETS: Fetcher;
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

// Kept unbound so Cloudflare retains the previous namespace without exposing
// any of its behavior. Purging that stored data is a separate irreversible act.
export class Room {
  constructor(state: DurableObjectState) {
    void state;
  }

  fetch(): Response {
    return new Response("Gone", { status: 410 });
  }
}
