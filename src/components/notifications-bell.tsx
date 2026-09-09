"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import {
  Bell,
  CircleCheckIcon,
  InfoIcon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useSonner } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  clearNotificationInbox,
  getNotificationInboxServerSnapshot,
  getNotificationInboxSnapshot,
  ingestSonnerHistory,
  markNotificationInboxRead,
  subscribeNotificationInbox,
  type InboxNotification,
  type NotificationKind,
} from "@/lib/notification-inbox";
import { cn } from "@/lib/utils";

function KindIcon({ kind }: { kind: NotificationKind }) {
  if (kind === "error") {
    return <OctagonXIcon className="mt-0.5 size-4 text-destructive" />;
  }
  if (kind === "success") {
    return <CircleCheckIcon className="mt-0.5 size-4 text-success" />;
  }
  if (kind === "warning") {
    return <TriangleAlertIcon className="mt-0.5 size-4 text-warning" />;
  }
  if (kind === "info") {
    return <InfoIcon className="mt-0.5 size-4 text-info" />;
  }
  return <Bell className="mt-0.5 size-4 text-muted-foreground" />;
}

function formatAgo(createdAt: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - createdAt) / 1000));
  if (seconds < 60) {
    return "just now";
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  return `${Math.floor(hours / 24)}d`;
}

export function NotificationsBell() {
  const { toasts } = useSonner();
  const items = useSyncExternalStore(
    subscribeNotificationInbox,
    getNotificationInboxSnapshot,
    getNotificationInboxServerSnapshot
  );

  useLayoutEffect(() => {
    ingestSonnerHistory();
  }, [toasts]);

  const unread = items.reduce((count, item) => count + (item.read ? 0 : 1), 0);

  return (
    <DropdownMenu
      modal={false}
      onOpenChange={(open) => {
        if (open) {
          markNotificationInboxRead();
        }
      }}
    >
      <DropdownMenuTrigger
        aria-label="Notifications"
        title="Notifications"
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "relative")}
      >
        <Bell />
        {unread > 0 ? (
          <span className="absolute top-0.5 right-0.5 flex size-4 min-w-4 items-center justify-center rounded-full bg-destructive px-0.5 text-[10px] font-medium text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-80 min-w-80 bg-background p-0"
        id="notifications-inbox"
      >
        <div className="flex items-center justify-between gap-2 px-2.5 py-2">
          <p className="text-sm font-medium">Notifications</p>
          {items.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => clearNotificationInbox()}
            >
              Clear
            </Button>
          ) : null}
        </div>
        <DropdownMenuSeparator className="mx-0" />
        {items.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            No notifications yet
          </p>
        ) : (
          <div className="max-h-80 overflow-y-auto py-1">
            {items.map((item) => (
              <NotificationRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationRow({ item }: { item: InboxNotification }) {
  return (
    <DropdownMenuItem
      closeOnClick={false}
      className="items-start gap-2 px-2.5 py-2 whitespace-normal"
    >
      <KindIcon kind={item.kind} />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-5 break-words">{item.title}</p>
        {item.description ? (
          <p className="mt-0.5 text-xs leading-4 text-muted-foreground break-words">
            {item.description}
          </p>
        ) : null}
        <p className="mt-1 text-[11px] text-muted-foreground">{formatAgo(item.createdAt)}</p>
      </div>
    </DropdownMenuItem>
  );
}
