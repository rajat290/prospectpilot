"use client";

import { BarChart3, Bot, BriefcaseBusiness, CircleHelp, Database, MailCheck, MessagesSquare, Radar, Rocket, ShieldCheck, Sparkles } from "lucide-react";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Today", icon: BarChart3 },
  { href: "/sources", label: "Find leads", icon: Radar },
  { href: "/quality", label: "Data quality", icon: ShieldCheck },
  { href: "/leads", label: "Leads", icon: Database },
  { href: "/campaigns", label: "Campaigns", icon: Rocket },
  { href: "/inbox", label: "Inbox", icon: MessagesSquare },
  { href: "/pipeline", label: "Deals", icon: BriefcaseBusiness },
  { href: "/copilot", label: "Sales Copilot", icon: Sparkles },
  { href: "/email-settings", label: "Email settings", icon: MailCheck },
  { href: "/automation", label: "Automation", icon: Bot },
  { href: "/guide", label: "Guide & glossary", icon: CircleHelp }
];

export function AppNavigation() {
  const pathname = usePathname();

  return (
    <nav className="nav-list" aria-label="Main navigation">
      <section className="nav-group">
        <span className="nav-group-label">Workflow</span>
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return <a href={item.href} className={`nav-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined} key={item.href}><Icon size={18} /><span>{item.label}</span></a>;
        })}
      </section>
    </nav>
  );
}
