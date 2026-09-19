import { NestFactory } from "@nestjs/core";
import { Logger, ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();

  // Log auth and ramp requests (Nest does not log 4xx by default)
  const httpLog = new Logger("HTTP");
  app.use((req, res, next) => {
    if (!/^\/(auth|api\/v1\/ramp)/.test(req.originalUrl)) return next();
    const start = Date.now();
    res.on("finish", () => {
      const path = req.originalUrl.split("?")[0];
      httpLog.log(`${req.method} ${path} ${res.statusCode} ${Date.now() - start}ms origin=${req.headers.origin ?? "-"}`);
    });
    next();
  });

  // Global Validation
  app.useGlobalPipes(new ValidationPipe({ transform: true }));

  const config = new DocumentBuilder()
    .setTitle("Terminal8 API")
    .setDescription("Stellar Liquidity Pool Management System API")
    .setVersion("1.0")
    .addServer("/stellar", "Live Server (Nginx Proxy)")
    .addServer("/", "Localhost")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document);

  await app.listen(3000);
}
bootstrap();
