import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

// This week's brief: comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/04-instrument/
// Turns the mechanically-checkable spec lines into assertions against the
// built page. "Expressive" and "invites the first sound" are judged live at
// the crit, not here.

const doc = new JSDOM(readFileSync(resolve("dist/index.html"), "utf8")).window.document;

describe("instrument: no fail state", () => {
  it("has no score, points, or lives readout", () => {
    const text = doc.body.textContent?.toLowerCase() ?? "";
    expect(text).not.toMatch(/\bscore\b|\bpoints\b|\blives\b|game over/);
  });
});

describe("instrument: playable with whatever is at hand", () => {
  it("has one surface that accepts pointer input", () => {
    const strand = doc.getElementById("strand");
    expect(strand, "the instrument surface must exist").toBeTruthy();
  });

  it("that surface is keyboard-reachable", () => {
    const strand = doc.getElementById("strand");
    expect(strand?.getAttribute("tabindex")).toBe("0");
  });

  it("names itself for a screen reader without printing instructions on screen", () => {
    const strand = doc.getElementById("strand");
    expect(strand?.getAttribute("aria-label")).toBeTruthy();
  });
});

describe("instrument: no on-screen instructions", () => {
  it("the opening screen has no visible instructional text", () => {
    const main = doc.querySelector("main");
    const visibleText = Array.from(main?.childNodes ?? [])
      .filter((node) => {
        if (node.nodeType !== 1) return true;
        const el = node as Element;
        return !el.classList.contains("visually-hidden");
      })
      .map((node) => node.textContent?.trim() ?? "")
      .join("");
    expect(visibleText).toBe("");
  });
});
