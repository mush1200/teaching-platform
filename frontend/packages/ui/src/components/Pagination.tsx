import { Button, Paragraph, XStack } from "tamagui";

export type PaginationProps = {
  page: number;
  totalPages: number;
  totalItems?: number;
  disabled?: boolean;
  onPageChange: (nextPage: number) => void;
};

export function Pagination({ page, totalPages, totalItems, disabled, onPageChange }: PaginationProps) {
  const canPrev = page > 1 && !disabled;
  const canNext = page < totalPages && !disabled;

  return (
    <XStack alignItems="center" gap="$3" flexWrap="wrap">
      <Button disabled={!canPrev} onPress={() => onPageChange(page - 1)}>
        上一頁
      </Button>
      <Paragraph>
        第 {page} / {totalPages} 頁
      </Paragraph>
      <Button disabled={!canNext} onPress={() => onPageChange(page + 1)}>
        下一頁
      </Button>
      {typeof totalItems === "number" ? <Paragraph>總筆數：{totalItems}</Paragraph> : null}
    </XStack>
  );
}
