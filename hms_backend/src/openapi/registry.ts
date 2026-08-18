import { OpenAPIRegistry, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Extend Zod so schemas can carry `.openapi()` metadata. MUST run before any schema that
// uses `.openapi()` is defined — importing this module first guarantees that.
extendZodWithOpenApi(z);

// The single registry every module registers its paths and schemas into. The OpenAPI
// document is generated FROM this registry — the spec is never hand-maintained
// (resources/rules.md → API Documentation Rules).
export const registry = new OpenAPIRegistry();

// Bearer JWT security scheme. Protected operations reference this via `security`.
export const bearerAuth = registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

// Re-export the openapi-extended `z` so modules import Zod from one place and always get
// the `.openapi()` extension.
export { z };
