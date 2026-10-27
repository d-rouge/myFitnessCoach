import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Email non valida")
  .max(254, "Email troppo lunga");

const passwordSchema = z
  .string()
  .min(8, "La password deve contenere almeno 8 caratteri")
  .max(128, "La password non può superare 128 caratteri");

export const RegisterSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().min(2, "Il nome deve contenere almeno 2 caratteri").max(100).optional(),
  ),
});

export const LocalLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "La password è obbligatoria"),
});

export const GoogleLoginSchema = z.object({
  id_token: z.string().min(1, "id_token è obbligatorio"),
});

export const DevLoginSchema = z
  .object({
    email: z.string().email("Email non valida").optional(),
    name: z.string().min(1).max(100).optional(),
  })
  .default({});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LocalLoginInput = z.infer<typeof LocalLoginSchema>;
export type GoogleLoginInput = z.infer<typeof GoogleLoginSchema>;
export type DevLoginInput = z.infer<typeof DevLoginSchema>;
