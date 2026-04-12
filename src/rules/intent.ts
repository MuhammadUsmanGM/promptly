export type Intent = "create" | "fix" | "refactor" | "explain" | "configure" | "generic";

const INTENT_PATTERNS: { intent: Intent; patterns: RegExp[] }[] = [
  {
    intent: "create",
    patterns: [
      /\b(create|add|build|implement|make|write|generate|scaffold|set\s*up|init|new)\b/i,
      /\b(add\s+a|create\s+a|build\s+a|make\s+a|write\s+a|new\s+\w+)\b/i,
    ],
  },
  {
    intent: "fix",
    patterns: [
      /\b(fix|debug|resolve|patch|repair|broken|not\s+working|bug|error|crash|issue|failing)\b/i,
      /\b(doesn'?t\s+work|isn'?t\s+working|wrong|incorrect)\b/i,
    ],
  },
  {
    intent: "refactor",
    patterns: [
      /\b(refactor|restructure|reorganize|clean\s*up|simplify|extract|move|rename|split|merge|optimize|improve\s+(?:code|performance|readability))\b/i,
      /\b(make\s+(?:it\s+)?(?:cleaner|faster|simpler|more\s+readable))\b/i,
    ],
  },
  {
    intent: "explain",
    patterns: [
      /\b(explain|describe|what\s+(?:does|is)|how\s+does|walk\s+(?:me\s+)?through|understand|tell\s+me\s+about|show\s+me\s+how|why\s+(?:does|is))\b/i,
      /\bwhat('?s|\s+is)\s+(this|that|the)\b/i,
    ],
  },
  {
    intent: "configure",
    patterns: [
      /\b(configure|config|install|set\s*up|deploy|migrate|upgrade|update\s+(?:deps|dependencies|packages))\b/i,
      /\b(add\s+(?:eslint|prettier|tailwind|docker|ci|cd|github\s+actions))\b/i,
    ],
  },
];

export function detectIntent(prompt: string): Intent {
  // Score each intent by how many patterns match
  let bestIntent: Intent = "generic";
  let bestScore = 0;

  for (const { intent, patterns } of INTENT_PATTERNS) {
    let score = 0;
    for (const pattern of patterns) {
      if (pattern.test(prompt)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
    }
  }

  return bestIntent;
}
