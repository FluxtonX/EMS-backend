import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const rawStatus = (exception as any)?.status || (exception as any)?.statusCode;
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : rawStatus && typeof rawStatus === 'number' && rawStatus >= 400 && rawStatus < 600
        ? rawStatus
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    let message = 'An unexpected server error occurred. Please try again.';
    let code = 'INTERNAL_SERVER_ERROR';
    let details: any = null;

    if (exception instanceof HttpException) {
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, any>;
        message = resp.message || exception.message;
        code = resp.error || HttpStatus[status] || 'HTTP_ERROR';
        if (Array.isArray(resp.message)) {
          details = resp.message;
          message = 'Validation failed';
          code = 'VALIDATION_ERROR';
        }
      }
    } else if (exception instanceof Error) {
      if ((exception as any).status === 413 || (exception as any).type === 'entity.too.large') {
        message = 'The uploaded payload or image is too large. Please select a photo under 15MB.';
        code = 'PAYLOAD_TOO_LARGE';
        this.logger.warn(`Request entity too large from ${request.ip}: ${request.url}`);
      } else {
        this.logger.error(`Unhandled Exception: ${exception.message}`, exception.stack);
      }
    }

    const requestId = (request.headers['x-request-id'] as string) || 'req_' + Date.now();

    response.status(status).json({
      success: false,
      error: {
        code,
        message,
        details,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
        path: request.url,
      },
    });
  }
}
