import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Une clases de Tailwind resolviendo conflictos (la última gana). La usan
// los componentes de shadcn/ui en src/components/ui/.
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
