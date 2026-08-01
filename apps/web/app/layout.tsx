import type { Metadata } from "next";
import { BarChart3, Bot, BriefcaseBusiness, CircleHelp, Database, Mail, MessagesSquare, Radar, Rocket, Settings2, ShieldCheck } from "lucide-react";
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
            <nav className="nav-list" aria-label="Main navigation">
              <NavItem href="/" label="Overview" icon={<BarChart3 size={18} />} />
              <NavItem href="/leads" label="Lead database" icon={<Database size={18} />} />
              <NavItem href="/quality" label="Data quality" icon={<ShieldCheck size={18} />} />
              <NavItem href="/inbox" label="Inbox" icon={<Mail size={18} />} />
              <NavItem href="/communications" label="Communications" icon={<MessagesSquare size={18} />} />
              <NavItem href="/campaigns" label="Campaign launch" icon={<Rocket size={18} />} />
              <NavItem href="/pipeline" label="Deal pipeline" icon={<BriefcaseBusiness size={18} />} />
              <NavItem href="/sources" label="Sources" icon={<Radar size={18} />} />
              <NavItem href="/automation" label="Automation" icon={<Bot size={18} />} />
              <NavItem href="/guide" label="Product guide" icon={<CircleHelp size={18} />} />
            </nav>
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

function NavItem({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <a href={href} className="nav-item">
      {icon}
      <span>{label}</span>
    </a>
  );
}
