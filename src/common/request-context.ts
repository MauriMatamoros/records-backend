import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export type ActorType = 'USER' | 'API_TOKEN' | 'SYSTEM';

export interface Actor {
  type: ActorType;
  id?: string;
  label?: string;
}

export interface RequestContextStore {
  requestId: string;
  ip?: string;
  actor?: Actor;
}

const storage = new AsyncLocalStorage<RequestContextStore>();

/**
 * Per-request context (request id, client ip, authenticated actor) available
 * anywhere in the call stack without threading it through every method.
 */
export const RequestContext = {
  current(): RequestContextStore | undefined {
    return storage.getStore();
  },

  setActor(actor: Actor) {
    const store = storage.getStore();
    if (store) store.actor = actor;
  },

  run<T>(store: RequestContextStore, fn: () => T): T {
    return storage.run(store, fn);
  },
};

/**
 * Must be registered before the pino-http middleware so the logger reuses the
 * same request id (see genReqId in app.module.ts).
 */
export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const incoming = req.header('x-request-id');
  const requestId =
    incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  (req as Request & { id: string }).id = requestId;
  res.setHeader('X-Request-Id', requestId);
  storage.run({ requestId, ip: req.ip }, () => next());
}
