import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for frontend
  app.enableCors({
    origin: 'http://localhost:3000',
    credentials: true,
  });

  // Enable validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 3001;
  await app.listen(port);
  
  console.log('');
  console.log('🚀 ================================');
  console.log(`✅ Backend running on: http://localhost:${port}`);
  console.log('🗄️  Database: PostgreSQL (flashsale)');
  console.log('📦 Redis: localhost:6379');
  console.log('================================');
  console.log('');
}
bootstrap();