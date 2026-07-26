export function Pill({ value }: { value: string }) {
  const label = value.replaceAll("_", " ");
  return <span className={`pill ${label.toLowerCase().replaceAll(" ", "-")}`}>{label}</span>;
}
