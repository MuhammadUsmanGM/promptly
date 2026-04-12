import type { Rule } from "./universal.js";

export const cursorRules: Rule[] = [
  {
    name: "cursor_file_refs",
    description: "Use @file references for Cursor",
    intents: ["create", "fix", "refactor"],
    apply: (prompt, context) => {
      if (context.structure?.keyDirs) {
        return prompt + "\n\nReference relevant files using @file syntax when working in Cursor.";
      }
      return prompt;
    },
  },
  {
    name: "cursor_inline",
    description: "Optimize for Cursor's inline editing",
    intents: ["fix", "refactor"],
    apply: (prompt) => {
      return prompt + "\n\nKeep changes minimal and focused for inline diff review.";
    },
  },
];
