import { Input } from "../ui/Input";

type Props = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
};

export function SearchBar({ value, onChange, id = "explore-search" }: Props) {
  return (
    <div className="max-w-2xl">
      <Input
        id={id}
        label="搜尋"
        type="search"
        placeholder="搜尋教材、主題、年齡…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
    </div>
  );
}
