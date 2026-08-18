// The document/print layer (ADR-047) — print prints the document, not the app.
//
// A module supplies its document's content; the header, geometry, repeating table
// headers, page breaks, signatures, notices and footer live here, so every printable
// document in the platform is a template rather than its own print system.

export {
  PrintDocument,
  PrintSection,
  PrintFields,
  PrintTable,
  PrintTotals,
  PrintSignatures,
  PrintNote,
} from './PrintDocument';
export type { PrintDocumentProps, DocumentBrand } from './PrintDocument';
export { PrintToolbar } from './PrintToolbar';
