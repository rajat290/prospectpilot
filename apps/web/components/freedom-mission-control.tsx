"use client";

import {
  Award,
  Bike,
  CalendarCheck,
  Car,
  Coins,
  Eye,
  EyeOff,
  Gem,
  Goal,
  IndianRupee,
  LandPlot,
  Lock,
  Medal,
  Pause,
  PartyPopper,
  Phone,
  PiggyBank,
  Save,
  ShieldCheck,
  Sparkles,
  Trophy,
  Vault,
  Zap
} from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { apiUrl } from "../lib/api";
import { displayTerm } from "../lib/terminology";
import { Pill } from "./pill";

export type FounderMissionSummary = {
  profile: {
    displayName: string;
    missionName: string;
    missionTargetAmount: number;
    privacyModeEnabled: boolean;
    reducedMotionEnabled: boolean;
    soundEnabled: boolean;
    disciplineMode: string;
    streak?: { currentDays: number; longestDays: number } | null;
  };
  mission: {
    targetAmount: number;
    freedomProgressAmount: number;
    progressPercent: number;
    collectedRevenue: number;
    pipelineCount: number;
    wonDeals: number;
    debtRepaid: number;
    liquidReserve: number;
    verifiedInvestmentValue: number;
    nextMilestone: MissionMilestone | null;
    formula: string;
  };
  xp: {
    total: number;
    recent: Array<{ id: string; eventType: string; finalXp: number; reason: string; createdAt: string }>;
    level: { level: number; title: string; requiredXp: number; progressPercent: number; xpIntoLevel: number; xpToNext: number; next: { level: number; title: string; requiredXp: number } | null };
    coins: number;
    lifetimeCoins: number;
  };
  milestones: MissionMilestone[];
  quests: Array<{ id: string; title: string; description: string; targetValue: number; currentValue: number; xpReward: number; coinReward: number; status: string; sourceRule: string; progressPercent: number }>;
  achievements: Array<{ id: string; earnedAt: string; definition: { name: string; description: string; icon: string; rarity: string; category: string } }>;
  celebrations: Array<{ id: string; title: string; message: string; level: string; viewedAt?: string | null; createdAt: string }>;
  recentWins: Array<{ id: string; title: string; message: string; type: string; createdAt: string }>;
  guardrails: string[];
  finances?: {
    allocations: Array<{ id: string; category: string; amount: number; note?: string | null; occurredAt: string; verified: boolean }>;
    debtPayments: Array<{ id: string; amount: number; note?: string | null; paidAt: string }>;
    debtAccounts: Array<{ id: string; name: string; originalAmount: number; currentBalance: number; status: string }>;
    assets: Array<{ id: string; name: string; assetType: string; verifiedValue: number; verifiedAt?: string | null }>;
    trend: Array<{ label: string; value: number; percent: number }>;
    projection: { monthlyRate: number; monthsRemaining: number | null; label: string };
  };
};

type MissionMilestone = {
  id: string;
  milestoneKey: string;
  title: string;
  description: string;
  targetAmount: number;
  allocatedAmount: number;
  status: string;
  sortOrder: number;
  icon: string;
  rewardXp: number;
  rewardCoins: number;
  progressPercent: number;
  note?: string | null;
  evidenceUrl?: string | null;
  completedAt?: string | null;
  verifiedAt?: string | null;
};

const iconMap = {
  phone: Phone,
  chain: Gem,
  shield: ShieldCheck,
  bike: Bike,
  land: LandPlot,
  vault: Vault,
  vehicle: Car
};

export function FreedomMissionControl({ summary }: { summary: FounderMissionSummary }) {
  const [mission, setMission] = useState(summary);
  const [hideMoney, setHideMoney] = useState(summary.profile.privacyModeEnabled);
  const [selectedMilestone, setSelectedMilestone] = useState<MissionMilestone | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const latestCelebration = mission.celebrations.find((item) => !item.viewedAt) ?? mission.celebrations[0];
  const nextMilestone = mission.mission.nextMilestone;
  const visualTrack = useMemo(() => buildTrack(mission.milestones), [mission.milestones]);

  async function refreshFrom(response: Response) {
    if (!response.ok) throw new Error(await response.text());
    setMission(await response.json());
  }

  async function submitJson(path: string, payload: Record<string, unknown>, method = "POST") {
    setBusy(path);
    try {
      await refreshFrom(await fetch(`${apiUrl}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className={`page freedom-page${mission.profile.reducedMotionEnabled ? " reduced-motion" : ""}`}>
      <header className="page-head freedom-head">
        <div>
          <p className="eyebrow">My Freedom Mission</p>
          <h1>My Freedom Mission</h1>
          <p className="subtle">A gamified founder cockpit for the Rs 1 crore mission. Existing Today dashboard stays focused on daily operations.</p>
        </div>
        <div className="actions">
          <button className="button" onClick={() => setHideMoney((value) => !value)} type="button">
            {hideMoney ? <Eye size={15} /> : <EyeOff size={15} />} {hideMoney ? "Show amounts" : "Hide amounts"}
          </button>
          <a className="button primary" href="/pipeline"><Goal size={15} /> Move a deal</a>
        </div>
      </header>

      <section className="freedom-hud" aria-label="Founder status HUD">
        <HudCard icon={<ShieldCheck size={22} />} label={`Level ${mission.xp.level.level} Founder`} value={mission.xp.level.title} note={`${mission.xp.total.toLocaleString("en-IN")} XP earned`} />
        <HudCard icon={<Coins size={22} />} label="Sales Coins" value={mission.xp.coins.toLocaleString("en-IN")} note="Visual reward wallet" />
        <HudCard icon={<IndianRupee size={22} />} label="Total Collected" value={money(mission.mission.collectedRevenue, hideMoney)} note="Real collected revenue" />
        <HudCard icon={<Zap size={22} />} label="Daily Streak" value={`${mission.profile.streak?.currentDays ?? 0} Days`} note={`Best: ${mission.profile.streak?.longestDays ?? 0} days`} />
        <HudCard icon={<Trophy size={22} />} label="Achievements" value={`${mission.achievements.length} / 42`} note="Unlocked badges" />
      </section>

      <section className="freedom-hero" aria-label="Freedom mission progress">
        <div className="mission-skyline" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="freedom-hero-main">
          <div className="mission-badge"><Trophy size={18} /> {mission.profile.displayName}&apos;s mission</div>
          <h2>{mission.profile.missionName}: {money(mission.mission.targetAmount, hideMoney)}</h2>
          <div className="mission-why">
            <Sparkles size={16} />
            <span>To build true financial freedom, clear pressure, create assets, and win on my own terms.</span>
          </div>
          <div className="freedom-track">
            <div className="freedom-track-meta">
              <strong>{mission.mission.progressPercent}% complete</strong>
              <span>{money(mission.mission.freedomProgressAmount, hideMoney)} real freedom progress</span>
            </div>
            <div className="freedom-progress"><span style={{ width: `${mission.mission.progressPercent}%` }} /></div>
            <div className="freedom-avatar" style={{ left: `${Math.min(96, mission.mission.progressPercent)}%` }}><Zap size={15} /></div>
          </div>
          <div className="pixel-blocks" aria-hidden="true">{Array.from({ length: 36 }).map((_, index) => <span className={index < Math.round(mission.mission.progressPercent / 3) ? "filled" : ""} key={index} />)}</div>
        </div>
        <aside className="level-console">
          <div className="level-ring">
            <span>LVL</span>
            <strong>{mission.xp.level.level}</strong>
          </div>
          <div>
            <p className="eyebrow">Founder level</p>
            <h3>{mission.xp.level.title}</h3>
            <div className="xp-line"><span style={{ width: `${mission.xp.level.progressPercent}%` }} /></div>
            <small>{mission.xp.level.next ? `${mission.xp.level.xpToNext.toLocaleString("en-IN")} XP to ${mission.xp.level.next.title}` : "Final level reached"}</small>
          </div>
          <div className="coin-wallet"><Coins size={16} /><span>{mission.xp.coins.toLocaleString("en-IN")} sales coins</span></div>
        </aside>
      </section>

      <section className="mission-metrics">
        <MissionMetric icon={<IndianRupee size={16} />} label="Collected revenue" value={money(mission.mission.collectedRevenue, hideMoney)} note="Shown separately from wealth" />
        <MissionMetric icon={<ShieldCheck size={16} />} label="Debt repaid" value={money(mission.mission.debtRepaid, hideMoney)} note="Counts toward freedom" />
        <MissionMetric icon={<PiggyBank size={16} />} label="Liquid reserve" value={money(mission.mission.liquidReserve, hideMoney)} note="Emergency + balance" />
        <MissionMetric icon={<BriefSpark />} label="Active pipeline" value={`${mission.mission.pipelineCount}`} note={`${mission.mission.wonDeals} won deals`} />
      </section>

      <MissionActions mission={mission} busy={busy} hideMoney={hideMoney} onSubmit={submitJson} />

      <section className="freedom-grid">
        <div className="panel mission-panel">
          <div className="panel-head">
            <h2>Daily revenue quests</h2>
            <span className="streak-pill"><CalendarCheck size={13} /> {mission.profile.streak?.currentDays ?? 0}-day streak</span>
          </div>
          <div className="quest-list">
            {mission.quests.map((quest) => (
              <article className={`quest-card ${quest.status.toLowerCase()}`} key={quest.id}>
                <div>
                  <strong>{quest.title}</strong>
                  <p>{quest.description}</p>
                  <small>{quest.sourceRule}</small>
                </div>
                <div className="quest-reward">
                  <span>+{quest.xpReward} XP</span>
                  <span>+{quest.coinReward} coins</span>
                </div>
                <div className="quest-progress">
                  <span>{quest.currentValue}/{quest.targetValue}</span>
                  <div><b style={{ width: `${quest.progressPercent}%` }} /></div>
                </div>
              </article>
            ))}
            {!mission.quests.length ? <div className="empty">Quests appear after mission data is initialized.</div> : null}
          </div>
        </div>

        <div className="panel arcade-panel">
          <div className="panel-head">
            <h2>Latest win</h2>
            <PartyPopper size={17} />
          </div>
          {latestCelebration ? (
            <div className="celebration-card">
              <div className="coin-burst" aria-hidden="true"><span /><span /><span /><span /><span /></div>
              <Sparkles size={22} />
              <strong>{latestCelebration.title}</strong>
              <p>{latestCelebration.message}</p>
              <Pill value={latestCelebration.level} />
              {!latestCelebration.viewedAt ? <button className="button" type="button" onClick={() => submitJson(`/founder-mission/celebrations/${latestCelebration.id}/viewed`, {})}>Mark seen</button> : null}
            </div>
          ) : (
            <div className="celebration-card muted">
              <Sparkles size={22} />
              <strong>First win waiting</strong>
              <p>Send real outreach, receive a reply, book a meeting, win a deal or record payment to trigger celebration.</p>
            </div>
          )}
        </div>
      </section>

      <section className="panel mission-map-panel">
        <div className="panel-head">
          <h2>Freedom Achievements - Your Quest Map</h2>
          <span>{nextMilestone ? `Next unlock: ${nextMilestone.title}` : "Mission path complete"}</span>
        </div>
        <div className="mission-map">
          <div className="map-line" aria-hidden="true">
            {visualTrack.map((item) => <span key={item.key} className={item.complete ? "complete" : ""} />)}
          </div>
          {mission.milestones.map((milestone) => {
            const Icon = iconMap[milestone.icon as keyof typeof iconMap] ?? Medal;
            return (
              <article className={`milestone-card ${milestone.status.toLowerCase().replaceAll("_", "-")}`} key={milestone.id} role="button" tabIndex={0} onClick={() => setSelectedMilestone(milestone)} onKeyDown={(event) => event.key === "Enter" ? setSelectedMilestone(milestone) : undefined}>
                <div className="milestone-number">{milestone.sortOrder}</div>
                <div className="milestone-art" data-icon={milestone.icon} aria-hidden="true">
                  {milestone.icon === "phone" ? <span className="art-phone" /> : null}
                  {milestone.icon === "chain" ? <span className="art-chain"><i /><i /><i /><b /></span> : null}
                  {milestone.icon === "shield" ? <span className="art-loan"><i>LOAN</i><b /></span> : null}
                  {milestone.icon === "bike" ? <span className="art-bike"><i /><i /><b /></span> : null}
                  {milestone.icon === "land" ? <span className="art-land"><i /><i /><i /></span> : null}
                  {milestone.icon === "vault" ? <span className="art-vault"><i /><b /></span> : null}
                  {milestone.icon === "vehicle" ? <span className="art-car"><i /><b /></span> : null}
                </div>
                <div className="milestone-body">
                  <div><strong>{milestone.title}</strong></div>
                  <div className="milestone-money"><span>{money(milestone.allocatedAmount, hideMoney)}</span><small>{milestone.progressPercent}%</small></div>
                  <div className="milestone-progress"><span style={{ width: `${milestone.progressPercent}%` }} /></div>
                  <div className="milestone-footer">{milestone.status === "LOCKED" ? <Lock size={11} /> : milestone.status === "COMPLETED" || milestone.status === "VERIFIED" ? <ShieldCheck size={11} /> : <Zap size={11} />}<span>{statusLabel(milestone.status)}</span></div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="freedom-grid lower">
        <div className="panel boss-panel">
          <div className="panel-head"><h2>Boss missions</h2><Award size={17} /></div>
          <div className="boss-list">
            <BossMission title="Debt Freedom" amount={mission.mission.debtRepaid} target={800000} hideMoney={hideMoney} tone="debt" />
            <BossMission title="Rs 1 Crore Final Mission" amount={mission.mission.freedomProgressAmount} target={mission.mission.targetAmount} hideMoney={hideMoney} tone="final" />
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Achievement center</h2><Medal size={17} /></div>
          <div className="achievement-grid">
            {mission.achievements.slice(0, 8).map((achievement) => (
              <article key={achievement.id}>
                <span><Medal size={15} /></span>
                <strong>{achievement.definition.name}</strong>
                <small>{achievement.definition.rarity} / {achievement.definition.category}</small>
              </article>
            ))}
            {!mission.achievements.length ? <div className="empty">Achievements unlock from real ProspectPilot events.</div> : null}
          </div>
        </div>
      </section>

      <section className="panel trend-panel">
        <div className="panel-head"><h2>Monthly mission velocity</h2><span>{mission.finances?.projection.label ?? "Projection starts after financial entries."}</span></div>
        <div className="mission-bars">
          {(mission.finances?.trend ?? []).map((item) => <div key={item.label}><span style={{ height: `${Math.max(4, item.percent)}%` }} /><strong>{item.label}</strong><small>{money(item.value, hideMoney)}</small></div>)}
        </div>
      </section>

      <section className="mission-metrics founder-floor">
        <MissionMetric icon={<PiggyBank size={16} />} label="Emergency / balance" value={money(mission.mission.liquidReserve, hideMoney)} note="Reserve power" />
        <MissionMetric icon={<Goal size={16} />} label="Active pipeline" value={`${mission.mission.pipelineCount} deals`} note="Not counted as wealth" />
        <MissionMetric icon={<IndianRupee size={16} />} label="This mission" value={money(mission.mission.freedomProgressAmount, hideMoney)} note={`${mission.mission.progressPercent}% of target`} />
        <MissionMetric icon={<Sparkles size={16} />} label="Founder tip" value="Win daily" note="Small real wins compound." />
      </section>

      <section className="panel audit-panel">
        <div className="panel-head">
          <h2>Recent mission history</h2>
          <span>Auditable, real events only</span>
        </div>
        <div className="mission-history">
          <div>
            <h3>Recent wins</h3>
            {mission.recentWins.map((win) => <HistoryRow key={win.id} title={win.title} detail={win.message} date={win.createdAt} />)}
            {!mission.recentWins.length ? <div className="empty">No wins recorded yet.</div> : null}
          </div>
          <div>
            <h3>Recent XP</h3>
            {mission.xp.recent.slice(0, 7).map((item) => <HistoryRow key={item.id} title={`+${item.finalXp} XP`} detail={item.reason} date={item.createdAt} />)}
            {!mission.xp.recent.length ? <div className="empty">XP starts after real actions are detected.</div> : null}
          </div>
          <div>
            <h3>Guardrails</h3>
            {mission.guardrails.map((item) => <div className="guardrail" key={item}><ShieldCheck size={14} /><span>{item}</span></div>)}
          </div>
        </div>
      </section>
      {selectedMilestone ? <MilestoneModal milestone={selectedMilestone} hideMoney={hideMoney} busy={busy} onClose={() => setSelectedMilestone(null)} onSubmit={submitJson} /> : null}
    </main>
  );
}

function MissionActions({ mission, busy, hideMoney, onSubmit }: { mission: FounderMissionSummary; busy: string | null; hideMoney: boolean; onSubmit: (path: string, payload: Record<string, unknown>, method?: string) => Promise<void> }) {
  const [mode, setMode] = useState("payment");
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const amount = Number(formData.get("amount"));
    const note = String(formData.get("note") || "");
    const milestoneKey = String(formData.get("milestoneKey") || "");
    if (!amount || amount < 1) return;
    if (mode === "debt") {
      await onSubmit("/founder-mission/debt-payments", { amount, note });
      return;
    }
    if (mode === "asset") {
      await onSubmit("/founder-mission/assets", { name: note || "Verified asset", assetType: "Mission asset", verifiedValue: amount, milestoneKey: milestoneKey || undefined, note });
      return;
    }
    const category = mode === "payment" ? "COLLECTED_REVENUE" : mode === "reserve" ? "EMERGENCY_RESERVE" : milestoneKey === "xuv_fortuner" ? "VEHICLE_FUND" : milestoneKey === "property_asset" ? "ASSET_FUND" : "PERSONAL_REWARD_FUND";
    await onSubmit("/founder-mission/allocations", { category, amount, milestoneKey: milestoneKey || undefined, note, verified: true });
  }
  return (
    <section className="panel mission-actions-panel">
      <div className="panel-head"><h2>Mission operations</h2><span>Record real money movement here</span></div>
      <form className="mission-actions-form" onSubmit={handleSubmit}>
        <select className="select" value={mode} onChange={(event) => setMode(event.target.value)} aria-label="Mission action type">
          <option value="payment">Payment received</option>
          <option value="allocate">Allocate to milestone</option>
          <option value="debt">Debt payment</option>
          <option value="reserve">Emergency / bank reserve</option>
          <option value="asset">Verified asset</option>
        </select>
        <select className="select" name="milestoneKey" aria-label="Milestone">
          <option value="">No specific milestone</option>
          {mission.milestones.map((item) => <option value={item.milestoneKey} key={item.id}>{item.title}</option>)}
        </select>
        <input className="field" name="amount" inputMode="numeric" placeholder="Amount in INR" />
        <input className="field" name="note" placeholder="Note or evidence label" />
        <button className="button primary" disabled={Boolean(busy)} type="submit"><Save size={15} /> Record</button>
      </form>
      <div className="mission-ledger-preview">
        <strong>Latest ledger entries</strong>
        {(mission.finances?.allocations ?? []).slice(0, 3).map((item) => <span key={item.id}>{displayTerm(item.category)} - {money(item.amount, hideMoney)}</span>)}
        {!(mission.finances?.allocations ?? []).length ? <span>No financial entries yet.</span> : null}
      </div>
    </section>
  );
}

function MilestoneModal({ milestone, hideMoney, busy, onClose, onSubmit }: { milestone: MissionMilestone; hideMoney: boolean; busy: string | null; onClose: () => void; onSubmit: (path: string, payload: Record<string, unknown>, method?: string) => Promise<void> }) {
  async function update(status?: string) {
    await onSubmit(`/founder-mission/milestones/${milestone.milestoneKey}`, { status }, "PATCH");
    onClose();
  }
  return (
    <div className="mission-modal-layer" role="dialog" aria-modal="true">
      <article className="mission-modal">
        <header><div><p className="eyebrow">Mission detail</p><h2>{milestone.title}</h2></div><button className="button icon" onClick={onClose} type="button">x</button></header>
        <p>{milestone.description}</p>
        <div className="modal-progress"><span style={{ width: `${milestone.progressPercent}%` }} /></div>
        <div className="modal-facts">
          <div><small>Progress</small><strong>{milestone.progressPercent}%</strong></div>
          <div><small>Allocated</small><strong>{money(milestone.allocatedAmount, hideMoney)}</strong></div>
          <div><small>Target</small><strong>{money(milestone.targetAmount, hideMoney)}</strong></div>
          <div><small>Status</small><Pill value={milestone.status} /></div>
        </div>
        <div className="modal-actions">
          <button className="button" disabled={Boolean(busy)} onClick={() => update("PAUSED")} type="button"><Pause size={15} /> Pause</button>
          <button className="button primary" disabled={Boolean(busy)} onClick={() => update("VERIFIED")} type="button"><ShieldCheck size={15} /> Verify completed</button>
        </div>
      </article>
    </div>
  );
}

function HudCard({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return <article className="hud-card"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong><em>{note}</em></div></article>;
}

function MissionMetric({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return <div className="mission-metric"><span>{icon}</span><small>{label}</small><strong>{value}</strong><em>{note}</em></div>;
}

function BossMission({ title, amount, target, hideMoney, tone }: { title: string; amount: number; target: number; hideMoney: boolean; tone: string }) {
  const progress = Math.max(0, Math.min(100, Math.round((amount / target) * 100)));
  return (
    <article className={`boss-card ${tone}`}>
      <div><strong>{title}</strong><span>{progress}%</span></div>
      <p>{money(amount, hideMoney)} / {money(target, hideMoney)}</p>
      <div><span style={{ width: `${progress}%` }} /></div>
    </article>
  );
}

function HistoryRow({ title, detail, date }: { title: string; detail: string; date: string }) {
  return <article className="history-row"><span /><div><strong>{title}</strong><small>{detail}</small><time>{new Date(date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</time></div></article>;
}

function money(value: number, hidden: boolean) {
  if (hidden) return "Rs ******";
  return `Rs ${Math.round(value).toLocaleString("en-IN")}`;
}

function buildTrack(milestones: MissionMilestone[]) {
  return milestones.map((item) => ({ key: item.id, complete: ["COMPLETED", "VERIFIED"].includes(item.status) }));
}

function BriefSpark() {
  return <Sparkles size={16} />;
}

function statusLabel(status: string) {
  return displayTerm(status);
}
