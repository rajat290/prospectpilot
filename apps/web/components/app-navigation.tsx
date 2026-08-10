"use client";

import { BarChart3, Bot, BrainCircuit, BriefcaseBusiness, CircleHelp, Crosshair, Database, Gem, Mail, MessagesSquare, Radar, Rocket, ShieldCheck, Sparkles } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const groups = [
  {
    label: "Work",
    items: [
      { href: "/", label: "Today", icon: BarChart3 },
      { href: "/overview", label: "Overview", icon: Gem },
      { href: "/leads", label: "Leads", icon: Database },
      { href: "/inbox", label: "Inbox", icon: Mail },
      { href: "/pipeline", label: "Deals", icon: BriefcaseBusiness }
    ]
  },
  {
    label: "Grow",
    items: [
      { href: "/source-strategy", label: "Source strategy", icon: Crosshair },
      { href: "/sources", label: "Find leads", icon: Radar },
      { href: "/campaigns", label: "Send campaigns", icon: Rocket },
      { href: "/copilot", label: "Sales Copilot", icon: Sparkles }
    ]
  },
  {
    label: "Advanced",
    advanced: true,
    items: [
      { href: "/quality", label: "Data quality", icon: ShieldCheck },
      { href: "/communications?view=advanced", match: "/communications", label: "Email operations", icon: MessagesSquare },
      { href: "/automation", label: "Automation", icon: Bot },
      { href: "/copilot#settings", label: "AI controls", icon: BrainCircuit }
    ]
  },
  {
    label: "Help",
    items: [{ href: "/guide", label: "Guide & glossary", icon: CircleHelp }]
  }
];

const storageKey = "prospectpilot-navigation-mode";

export function AppNavigation() {
  const pathname = usePathname();
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => setAdvanced(localStorage.getItem(storageKey) === "advanced"), []);

  function changeMode(next: boolean) {
    setAdvanced(next);
    localStorage.setItem(storageKey, next ? "advanced" : "simple");
  }

  return (
    <>
      <div className="nav-mode" aria-label="Navigation detail level">
        <button className={!advanced ? "active" : ""} onClick={() => changeMode(false)}>Simple</button>
        <button className={advanced ? "active" : ""} onClick={() => changeMode(true)}>Advanced</button>
      </div>
      <nav className="nav-list" aria-label="Main navigation">
        {groups.filter((group) => !group.advanced || advanced).map((group) => (
          <section className="nav-group" key={group.label}>
            <span className="nav-group-label">{group.label}</span>
            {group.items.map((item) => {
              const activePath = ("match" in item ? item.match : undefined) ?? item.href.split("?")[0]!.split("#")[0]!;
              const active = activePath === "/" ? pathname === "/" : pathname.startsWith(activePath);
              const Icon = item.icon;
              return <a href={item.href} className={`nav-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined} key={item.href}><Icon size={18} /><span>{item.label}</span></a>;
            })}
          </section>
        ))}
      </nav>
    </>
  );
}
