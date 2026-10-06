import type {
  ApiToken,
  User as PrismaUser,
} from '../generated/prisma/client.js';

declare global {
  namespace Express {
    /** Passport types `req.user` as Express.User; SessionAuthGuard sets it to the DB user. */
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends PrismaUser {}

    interface Request {
      /** Set by ApiTokenGuard for public API requests. */
      apiToken?: ApiToken;
    }
  }
}

export {};
