import { BookOpenCheck } from "lucide-react";
import { InteractiveTutorial } from "../../components/interactive-tutorial";

export default function GuidePage() {
  return (
    <main className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Interactive product guide</p>
          <h1>From directory to first freelance conversation</h1>
          <p className="subtle">Seven short lessons. Your progress stays saved in this browser.</p>
        </div>
        <span className="button"><BookOpenCheck size={15} /> Practical workflow</span>
      </header>
      <InteractiveTutorial />
    </main>
  );
}
