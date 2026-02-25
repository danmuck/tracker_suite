import {
  Banknote,
  Receipt,
  Repeat,
  Car,
  ShoppingCart,
  CreditCard,
  Gamepad2,
  UtensilsCrossed,
  HeartPulse,
  ArrowLeftRight,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  Banknote,
  Receipt,
  Repeat,
  Car,
  ShoppingCart,
  CreditCard,
  Gamepad2,
  UtensilsCrossed,
  HeartPulse,
  ArrowLeftRight,
  MoreHorizontal,
};

export function getIcon(name: string): LucideIcon {
  return iconMap[name] ?? MoreHorizontal;
}

export default iconMap;
