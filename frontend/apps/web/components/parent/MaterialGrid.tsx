import type { MockMaterial } from "../../lib/mock-data";
import { MaterialCard } from "../materials/MaterialCard";

type Props = {
  materials: MockMaterial[];
  trackRecent?: boolean;
  /** Extra grid classes */
  className?: string;
};

export function MaterialGrid({ materials, trackRecent, className = "" }: Props) {
  return (
    <div
      className={`grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 ${className}`.trim()}
    >
      {materials.map((m) => (
        <MaterialCard key={m.id} material={m} trackRecent={trackRecent} />
      ))}
    </div>
  );
}
