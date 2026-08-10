import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { ToolAuthRoot } from "@/components/ToolAuthRoot";
import { DashboardFilterProvider } from "@/lib/dashboard-filters";

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Time Tracking · Longhouse",
  description: "Longhouse internal time tracking.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${figtree.variable} h-full`}>
      <body className="min-h-full">
        <ToolAuthRoot>
          <DashboardFilterProvider>
            <Sidebar />
            <main className="min-h-dvh min-w-0 pl-[var(--dock-gutter)]">
              {children}
            </main>
          </DashboardFilterProvider>
        </ToolAuthRoot>
      </body>
    </html>
  );
}
