import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { site } from "@/content/site";
import { UiProvider } from "@/components/shell/UiContext";
import { Header } from "@/components/shell/Header";
import { CommandMenu } from "@/components/shell/CommandMenu";
import { Notifications } from "@/components/shell/Notifications";
import { Drawer, RouteWatcher, Scrim, SmoothScroll, Veil } from "@/components/shell/Chrome";
import { PaperGround } from "@/components/shell/PaperGround";
import "./globals.css";
import "./pages.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: `${site.name} — ${site.role}`, template: `%s — ${site.name}` },
  description: site.description,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#d6d6d5" },
    { media: "(prefers-color-scheme: dark)", color: "#1e1e1e" },
  ],
};

// Applies the saved/system theme before first paint so there is no flash.
const themeScript = `(()=>{try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <PaperGround />
        <UiProvider>
          <SmoothScroll />
          <Header />
          {children}
          <Scrim />
          <CommandMenu />
          <Notifications />
          <Drawer />
          <RouteWatcher />
          <Veil />
        </UiProvider>
      </body>
    </html>
  );
}
