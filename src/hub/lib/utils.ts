import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names, letting a caller's utility win over a component's default
 * rather than both landing in the class list and the cascade deciding.
 */
export const cn = (...inputs: Array<ClassValue>) => twMerge(clsx(inputs));
