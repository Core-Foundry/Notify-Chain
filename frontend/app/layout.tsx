import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "../src/hooks/useTheme";
import { ThemeToggle } from "../src/components/ThemeToggle";

export const metadata: Metadata = {
  title: "NotifyChain - Analytics Dashboard",
  description: "Actionable insights into notification performance",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        <ThemeProvider>
          <div className="fixed top-4 right-4 z-50">
            <ThemeToggle />
          </div>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
