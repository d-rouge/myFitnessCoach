import { z } from "zod";

export const UserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
  picture: z.string().url().optional(),
  roles: z.array(z.string()).default(["athlete"]),
  createdAt: z.string(),
  lastLoginAt: z.string(),
});

export type User = z.infer<typeof UserSchema>;
