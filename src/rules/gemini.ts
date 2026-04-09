import type { Rule } from "./universal.js";

export const geminiRules: Rule[] = [
  {
    name: "gemini_explicit_paths",
    description: "Be extra explicit about file paths for Gemini CLI",
    apply: (prompt, context) => {
      if (context.structure) {
        return prompt + "\n\nAlways use full relative paths from project root.";
      }
      return prompt;
    },
  },
  {
    name: "gemini_step_by_step",
    description: "Gemini benefits from step-by-step breakdown",
    apply: (prompt) => {
      return prompt + "\n\nApproach this step by step, verifying each change before proceeding.";
    },
  },
];
