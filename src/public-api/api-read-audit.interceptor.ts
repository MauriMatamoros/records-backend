import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AuditService } from '../audit/audit.service.js';

/** Records every successful public-API read in the audit log. */
@Injectable()
export class ApiReadAuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    return next.handle().pipe(
      tap((body: unknown) => {
        const meta = (body as { meta?: { total?: number } } | null)?.meta;
        void this.audit.record({
          action: 'api.read',
          entity: 'table',
          entityId: req.params.slug as string | undefined,
          detail: {
            path: req.path,
            query: req.query,
            total: meta?.total,
          },
        });
      }),
    );
  }
}
