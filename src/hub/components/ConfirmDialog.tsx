import { type ReactNode, useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

/**
 * The replacement for `window.confirm`.
 *
 * Every destructive action in MailHub has consequences worth spelling out -
 * disabling an admin revokes a whole subtree's sessions, deleting a collection
 * takes its emails - and a browser confirm can show none of that. This one
 * takes a body, and optionally asks the person to type the object's name
 * first, which is the right amount of friction for the handful of actions that
 * cannot be undone.
 */
export const ConfirmDialog = ({
  open,
  onOpenChange,
  title,
  description,
  body,
  confirmLabel = "Confirm",
  destructive = false,
  /** When set, the action stays disabled until this exact text is typed. */
  typeToConfirm,
  onConfirm,
  pending = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  body?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  typeToConfirm?: string | undefined;
  onConfirm: () => void;
  pending?: boolean;
}) => {
  const [typed, setTyped] = useState("");
  const armed = !typeToConfirm || typed === typeToConfirm;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setTyped("");
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        {body}

        {typeToConfirm ? (
          <div className="space-y-2">
            <Label htmlFor="confirm-name">
              Type <span className="font-mono font-semibold">{typeToConfirm}</span> to
              confirm
            </Label>
            <Input
              id="confirm-name"
              value={typed}
              autoComplete="off"
              onChange={(event) => setTyped(event.target.value)}
            />
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={!armed || pending}
            onClick={onConfirm}
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
