export type Intent = "create" | "fix" | "refactor" | "explain" | "configure" | "test" | "generic";

// Weighted scoring — each pattern carries an explicit weight so a strong
// keyword ("bug", "configure") outranks a weak one ("add"). Weights beat
// ordering: this is what makes "add test coverage" become test instead of
// create, without hinging on which block sits higher in the array.
interface WeightedPattern {
  pattern: RegExp;
  weight: number;
}

const INTENT_PATTERNS: { intent: Intent; patterns: WeightedPattern[] }[] = [
  {
    // "write tests for X", "add test coverage", "cover X with tests" — needs
    // test-file rewriting (colocation, test runner) rather than generic create.
    intent: "test",
    patterns: [
      { pattern: /\b(write|add|create)\s+(?:a\s+|some\s+|more\s+)?(?:unit\s+|integration\s+|e2e\s+)?tests?\b/i, weight: 5 },
      { pattern: /\btest\s+coverage\b/i, weight: 5 },
      { pattern: /\b(cover|covering)\s+.*\b(with|via)\s+tests?\b/i, weight: 4 },
      { pattern: /\b(unit|integration|e2e)\s+tests?\b/i, weight: 3 },
      { pattern: /\btest\s+(this|that|it|the\s+\w+)\b/i, weight: 3 },
    ],
  },
  {
    intent: "configure",
    patterns: [
      { pattern: /\b(configure|config|install|set\s*up|deploy|migrate|upgrade)\b/i, weight: 4 },
      { pattern: /\bupdate\s+(?:deps|dependencies|packages)\b/i, weight: 4 },
      { pattern: /\badd\s+(?:eslint|prettier|tailwind|docker|ci|cd|github\s+actions)\b/i, weight: 5 },
    ],
  },
  {
    intent: "explain",
    patterns: [
      { pattern: /\b(explain|describe|walk\s+(?:me\s+)?through|understand|tell\s+me\s+about)\b/i, weight: 5 },
      { pattern: /\bwhat\s+(?:does|is)\b/i, weight: 4 },
      { pattern: /\bhow\s+does\b/i, weight: 4 },
      { pattern: /\bshow\s+me\s+how\b/i, weight: 4 },
      { pattern: /\bwhy\s+(?:does|is)\b/i, weight: 4 },
      { pattern: /\bwhat('?s|\s+is)\s+(this|that|the)\b/i, weight: 3 },
    ],
  },
  {
    intent: "fix",
    patterns: [
      { pattern: /\b(fix|debug|resolve|patch|repair)\b/i, weight: 5 },
      { pattern: /\b(broken|not\s+working|bug|error|crash|failing)\b/i, weight: 4 },
      { pattern: /\b(doesn'?t\s+work|isn'?t\s+working|wrong|incorrect)\b/i, weight: 4 },
      { pattern: /\bissue\b/i, weight: 2 },
    ],
  },
  {
    intent: "refactor",
    patterns: [
      { pattern: /\b(refactor|restructure|reorganize|clean\s*up|simplify)\b/i, weight: 5 },
      { pattern: /\b(extract|move|rename|split|merge|optimize)\b/i, weight: 3 },
      { pattern: /\bimprove\s+(?:code|performance|readability)\b/i, weight: 4 },
      { pattern: /\bmake\s+(?:it\s+)?(?:cleaner|faster|simpler|more\s+readable)\b/i, weight: 4 },
    ],
  },
  {
    intent: "create",
    patterns: [
      { pattern: /\b(create|build|implement|scaffold)\b/i, weight: 4 },
      { pattern: /\b(add|make|write|generate)\b/i, weight: 2 },
      { pattern: /\b(init|new)\b/i, weight: 2 },
      { pattern: /\b(add\s+a|create\s+a|build\s+a|make\s+a|write\s+a|new\s+\w+)\b/i, weight: 3 },
    ],
  },
];

export function detectIntent(prompt: string): Intent {
  let bestIntent: Intent = "generic";
  let bestScore = 0;

  for (const { intent, patterns } of INTENT_PATTERNS) {
    let score = 0;
    for (const { pattern, weight } of patterns) {
      if (pattern.test(prompt)) score += weight;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
    }
  }

  return bestIntent;
}
