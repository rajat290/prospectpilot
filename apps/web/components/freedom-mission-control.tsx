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
  PartyPopper,
  Phone,
  PiggyBank,
  ShieldCheck,
  Sparkles,
  Trophy,
  Vault,
  Zap
} from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
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
  const [hideMoney, setHideMoney] = useState(summary.profile.privacyModeEnabled);
  const latestCelebration = summary.celebrations.find((item) => !item.viewedAt) ?? summary.celebrations[0];
  const nextMilestone = summary.mission.nextMilestone;
  const visualTrack = useMemo(() => buildTrack(summary.milestones), [summary.milestones]);

  return (
    <main className={`page freedom-page${summary.profile.reducedMotionEnabled ? " reduced-motion" : ""}`}>
      <header className="page-head freedom-head">
        <div>
          <p className="eyebrow">Overview</p>
          <h1>Freedom Mission Control</h1>
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
        <HudCard icon={<ShieldCheck size={22} />} label={`Level ${summary.xp.level.level} Founder`} value={summary.xp.level.title} note={`${summary.xp.total.toLocaleString("en-IN")} XP earned`} />
        <HudCard icon={<Coins size={22} />} label="Sales Coins" value={summary.xp.coins.toLocaleString("en-IN")} note="Visual reward wallet" />
        <HudCard icon={<IndianRupee size={22} />} label="Total Collected" value={money(summary.mission.collectedRevenue, hideMoney)} note="Real collected revenue" />
        <HudCard icon={<Zap size={22} />} label="Daily Streak" value={`${summary.profile.streak?.currentDays ?? 0} Days`} note={`Best: ${summary.profile.streak?.longestDays ?? 0} days`} />
        <HudCard icon={<Trophy size={22} />} label="Achievements" value={`${summary.achievements.length} / 42`} note="Unlocked badges" />
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
          <div className="mission-badge"><Trophy size={18} /> {summary.profile.displayName}&apos;s mission</div>
          <h2>{summary.profile.missionName}: {money(summary.mission.targetAmount, hideMoney)}</h2>
          <div className="mission-why">
            <Sparkles size={16} />
            <span>To build true financial freedom, clear pressure, create assets, and win on my own terms.</span>
          </div>
          <div className="freedom-track">
            <div className="freedom-track-meta">
              <strong>{summary.mission.progressPercent}% complete</strong>
              <span>{money(summary.mission.freedomProgressAmount, hideMoney)} real freedom progress</span>
            </div>
            <div className="freedom-progress"><span style={{ width: `${summary.mission.progressPercent}%` }} /></div>
            <div className="freedom-avatar" style={{ left: `${Math.min(96, summary.mission.progressPercent)}%` }}><Zap size={15} /></div>
          </div>
          <div className="pixel-blocks" aria-hidden="true">{Array.from({ length: 36 }).map((_, index) => <span className={index < Math.round(summary.mission.progressPercent / 3) ? "filled" : ""} key={index} />)}</div>
        </div>
        <aside className="level-console">
          <div className="level-ring">
            <span>LVL</span>
            <strong>{summary.xp.level.level}</strong>
          </div>
          <div>
            <p className="eyebrow">Founder level</p>
            <h3>{summary.xp.level.title}</h3>
            <div className="xp-line"><span style={{ width: `${summary.xp.level.progressPercent}%` }} /></div>
            <small>{summary.xp.level.next ? `${summary.xp.level.xpToNext.toLocaleString("en-IN")} XP to ${summary.xp.level.next.title}` : "Final level reached"}</small>
          </div>
          <div className="coin-wallet"><Coins size={16} /><span>{summary.xp.coins.toLocaleString("en-IN")} sales coins</span></div>
        </aside>
      </section>

      <section className="mission-metrics">
        <MissionMetric icon={<IndianRupee size={16} />} label="Collected revenue" value={money(summary.mission.collectedRevenue, hideMoney)} note="Shown separately from wealth" />
        <MissionMetric icon={<ShieldCheck size={16} />} label="Debt repaid" value={money(summary.mission.debtRepaid, hideMoney)} note="Counts toward freedom" />
        <MissionMetric icon={<PiggyBank size={16} />} label="Liquid reserve" value={money(summary.mission.liquidReserve, hideMoney)} note="Emergency + balance" />
        <MissionMetric icon={<BriefSpark />} label="Active pipeline" value={`${summary.mission.pipelineCount}`} note={`${summary.mission.wonDeals} won deals`} />
      </section>

      <section className="freedom-grid">
        <div className="panel mission-panel">
          <div className="panel-head">
            <h2>Daily revenue quests</h2>
            <span className="streak-pill"><CalendarCheck size={13} /> {summary.profile.streak?.currentDays ?? 0}-day streak</span>
          </div>
          <div className="quest-list">
            {summary.quests.map((quest) => (
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
            {!summary.quests.length ? <div className="empty">Quests appear after mission data is initialized.</div> : null}
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
          <h2>Seven milestone roadmap</h2>
          <span>{nextMilestone ? `Next unlock: ${nextMilestone.title}` : "Mission path complete"}</span>
        </div>
        <div className="mission-map">
          <div className="map-line" aria-hidden="true">
            {visualTrack.map((item) => <span key={item.key} className={item.complete ? "complete" : ""} />)}
          </div>
          {summary.milestones.map((milestone) => {
            const Icon = iconMap[milestone.icon as keyof typeof iconMap] ?? Medal;
            return (
              <article className={`milestone-card ${milestone.status.toLowerCase().replaceAll("_", "-")}`} key={milestone.id}>
                <div className="milestone-icon">{milestone.status === "LOCKED" ? <Lock size={18} /> : <Icon size={18} />}</div>
                <div className="milestone-body">
                  <div><strong>{milestone.title}</strong><Pill value={milestone.status} /></div>
                  <p>{milestone.description}</p>
                  <div className="milestone-money"><span>{money(milestone.allocatedAmount, hideMoney)}</span><small>of {money(milestone.targetAmount, hideMoney)}</small></div>
                  <div className="milestone-progress"><span style={{ width: `${milestone.progressPercent}%` }} /></div>
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
            <BossMission title="Debt Freedom" amount={summary.mission.debtRepaid} target={800000} hideMoney={hideMoney} tone="debt" />
            <BossMission title="Rs 1 Crore Final Mission" amount={summary.mission.freedomProgressAmount} target={summary.mission.targetAmount} hideMoney={hideMoney} tone="final" />
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Achievement center</h2><Medal size={17} /></div>
          <div className="achievement-grid">
            {summary.achievements.slice(0, 8).map((achievement) => (
              <article key={achievement.id}>
                <span><Medal size={15} /></span>
                <strong>{achievement.definition.name}</strong>
                <small>{achievement.definition.rarity} / {achievement.definition.category}</small>
              </article>
            ))}
            {!summary.achievements.length ? <div className="empty">Achievements unlock from real ProspectPilot events.</div> : null}
          </div>
        </div>
      </section>

      <section className="mission-metrics founder-floor">
        <MissionMetric icon={<PiggyBank size={16} />} label="Emergency / balance" value={money(summary.mission.liquidReserve, hideMoney)} note="Reserve power" />
        <MissionMetric icon={<Goal size={16} />} label="Active pipeline" value={`${summary.mission.pipelineCount} deals`} note="Not counted as wealth" />
        <MissionMetric icon={<IndianRupee size={16} />} label="This mission" value={money(summary.mission.freedomProgressAmount, hideMoney)} note={`${summary.mission.progressPercent}% of target`} />
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
            {summary.recentWins.map((win) => <HistoryRow key={win.id} title={win.title} detail={win.message} date={win.createdAt} />)}
            {!summary.recentWins.length ? <div className="empty">No wins recorded yet.</div> : null}
          </div>
          <div>
            <h3>Recent XP</h3>
            {summary.xp.recent.slice(0, 7).map((item) => <HistoryRow key={item.id} title={`+${item.finalXp} XP`} detail={item.reason} date={item.createdAt} />)}
            {!summary.xp.recent.length ? <div className="empty">XP starts after real actions are detected.</div> : null}
          </div>
          <div>
            <h3>Guardrails</h3>
            {summary.guardrails.map((item) => <div className="guardrail" key={item}><ShieldCheck size={14} /><span>{item}</span></div>)}
          </div>
        </div>
      </section>
    </main>
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
