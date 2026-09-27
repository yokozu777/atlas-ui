import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { packMapPdfFileName, packMapPdfPage } from "./pack-map-pdf.ts";

describe("pack map pdf", () => {
  it("builds a safe file name from a cluster id", () => {
    assert.equal(packMapPdfFileName("build32/k8s"), "build32-k8s.pdf");
    assert.equal(packMapPdfFileName("  "), "pack-map.pdf");
    assert.equal(packMapPdfFileName("already.pdf"), "already.pdf");
  });

  it("fits a wide graph into the page without stretching", () => {
    const page = packMapPdfPage(3000, 800);
    assert.equal(page.width, 2400);
    assert.equal(page.height, 640);
  });
});
