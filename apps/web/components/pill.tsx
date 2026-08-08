import { getTerm, humanizeTerm, normalizeTerm } from "../lib/terminology";

export function Pill({ value }: { value: string }) {
  const normalized = normalizeTerm(value);
  const term = getTerm(value);
  const label = term?.label ?? humanizeTerm(value);
  const explanation = term ? `${term.meaning}${term.nextAction ? ` Next: ${term.nextAction}` : ""}` : label;

  return (
    <span className="status-help" tabIndex={0} aria-label={`${label}. ${explanation}`}>
      <span className={`pill ${normalized.toLowerCase().replaceAll("_", "-")}`}>{label}</span>
      {term ? <span className="status-help-popover" role="tooltip"><strong>{label}</strong><span>{term.meaning}</span>{term.nextAction ? <small>Next: {term.nextAction}</small> : null}</span> : null}
    </span>
  );
}
