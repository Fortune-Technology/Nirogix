import { registry, z } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const notAuthed = { description: 'Not authenticated', ...json(ErrorResponseSchema) };
const forbidden = {
  description: 'Missing `platform.signature.manage`',
  ...json(ErrorResponseSchema),
};

const SignatureVersionSchema = z
  .object({
    id: z.string().uuid(),
    version: z.number().int(),
    status: z.enum(['active', 'superseded', 'removed']),
    fileId: z.string().uuid(),
    createdAt: z.string(),
    retiredAt: z.string().nullable(),
  })
  .openapi('SignatureVersion');

const MySignatureSchema = z
  .object({
    active: SignatureVersionSchema.extend({ imageUrl: z.string().nullable() }).nullable(),
    versions: z.array(SignatureVersionSchema),
    /**
     * Stated by the API and not only by the screen: what this endpoint stores and renders is an
     * uploaded image, not a cryptographically verified signature (ADR-137).
     */
    kind: z.literal('electronic_image'),
  })
  .openapi('MySignature');

const ELECTRONIC_ONLY =
  'This is an **electronic signature** — an image the user uploaded, rendered onto generated ' +
  'documents. It is NOT a cryptographic digital signature: nothing signs a hash, nothing is ' +
  'tamper-evident, and no certificate authority is involved (ADR-137).';

const OWN_ONLY =
  'Acts on the authenticated user and takes no user id. There is deliberately no ' +
  '`/users/{id}/signature`: an administrator holding every permission still cannot upload a ' +
  "signature in somebody else's name, because the route to do it does not exist.";

registry.registerPath({
  method: 'get',
  path: '/api/v1/me/signature',
  operationId: 'getMySignature',
  tags: ['Signature'],
  summary: 'Your own signature — the active one, and every version you have had',
  description: `${ELECTRONIC_ONLY}\n\n${OWN_ONLY}`,
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Your signature versions', ...json(MySignatureSchema) },
    401: notAuthed,
    403: forbidden,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/me/signature',
  operationId: 'uploadMySignature',
  tags: ['Signature'],
  summary: 'Upload a new signature image, which becomes the active version',
  description:
    `${ELECTRONIC_ONLY}\n\n${OWN_ONLY}\n\n` +
    'Uploading does not replace the previous version: it is retired, and every document already ' +
    'signed with it keeps rendering it. PNG, JPEG or WebP, 512 KB or smaller.',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({ file: z.string().openapi({ type: 'string', format: 'binary' }) }),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'The new active version',
      ...json(SignatureVersionSchema.extend({ imageUrl: z.string().nullable() })),
    },
    401: notAuthed,
    403: forbidden,
    422: { description: 'Not an accepted image type, or too large', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/me/signature',
  operationId: 'removeMySignature',
  tags: ['Signature'],
  summary: 'Stop signing new documents with your signature',
  description:
    `${OWN_ONLY}\n\nThe version is marked removed and kept. Documents already signed with it ` +
    'still render it — "remove" means "stop signing with this", which is the only meaning that ' +
    'can be honoured without rewriting what a past document showed.',
  security: [{ bearerAuth: [] }],
  responses: {
    204: { description: 'Removed from future documents' },
    401: notAuthed,
    403: forbidden,
    404: { description: 'You have no signature to remove', ...json(ErrorResponseSchema) },
  },
});
