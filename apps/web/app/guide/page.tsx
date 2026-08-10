import { BookOpenCheck } from "lucide-react";
import { Glossary } from "../../components/glossary";
import { InteractiveTutorial } from "../../components/interactive-tutorial";

export default function GuidePage() {
  return (
    <main className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Guide & glossary</p>
          <h1>Guide & glossary</h1>
          <p className="subtle">One workflow overview, eight practical steps, and a searchable dictionary. Progress stays saved in this browser.</p>
        </div>
        <span className="button"><BookOpenCheck size={15} /> Practical workflow</span>
      </header>
      <InteractiveTutorial />
      <Glossary />
    </main>
  );
}
