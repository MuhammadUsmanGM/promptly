// src/universal.ts
var universalRules = [
  {
    name: "specificity",
    description: "Replace vague words with concrete specifics",
    apply: (prompt, context) => {
      let refined = prompt;
      if (context.stack) {
        const stackStr = [
          context.stack.framework,
          context.stack.language,
          context.stack.styling,
          context.stack.orm
        ].filter(Boolean).join(", ");
        if (stackStr && !prompt.toLowerCase().includes(context.stack.framework?.toLowerCase() ?? "")) {
          refined += `

Tech stack: ${stackStr}`;
        }
      }
      return refined;
    }
  },
  {
    name: "file_scope",
    description: "Reference exact files and limit blast radius",
    apply: (prompt, context) => {
      let refined = prompt;
      if (context.structure) {
        const relevantDirs = Object.entries(context.structure.keyDirs).map(([dir, purpose]) => `  ${dir} \u2014 ${purpose}`).join("\n");
        if (relevantDirs) {
          refined += `

Project structure:
${relevantDirs}`;
        }
      }
      return refined;
    }
  },
  {
    name: "conventions",
    description: "Enforce existing code conventions",
    apply: (prompt, context) => {
      let refined = prompt;
      if (context.conventions) {
        const c = context.conventions;
        const conventions = [
          `Naming: ${c.namingConvention}`,
          `File naming: ${c.fileNaming}`,
          `Exports: ${c.exportStyle}`,
          `Quotes: ${c.quotes}`,
          c.semicolons ? "Semicolons: yes" : "Semicolons: no",
          c.componentPattern ? `Components: ${c.componentPattern}` : null,
          `Tests: ${c.testLocation}`
        ].filter(Boolean).join(", ");
        refined += `

Follow existing conventions: ${conventions}`;
      }
      return refined;
    }
  },
  {
    name: "constraints",
    description: "Add hard constraints to prevent scope creep",
    apply: (prompt) => {
      return prompt + "\n\nConstraints: Preserve existing patterns. Do not install new packages unless explicitly requested. Do not break existing tests. Match existing code style. Minimize files changed.";
    }
  },
  {
    name: "success_criteria",
    description: "Define what done looks like",
    apply: (prompt, context) => {
      let refined = prompt;
      if (context.stack?.testRunner) {
        refined += `

Verify by running tests with ${context.stack.testRunner}.`;
      }
      return refined;
    }
  }
];

// src/claude-code.ts
var claudeCodeRules = [
  {
    name: "imperative_mood",
    description: "Use imperative mood for Claude Code prompts",
    apply: (prompt) => {
      const imperativeStarters = [
        "create",
        "add",
        "fix",
        "refactor",
        "update",
        "remove",
        "delete",
        "implement",
        "build",
        "write",
        "move",
        "rename",
        "extract",
        "replace",
        "configure",
        "set up",
        "install"
      ];
      const firstWord = prompt.trim().split(/\s/)[0].toLowerCase();
      if (!imperativeStarters.includes(firstWord)) {
        return `Task: ${prompt}`;
      }
      return prompt;
    }
  },
  {
    name: "numbered_steps",
    description: "Break complex tasks into numbered steps",
    apply: (prompt) => {
      const actionWords = prompt.match(/\b(and then|also|additionally|plus|as well)\b/gi);
      if (actionWords && actionWords.length >= 2) {
        return prompt + "\n\nBreak this into numbered steps and execute sequentially.";
      }
      return prompt;
    }
  },
  {
    name: "test_awareness",
    description: "Remind about tests for Claude Code",
    apply: (prompt, context) => {
      const isFeature = /\b(create|add|implement|build|write)\b/i.test(prompt);
      const mentionsTests = /\b(test|spec|jest|vitest|mocha)\b/i.test(prompt);
      if (isFeature && !mentionsTests && context.stack?.testRunner) {
        return prompt + `

Update or add tests using ${context.stack.testRunner} if applicable.`;
      }
      return prompt;
    }
  }
];

// src/cursor.ts
var cursorRules = [
  {
    name: "cursor_file_refs",
    description: "Use @file references for Cursor",
    apply: (prompt, context) => {
      if (context.structure?.keyDirs) {
        const hint = "Reference relevant files using @file syntax when working in Cursor.";
        return prompt + `

${hint}`;
      }
      return prompt;
    }
  },
  {
    name: "cursor_inline",
    description: "Optimize for Cursor's inline editing",
    apply: (prompt) => {
      return prompt + "\n\nKeep changes minimal and focused for inline diff review.";
    }
  }
];

// src/gemini.ts
var geminiRules = [
  {
    name: "gemini_explicit_paths",
    description: "Be extra explicit about file paths for Gemini CLI",
    apply: (prompt, context) => {
      if (context.structure) {
        return prompt + "\n\nAlways use full relative paths from project root.";
      }
      return prompt;
    }
  },
  {
    name: "gemini_step_by_step",
    description: "Gemini benefits from step-by-step breakdown",
    apply: (prompt) => {
      return prompt + "\n\nApproach this step by step, verifying each change before proceeding.";
    }
  }
];

// src/index.ts
function getRulesForAgent(agent) {
  switch (agent) {
    case "claude_code":
      return [...universalRules, ...claudeCodeRules];
    case "cursor":
      return [...universalRules, ...cursorRules];
    case "gemini_cli":
      return [...universalRules, ...geminiRules];
    case "generic":
    default:
      return [...universalRules];
  }
}
function refinePrompt(rawPrompt, context, agent = "generic") {
  const rules = getRulesForAgent(agent);
  let refined = rawPrompt;
  const rulesApplied = [];
  for (const rule of rules) {
    const before = refined;
    refined = rule.apply(refined, context);
    if (refined !== before) {
      rulesApplied.push(rule.name);
    }
  }
  return { refined, rulesApplied };
}
function getRulesDescription(agent = "generic") {
  const rules = getRulesForAgent(agent);
  return rules.map((r, i) => `${i + 1}. **${r.name}**: ${r.description}`).join("\n");
}
export {
  claudeCodeRules,
  cursorRules,
  geminiRules,
  getRulesDescription,
  getRulesForAgent,
  refinePrompt,
  universalRules
};
