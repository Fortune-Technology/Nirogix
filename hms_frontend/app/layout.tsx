import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@hms/ui/styles.css";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HMS Portal",
  description: "Hospital Management System — staff portal",
};

// Applies the persisted theme + tenant brand before first paint to avoid a flash.
// Defaults to Light (the product default) when nothing is stored.
const noFlashScript = `(function(){try{
  var t=localStorage.getItem('hms-theme');
  document.documentElement.setAttribute('data-theme', t==='dark'?'dark':'light');
  var b=localStorage.getItem('hms-brand');
  if(b){document.documentElement.style.setProperty('--hms-brand',b);}
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
