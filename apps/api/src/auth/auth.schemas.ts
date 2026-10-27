import { z } from "zod";

export const GoogleLoginSchema = z.object({
  id_token: z.string().min(1, "id_token è obbligatorio"),
});

export const DevLoginSchema = z
  .object({
    email: z.string().email("Email non valida").optional(),
    name: z.string().min(1).max(100).optional(),
  })
  .default({});

export type GoogleLoginInput = z.infer<typeof GoogleLoginSchema>;
export type DevLoginInput = z.infer<typeof DevLoginSchema>;
