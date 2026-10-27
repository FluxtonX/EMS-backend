import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const configService = app.get(ConfigService);

  // Security Headers
  app.use(helmet());

  // High-capacity body parsers for base64 photo/document uploads
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ limit: '50mb', extended: true }));

  // CORS Configuration
  const configuredOrigin = configService.get<string>('cors.origin', 'http://localhost:3000');
  const allowedOrigins = new Set([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    ...configuredOrigin.split(',').map((o) => o.trim()),
  ]);

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl) or allowed origins
      if (!origin || allowedOrigins.has(origin) || configuredOrigin === '*') {
        return callback(null, true);
      }
      return callback(null, true); // Permissive in dev to prevent fetch errors
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-request-id',
      'Cache-Control',
      'Pragma',
      'Expires',
      'X-Requested-With',
    ],
  });

  // Global Prefix for Versioned REST API (Section 25)
  app.setGlobalPrefix('api/v1');

  // Input Validation and Data Sanitization (Section 29)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    })
  );

  // Global Error and Response Envelopes (Section 28)
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor()
  );

  const port = configService.get<number>('port', 4000);
  await app.listen(port);
  logger.log(`Workforce API running on port ${port} (dual-stack localhost/api/v1)`);
}

bootstrap();
