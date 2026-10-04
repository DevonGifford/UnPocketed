import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges class names, letting a later Tailwind utility win over an earlier one
 * in the same group. React Native Reusables components take a `className` prop
 * and merge it over their own defaults with this, which is what makes them
 * restyleable without editing the component.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
