import type { FastifyReply } from "fastify";
import { Prisma } from "@prisma/client";
import type { ZodError } from "zod";

export function formatZodError(error: ZodError): string[] {
  return error.issues.map((issue) =>
    issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
  );
}

export function sendValidationError(reply: FastifyReply, error: ZodError) {
  return reply.code(400).send({ error: "Datos inválidos", detalles: formatZodError(error) });
}

// Violación de @unique (por ejemplo, dos altas simultáneas con el mismo nombre)
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}
