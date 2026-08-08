import { apiGet } from "../../lib/api";
import { FreedomMissionControl, type FounderMissionSummary } from "../../components/freedom-mission-control";

const fallback: FounderMissionSummary = {
  profile: {
    displayName: "Rajat Tomar",
    missionName: "Freedom Mission",
    missionTargetAmount: 10000000,
    privacyModeEnabled: false,
    reducedMotionEnabled: false,
    soundEnabled: false,
    disciplineMode: "ADVISORY",
    streak: { currentDays: 0, longestDays: 0 }
  },
  mission: {
    targetAmount: 10000000,
    freedomProgressAmount: 0,
    progressPercent: 0,
    collectedRevenue: 0,
    pipelineCount: 0,
    wonDeals: 0,
    debtRepaid: 0,
    liquidReserve: 0,
    verifiedInvestmentValue: 0,
    nextMilestone: null,
    formula: "Freedom Progress = verified debt repaid + liquid reserve + verified investment value + completed personal/asset/vehicle allocations."
  },
  xp: {
    total: 0,
    recent: [],
    level: { level: 1, title: "Starter", requiredXp: 0, next: { level: 2, title: "Builder", requiredXp: 500 }, progressPercent: 0, xpIntoLevel: 0, xpToNext: 500 },
    coins: 0,
    lifetimeCoins: 0
  },
  milestones: [],
  quests: [],
  achievements: [],
  celebrations: [],
  recentWins: [],
  guardrails: []
};

export default async function OverviewMissionPage() {
  const summary = await apiGet<FounderMissionSummary>("/founder-mission", fallback);
  return <FreedomMissionControl summary={summary} />;
}
