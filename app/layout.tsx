import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RegistroPwa } from "@/components/pwa/registro-pwa";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const NOMBRE_APP = "Gestor Documental";

export const metadata: Metadata = {
  title: {
    default: NOMBRE_APP,
    template: `%s · ${NOMBRE_APP}`,
  },
  description:
    "Documentos internos de la empresa, organizados por área y con vigencia controlada.",
  applicationName: NOMBRE_APP,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: NOMBRE_APP,
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/iconos/icono-192.png", sizes: "192x192", type: "image/png" },
      { url: "/iconos/icono-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/iconos/apple-touch-icon.png", sizes: "180x180" }],
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#171717",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="top-center" richColors closeButton />
        <RegistroPwa />
      </body>
    </html>
  );
}
