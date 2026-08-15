import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = (() => {
  let dir = import.meta.dirname;
  while (!fs.existsSync(path.join(dir, "context", "spec.md"))) {
    const parent = path.dirname(dir);
    if (parent === dir)
      throw new Error("repo root with context/spec.md not found");
    dir = parent;
  }
  return dir;
})();

const contextDir = path.join(repoRoot, "context");
const relative = (file: string) => path.relative(repoRoot, file);

const walkFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkFiles(target);
    return entry.isFile() ? [target] : [];
  });

const walkDirs = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) return [];
    const target = path.join(dir, entry.name);
    return [target, ...walkDirs(target)];
  });

const markdownFiles = walkFiles(contextDir).filter((file) =>
  file.endsWith(".md")
);
const markdownText = new Map(
  markdownFiles.map((file) => [file, fs.readFileSync(file, "utf8")])
);

const ID_PATTERN = String.raw`CS(?:\.[A-Z]+)*-(?:A|C|T|R|DQ)\d+`;
const ID_RE = new RegExp(
  String.raw`(?<![A-Z0-9.])${ID_PATTERN}(?![A-Z0-9])`,
  "g"
);
const ID_DEFINITION_RE = new RegExp(
  String.raw`^\s*-\s+\*\*(${ID_PATTERN})(?:\s+[^*]+)?[:.]\*\*`
);
const COMPANION_DIRS = new Set([
  ".decisions",
  ".delta",
  ".experiments",
  ".reference",
]);

interface IdDefinition {
  id: string;
  file: string;
  line: number;
}

const definitions: IdDefinition[] = markdownFiles.flatMap((file) =>
  markdownText
    .get(file)!
    .split("\n")
    .flatMap((line, index) => {
      const match = ID_DEFINITION_RE.exec(line);
      return match ? [{ id: match[1], file, line: index + 1 }] : [];
    })
);
const definedIds = new Set(definitions.map(({ id }) => id));

interface Section {
  heading: string;
  body: string;
}

const sections = (text: string): Section[] => {
  const found = [...text.matchAll(/^## (.+)$/gm)];
  return found.map((match, index) => ({
    heading: match[1].trim(),
    body: text.slice(
      match.index + match[0].length,
      found[index + 1]?.index ?? text.length
    ),
  }));
};

const statusLine = (text: string): string | undefined =>
  /^Status:\s*(.+)$/m.exec(text)?.[1]?.trim();

const requireSections = (
  file: string,
  text: string,
  headings: readonly string[]
): string[] => {
  const byHeading = new Map(
    sections(text).map((section) => [section.heading, section])
  );
  return headings.flatMap((heading) => {
    const section = byHeading.get(heading);
    if (!section) return [`${relative(file)} — missing \`## ${heading}\``];
    return section.body.trim()
      ? []
      : [`${relative(file)} — empty \`## ${heading}\``];
  });
};

const linesOutsideCode = (text: string): string[] => {
  let fenced = false;
  return text.split("\n").flatMap((line) => {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      return [];
    }
    if (fenced) return [];
    return [line.replace(/`[^`]*`/g, "")];
  });
};

const headingAnchors = (text: string): Set<string> =>
  new Set(
    text.split("\n").flatMap((line) => {
      const heading = /^#{1,6}\s+(.+)$/.exec(line)?.[1];
      if (!heading) return [];
      const anchor = heading
        .trim()
        .toLowerCase()
        .replace(/<[^>]+>/g, "")
        .replace(/[^\p{L}\p{N}\s-]/gu, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");
      return [anchor];
    })
  );

const DECLARED_NODE_PATHS = [
  "",
  "01-product",
  "02-system",
  "02-system/01-data",
  "02-system/02-auth-and-tenancy",
  "02-system/03-sync",
  "02-system/04-ingestion",
  "02-system/05-link-processing",
  "02-system/06-retrieval-and-agent",
  "02-system/07-integrations",
  "02-system/08-billing-and-entitlements",
  "02-system/09-account-lifecycle",
  "02-system/10-verification",
  "03-operations",
  "04-delivery",
] as const;

const nodeDirs = (): string[] =>
  DECLARED_NODE_PATHS.map((node) => path.join(contextDir, node));

const nodeOrder = (dir: string): number[] =>
  path
    .relative(contextDir, dir)
    .split(path.sep)
    .filter(Boolean)
    .map((part) => Number.parseInt(part.slice(0, 2), 10));

const isAllowedRefinement = (fromDir: string, toDir: string): boolean => {
  if (fromDir === toDir) return false;
  const fromRelative = path.relative(contextDir, fromDir);
  const toRelative = path.relative(contextDir, toDir);
  if (toRelative === "" || fromRelative.startsWith(`${toRelative}${path.sep}`))
    return true;
  const from = nodeOrder(fromDir);
  const to = nodeOrder(toDir);
  for (let index = 0; index < Math.min(from.length, to.length); index += 1) {
    if (from[index] !== to[index]) return to[index] < from[index];
  }
  return to.length < from.length;
};

const markdownLinkCount = (text: string): number =>
  text
    .split("\n")
    .reduce(
      (count, line) =>
        count + [...line.matchAll(/\[[^\]]+\]\([^)]+\)/g)].length,
      0
    );

const parseNamespaceTable = (): Map<string, string> => {
  const rootSpec = markdownText.get(path.join(contextDir, "spec.md"))!;
  const section = rootSpec
    .split(/^## Identifier Scheme$/m)[1]
    ?.split(/^## /m)[0];
  if (!section)
    throw new Error("context/spec.md has no Identifier Scheme section");

  const namespaces = new Map<string, string>();
  for (const row of section.split("\n")) {
    const cells = row.split("|").map((cell) => cell.trim());
    const namespace = /`(CS(?:\.[A-Z]+)*)-\*`/.exec(cells[1] ?? "")?.[1];
    const node = /`context\/?([^`]*)`/.exec(cells[2] ?? "")?.[1];
    if (namespace && node !== undefined)
      namespaces.set(namespace, node.replace(/\/$/, ""));
  }
  return namespaces;
};

describe("Cloudstash Intent layer", () => {
  it("is present and non-empty", () => {
    expect(fs.existsSync(contextDir)).toBe(true);
    expect(markdownFiles.length).toBeGreaterThan(20);
    for (const file of [
      "vision.md",
      "requirements.md",
      "spec.md",
      "ontology.md",
      "intuition.md",
    ]) {
      expect(
        fs.existsSync(path.join(contextDir, file)),
        `missing context/${file}`
      ).toBe(true);
    }
  });

  it("requires both core artifacts for every declared node", () => {
    const discovered = walkDirs(contextDir).filter((dir) =>
      ["requirements.md", "spec.md"].some((file) =>
        fs.existsSync(path.join(dir, file))
      )
    );
    const declared = new Set(nodeDirs());
    const violations = [
      ...nodeDirs().flatMap((dir) =>
        ["requirements.md", "spec.md"].flatMap((file) =>
          fs.existsSync(path.join(dir, file))
            ? []
            : [`${relative(dir)} — missing ${file}`]
        )
      ),
      ...discovered.flatMap((dir) =>
        declared.has(dir) ? [] : [`${relative(dir)} — undeclared Intent node`]
      ),
    ];
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("rejects empty companion directories", () => {
    const violations = walkDirs(contextDir)
      .filter(
        (dir) =>
          COMPANION_DIRS.has(path.basename(dir)) ||
          path.basename(dir) === ".proposed"
      )
      .filter(
        (dir) =>
          walkFiles(dir).filter((file) => file.endsWith(".md")).length === 0
      )
      .map((dir) => `${relative(dir)} — empty companion directory`);
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("uses numeric names for child Intent nodes", () => {
    const violations = walkDirs(contextDir)
      .filter((dir) => {
        const name = path.basename(dir);
        if (name.startsWith(".")) return false;
        const hasNodeArtifacts = ["requirements.md", "spec.md"].some((file) =>
          fs.existsSync(path.join(dir, file))
        );
        return hasNodeArtifacts && !/^\d{2}-[a-z0-9-]+$/.test(name);
      })
      .map(relative);
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("defines IDs once and in their declared namespace node", () => {
    const violations: string[] = [];
    const byId = new Map<string, IdDefinition[]>();
    for (const definition of definitions) {
      byId.set(definition.id, [...(byId.get(definition.id) ?? []), definition]);
    }
    for (const [id, sites] of byId) {
      if (sites.length > 1) {
        violations.push(
          `${id} defined at ${sites.map((site) => `${relative(site.file)}:${site.line}`).join(", ")}`
        );
      }
    }

    const namespaceTable = parseNamespaceTable();
    for (const definition of definitions) {
      const namespace = definition.id.slice(0, definition.id.lastIndexOf("-"));
      const expected = namespaceTable.get(namespace);
      if (expected === undefined) {
        violations.push(
          `${definition.id} namespace is absent from context/spec.md`
        );
        continue;
      }
      const actual = path.relative(contextDir, path.dirname(definition.file));
      if (actual !== expected) {
        violations.push(
          `${relative(definition.file)}:${definition.line} — ${definition.id} belongs in context/${expected || ""}`
        );
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("resolves every structured ID reference", () => {
    const violations: string[] = [];
    for (const file of markdownFiles) {
      const text = markdownText.get(file)!;
      for (const match of text.matchAll(ID_RE)) {
        if (!definedIds.has(match[0])) {
          violations.push(`${relative(file)} — undefined ID ${match[0]}`);
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("validates refinement edges", () => {
    const violations: string[] = [];
    const byId = new Map(
      definitions.map((definition) => [definition.id, definition])
    );
    for (const file of markdownFiles.filter(
      (candidate) => path.basename(candidate) === "requirements.md"
    )) {
      markdownText
        .get(file)!
        .split("\n")
        .forEach((line, index) => {
          const marker = /`refines:\s*([^`]+)`/.exec(line)?.[1];
          if (!marker) return;
          const ids = marker.match(new RegExp(ID_PATTERN, "g")) ?? [];
          if (ids.length === 0) {
            violations.push(
              `${relative(file)}:${index + 1} — empty refines marker`
            );
          }
          for (const id of ids) {
            const target = byId.get(id);
            if (!target) continue;
            if (!id.includes("-R")) {
              violations.push(
                `${relative(file)}:${index + 1} — refines non-requirement ${id}`
              );
            } else if (
              !isAllowedRefinement(
                path.dirname(file),
                path.dirname(target.file)
              )
            ) {
              violations.push(
                `${relative(file)}:${index + 1} — forward refinement to ${id}`
              );
            }
          }
        });
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("keeps requirements files within the node-size bound", () => {
    const violations = markdownFiles.flatMap((file) => {
      if (path.basename(file) !== "requirements.md") return [];
      const requirements = markdownText
        .get(file)!
        .match(new RegExp(String.raw`^\s*-\s+\*\*CS(?:\.[A-Z]+)*-R\d+`, "gm"));
      return (requirements?.length ?? 0) > 40
        ? [`${relative(file)} — ${requirements!.length} requirements (max 40)`]
        : [];
    });
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("has a valid status and requirements link in every spec", () => {
    const violations: string[] = [];
    for (const file of markdownFiles.filter(
      (candidate) => path.basename(candidate) === "spec.md"
    )) {
      const text = markdownText.get(file)!;
      const status = text
        .split(/^## Status$/m)[1]
        ?.split(/^## /m)[0]
        ?.trim()
        .replace(/\.$/, "");
      if (!status || !["Draft", "Active", "Stable"].includes(status)) {
        violations.push(
          `${relative(file)} — invalid ## Status ${JSON.stringify(status)}`
        );
      }
      if (!/\]\(\.\/requirements\.md\)/.test(text)) {
        violations.push(`${relative(file)} — does not link ./requirements.md`);
      }
      if (/\*\*Maturity:\s*[^*]+\*\*/.test(text)) {
        for (const maturity of text.matchAll(/\*\*Maturity:\s*([^*]+)\*\*/g)) {
          if (maturity[1]?.trim() !== "experimental") {
            violations.push(
              `${relative(file)} — invalid maturity ${JSON.stringify(maturity[1]?.trim())}`
            );
          }
        }
      }
      if (
        /\b(?:Maturity|maturity):/.test(text) &&
        !/\*\*Maturity:\s*experimental\*\*/.test(text)
      ) {
        violations.push(
          `${relative(file)} — maturity marker must be bold experimental`
        );
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("has no broken relative Markdown links or anchors", () => {
    const violations: string[] = [];
    for (const file of markdownFiles) {
      const text = markdownText.get(file)!;
      linesOutsideCode(text).forEach((line, index) => {
        for (const match of line.matchAll(/\[[^\]]*\]\(([^()\s]+)\)/g)) {
          const target = match[1];
          if (/^(https?:|mailto:)/.test(target)) continue;
          const [filePart, anchor] = target.split("#", 2);
          const targetFile = filePart
            ? path.resolve(path.dirname(file), decodeURIComponent(filePart))
            : file;
          if (!fs.existsSync(targetFile)) {
            violations.push(
              `${relative(file)}:${index + 1} — missing ${target}`
            );
            continue;
          }
          if (
            anchor &&
            fs.statSync(targetFile).isFile() &&
            targetFile.endsWith(".md")
          ) {
            const targetText = fs.readFileSync(targetFile, "utf8");
            if (!headingAnchors(targetText).has(anchor)) {
              violations.push(
                `${relative(file)}:${index + 1} — missing anchor ${target}`
              );
            }
          }
        }
      });
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("keeps accepted decision records structurally complete", () => {
    const violations: string[] = [];
    for (const dir of walkDirs(contextDir).filter(
      (candidate) => path.basename(candidate) === ".decisions"
    )) {
      const proposed = path.join(dir, ".proposed");
      if (fs.existsSync(proposed) && walkFiles(proposed).length > 0) {
        violations.push(
          `${relative(proposed)} — proposed decisions must not merge`
        );
      }
      for (const file of fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => path.join(dir, entry.name))) {
        if (!/^\d{4}-[a-z0-9-]+\.md$/.test(path.basename(file))) {
          violations.push(
            `${relative(file)} — filename must match NNNN-slug.md`
          );
        }
        const text = markdownText.get(file)!;
        const status = statusLine(text);
        if (
          !status ||
          !/^(accepted|deprecated|superseded by .+)$/.test(status)
        ) {
          violations.push(
            `${relative(file)} — invalid decision status ${JSON.stringify(status)}`
          );
        }
        violations.push(
          ...requireSections(file, text, [
            "Context",
            "Evidence and Argument",
            "Options",
            "Decision",
          ])
        );
        const options =
          sections(text).find((section) => section.heading === "Options")
            ?.body ?? "";
        const rows = options
          .split("\n")
          .filter((line) => /^\|.+\|$/.test(line.trim()))
          .filter((line) => !/^\|\s*(Option|---)/.test(line.trim()));
        if (rows.length < 2)
          violations.push(
            `${relative(file)} — Options needs at least two rows`
          );
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("keeps delta records open, complete, and directional", () => {
    const violations: string[] = [];
    for (const dir of walkDirs(contextDir).filter(
      (candidate) => path.basename(candidate) === ".delta"
    )) {
      for (const file of walkFiles(dir).filter((candidate) =>
        candidate.endsWith(".md")
      )) {
        if (!/^DELTA-\d{3}-[a-z0-9-]+\.md$/.test(path.basename(file))) {
          violations.push(
            `${relative(file)} — filename must match DELTA-NNN-slug.md`
          );
        }
        const text = markdownText.get(file)!;
        if (statusLine(text) !== "open") {
          violations.push(`${relative(file)} — delta status must be open`);
        }
        violations.push(
          ...requireSections(file, text, [
            "Divergence",
            "Intent",
            "Implementation",
            "Direction",
            "Resolution Signal",
          ])
        );
        const intent =
          sections(text).find((section) => section.heading === "Intent")
            ?.body ?? "";
        const implementation =
          sections(text).find((section) => section.heading === "Implementation")
            ?.body ?? "";
        if (markdownLinkCount(intent) === 0) {
          violations.push(
            `${relative(file)} — Intent needs Markdown evidence link`
          );
        }
        if (markdownLinkCount(implementation) === 0) {
          violations.push(
            `${relative(file)} — Implementation needs Markdown evidence link`
          );
        }
        const direction = sections(text)
          .find((section) => section.heading === "Direction")
          ?.body.trim();
        if (
          !direction ||
          !["update implementation", "update Intent", "decide"].includes(
            direction
          )
        ) {
          violations.push(
            `${relative(file)} — invalid direction ${JSON.stringify(direction)}`
          );
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("keeps experiment and reference records evidence-shaped", () => {
    const violations: string[] = [];
    for (const dir of walkDirs(contextDir)) {
      const name = path.basename(dir);
      for (const file of walkFiles(dir).filter(
        (candidate) =>
          path.dirname(candidate) === dir && candidate.endsWith(".md")
      )) {
        const text = markdownText.get(file)!;
        if (name === ".experiments") {
          violations.push(
            ...requireSections(file, text, [
              "Question",
              "Method",
              "Result",
              "Conclusion",
              "Intent Impact",
            ])
          );
        }
        if (name === ".reference") {
          if (!/^Source:\s*.+$/m.test(text)) {
            violations.push(`${relative(file)} — reference is missing Source:`);
          }
          violations.push(
            ...requireSections(file, text, ["Relevant Facts", "Intent Impact"])
          );
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("does not use wiki links in the normative corpus", () => {
    const violations = markdownFiles.flatMap((file) =>
      linesOutsideCode(markdownText.get(file)!).some((line) =>
        /\[\[.+?\]\]/.test(line)
      )
        ? [relative(file)]
        : []
    );
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
