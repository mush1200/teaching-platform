import type { MockMaterial } from "../../lib/mock-data";
import { MaterialCard } from "../materials/MaterialCard";

type Props = {
  materials: MockMaterial[];
  trackRecent?: boolean;
};

export function MaterialCarousel({ materials, trackRecent }: Props) {
  if (materials.length === 0) return null;
  return (
    <div className="-mx-1">
      <div
        className="flex snap-x snap-mandatory gap-6 overflow-x-auto pb-2 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] md:grid md:grid-cols-2 md:gap-6 md:overflow-visible lg:grid-cols-4 [&::-webkit-scrollbar]:hidden"
        role="list"
        aria-label="橫向教材列表"
      >
        {materials.map((m) => (
          <div key={m.id} className="w-[min(100%,260px)] shrink-0 snap-start md:w-auto" role="listitem">
            <MaterialCard material={m} trackRecent={trackRecent} />
          </div>
        ))}
      </div>
    </div>
  );
}
