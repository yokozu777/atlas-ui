import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";

import { AppShell } from "@/components/app-shell";
import { RadixWallpaper } from "@/components/radix-wallpaper";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "atlas-ui",
  description: "Projects console for Atlas clusterctl and hub Ansible",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={{ colorScheme: "dark" }}
    >
      <body className="h-full overflow-hidden">
        <Theme
          appearance="dark"
          panelBackground="translucent"
          grayColor="gray"
          accentColor="gray"
          hasBackground={false}
          className="relative flex h-full min-h-0 flex-col"
        >
          <RadixWallpaper />
          <TooltipProvider>
            <div className="relative z-10 flex h-full min-h-0 flex-col">
              <AppShell>{children}</AppShell>
              <Toaster />
            </div>
          </TooltipProvider>
        </Theme>
      </body>
    </html>
  );
}
