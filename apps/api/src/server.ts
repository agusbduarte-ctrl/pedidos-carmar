import { buildApp } from "./app.js";

const start = async () => {
  const app = await buildApp();
  const port = Number(process.env.PORT) || 3000;
  try {
    await app.listen({ port, host: "0.0.0.0" });
    console.log(`API en http://localhost:${port}`);
  } catch (err) {
    app.log.error(err);
    await app.close();
    process.exit(1);
  }

  const shutdown = async (signal: NodeJS.Signals) => {
    app.log.info({ signal }, "cerrando...");
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error(err);
      process.exit(1);
    }
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
};

start();
