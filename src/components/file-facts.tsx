export type FileFactsMeta = {
  modifiedAt?: string | null;
  createdAt?: string | null;
  editedBy?: string | null;
  absolutePath?: string | null;
};

function formatFileStamp(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function FileFacts({ meta }: { meta?: FileFactsMeta }) {
  const rows: { label: string; value: string }[] = [
    { label: "Modified", value: formatFileStamp(meta?.modifiedAt) },
    { label: "Created", value: formatFileStamp(meta?.createdAt) },
    { label: "Path", value: meta?.absolutePath?.trim() || "—" },
    { label: "Edited by", value: meta?.editedBy?.trim() || "—" },
  ];
  return (
    <dl className="grid shrink-0 grid-cols-[auto_minmax(0,14rem)] gap-x-3 gap-y-0.5 text-[11px] leading-4">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="truncate font-mono text-foreground/80" title={row.value}>
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
