import SwaggerParser from '@apidevtools/swagger-parser';
import listEndpoints from 'express-list-endpoints';
import type { Express } from 'express';
import { buildOpenApiDocument } from './document';

export type ValidationResult = { ok: boolean; problems: string[] };

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;

// Routes that are intentionally not part of the documented API contract.
const EXCLUDED_EXACT = new Set(['/api/v1/openapi.json']);
const EXCLUDED_PREFIXES = ['/api/v1/docs'];

// Express ":id" → OpenAPI "{id}" so the two path styles compare equal.
function normalizePath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

/**
 * Validates the generated OpenAPI document and (if an Express app is supplied) enforces that
 * every registered API route is documented. Returns all problems found — the CI script fails
 * the build on any. Covers: invalid schemas / broken $refs / invalid parameters (via
 * swagger-parser), duplicate operationIds, missing responses, missing tags, missing security
 * definitions, and undocumented routes.
 */
export async function validateOpenApiDocument(app?: Express): Promise<ValidationResult> {
  const problems: string[] = [];
  const doc = buildOpenApiDocument();
  const paths = doc.paths ?? {};

  // 1. Structural validity — schemas, $refs, parameters. swagger-parser mutates its input,
  // so validate a deep clone.
  try {
    await SwaggerParser.validate(JSON.parse(JSON.stringify(doc)));
  } catch (err) {
    problems.push(`Invalid OpenAPI specification: ${(err as Error).message}`);
  }

  // 2. A bearer security scheme must be defined so protected operations can reference it.
  if (!doc.components?.securitySchemes?.bearerAuth) {
    problems.push('Missing security definition: components.securitySchemes.bearerAuth');
  }

  // 3. Per-operation contract checks + build the documented-operation set for coverage.
  const documented = new Set<string>();
  const seenOperationIds = new Set<string>();
  for (const [path, item] of Object.entries(paths)) {
    for (const method of HTTP_METHODS) {
      const op = (item as Record<string, unknown>)[method] as
        { operationId?: string; responses?: Record<string, unknown>; tags?: string[] } | undefined;
      if (!op) continue;
      const label = `${method.toUpperCase()} ${path}`;
      documented.add(`${method.toUpperCase()} ${path}`);

      if (op.operationId) {
        if (seenOperationIds.has(op.operationId)) {
          problems.push(`Duplicate operationId "${op.operationId}" (${label})`);
        }
        seenOperationIds.add(op.operationId);
      }
      if (!op.responses || Object.keys(op.responses).length === 0) {
        problems.push(`Missing response definitions: ${label}`);
      }
      if (!op.tags || op.tags.length === 0) {
        problems.push(`Missing tag: ${label}`);
      }
    }
  }

  // 4. Coverage — no undocumented production API routes. Every /api/v1 route registered on
  // the Express app must have a matching documented operation.
  if (app) {
    for (const ep of listEndpoints(app)) {
      if (!ep.path.startsWith('/api/v1')) continue;
      if (EXCLUDED_EXACT.has(ep.path) || EXCLUDED_PREFIXES.some((p) => ep.path.startsWith(p))) {
        continue;
      }
      for (const method of ep.methods) {
        const key = `${method.toUpperCase()} ${normalizePath(ep.path)}`;
        if (!documented.has(key)) {
          problems.push(`Undocumented API route: ${method.toUpperCase()} ${ep.path}`);
        }
      }
    }
  }

  return { ok: problems.length === 0, problems };
}
