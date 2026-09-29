import Fastify from "fastify";
import cors from "@fastify/cors";

const app = Fastify({ logger: true });

app.register(cors, { origin: true });

app.get("/health", async () => ({ status: "ok", service: "api" }));

const start = async () => {
  try {
    await app.listen({ port: 3000, host: "0.0.0.0" });
    console.log("API en http://localhost:3000");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
