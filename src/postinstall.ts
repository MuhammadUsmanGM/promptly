const dim = "\x1b[90m";
const bold = "\x1b[1m";
const gold = "\x1b[38;5;179m";
const reset = "\x1b[0m";
const green = "\x1b[32m";

const message = `
${dim}  ──────────────────────────────────────────${reset}

${gold}  ✦ ${bold}Promptly${reset}${gold} installed successfully${reset}

${dim}  Your prompts, refined before they land.${reset}

${green}  Get started:${reset}
${dim}  $${reset} ${bold}promptly init${reset}       ${dim}Set up your AI agent${reset}
${dim}  $${reset} ${bold}promptly status${reset}     ${dim}Check configuration${reset}
${dim}  $${reset} ${bold}promptly --help${reset}     ${dim}View all commands${reset}

${dim}  ──────────────────────────────────────────${reset}
`;

console.log(message);
