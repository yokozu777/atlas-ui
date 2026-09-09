"use client";

import { isValidElement, type ReactNode } from "react";
import { toast, type ToastT, type ToastToDismiss } from "sonner";

export type NotificationKind = "error" | "success" | "warning" | "info" | "default";

export type InboxNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  description: string;
  createdAt: number;
  read: boolean;
};

const MAX_ITEMS = 50;
const empty: InboxNotification[] = [];

let items: InboxNotification[] = empty;
const forgottenIds = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeNotificationInbox(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getNotificationInboxSnapshot() {
  return items;
}

export function getNotificationInboxServerSnapshot() {
  return empty;
}

export function nodeToText(value: unknown): string {
  if (value == null || typeof value === "boolean") {
    return "";
  }
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "function") {
    try {
      return nodeToText(value());
    } catch {
      return "";
    }
  }
  if (Array.isArray(value)) {
    return value.map(nodeToText).filter(Boolean).join(" ");
  }
  if (isValidElement(value)) {
    const props = value.props as { children?: ReactNode };
    return nodeToText(props.children);
  }
  return "";
}

function kindFromType(type: ToastT["type"]): NotificationKind | null {
  if (type === "loading") {
    return null;
  }
  if (type === "error" || type === "success" || type === "warning" || type === "info") {
    return type;
  }
  return "default";
}

function ingestToast(raw: ToastT | ToastToDismiss) {
  if ("dismiss" in raw && raw.dismiss && !("title" in raw)) {
    return;
  }
  const toastItem = raw as ToastT;
  const kind = kindFromType(toastItem.type);
  if (kind == null) {
    return;
  }
  const title = nodeToText(toastItem.title);
  const description = nodeToText(toastItem.description);
  if (!title && !description) {
    return;
  }
  const id = String(toastItem.id);
  if (forgottenIds.has(id)) {
    return;
  }
  const existing = items.find((item) => item.id === id);
  const nextTitle = title || description;
  const nextDescription = title ? description : "";
  if (existing) {
    const changed =
      existing.kind !== kind ||
      existing.title !== nextTitle ||
      existing.description !== nextDescription;
    if (!changed) {
      return;
    }
    items = items.map((item) =>
      item.id === id
        ? {
            ...item,
            kind,
            title: nextTitle,
            description: nextDescription,
            read: false,
          }
        : item
    );
    emit();
    return;
  }
  items = [
    {
      id,
      kind,
      title: nextTitle,
      description: nextDescription,
      createdAt: Date.now(),
      read: false,
    },
    ...items,
  ].slice(0, MAX_ITEMS);
  emit();
}

export function ingestSonnerHistory() {
  for (const entry of toast.getHistory()) {
    ingestToast(entry);
  }
}

export function markNotificationInboxRead() {
  if (!items.some((item) => !item.read)) {
    return;
  }
  items = items.map((item) => (item.read ? item : { ...item, read: true }));
  emit();
}

export function clearNotificationInbox() {
  if (items.length === 0) {
    return;
  }
  for (const item of items) {
    forgottenIds.add(item.id);
  }
  items = empty;
  emit();
}
