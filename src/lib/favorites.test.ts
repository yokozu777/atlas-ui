import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseFavoriteIds,
  sortFavoritesFirst,
  toggleFavoriteId,
} from "./favorites.ts";

describe("parseFavoriteIds", () => {
  it("reads unique string ids", () => {
    assert.deepEqual(
      parseFavoriteIds('["build27","build31","build27",""]'),
      ["build27", "build31"],
    );
  });

  it("returns empty on invalid json", () => {
    assert.deepEqual(parseFavoriteIds("nope"), []);
    assert.deepEqual(parseFavoriteIds(null), []);
  });
});

describe("toggleFavoriteId", () => {
  it("adds to the front", () => {
    assert.deepEqual(toggleFavoriteId(["a"], "b"), ["b", "a"]);
  });

  it("removes an existing id", () => {
    assert.deepEqual(toggleFavoriteId(["b", "a"], "b"), ["a"]);
  });
});

describe("sortFavoritesFirst", () => {
  it("keeps relative order inside each group", () => {
    assert.deepEqual(
      sortFavoritesFirst(
        [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
        ["c", "a"],
        (row) => row.id,
      ),
      [{ id: "a" }, { id: "c" }, { id: "b" }, { id: "d" }],
    );
  });
});
