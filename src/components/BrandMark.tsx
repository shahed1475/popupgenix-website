// PopupGenix mark: four blocks turning around an open centre.
// Uses currentColor, so `text-primary` gives emerald #1A7A5E and `text-accent` jade #5FB89A.
interface BrandMarkProps {
  className?: string;
  title?: string;
}

const BLOCKS = [
  { x: 39, y: 39, width: 106, height: 58 },
  { x: 159, y: 39, width: 58, height: 106 },
  { x: 111, y: 159, width: 106, height: 58 },
  { x: 39, y: 111, width: 58, height: 106 },
];

export function BrandMark({ className, title = "PopupGenix" }: BrandMarkProps) {
  return (
    <svg viewBox="0 0 256 256" className={className} role="img" aria-label={title} fill="currentColor">
      {BLOCKS.map((b) => (
        <rect key={`${b.x}-${b.y}`} {...b} rx="14" />
      ))}
    </svg>
  );
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className="text-[#0D0F0E] dark:text-white">Popup</span>
      <span className="text-primary">Genix</span>
    </span>
  );
}
