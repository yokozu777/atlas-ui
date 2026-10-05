"use client";

import { ChevronDown } from "lucide-react";
import { Combobox } from "@base-ui/react/combobox";

import { cn } from "@/lib/utils";

export type SuggestOption = {
  value: string;
  label: string;
};

export function SuggestInput({
  id,
  value,
  options,
  invalid,
  highlight,
  placeholder,
  ariaLabel,
  className,
  onChange,
  onPick,
}: {
  id?: string;
  value: string;
  options: SuggestOption[];
  invalid?: boolean;
  highlight?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  onChange: (value: string) => void;
  onPick?: (value: string) => void;
}) {
  const labels = new Map(options.map((option) => [option.value, option.label]));
  const items = options.map((option) => option.value);
  const selected = items.includes(value) ? value : null;
  return (
    <Combobox.Root
      items={items}
      filteredItems={items}
      filter={null}
      value={selected}
      inputValue={value}
      onValueChange={(next) => {
        if (typeof next !== "string") return;
        onChange(next);
        onPick?.(next);
      }}
      onInputValueChange={(next, details) => {
        // Closing the list writes the selected item back into the input.
        // A typed name that is not in the list has no selection, so that
        // reset would wipe it. Keep the text the user entered.
        if (details.reason === "input-clear" && next === "" && value !== "") {
          details.cancel();
          return;
        }
        onChange(next);
      }}
    >
      <div className="relative min-w-0">
        <Combobox.Input
          id={id}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          className={cn(
            "h-8 w-full rounded-lg border border-foreground/20 bg-background pr-8 pl-2.5 font-mono text-[13px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive",
            highlight && "border-amber-400/80 ring-2 ring-amber-400/40",
            className,
          )}
        />
        <Combobox.Trigger
          className="absolute top-1/2 right-1 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={ariaLabel ? `${ariaLabel} options` : "Show options"}
        >
          <ChevronDown className="size-3.5" />
        </Combobox.Trigger>
      </div>
      <Combobox.Portal>
        <Combobox.Positioner className="z-[80]" sideOffset={4}>
          <Combobox.Popup className="max-h-56 w-(--anchor-width) overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
            <Combobox.Empty className="px-2 py-1.5 text-xs text-muted-foreground">
              {value.trim() ? `Use "${value.trim()}"` : "No matches"}
            </Combobox.Empty>
            <Combobox.List>
              {(item: string) => (
                <Combobox.Item
                  key={item}
                  value={item}
                  className="cursor-default rounded-md px-2 py-1 font-mono text-[13px] outline-none data-highlighted:bg-muted"
                >
                  {labels.get(item) || item}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
