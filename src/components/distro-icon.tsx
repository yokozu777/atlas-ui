import type { ReactNode } from "react";
import { Server } from "lucide-react";

import {
  distroKindFromName,
  type DistroKind,
} from "@/lib/distro-kind";
import { cn } from "@/lib/utils";

function SvgMark({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      {children}
    </svg>
  );
}

export function DistroIcon({
  kind,
  name,
  className,
}: {
  kind?: DistroKind;
  name?: string | null;
  className?: string;
}) {
  const resolved = kind ?? distroKindFromName(name);
  const cls = cn("size-3.5 shrink-0", className);

  if (resolved === "ubuntu") {
    return (
      <SvgMark className={cls}>
        <circle cx="12" cy="12" r="10" fill="#E95420" />
        <circle
          cx="12"
          cy="12"
          r="3.15"
          fill="none"
          stroke="#fff"
          strokeWidth="1.7"
        />
        <circle cx="12" cy="4.7" r="1.65" fill="#fff" />
        <circle cx="18.3" cy="15.65" r="1.65" fill="#fff" />
        <circle cx="5.7" cy="15.65" r="1.65" fill="#fff" />
      </SvgMark>
    );
  }
  if (resolved === "debian") {
    return (
      <SvgMark className={cls}>
        <circle cx="12" cy="12" r="10" fill="#A80030" />
        <path
          fill="#fff"
          d="M13.8 6.05c2.7.45 4.65 2.7 4.65 5.45 0 3.35-2.7 6-6.35 6.15-2.85.1-5.35-1.45-6.4-3.95-.2-.5.4-.85.85-.55 1.25 1.85 3.35 2.95 5.55 2.8 2.7-.2 4.75-2.5 4.75-5.2 0-2.25-1.55-4.15-3.7-4.55-1.7-.3-3.35.45-4 1.9-.15.4-.8.3-.9-.15C7.7 6.2 10.4 5.55 13.8 6.05z"
        />
      </SvgMark>
    );
  }
  if (resolved === "oracle") {
    return (
      <SvgMark className={cls}>
        <circle cx="12" cy="12" r="10" fill="#C74634" />
        <circle
          cx="12"
          cy="12"
          r="5.4"
          fill="none"
          stroke="#fff"
          strokeWidth="2.15"
        />
      </SvgMark>
    );
  }
  if (resolved === "rhel") {
    return (
      <SvgMark className={cls}>
        <circle cx="12" cy="12" r="10" fill="#EE0000" />
        <path
          fill="#fff"
          d="M7.2 14.2c1.1-2.6 2.7-4.4 4.8-5.4 1.3-.6 2.5-.7 3.4-.4.6.2.7.9.2 1.2-1 .6-1.8 1.7-2.2 3.2-.3 1.2.2 2.4 1.5 2.7 1.5.3 2.6-.8 2.9-2.1.1-.5.8-.6.9-.1.3 2.1-1.4 4.1-3.7 4.1-2.6 0-4.4-1.7-4.8-3.2Z"
        />
      </SvgMark>
    );
  }
  if (resolved === "rocky") {
    return (
      <SvgMark className={cls}>
        <circle cx="12" cy="12" r="10" fill="#10B981" />
        <path fill="#fff" d="M5.5 16.5 9.2 10l2.6 3.4L15 8.5l3.5 8H5.5z" />
      </SvgMark>
    );
  }
  if (resolved === "alma") {
    return (
      <SvgMark className={cls}>
        <circle cx="12" cy="12" r="10" fill="#0F62FE" />
        <path
          fill="#fff"
          d="M12 6.4 16.6 17h-2.1l-.9-2.2H10.4L9.5 17H7.4L12 6.4zm-1.1 6.7h2.2L12 10.2l-1.1 2.9z"
        />
      </SvgMark>
    );
  }
  if (resolved === "fedora") {
    return (
      <SvgMark className={cls}>
        <circle cx="12" cy="12" r="10" fill="#3C6EB4" />
        <path
          fill="#fff"
          d="M10.2 7.2h3.1c2.3 0 3.7 1.3 3.7 3.2 0 1.6-1 2.7-2.5 3.1l2.6 3.3h-2.4l-2.3-3H11.4v3H9.4V7.2h.8zm1.2 5.1h1.9c1.1 0 1.7-.6 1.7-1.5s-.6-1.5-1.7-1.5h-1.9v3z"
        />
      </SvgMark>
    );
  }
  if (resolved === "alpine") {
    return (
      <SvgMark className={cls}>
        <circle cx="12" cy="12" r="10" fill="#0D597F" />
        <path fill="#fff" d="m12 5.8 6.4 10.4H5.6L12 5.8z" />
        <path fill="#0D597F" d="m12 9.4 3.6 5.8H8.4L12 9.4z" />
      </SvgMark>
    );
  }
  if (resolved === "windows") {
    return (
      <SvgMark className={cls}>
        <rect width="24" height="24" rx="5" fill="#0078D4" />
        <path
          fill="#fff"
          d="M6.4 6.4h4.7v4.7H6.4V6.4zm6.5 0h4.7v4.7h-4.7V6.4zM6.4 12.9h4.7v4.7H6.4v-4.7zm6.5 0h4.7v4.7h-4.7v-4.7z"
        />
      </SvgMark>
    );
  }
  return <Server className={cn(cls, "text-muted-foreground")} />;
}
