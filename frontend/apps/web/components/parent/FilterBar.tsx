import { Card } from "../ui/Card";
import { AgeFilter } from "./AgeFilter";
import { PriceFilter, type PriceMode } from "./PriceFilter";
import { RatingFilter } from "./RatingFilter";

type Props = {
  age: string;
  onAgeChange: (v: string) => void;
  priceMode: PriceMode;
  onPriceModeChange: (m: PriceMode) => void;
  priceMin: string;
  priceMax: string;
  onPriceMinChange: (v: string) => void;
  onPriceMaxChange: (v: string) => void;
  minRating4: boolean;
  onMinRating4Change: (v: boolean) => void;
};

export function FilterBar({
  age,
  onAgeChange,
  priceMode,
  onPriceModeChange,
  priceMin,
  priceMax,
  onPriceMinChange,
  onPriceMaxChange,
  minRating4,
  onMinRating4Change,
}: Props) {
  return (
    <Card level="flat" padding="md" className="border-[#E5E7EB]/80">
      <p className="mb-3 text-sm font-bold text-[#1F2937]">進階篩選</p>
      <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:gap-6">
        <AgeFilter value={age} onChange={onAgeChange} />
        <PriceFilter
          mode={priceMode}
          onModeChange={onPriceModeChange}
          priceMin={priceMin}
          priceMax={priceMax}
          onPriceMinChange={onPriceMinChange}
          onPriceMaxChange={onPriceMaxChange}
        />
        <RatingFilter minRating4={minRating4} onChange={onMinRating4Change} />
      </div>
    </Card>
  );
}
