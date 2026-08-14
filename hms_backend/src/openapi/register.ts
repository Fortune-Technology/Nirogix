// Imports every module's OpenAPI registration for its side effects (each file calls
// registry.registerPath(...)). When you add a module, create a `<module>.openapi.ts` next
// to its routes and import it here — otherwise the coverage validator will flag its routes
// as undocumented and fail the build.
import '../modules/health/health.openapi';
import '../modules/auth/auth.openapi';
import '../modules/rbac/rbac.openapi';
import '../modules/entitlement/entitlement.openapi';
import '../modules/audit/audit.openapi';
import '../modules/notification/notification.openapi';
import '../modules/file/file.openapi';
import '../modules/provider/provider.openapi';
