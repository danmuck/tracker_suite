import { Badge } from "@/components/ui/badge";
import { getIcon } from "@/lib/icon-map";
import type { Category } from "@/types/finance/category";

interface CategoryBadgeProps {
  categoryName: string;
  categories: Category[];
}

export function CategoryBadge({ categoryName, categories }: CategoryBadgeProps) {
  const category = categories.find(
    (c) => c.name.toLowerCase() === categoryName.toLowerCase()
  );

  if (!category) {
    return (
      <Badge variant="secondary" className="text-xs">
        {categoryName}
      </Badge>
    );
  }

  const Icon = getIcon(category.icon);

  return (
    <Badge
      className="text-xs gap-1 text-white"
      style={{ backgroundColor: category.color }}
    >
      <Icon className="h-3 w-3" />
      {category.name}
    </Badge>
  );
}
