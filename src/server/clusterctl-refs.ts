export function githubRepoFromUrl(
  url: string,
): { owner: string; name: string } | null {
  const text = url.trim();
  let rest = "";
  for (const prefix of [
    "https://github.com/",
    "http://github.com/",
    "ssh://git@github.com/",
  ]) {
    if (text.startsWith(prefix)) {
      rest = text.slice(prefix.length);
      break;
    }
  }
  if (!rest && text.startsWith("git@github.com:")) {
    rest = text.slice("git@github.com:".length);
  }
  rest = rest.replace(/\/+$/, "").replace(/\.git$/, "");
  const slash = rest.indexOf("/");
  if (slash <= 0) {
    return null;
  }
  const owner = rest.slice(0, slash);
  const name = rest.slice(slash + 1);
  if (!owner || !name || name.includes("/")) {
    return null;
  }
  return { owner, name };
}

export function parseForEachRefDates(stdout: string): Record<string, string> {
  const dates: Record<string, string> = {};
  for (const raw of stdout.split("\n")) {
    const line = raw.trim();
    if (!line) {
      continue;
    }
    const tab = line.indexOf("\t");
    if (tab <= 0) {
      continue;
    }
    const name = line.slice(0, tab);
    const stamp = line.slice(tab + 1).trim();
    if (!stamp) {
      continue;
    }
    if (name === "refs/heads/main") {
      dates.main = stamp;
    } else if (name.startsWith("refs/tags/") && !name.endsWith("^{}")) {
      dates[name.slice("refs/tags/".length)] = stamp;
    }
  }
  return dates;
}

function commitDate(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const commit = (payload as { commit?: { committer?: { date?: string } } }).commit;
  return commit?.committer?.date?.trim() || "";
}

async function githubJson(url: string): Promise<unknown> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "atlas-ui",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(url, { headers, cache: "no-store" });
  if (!response.ok) {
    throw new Error(`github ${response.status}`);
  }
  return response.json();
}

async function githubOneDate(owner: string, name: string, ref: string): Promise<string> {
  const root = `https://api.github.com/repos/${owner}/${name}`;
  if (ref === "main") {
    return commitDate(await githubJson(`${root}/commits/main`));
  }
  const quoted = encodeURIComponent(ref);
  let info: { object?: { type?: string; url?: string; sha?: string } } = {};
  try {
    info = (await githubJson(`${root}/git/ref/tags/${quoted}`)) as typeof info;
  } catch {
    info = {};
  }
  const object = info.object;
  if (object?.type === "tag" && object.url) {
    const tag = (await githubJson(object.url)) as { tagger?: { date?: string } };
    const stamp = tag.tagger?.date?.trim() || "";
    if (stamp) {
      return stamp;
    }
  }
  const sha = object?.sha || ref;
  return commitDate(await githubJson(`${root}/commits/${encodeURIComponent(sha)}`));
}

export async function githubRefDates(
  owner: string,
  name: string,
  refs: string[],
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    refs.map(async (ref) => {
      try {
        const stamp = await githubOneDate(owner, name, ref);
        return stamp ? ([ref, stamp] as const) : null;
      } catch {
        return null;
      }
    }),
  );
  return Object.fromEntries(entries.filter((item) => item != null));
}
