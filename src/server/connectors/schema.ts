import { z } from 'zod';

const envRef = z.string().regex(/^(AGENT_|NOMYLAX_AGENT_)[A-Z0-9_]{1,80}$/, 'secret reference must start with AGENT_ or NOMYLAX_AGENT_');
const headerName = z.string().regex(/^[A-Za-z0-9-]{1,80}$/, 'invalid header name');
const path = z.string().max(180).regex(/^[A-Za-z0-9_$.[\]-]*$/, 'invalid JSON path').optional();

export const connectorInputSchema = z.object({
  method: z.enum(['GET', 'POST']).default('POST'),
  sendContext: z.boolean().default(true),
  responseMode: z.enum(['native', 'auto', 'mapping']).default('auto'),
  rootPath: path,
  mapping: z.object({
    amount: path,
    token: path,
    recipient: path,
    purpose: path,
    recipientVerified: path,
    contractRisk: path,
  }).optional(),
  defaultToken: z.string().min(2).max(12).default('SOL'),
  auth: z.discriminatedUnion('type', [
    z.object({ type: z.literal('none') }),
    z.object({ type: z.literal('env-bearer'), secretRef: envRef }),
    z.object({ type: z.literal('env-header'), secretRef: envRef, headerName }),
    z.object({ type: z.literal('bearer') }),
    z.object({ type: z.literal('header'), headerName }),
  ]),
  credential: z.string().min(1).max(4000).optional(),
}).superRefine((value, ctx) => {
  if ((value.auth.type === 'bearer' || value.auth.type === 'header') && !value.credential) {
    ctx.addIssue({ code: 'custom', path: ['credential'], message: 'credential is required for this authentication mode' });
  }
  if (value.responseMode === 'mapping') {
    const m = value.mapping;
    if (!m?.amount || !m?.recipient || !m?.purpose) {
      ctx.addIssue({ code: 'custom', path: ['mapping'], message: 'mapping mode requires amount, recipient and purpose paths' });
    }
  }
});

export type ParsedConnectorInput = z.infer<typeof connectorInputSchema>;
