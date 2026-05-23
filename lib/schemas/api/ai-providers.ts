// =================== /api/admin/ai/providers CONTRACT ===================
//
// GET — lists every AI provider the app knows about + whether its
// env-var key is set + which one is the default for new sessions.
//
// Powers the admin "switch provider" picker modal. The client uses
// `availability.available === false` to render grayed-out entries
// with an explanatory tooltip from `availability.reason`.
//
// Auth: admin-only. Non-admins get 403 (handled at the route level,
// not in the schema).

import { z } from "zod";

/** The four provider ids the codebase knows. Matches `ProviderId` in
 *  `lib/ai/provider.ts`. We re-declare here instead of importing the
 *  type so the schema is the single source of truth for the wire
 *  contract — if the union changes in `provider.ts` but not here, the
 *  schema fails and the route handler trips loud. */
const providerIdSchema = z.enum(["stub", "gemini", "openai", "deepseek"]);

/** Discriminated union: an `available: true` entry has no reason
 *  (the provider works); a `false` entry carries a short reason
 *  string that the modal tooltip displays. */
const availabilityCheckSchema = z.discriminatedUnion("available", [
  z.object({ available: z.literal(true) }).strict(),
  z.object({ available: z.literal(false), reason: z.string() }).strict(),
]);

const providerSnapshotSchema = z
  .object({
    id: providerIdSchema,
    displayName: z.string().min(1),
    availability: availabilityCheckSchema,
  })
  .strict();

export const aiProvidersResponseSchema = z
  .object({
    defaultId: providerIdSchema,
    providers: z.array(providerSnapshotSchema).min(1),
  })
  .strict();

export type AIProvidersResponse = z.infer<typeof aiProvidersResponseSchema>;
