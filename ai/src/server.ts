import { buildApp } from "./api/app.js";
import { createAppServices } from "./composition.js";

async function main(): Promise<void> {
  const services = createAppServices();
  if (services.database === undefined) {
    throw new Error(
      "DATABASE_URL is required. Configure a direct PostgreSQL connection before starting the server."
    );
  }
  await services.database.query("SELECT 1");
  const app = await buildApp(services);
  const close = async (): Promise<void> => {
    await app.close();
  };
  process.once("SIGINT", () => {
    void close();
  });
  process.once("SIGTERM", () => {
    void close();
  });
  await app.listen({ host: services.config.HOST, port: services.config.PORT });
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
