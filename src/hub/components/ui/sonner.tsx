import { Toaster as Sonner, toast } from "sonner";

import { useTheme } from "~/hooks/theme";

/**
 * Toasts for the outcome of an action.
 *
 * An admin surface does a lot of small mutations - approve, send, disable,
 * reassign - and a notice block that pushes the table down for each of them is
 * worse than no feedback at all. These stack in a corner and leave the page
 * where it was.
 */
export const Toaster = () => {
  const { resolved } = useTheme();

  return (
    <Sonner
      theme={resolved}
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "group bg-popover text-popover-foreground border-border rounded-lg border shadow-lg",
          description: "text-muted-foreground",
          actionButton: "bg-primary text-primary-foreground",
        },
      }}
    />
  );
};

export { toast };
