import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { getRequestId } from './observability';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly production: boolean) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = getRequestId(request);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resBody = exception.getResponse();
      if (typeof resBody === 'string') {
        message = resBody;
      } else if (resBody && typeof resBody === 'object') {
        const msg = (resBody as { message?: unknown }).message;
        if (Array.isArray(msg)) {
          message = msg.map(String).join(', ');
        } else if (typeof msg === 'string') {
          message = msg;
        } else {
          message = exception.message;
        }
      } else {
        message = exception.message;
      }
    } else if (exception && typeof exception === 'object') {
      const pgCode = (exception as { code?: unknown }).code;
      if (pgCode === '23505') {
        status = HttpStatus.CONFLICT;
        message = 'Duplicate record conflict';
      } else if (pgCode === '23503' || pgCode === '22P02' || pgCode === '23502' || pgCode === '23514') {
        status = HttpStatus.BAD_REQUEST;
        message = 'Invalid data or reference';
      } else if (exception instanceof Error && !this.production) {
        message = exception.message || message;
      }
    }

    if (status >= 500) {
      const pathOnly = (request.originalUrl || request.url || '/').split('?')[0] || '/';
      console.error(
        `[HTTP ${status}] ${request.method} ${pathOnly}${requestId ? ` reqId=${requestId}` : ''}:`,
        exception instanceof Error ? exception.stack || exception.message : exception,
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      ...(requestId ? { requestId } : {}),
      timestamp: new Date().toISOString(),
    });
  }
}
