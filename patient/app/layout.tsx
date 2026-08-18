import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@hms/ui/styles.css";
import "./globals.css";
import { Toaster } from "@hms/ui";
import { Providers } from "./providers";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

/**
 * The Nirogix patient portal (ADR-051, ADR-052).
 *
 * Patients, on their own origin. A patient is a different principal from staff, so
 * this app shares the design system through `@hms/ui` and nothing else — a patient
 * must never be one route away from a clinical screen.
 *
 * Never indexed, and it never renders a hospital's or a patient's name in metadata
 * (ADR-027). Nothing identifying may enter this metadata.
 */
export const metadata: Metadata = {
  title: "Nirogix: Your health records",
  description: "View your records from the hospitals you are registered with.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
  referrer: "strict-origin-when-cross-origin",
};

// Applies the persisted theme before first paint to avoid a flash. The portal wears the
// Nirogix accent, not a hospital's: a patient may be registered at several hospitals,
// and repainting the app per hospital would make it unclear whose surface this is.
const noFlashScript = `(function(){try{
  var t=localStorage.getItem('nirogix-patient-theme');
  document.documentElement.setAttribute('data-theme', t==='dark'?'dark':'light');
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body className="min-h-full">
        <Providers>
          {children}
          {/* The one API-feedback surface for this app (ADR-026). */}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
