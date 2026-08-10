import { ArrowRight, BadgeDollarSign, Crosshair, DatabaseZap, Gauge, Globe2, ListChecks, Radar, ShieldCheck, Sparkles, Target } from "lucide-react";
import { apiGet } from "../../lib/api";
import { Pill } from "../../components/pill";
import { CandidateCaptureForm, DiscoverTaskLeadsButton, First100MissionButton, PromoteCandidateButton, TaskStatusButton } from "../../components/source-strategy-actions";

export const dynamic = "force-dynamic";

type SourceStrategy = {
  id: string;
  name: string;
  category: string;
  priority: string;
  cost: string;
  ease: string;
  reliabilityScore: number;
  leadQualityScore: number;
  dealPotentialScore: number;
  speedScore: number;
  totalScore: number;
  bestMarkets: string[];
  bestIndustries: string[];
  bestOffers: string[];
  acquisitionMethod: string;
  searchPatterns: string[];
  expectedFields: string[];
  risk: string;
  nextAction: string;
};

export default async function SourceStrategyPage() {
  const [strategy, missions] = await Promise.all([
    apiGet<any>("/source-strategy", { sources: [], strikeNow: [], enrichment: [], immediateMix: [], scoringWeights: {} }),
    apiGet<any[]>("/source-strategy/missions", [])
  ]);
  const strikeNow = strategy.strikeNow || [];
  const sources = strategy.sources || [];
  const freeEasy = sources.filter((source: SourceStrategy) => ["FREE", "FREE_LIMITED"].includes(source.cost) && ["EASY", "MEDIUM"].includes(source.ease));
  const activeMission = missions[0];

  return (
    <main className="page">
      <section className="page-head">
        <div>
          <p className="eyebrow">Source Strategy</p>
          <h1>10000000 journey lead engine</h1>
          <p className="page-subtitle">A business-first source layer for aggressive lead collection without confusing volume with deal quality.</p>
        </div>
        <First100MissionButton />
      </section>

      <section className="source-strategy-hero">
        <div>
          <span><Sparkles size={15} /> Mission rule</span>
          <h2>{strategy.mission || "Aggressive but disciplined real lead collection."}</h2>
          <p>{strategy.rule || "Optimize for real company, reachable contact, visible pain, deal potential and responsible outreach."}</p>
        </div>
        <div className="source-strategy-score">
          <strong>{sources.length}</strong>
          <span>source lanes mapped</span>
          <small>{strikeNow.length} strike-now lanes ready for first attack</small>
        </div>
      </section>

      <section className="metric-grid source-strategy-metrics">
        <Metric label="Free or limited-free" value={freeEasy.length} icon={<BadgeDollarSign size={17} />} />
        <Metric label="Strike now" value={strikeNow.length} icon={<Crosshair size={17} />} />
        <Metric label="Enrichment engines" value={(strategy.enrichment || []).length} icon={<DatabaseZap size={17} />} />
        <Metric label="Avg top score" value={average(strikeNow.map((item: SourceStrategy) => item.totalScore))} icon={<Gauge size={17} />} />
      </section>

      <section className="source-strategy-layout">
        <div className="source-strategy-main">
          <section className="panel">
            <div className="panel-head"><h2><DatabaseZap size={16} /> Collection engine</h2><span className="panel-count">{activeMission ? `${activeMission.collectedCount}/${activeMission.targetCount}` : "Not started"}</span></div>
            <div className="panel-body">
              {activeMission ? <MissionEngine mission={activeMission} /> : (
                <div className="source-engine-empty">
                  <strong>No active 100-lead mission yet.</strong>
                  <span>Click Start 100-lead mission. ProspectPilot will generate lane-wise collection tasks from this strategy map.</span>
                </div>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2><Target size={16} /> First 100 real leads mix</h2><span className="panel-count">Campaign 1</span></div>
            <div className="panel-body first-mix">
              {(strategy.immediateMix || []).map((item: any) => (
                <div key={item.lane}>
                  <strong>{item.count}</strong>
                  <span>{item.lane}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2><Crosshair size={16} /> Strike-now sources</h2><span className="panel-count">{strikeNow.length}</span></div>
            <div className="panel-body source-strategy-cards">
              {strikeNow.map((source: SourceStrategy) => <SourceCard key={source.id} source={source} featured />)}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2><Globe2 size={16} /> Full source catalog</h2><span className="panel-count">{sources.length}</span></div>
            <div className="panel-body source-table-wrap">
              <table className="source-strategy-table">
                <thead><tr><th>Source</th><th>Priority</th><th>Cost</th><th>Ease</th><th>Quality</th><th>Deal</th><th>Next action</th></tr></thead>
                <tbody>
                  {sources.map((source: SourceStrategy) => (
                    <tr key={source.id}>
                      <td><strong>{source.name}</strong><small>{source.category}</small></td>
                      <td><Pill value={source.priority} /></td>
                      <td>{label(source.cost)}</td>
                      <td>{label(source.ease)}</td>
                      <td>{source.leadQualityScore}</td>
                      <td>{source.dealPotentialScore}</td>
                      <td><span>{source.nextAction}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="source-strategy-side">
          <section className="panel">
            <div className="panel-head"><h2><ShieldCheck size={16} /> Scoring</h2></div>
            <div className="panel-body strategy-score-list">
              <Score label="Reliability" value={strategy.scoringWeights?.reliability || 25} />
              <Score label="Lead quality" value={strategy.scoringWeights?.leadQuality || 30} />
              <Score label="Deal potential" value={strategy.scoringWeights?.dealPotential || 30} />
              <Score label="Speed" value={strategy.scoringWeights?.speed || 15} />
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2><ListChecks size={16} /> Free/easy shortlist</h2><span className="panel-count">{freeEasy.length}</span></div>
            <div className="panel-body source-shortlist">
              {freeEasy.slice(0, 10).map((source: SourceStrategy) => (
                <a href={`#${source.id}`} key={source.id}>
                  <strong>{source.name}</strong>
                  <span>{label(source.cost)} · {label(source.ease)} · score {source.totalScore}</span>
                </a>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

function MissionEngine({ mission }: { mission: any }) {
  const progress = Math.min(100, Math.round((mission.collectedCount / Math.max(1, mission.targetCount)) * 100));
  return (
    <div className="source-engine">
      <header>
        <div>
          <strong>{mission.name}</strong>
          <span>{mission.market || "Target market"} · {mission.offer || "Offer"}</span>
        </div>
        <Pill value={mission.status} />
      </header>
      <div className="engine-progress">
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="engine-stats">
        <div><strong>{mission.targetCount}</strong><span>target</span></div>
        <div><strong>{mission.collectedCount}</strong><span>captured</span></div>
        <div><strong>{mission.promotedCount}</strong><span>promoted</span></div>
        <div><strong>{progress}%</strong><span>complete</span></div>
      </div>
      <div className="engine-task-list">
        {mission.tasks.map((task: any) => <MissionTask key={task.id} task={task} offer={mission.offer} />)}
      </div>
    </div>
  );
}

function MissionTask({ task, offer }: { task: any; offer?: string }) {
  const progress = Math.min(100, Math.round((task.collectedCount / Math.max(1, task.targetCount)) * 100));
  return (
    <article className="engine-task">
      <header>
        <div>
          <strong>{task.lane}</strong>
          <span>{task.collectedCount}/{task.targetCount} captured · {task.promotedCount} promoted</span>
        </div>
        <div className="task-actions"><Pill value={task.status} /><TaskStatusButton task={task} /></div>
      </header>
      <div className="engine-progress compact"><span style={{ width: `${progress}%` }} /></div>
      <div className="task-patterns">
        {task.searchPatterns.slice(0, 3).map((pattern: string) => <code key={pattern}>{pattern}</code>)}
      </div>
      <DiscoverTaskLeadsButton task={task} />
      <details>
        <summary>Capture a lead from this lane</summary>
        <CandidateCaptureForm task={task} offer={offer} />
      </details>
      {task.candidates?.length ? (
        <div className="candidate-list">
          {task.candidates.map((candidate: any) => <CandidateRow key={candidate.id} candidate={candidate} />)}
        </div>
      ) : null}
    </article>
  );
}

function CandidateRow({ candidate }: { candidate: any }) {
  return (
    <div className="candidate-row">
      <div>
        <strong>{candidate.companyName}</strong>
        <span>{candidate.email || "No email"} · {candidate.websiteUrl || "No website"} · score {candidate.qualityScore}</span>
      </div>
      <Pill value={candidate.status} />
      <PromoteCandidateButton candidate={candidate} />
    </div>
  );
}

function SourceCard({ source, featured = false }: { source: SourceStrategy; featured?: boolean }) {
  return (
    <article className={featured ? "source-strategy-card featured" : "source-strategy-card"} id={source.id}>
      <header>
        <div>
          <span>{source.category}</span>
          <h3>{source.name}</h3>
        </div>
        <strong>{source.totalScore}</strong>
      </header>
      <div className="source-badges">
        <Pill value={source.priority} />
        <b>{label(source.cost)}</b>
        <b>{label(source.ease)}</b>
      </div>
      <p>{source.acquisitionMethod}</p>
      <div className="source-score-grid">
        <Score label="Reliability" value={source.reliabilityScore} />
        <Score label="Quality" value={source.leadQualityScore} />
        <Score label="Deal" value={source.dealPotentialScore} />
        <Score label="Speed" value={source.speedScore} />
      </div>
      <Section title="Best markets" items={source.bestMarkets} />
      <Section title="Best industries" items={source.bestIndustries} />
      <Section title="Best offers" items={source.bestOffers} />
      <Section title="Search patterns" items={source.searchPatterns.slice(0, 3)} mono />
      <div className="source-next">
        <span>{source.risk}</span>
        <strong><ArrowRight size={14} /> {source.nextAction}</strong>
      </div>
    </article>
  );
}

function Section({ title, items, mono = false }: { title: string; items: string[]; mono?: boolean }) {
  return <div className={mono ? "source-chip-section mono" : "source-chip-section"}><span>{title}</span><div>{items.map((item) => <small key={item}>{item}</small>)}</div></div>;
}

function Score({ label, value }: { label: string; value: number }) {
  return <div className="strategy-score"><span>{label}</span><strong>{value}</strong><i style={{ width: `${Math.min(100, value)}%` }} /></div>;
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <div className="metric"><div className="metric-top"><span className="metric-label">{label}</span>{icon}</div><div className="metric-value">{value}</div></div>;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function label(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
