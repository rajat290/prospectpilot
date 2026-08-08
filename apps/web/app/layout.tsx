import type { Metadata } from "next";
import { CircleHelp, Settings2 } from "lucide-react";
import { AppNavigation } from "../components/app-navigation";
import { NotificationCenter } from "../components/notification-center";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProspectPilot AI",
  description: "Turn public business sources into qualified sales opportunities."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-frame">
          <aside className="sidebar">
            <a className="brand" href="/">
              <span className="brand-mark">P</span>
              <span>
                <strong>ProspectPilot</strong>
                <small>Revenue Intelligence</small>
              </span>
            </a>
            <AppNavigation />
            <NotificationCenter />
            <div className="sidebar-footer">
              <Settings2 size={16} />
              <span>Internal workspace</span>
              <span className="live-dot" title="Local workspace" />
            </div>
          </aside>
          <div className="content-frame">{children}</div>
          <a className="help-fab" href="/guide" aria-label="Open interactive product guide" title="Open interactive product guide">
            <CircleHelp size={20} />
          </a>
        </div>
      </body>
    </html>
  );
}
