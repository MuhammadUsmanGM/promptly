import type { Rule } from "./universal.js";

export const cursorRules: Rule[] = [
  {
    name: "cursor_file_refs",
    description: "Use @file references for Cursor",
    apply: (prompt, context) => {
      if (context.structure?.keyDirs) {
        const hint = "Reference relevant files using @file syntax when working in Cursor.";
        return prompt + `\n\n${hint}`;
      }
      return prompt;
    },
  },
  {
    name: "cursor_inline",
    description: "Optimize for Cursor's inline editing",
    apply: (prompt) => {
      return prompt + "\n\nKeep changes minimal and focused for inline diff review.";
    },
  },
];
