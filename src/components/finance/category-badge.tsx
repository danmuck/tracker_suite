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
      variant="outline"
      className="text-xs gap-1"
      // Tinted from the category colour so it sits with the theme in light and dark
      style={{
        backgroundColor: `color-mix(in oklab, ${category.color} 14%, transparent)`,
        borderColor: `color-mix(in oklab, ${category.color} 35%, transparent)`,
        color: `color-mix(in oklab, ${category.color} 65%, var(--foreground))`,
      }}
    >
      <Icon className="h-3 w-3" />
      {category.name}
    </Badge>
  );
}
