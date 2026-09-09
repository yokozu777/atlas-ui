import { yamlLanguage } from "@codemirror/lang-yaml";
import { jinjaLanguage } from "@codemirror/lang-jinja";
import {
  HighlightStyle,
  LanguageSupport,
  syntaxHighlighting,
  syntaxTree,
} from "@codemirror/language";
import { parseMixed, type SyntaxNode } from "@lezer/common";
import { tags as t } from "@lezer/highlight";
import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";

/**
 * Seti Dark Pro as in VS Code YAML: orange keys, green values,
 * cyan anchors, red Ansible modules, black canvas.
 */
export const SETI = {
  bg: "#000000",
  fg: "#d4d7d6",
  comment: "#41535b",
  yellow: "#e6cd69",
  red: "#cd3f45",
  cyan: "#55b5db",
  green: "#9fca56",
  key: "#e37933",
  module: "#cd3f45",
  string: "#9fca56",
  filter: "#55b5db",
  gutter: "#6d8088",
  indent: "#2d3338",
  indentActive: "#41535b",
  selection: "rgba(85, 181, 219, 0.28)",
  activeLine: "rgba(85, 181, 219, 0.08)",
} as const;

const PLAY_TASK_KEYWORDS = new Set([
  "action",
  "always",
  "any_errors_fatal",
  "args",
  "async",
  "become",
  "become_exe",
  "become_flags",
  "become_method",
  "become_user",
  "block",
  "changed_when",
  "check_mode",
  "collections",
  "connection",
  "debugger",
  "delay",
  "delegate_facts",
  "delegate_to",
  "diff",
  "environment",
  "fact_path",
  "failed_when",
  "force_handlers",
  "gather_facts",
  "handlers",
  "hosts",
  "ignore_errors",
  "ignore_unreachable",
  "import_playbook",
  "import_role",
  "import_tasks",
  "include",
  "include_role",
  "include_tasks",
  "include_vars",
  "label",
  "listen",
  "local_action",
  "loop",
  "loop_control",
  "max_fail_percentage",
  "module_defaults",
  "name",
  "no_log",
  "notify",
  "order",
  "poll",
  "port",
  "post_tasks",
  "pre_tasks",
  "register",
  "remote_user",
  "rescue",
  "retries",
  "role",
  "roles",
  "run_once",
  "serial",
  "strategy",
  "tags",
  "tasks",
  "throttle",
  "timeout",
  "until",
  "vars",
  "vars_files",
  "vars_prompt",
  "when",
]);

const JINJA_RE = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\{#[\s\S]*?#\}/g;

const ansibleYamlLanguage = yamlLanguage.configure({
  wrap: parseMixed((node, input) => {
    if (!node.type.isTop) {
      return null;
    }
    const text = input.read(node.from, node.to);
    const overlay: { from: number; to: number }[] = [];
    JINJA_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = JINJA_RE.exec(text))) {
      overlay.push({
        from: node.from + match.index,
        to: node.from + match.index + match[0].length,
      });
    }
    if (overlay.length === 0) {
      return null;
    }
    return { parser: jinjaLanguage.parser, overlay };
  }),
});

const setiHighlight = HighlightStyle.define([
  { tag: t.comment, color: SETI.comment, fontStyle: "italic" },
  { tag: t.lineComment, color: SETI.comment, fontStyle: "italic" },
  { tag: t.blockComment, color: SETI.comment, fontStyle: "italic" },
  { tag: t.content, color: SETI.string },
  { tag: t.string, color: SETI.string },
  { tag: t.special(t.string), color: SETI.string },
  { tag: t.number, color: SETI.string },
  { tag: t.integer, color: SETI.string },
  { tag: t.bool, color: SETI.string },
  { tag: t.null, color: SETI.string },
  { tag: t.attributeValue, color: SETI.string },
  { tag: t.separator, color: SETI.fg },
  { tag: t.punctuation, color: SETI.fg },
  { tag: t.squareBracket, color: SETI.yellow },
  { tag: t.paren, color: SETI.fg },
  { tag: t.propertyName, color: SETI.string },
  { tag: t.typeName, color: SETI.yellow },
  { tag: t.keyword, color: SETI.filter },
  { tag: t.controlKeyword, color: SETI.filter },
  { tag: t.definitionKeyword, color: SETI.filter },
  { tag: t.operatorKeyword, color: SETI.filter },
  { tag: t.modifier, color: SETI.filter },
  { tag: t.operator, color: SETI.filter },
  { tag: t.arithmeticOperator, color: SETI.filter },
  { tag: t.compareOperator, color: SETI.filter },
  { tag: t.logicOperator, color: SETI.filter },
  { tag: t.definitionOperator, color: SETI.filter },
  { tag: t.derefOperator, color: SETI.fg },
  { tag: t.special(t.variableName), color: SETI.filter },
  { tag: t.standard(t.variableName), color: SETI.string },
  { tag: t.variableName, color: SETI.string },
  { tag: t.self, color: SETI.string },
  { tag: t.brace, color: SETI.module },
]);

const yamlKeyMark = Decoration.mark({ class: "cm-ansible-yaml-key" });
const moduleKeyMark = Decoration.mark({ class: "cm-ansible-module-key" });
const aliasStarMark = Decoration.mark({ class: "cm-ansible-alias-star" });
const aliasNameMark = Decoration.mark({ class: "cm-ansible-alias-name" });
const jinjaBraceMark = Decoration.mark({ class: "cm-ansible-jinja-brace" });
const jinjaVarMark = Decoration.mark({ class: "cm-ansible-jinja-var" });
const jinjaFilterMark = Decoration.mark({ class: "cm-ansible-jinja-filter" });
const jinjaStringMark = Decoration.mark({ class: "cm-ansible-jinja-string" });

const JINJA_WORDS = new Set([
  "and",
  "defined",
  "else",
  "false",
  "if",
  "in",
  "is",
  "none",
  "not",
  "or",
  "true",
]);

const JINJA_HINT = /\{\{|\{%|\||\bis\s+(?:not\s+)?defined\b/;

function decorateJinjaScalar(
  from: number,
  text: string,
  builder: RangeSetBuilder<Decoration>,
) {
  if (!JINJA_HINT.test(text)) {
    return;
  }
  const add = (start: number, end: number, mark: Decoration) => {
    if (end > start) {
      builder.add(from + start, from + end, mark);
    }
  };
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < n && text[j] !== ch) {
        j += 1;
      }
      add(i, Math.min(j + 1, n), jinjaStringMark);
      i = Math.min(j + 1, n);
      continue;
    }
    if (
      text.startsWith("{{", i) ||
      text.startsWith("}}", i) ||
      text.startsWith("{%", i) ||
      text.startsWith("%}", i)
    ) {
      add(i, i + 2, jinjaBraceMark);
      i += 2;
      continue;
    }
    if (
      text.startsWith("==", i) ||
      text.startsWith("!=", i) ||
      text.startsWith(">=", i) ||
      text.startsWith("<=", i)
    ) {
      add(i, i + 2, jinjaFilterMark);
      i += 2;
      continue;
    }
    if (ch === ">" || ch === "<") {
      add(i, i + 1, jinjaFilterMark);
      i += 1;
      continue;
    }
    if (ch === "|") {
      add(i, i + 1, jinjaFilterMark);
      i += 1;
      while (i < n && /\s/.test(text[i])) {
        i += 1;
      }
      if (i < n && /[A-Za-z_]/.test(text[i])) {
        let j = i + 1;
        while (j < n && /\w/.test(text[j])) {
          j += 1;
        }
        add(i, j, jinjaFilterMark);
        i = j;
      }
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < n && /[\w.]/.test(text[j])) {
        j += 1;
      }
      const word = text.slice(i, j);
      add(
        i,
        j,
        JINJA_WORDS.has(word.toLowerCase()) ? jinjaFilterMark : jinjaVarMark,
      );
      i = j;
      continue;
    }
    i += 1;
  }
}

function normalizeKey(raw: string): string {
  let value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  if (value.endsWith(":")) {
    value = value.slice(0, -1).trim();
  }
  return value;
}

function isPlayKeyword(name: string): boolean {
  return PLAY_TASK_KEYWORDS.has(name) || name.startsWith("with_");
}

function mappingIsSequenceItem(keyNode: SyntaxNode): boolean {
  let mapping: SyntaxNode | null = keyNode.parent;
  while (mapping && mapping.name === "Pair") {
    mapping = mapping.parent;
  }
  if (
    !mapping ||
    (mapping.name !== "BlockMapping" && mapping.name !== "FlowMapping")
  ) {
    return false;
  }
  let parent: SyntaxNode | null = mapping.parent;
  while (parent && (parent.name === "Tagged" || parent.name === "Anchored")) {
    parent = parent.parent;
  }
  return parent?.name === "Item";
}

function isModuleKey(name: string, keyNode: SyntaxNode): boolean {
  if (name.includes(".")) {
    return true;
  }
  if (isPlayKeyword(name)) {
    return false;
  }
  return mappingIsSequenceItem(keyNode);
}

function visibleSpan(view: EditorView): { from: number; to: number } {
  const ranges = view.visibleRanges;
  if (ranges.length === 0) {
    return { from: 0, to: view.state.doc.length };
  }
  return { from: ranges[0].from, to: ranges[ranges.length - 1].to };
}

function ansibleKeyDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const { from, to } = visibleSpan(view);
  syntaxTree(view.state).iterate({
    from,
    to,
    enter(node) {
      if (node.name === "Alias" || node.name === "Anchor") {
        const text = view.state.sliceDoc(node.from, node.to);
        if (
          (text.startsWith("*") || text.startsWith("&")) &&
          text.length > 1
        ) {
          builder.add(node.from, node.from + 1, aliasStarMark);
          builder.add(node.from + 1, node.to, aliasNameMark);
        } else if (text) {
          builder.add(node.from, node.to, aliasStarMark);
        }
        return;
      }
      if (node.name !== "Key") {
        return;
      }
      const text = normalizeKey(view.state.sliceDoc(node.from, node.to));
      if (!text) {
        return;
      }
      const mark = isModuleKey(text, node.node)
        ? moduleKeyMark
        : yamlKeyMark;
      builder.add(node.from, node.to, mark);
    },
  });
  return builder.finish();
}

const ansibleKeyHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = ansibleKeyDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = ansibleKeyDecorations(update.view);
      }
    }
  },
  { decorations: (value) => value.decorations },
);

function jinjaScalarDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const { from, to } = visibleSpan(view);
  syntaxTree(view.state).iterate({
    from,
    to,
    enter(node) {
      if (node.name === "Key") {
        return false;
      }
      if (
        node.name !== "Literal" &&
        node.name !== "QuotedLiteral" &&
        node.name !== "BlockLiteralContent"
      ) {
        return;
      }
      decorateJinjaScalar(
        node.from,
        view.state.sliceDoc(node.from, node.to),
        builder,
      );
    },
  });
  return builder.finish();
}

const jinjaScalarHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = jinjaScalarDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = jinjaScalarDecorations(update.view);
      }
    }
  },
  { decorations: (value) => value.decorations },
);

export const setiEditorTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: SETI.bg,
      color: SETI.fg,
      fontSize: "13px",
      height: "100%",
    },
    "&.cm-editor": {
      height: "100%",
      backgroundColor: SETI.bg,
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily:
        "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
    },
    ".cm-content": {
      caretColor: SETI.cyan,
      padding: "8px 0",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: SETI.cyan,
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      {
        backgroundColor: `${SETI.selection} !important`,
      },
    ".cm-activeLine": {
      backgroundColor: SETI.activeLine,
    },
    ".cm-activeLineGutter": {
      backgroundColor: SETI.activeLine,
      color: SETI.fg,
    },
    ".cm-gutters": {
      backgroundColor: SETI.bg,
      borderRight: "1px solid #111111",
      color: SETI.gutter,
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 8px 0 12px",
    },
    ".cm-foldGutter": {
      width: "14px",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "#0a0a0a",
      border: "none",
      color: SETI.gutter,
    },
    ".cm-panels": {
      backgroundColor: "#0a0a0a",
      color: SETI.fg,
    },
    ".cm-panels .cm-button": {
      background: "#2d3338",
      color: SETI.fg,
      border: "1px solid #41535b",
    },
    ".cm-panels .cm-textfield": {
      background: SETI.bg,
      color: SETI.fg,
      border: "1px solid #41535b",
    },
    ".cm-searchMatch": {
      backgroundColor: "rgba(230, 205, 105, 0.28)",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "rgba(85, 181, 219, 0.45)",
    },
    ".cm-ansible-yaml-key, .cm-ansible-yaml-key span": {
      color: `${SETI.key} !important`,
    },
    ".cm-ansible-module-key, .cm-ansible-module-key span": {
      color: `${SETI.module} !important`,
    },
    ".cm-ansible-alias-star, .cm-ansible-alias-star span": {
      color: `${SETI.filter} !important`,
    },
    ".cm-ansible-alias-name, .cm-ansible-alias-name span": {
      color: `${SETI.filter} !important`,
    },
    ".cm-ansible-jinja-brace, .cm-ansible-jinja-brace span": {
      color: `${SETI.module} !important`,
    },
    ".cm-ansible-jinja-var, .cm-ansible-jinja-var span": {
      color: `${SETI.string} !important`,
    },
    ".cm-ansible-jinja-filter, .cm-ansible-jinja-filter span": {
      color: `${SETI.filter} !important`,
    },
    ".cm-ansible-jinja-string, .cm-ansible-jinja-string span": {
      color: `${SETI.string} !important`,
    },
  },
  { dark: true },
);

export function ansibleYamlExtensions() {
  return [
    new LanguageSupport(ansibleYamlLanguage),
    syntaxHighlighting(setiHighlight),
    ansibleKeyHighlighter,
    jinjaScalarHighlighter,
    EditorView.lineWrapping,
    indentationMarkers({
      highlightActiveBlock: true,
      hideFirstIndent: false,
      markerType: "codeOnly",
      thickness: 1,
      colors: {
        dark: SETI.indent,
        light: SETI.indent,
        activeDark: SETI.indentActive,
        activeLight: SETI.indentActive,
      },
    }),
  ];
}
