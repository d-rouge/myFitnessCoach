import { BadRequestException, Injectable, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

export interface ValidationIssue {
  path: string;
  message: string;
}

/**
 * Validates a request payload with a Zod schema and returns the parsed value.
 * Errors are reported as 400 with a stable `issues` array.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const issues: ValidationIssue[] = result.error.issues.map((issue) => ({
        path: issue.path.join(".") || "(root)",
        message: issue.message,
      }));
      throw new BadRequestException({
        message: "Payload non valido",
        issues,
      });
    }
    return result.data;
  }
}
