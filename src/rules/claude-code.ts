import type { Rule } from "./universal.js";

export const claudeCodeRules: Rule[] = [
  {
    name: "imperative_mood",
    description: "Use imperative mood for Claude Code prompts",
    intents: ["create", "fix", "refactor", "configure", "generic"],
    apply: (prompt) => {
      const imperativeStarters = [
        "create", "add", "fix", "refactor", "update", "remove",
        "delete", "implement", "build", "write", "move", "rename",
        "extract", "replace", "configure", "set up", "install",
      ];
      const firstWord = prompt.trim().split(/\s/)[0].toLowerCase();
      if (!imperativeStarters.includes(firstWord)) {
        return `Task: ${prompt}`;
      }
      return prompt;
    },
  },
  {
    name: "numbered_steps",
    description: "Break complex tasks into numbered steps",
    intents: ["create", "configure"],
    apply: (prompt) => {
      const actionWords = prompt.match(/\b(and then|also|additionally|plus|as well)\b/gi);
      if (actionWords && actionWords.length >= 2) {
        return prompt + "\n\nBreak this into numbered steps and execute sequentially.";
      }
      return prompt;
    },
  },
  {
    name: "test_awareness",
    description: "Remind about tests when creating features",
    intents: ["create"],
    apply: (prompt, context) => {
      const mentionsTests = /\b(test|spec|jest|vitest|mocha)\b/i.test(prompt);
      if (!mentionsTests && context.stack?.testRunner) {
        return prompt + `\n\nUpdate or add tests using ${context.stack.testRunner} if applicable.`;
      }
      return prompt;
    },
  },
];
