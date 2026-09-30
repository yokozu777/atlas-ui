import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  githubRepoFromUrl,
  parseForEachRefDates,
} from "./clusterctl-refs.ts";

describe("clusterctl ref dates", () => {
  it("reads github owner and name", () => {
    assert.deepEqual(
      githubRepoFromUrl("https://github.com/yokozu777/atlas-clusterctl.git"),
      { owner: "yokozu777", name: "atlas-clusterctl" },
    );
    assert.equal(githubRepoFromUrl("/tmp/atlas-clusterctl"), null);
  });

  it("maps main and tags from for-each-ref", () => {
    const dates = parseForEachRefDates(
      [
        "refs/heads/main\t2026-09-29T15:02:00+00:00",
        "refs/tags/0.0.13\t2026-09-01T12:00:00+00:00",
        "refs/tags/0.0.13^{}\t2026-09-01T11:00:00+00:00",
      ].join("\n"),
    );
    assert.equal(dates.main, "2026-09-29T15:02:00+00:00");
    assert.equal(dates["0.0.13"], "2026-09-01T12:00:00+00:00");
    assert.equal(dates["0.0.13^{}"], undefined);
  });
});
