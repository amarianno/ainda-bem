import { z } from 'zod';
const source=z.object({url:z.url(),verifiedAt:z.iso.datetime()});
export const studioPlanSchema=z.object({
 mode:z.literal('heygen'),avatarId:z.literal('089168db17264c6b91c84d08ade8e559'),engine:z.literal('avatar_iv'),scriptConfirmed:z.literal(true),maxHeygenUsd:z.number().positive().max(100),maxAudioSeconds:z.number().min(30).max(600),
 stories:z.array(z.object({scene:z.number().int().nonnegative(),scope:z.enum(['BR','WORLD']),macroregion:z.enum(['N','NE','CO','SE','S']).optional(),city:z.string().optional(),source})).min(4).max(6),
 ticker:z.array(z.object({headline:z.string().min(10).max(120),source})).min(2).max(6),
 inserts:z.array(z.object({scene:z.number().int().nonnegative(),startPhrase:z.string().min(1),endPhrase:z.string().min(1),kind:z.enum(['editorial','image']),label:z.string().max(60).optional(),lines:z.array(z.string().max(50)).max(4).optional(),path:z.string().optional(),sha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),hasEmbeddedText:z.boolean().default(true),credit:z.string().max(100)})).max(12),
 captionCorrections:z.record(z.string(),z.record(z.string(),z.string())).default({})
});
export type StudioPlan=z.infer<typeof studioPlanSchema>;
