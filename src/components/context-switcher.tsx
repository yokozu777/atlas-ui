"use client";

import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { Virtuoso } from "react-virtuoso";

import { cn } from "@/lib/utils";

export type ContextSwitcherGroup<T> = {
  id: string;
  label: string;
  items: T[];
};

const ITEM_CLASS =
  "flex w-full cursor-default items-center gap-2 rounded-md px-2.5 py-1.5 text-left outline-none hover:bg-white/10 data-highlighted:bg-white/10 data-selected:bg-white/10";

const VIRTUOSO_THRESHOLD = 80;

type FlatRow<T> =
  | { type: "label"; id: string; label: string }
  | { type: "item"; key: string; item: T };

export function ContextSwitcher<T>({
  items,
  groups,
  value,
  onValueChange,
  open,
  onOpenChange,
  filter,
  itemToStringLabel,
  itemKey,
  isItemEqualToValue,
  renderItem,
  trigger,
  header,
  footer,
  emptyLabel,
  placeholder,
  status,
  popupClassName,
  align = "start",
  side = "bottom",
  closeOnSelect = true,
  onItemHighlighted,
  onPopupKeyDown,
  resetKey,
  isItemDisabled,
  itemClassName,
}: {
  items: T[];
  groups: ContextSwitcherGroup<T>[];
  value: T | null;
  onValueChange: (value: T) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filter: (item: T, query: string) => boolean;
  itemToStringLabel: (item: T) => string;
  itemKey: (item: T) => string;
  isItemEqualToValue: (a: T, b: T) => boolean;
  renderItem: (item: T) => ReactNode;
  trigger: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  emptyLabel: string;
  placeholder: string;
  status?: ReactNode;
  popupClassName?: string;
  align?: "start" | "end";
  side?: "top" | "bottom" | "left" | "right";
  closeOnSelect?: boolean;
  onItemHighlighted?: (value: T | undefined) => void;
  onPopupKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  resetKey?: string;
  isItemDisabled?: (item: T) => boolean;
  itemClassName?: (item: T) => string | undefined;
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    setQuery("");
  }, [resetKey]);

  const visibleGroups = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => filter(item, query)),
        }))
        .filter((group) => group.items.length > 0),
    [filter, groups, query],
  );

  const totalItems = visibleGroups.reduce(
    (sum, group) => sum + group.items.length,
    0,
  );
  const virtualize = totalItems >= VIRTUOSO_THRESHOLD;

  const flatRows = useMemo<FlatRow<T>[]>(() => {
    if (!virtualize) {
      return [];
    }
    const rows: FlatRow<T>[] = [];
    for (const group of visibleGroups) {
      rows.push({ type: "label", id: group.id, label: group.label });
      for (const item of group.items) {
        rows.push({ type: "item", key: itemKey(item), item });
      }
    }
    return rows;
  }, [itemKey, virtualize, visibleGroups]);

  return (
    <Combobox.Root
      key={resetKey ?? "context"}
      items={items}
      value={value}
      inputValue={query}
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setQuery("");
        }
      }}
      onInputValueChange={(next) => setQuery(next)}
      onValueChange={(row) => {
        if (!row || isItemDisabled?.(row)) {
          return;
        }
        if (closeOnSelect) {
          onOpenChange(false);
        }
        onValueChange(row);
      }}
      itemToStringLabel={itemToStringLabel}
      isItemEqualToValue={isItemEqualToValue}
      filter={filter}
      autoHighlight
      onItemHighlighted={(highlighted) => onItemHighlighted?.(highlighted)}
    >
      {trigger}
      <Combobox.Portal>
        <Combobox.Positioner
          className="isolate z-50 outline-none"
          side={side}
          align={align}
          sideOffset={4}
          collisionPadding={8}
        >
          <Combobox.Popup
            className={cn(
              "flex max-h-96 w-80 min-w-72 origin-(--transform-origin) flex-col overflow-hidden rounded-lg bg-background p-2 text-foreground shadow-lg ring-1 ring-foreground/15 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
              popupClassName,
            )}
            onKeyDown={onPopupKeyDown}
          >
            {header}
            <Combobox.Input
              placeholder={placeholder}
              className="mb-2 h-8 w-full rounded-md border border-input bg-transparent px-3 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              onKeyDown={onPopupKeyDown}
            />
            <Combobox.Status className="px-2.5 pb-1 text-xs text-muted-foreground empty:hidden">
              {status}
            </Combobox.Status>
            <Combobox.Empty className="px-2.5 py-3 text-center text-xs text-muted-foreground">
              {emptyLabel}
            </Combobox.Empty>
            <Combobox.List
              className={cn(
                "min-h-0 max-h-80 flex-1 overflow-y-auto outline-none",
                virtualize && "h-80",
              )}
            >
              {virtualize ? (
                <Virtuoso
                  data={flatRows}
                  className="h-full"
                  itemContent={(_, row) =>
                    row.type === "label" ? (
                      <div className="px-2.5 py-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                        {row.label}
                      </div>
                    ) : (
                      <Combobox.Item
                        key={row.key}
                        value={row.item}
                        disabled={isItemDisabled?.(row.item)}
                        className={cn(ITEM_CLASS, itemClassName?.(row.item))}
                        onClick={() => {
                          if (!isItemDisabled?.(row.item)) {
                            onValueChange(row.item);
                          }
                        }}
                      >
                        {renderItem(row.item)}
                      </Combobox.Item>
                    )
                  }
                />
              ) : (
                visibleGroups.map((group) => (
                  <Combobox.Group
                    key={group.id}
                    items={group.items}
                    className="mb-1 last:mb-0"
                  >
                    <Combobox.GroupLabel className="px-2.5 py-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                      {group.label}
                    </Combobox.GroupLabel>
                    <Combobox.Collection>
                      {(item: T) => (
                        <Combobox.Item
                          key={itemKey(item)}
                          value={item}
                          disabled={isItemDisabled?.(item)}
                          className={cn(ITEM_CLASS, itemClassName?.(item))}
                          onClick={() => {
                            if (!isItemDisabled?.(item)) {
                              onValueChange(item);
                            }
                          }}
                        >
                          {renderItem(item)}
                        </Combobox.Item>
                      )}
                    </Combobox.Collection>
                  </Combobox.Group>
                ))
              )}
            </Combobox.List>
            {footer ? (
              <div className="mt-2 flex flex-col gap-1 border-t border-white/10 pt-2">
                {footer}
              </div>
            ) : null}
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

export function ContextSwitcherCheck({ children }: { children: ReactNode }) {
  return (
    <Combobox.ItemIndicator className="ml-auto shrink-0 text-foreground">
      {children}
    </Combobox.ItemIndicator>
  );
}

export { Combobox as ContextCombobox };
