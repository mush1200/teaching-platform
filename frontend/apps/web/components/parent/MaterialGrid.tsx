import type { MockMaterial } from "../../lib/view-models";
import { MaterialCard } from "../materials/MaterialCard";

type Props = {
  materials: MockMaterial[];
  trackRecent?: boolean;
  /** Extra grid classes */
  className?: string;
};

/** Marketplace home：桌機 4 欄、平板 2 欄、手機 1 欄 */
export function MaterialGrid({ materials, trackRecent, className = "" }: Props) {
  return (
    <div
      className={`grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 ${className}`.trim()}
    >
      {materials.map((m) => (
        <MaterialCard key={m.id} material={m} trackRecent={trackRecent} />
      ))}
    </div>
  );
}
