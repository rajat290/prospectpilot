import { Info } from "lucide-react";

export function ContextHelp({
  title,
  children,
  compact = false
}: {
  title: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`context-help${compact ? " compact" : ""}`}>
      <Info size={15} />
      <div>
        <strong>{title}</strong>
        <span>{children}</span>
      </div>
    </div>
  );
}

export function FieldHelp({ children }: { children: React.ReactNode }) {
  return <span className="field-help">{children}</span>;
}
