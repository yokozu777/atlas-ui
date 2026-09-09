"use client";

import {
  ArrowDown,
  ChevronDown,
  ChevronUp,
  Download,
  MoreHorizontal,
  Search,
  WrapText,
} from "lucide-react";
import type { RefObject } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import type { LogCounts, LogFilter } from "@/lib/execution-log";
import { cn } from "@/lib/utils";

const FILTERS: { id: LogFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "errors", label: "Errors" },
  { id: "warnings", label: "Warnings" },
  { id: "info", label: "Info" },
];

export function LogToolbar({
  query,
  onQueryChange,
  searchRef,
  matchIndex,
  matchCount,
  onPrevMatch,
  onNextMatch,
  filter,
  onFilterChange,
  counts,
  follow,
  onFollowChange,
  wrap,
  onWrapChange,
  onPrevError,
  onNextError,
  errorCount,
  onCopyAll,
  onCopyVisible,
  onDownload,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  matchIndex: number;
  matchCount: number;
  onPrevMatch: () => void;
  onNextMatch: () => void;
  filter: LogFilter;
  onFilterChange: (value: LogFilter) => void;
  counts: LogCounts;
  follow: boolean;
  onFollowChange: (value: boolean) => void;
  wrap: boolean;
  onWrapChange: (value: boolean) => void;
  onPrevError: () => void;
  onNextError: () => void;
  errorCount: number;
  onCopyAll: () => void;
  onCopyVisible: () => void;
  onDownload: () => void;
}) {
  return (
    <div
      data-slot="log-toolbar"
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-foreground/10 px-3 py-2"
    >
      <InputGroup className="h-8 min-w-[12rem] flex-1 md:max-w-sm">
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          ref={searchRef}
          className="h-8"
          value={query}
          placeholder="Search logs..."
          aria-label="Search logs"
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (event.shiftKey) {
                onPrevMatch();
              } else {
                onNextMatch();
              }
            }
            if (event.key === "Escape") {
              onQueryChange("");
            }
          }}
        />
        {matchCount > 0 ? (
          <InputGroupAddon align="inline-end" className="gap-0.5">
            <span className="px-1 font-mono text-[11px] text-muted-foreground">
              {matchIndex + 1}/{matchCount}
            </span>
            <InputGroupButton
              size="icon-xs"
              aria-label="Previous match"
              onClick={onPrevMatch}
            >
              <ChevronUp />
            </InputGroupButton>
            <InputGroupButton
              size="icon-xs"
              aria-label="Next match"
              onClick={onNextMatch}
            >
              <ChevronDown />
            </InputGroupButton>
          </InputGroupAddon>
        ) : query ? (
          <InputGroupAddon align="inline-end">
            <span className="px-1 font-mono text-[11px] text-muted-foreground">
              0/0
            </span>
          </InputGroupAddon>
        ) : (
          <InputGroupAddon align="inline-end" className="hidden sm:flex">
            <Kbd className="text-[10px]">⌘F</Kbd>
          </InputGroupAddon>
        )}
      </InputGroup>

      <div className="flex items-center rounded-lg border border-input p-0.5">
        {FILTERS.map((item) => (
          <Button
            key={item.id}
            type="button"
            size="xs"
            variant="ghost"
            aria-pressed={filter === item.id}
            className={cn(
              "rounded-md",
              filter === item.id && "bg-white/10 text-foreground",
            )}
            onClick={() => onFilterChange(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      <p className="hidden font-mono text-[11px] text-muted-foreground lg:block">
        <span className="text-destructive">Errors {counts.errors.toLocaleString()}</span>
        <span className="px-1.5">·</span>
        <span className="text-warning">Warnings {counts.warnings.toLocaleString()}</span>
        <span className="px-1.5">·</span>
        Lines {counts.lines.toLocaleString()}
      </p>

      <div className="ml-auto flex items-center gap-1.5">
        <Button
          type="button"
          size="xs"
          variant={follow ? "secondary" : "outline"}
          aria-pressed={follow}
          onClick={() => onFollowChange(!follow)}
        >
          <ArrowDown />
          Follow
        </Button>
        <Button
          type="button"
          size="xs"
          variant={wrap ? "secondary" : "outline"}
          aria-pressed={wrap}
          className="hidden sm:inline-flex"
          onClick={() => onWrapChange(!wrap)}
        >
          <WrapText />
          Wrap
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="hidden md:inline-flex"
          disabled={errorCount === 0}
          onClick={onPrevError}
        >
          <ChevronUp />
          Error
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="hidden md:inline-flex"
          disabled={errorCount === 0}
          onClick={onNextError}
        >
          <ChevronDown />
          Error
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="hidden lg:inline-flex"
          onClick={onDownload}
        >
          <Download />
          Download
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Log actions"
            className={cn(
              buttonVariants({ variant: "outline", size: "icon-xs" }),
              "lg:hidden",
            )}
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuItem onClick={() => onWrapChange(!wrap)}>
              {wrap ? "Unwrap lines" : "Wrap lines"}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={errorCount === 0} onClick={onPrevError}>
              Previous error
            </DropdownMenuItem>
            <DropdownMenuItem disabled={errorCount === 0} onClick={onNextError}>
              Next error
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onCopyVisible}>Copy visible</DropdownMenuItem>
            <DropdownMenuItem onClick={onCopyAll}>Copy all</DropdownMenuItem>
            <DropdownMenuItem onClick={onDownload}>Download log</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              buttonVariants({ variant: "outline", size: "xs" }),
              "hidden lg:inline-flex",
            )}
          >
            Copy
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onCopyVisible}>Copy visible</DropdownMenuItem>
            <DropdownMenuItem onClick={onCopyAll}>Copy all</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
