#!/usr/bin/env node
// school.js — CLI for Claude School agent interactions

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { fileURLToPath } from 'url';

// === PATHS ===

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHOOLS_DIR = path.join(__dirname, 'schools');
const TEMPLATES_DIR = path.join(__dirname, 'templates');

// === CONSTANTS ===

const MODELS = {
  teacher: 'claude-sonnet-4-6',
  tester: 'claude-sonnet-4-6',
  pm: 'claude-sonnet-4-6',
  board: 'claude-sonnet-4-6',
};

const WEB_SEARCH_AGENTS = new Set(['teacher']);

const MARKERS = {
  teacher: { start: '---TEACHER ASSESSMENT---', end: '---END TEACHER ASSESSMENT---' },
  tester: { start: '---TEST RESULTS---', end: '---END TEST RESULTS---' },
  pm: { start: '---PROJECT STATE---', end: '---END PROJECT STATE---' },
  board: { start: '---MODULE RECORD---', end: '---END MODULE RECORD---' },
};

const KICKSTART = {
  teacher: "I'm ready to begin learning.",
  tester: "I'm ready to take the module test.",
  pm: "Please review my learning progress and assign a project.",
  board: "The module work is complete. Please review and deliberate.",
};

// === ROADMAP PARSER ===

function parseRoadmap(roadmapPath) {
  const content = fs.readFileSync(roadmapPath, 'utf8');
  const roadmap = { title: '', modules: [] };
  let currentModule = null;
  let currentSection = null;

  for (const line of content.split('\n')) {
    const titleMatch = line.match(/^# (.+)$/);
    const moduleMatch = line.match(/^## Module (\d+): (.+)$/);
    const sectionMatch = line.match(/^### Section (\d+)\.(\d+): (.+)$/);
    const bulletMatch = line.match(/^- (.+)$/);

    if (titleMatch) {
      roadmap.title = titleMatch[1].trim();
    } else if (moduleMatch) {
      currentSection = null;
      currentModule = {
        number: parseInt(moduleMatch[1]),
        title: moduleMatch[2].trim(),
        name: `Module ${moduleMatch[1]}: ${moduleMatch[2].trim()}`,
        sections: [],
      };
      roadmap.modules.push(currentModule);
    } else if (sectionMatch && currentModule) {
      currentSection = {
        moduleNumber: parseInt(sectionMatch[1]),
        sectionIndex: parseInt(sectionMatch[2]),
        title: sectionMatch[3].trim(),
        name: `Section ${sectionMatch[1]}.${sectionMatch[2]}: ${sectionMatch[3].trim()}`,
        topics: [],
      };
      currentModule.sections.push(currentSection);
    } else if (bulletMatch && currentSection) {
      currentSection.topics.push(bulletMatch[1].trim());
    }
  }

  return roadmap;
}

// === FILE HELPERS ===

function readFileSafe(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function writeFileSafe(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function appendFileSafe(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, content, 'utf8');
}

// === TEMPLATE ASSEMBLER ===

function assembleTemplate(agentType, variables) {
  const templatePath = path.join(TEMPLATES_DIR, `${agentType}.md`);
  let template = fs.readFileSync(templatePath, 'utf8');
  for (const [key, value] of Object.entries(variables)) {
    template = template.replaceAll(`{{${key}}}`, value ?? '');
  }
  return template;
}

// === CONTEXT BUILDERS ===

function getPriorAssessments(schoolDir, moduleNum, currentSectionNum) {
  const parts = [];
  for (let s = 1; s < currentSectionNum; s++) {
    const p = path.join(schoolDir, `module-${moduleNum}`, `section-${s}`, 'teacher-assessment.md');
    if (fs.existsSync(p)) {
      parts.push(`### Section ${moduleNum}.${s}\n\n${fs.readFileSync(p, 'utf8')}`);
    }
  }
  return parts.length > 0 ? parts.join('\n\n---\n\n') : '';
}

function getAllTeacherAssessments(schoolDir, moduleNum, roadmap) {
  const moduleData = roadmap.modules.find(m => m.number === moduleNum);
  if (!moduleData) return '';
  const parts = [];
  for (const section of moduleData.sections) {
    const p = path.join(schoolDir, `module-${moduleNum}`, `section-${section.sectionIndex}`, 'teacher-assessment.md');
    if (fs.existsSync(p)) {
      parts.push(`### ${section.name}\n\n${fs.readFileSync(p, 'utf8')}`);
    }
  }
  return parts.join('\n\n---\n\n');
}

function getStruggleContext(progressPath) {
  const content = readFileSafe(progressPath);
  if (!content) return '';
  const weakAreas = [];
  for (const match of content.matchAll(/\*\*Weak areas:\*\* (.+)/g)) {
    const area = match[1].trim();
    if (area && area.toLowerCase() !== 'none') weakAreas.push(area);
  }
  if (weakAreas.length === 0) return '';
  return `Previously identified weak areas:\n${weakAreas.map(w => `- ${w}`).join('\n')}`;
}

function buildVariables(agent, schoolDir, moduleNum, sectionNum, moduleData, sectionData, progressPath, roadmap) {
  const base = {
    module_name: moduleData.name,
    section_name: sectionData?.name ?? '',
  };

  if (agent === 'teacher') {
    return {
      ...base,
      topic_bullets: (sectionData?.topics ?? []).map(t => `- ${t}`).join('\n'),
      prior_assessments: sectionNum > 1 ? getPriorAssessments(schoolDir, moduleNum, sectionNum) : '',
      struggle_context: getStruggleContext(progressPath),
    };
  }

  const moduleDir = path.join(schoolDir, `module-${moduleNum}`);
  const allAssessments = getAllTeacherAssessments(schoolDir, moduleNum, roadmap);

  if (agent === 'tester') {
    return { ...base, all_teacher_assessments: allAssessments };
  }

  if (agent === 'pm') {
    return {
      ...base,
      all_teacher_assessments: allAssessments,
      test_results: readFileSafe(path.join(moduleDir, 'test-results.md')),
    };
  }

  if (agent === 'board') {
    return {
      ...base,
      all_teacher_assessments: allAssessments,
      test_results: readFileSafe(path.join(moduleDir, 'test-results.md')),
      project_state: readFileSafe(path.join(moduleDir, 'project-state.md')),
    };
  }

  return base;
}

// === CHAT HISTORY ===

function saveHistory(historyPath, { agent, school, module: mod, section, messages }) {
  writeFileSafe(historyPath, JSON.stringify({
    agent, school, module: mod, section,
    model: MODELS[agent],
    saved_at: new Date().toISOString(),
    messages,
  }, null, 2));
}

function loadHistory(historyPath) {
  const raw = readFileSafe(historyPath);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function deleteHistory(historyPath) {
  if (fs.existsSync(historyPath)) fs.unlinkSync(historyPath);
}

// === PROGRESS LOG ===

function updateProgress(progressPath, { agent, moduleName, sectionName, status, score, weakAreas, notes }) {
  const lines = [
    `\n## ${new Date().toISOString()}`,
    `- **Agent:** ${agent}`,
    `- **Module:** ${moduleName}`,
    sectionName ? `- **Section:** ${sectionName}` : null,
    `- **Status:** ${status}`,
    score != null ? `- **Score:** ${score}` : null,
    `- **Weak areas:** ${weakAreas || 'None'}`,
    `- **Notes:** ${notes || 'None'}`,
  ].filter(l => l !== null).join('\n');

  appendFileSafe(progressPath, lines + '\n');
}

// === BLOCK EXTRACTION ===

function extractBlock(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start === -1) return null;
  const end = text.indexOf(endMarker, start);
  if (end === -1) return null;
  return text.slice(start, end + endMarker.length);
}

function getFullAssistantText(messages) {
  return messages
    .filter(m => m.role === 'assistant')
    .map(m => m.content)
    .join('\n');
}

function parseProgressMeta(block) {
  const statusMatch = block.match(/(?:Overall Result|Final Status|Verdict):\s*(\S+)/i);
  const scoreMatch = block.match(/(?:Score|Overall Readiness):\s*([^\n]+)/i);
  const weakAreasSection = block.match(/### Weak Areas?\n([\s\S]*?)(?=###|---END)/i);
  const notesSection = block.match(/### (?:Carry-Forward Notes?|Advancement Notes?|Notes?(?: for \w+)?)\n([\s\S]*?)(?=###|---END)/i);

  const weakBullets = weakAreasSection
    ? weakAreasSection[1].trim().split('\n').filter(l => l.startsWith('-')).map(l => l.slice(1).trim()).join('; ')
    : null;

  return {
    status: statusMatch?.[1] ?? 'Complete',
    score: scoreMatch?.[1]?.trim() ?? null,
    weakAreas: weakBullets || null,
    notes: notesSection?.[1]?.trim().slice(0, 200) ?? null,
  };
}

// === API ===

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function callWithStreaming(client, params, agentLabel) {
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(1000 * Math.pow(2, attempt - 1));
      process.stdout.write(chalk.yellow(`\nRetrying (attempt ${attempt + 1}/${MAX_RETRIES})...\n`));
    }

    try {
      const stream = client.messages.stream(params);
      let fullText = '';
      let inToolUse = false;

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            inToolUse = true;
            process.stdout.write(chalk.dim('\n[Searching web...]\n'));
          } else if (event.content_block.type === 'text' && inToolUse) {
            inToolUse = false;
            process.stdout.write(chalk.dim('[Search complete]\n\n'));
            process.stdout.write(agentLabel + ' ');
          }
        } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          process.stdout.write(event.delta.text);
          fullText += event.delta.text;
        }
      }

      return fullText;
    } catch (err) {
      if (attempt === MAX_RETRIES - 1) throw err;
      if (err.status && err.status >= 400 && err.status < 500) throw err;
    }
  }
}

// === SESSION ===

async function promptYesNo(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(chalk.yellow(question), answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

function printStatus(agent, moduleData, sectionData, moduleDir) {
  console.log(chalk.bold('\n─── Status ───'));
  console.log(`Agent:   ${chalk.cyan(agent)}`);
  console.log(`Module:  ${chalk.cyan(moduleData.name)}`);
  if (sectionData) console.log(`Section: ${chalk.cyan(sectionData.name)}`);
  const stateFiles = ['test-results.md', 'project-state.md', 'module-record.md'];
  for (const f of stateFiles) {
    const exists = fs.existsSync(path.join(moduleDir, f));
    console.log(`${f}: ${exists ? chalk.green('✓') : chalk.dim('missing')}`);
  }
  console.log('──────────────\n');
}

async function finishSession({ block, stateFilePath, progressPath, historyPath, agent, moduleData, sectionData }) {
  writeFileSafe(stateFilePath, block);
  console.log(chalk.green(`\n✓ Saved: ${stateFilePath}`));

  const meta = parseProgressMeta(block);
  updateProgress(progressPath, {
    agent,
    moduleName: moduleData.name,
    sectionName: sectionData?.name ?? null,
    ...meta,
  });
  console.log(chalk.green(`✓ Progress log updated`));

  deleteHistory(historyPath);
  console.log(chalk.bold.green(`\nSession complete.\n`));
}

async function runSession(client, { agent, school, module: moduleNum, section: sectionNum, forceResume }) {
  const schoolDir = path.join(SCHOOLS_DIR, school);
  const roadmapPath = path.join(schoolDir, 'roadmap.md');
  const roadmap = parseRoadmap(roadmapPath);
  const moduleData = roadmap.modules.find(m => m.number === moduleNum);
  const sectionData = sectionNum != null
    ? moduleData?.sections.find(s => s.sectionIndex === sectionNum)
    : null;

  const moduleDir = path.join(schoolDir, `module-${moduleNum}`);
  const sessionDir = sectionNum != null ? path.join(moduleDir, `section-${sectionNum}`) : moduleDir;
  const historyPath = path.join(sessionDir, '.chat-history.json');
  const progressPath = path.join(schoolDir, 'progress.md');

  const stateFilePaths = {
    teacher: path.join(sessionDir, 'teacher-assessment.md'),
    tester: path.join(moduleDir, 'test-results.md'),
    pm: path.join(moduleDir, 'project-state.md'),
    board: path.join(moduleDir, 'module-record.md'),
  };
  const stateFilePath = stateFilePaths[agent];

  const variables = buildVariables(agent, schoolDir, moduleNum, sectionNum, moduleData, sectionData, progressPath, roadmap);
  const systemPrompt = assembleTemplate(agent, variables);

  const makeParams = msgs => {
    const p = { model: MODELS[agent], max_tokens: 8192, system: systemPrompt, messages: msgs };
    if (WEB_SEARCH_AGENTS.has(agent)) {
      p.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
    }
    return p;
  };

  const historyMeta = { agent, school, module: moduleNum, section: sectionNum };
  const agentLabel = chalk.bold.cyan(`[${agent.toUpperCase()}]`);
  const markers = MARKERS[agent];

  // Check for existing history
  let messages = [];
  const existingHistory = loadHistory(historyPath);
  if (existingHistory) {
    const resume = forceResume || await promptYesNo('Found an existing session. Resume? (y/n): ');
    if (resume) {
      messages = existingHistory.messages;
      console.log(chalk.cyan(`\nResuming with ${messages.length} messages in history.\n`));
    } else {
      deleteHistory(historyPath);
    }
  }

  // Kickstart if fresh
  if (messages.length === 0) {
    messages.push({ role: 'user', content: KICKSTART[agent] });
    process.stdout.write(`\n${agentLabel} `);
    const responseText = await callWithStreaming(client, makeParams(messages), agentLabel);
    process.stdout.write('\n');
    messages.push({ role: 'assistant', content: responseText });
    saveHistory(historyPath, { ...historyMeta, messages });
  }

  // Check if block already present in history (resumed after agent output the block)
  {
    const allText = getFullAssistantText(messages);
    const block = extractBlock(allText, markers.start, markers.end);
    if (block) {
      const finishContext = { block, stateFilePath, progressPath, historyPath, agent, moduleData, sectionData };
      await finishSession(finishContext);
      return;
    }
  }

  // Interactive loop
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const prompt = () => new Promise(resolve => rl.question(chalk.green('\nYou: '), resolve));
  console.log(chalk.dim('Commands: /done  /quit  /status\n'));

  try {
    while (true) {
      const raw = await prompt();
      const input = raw.trim();

      if (input === '/quit') {
        saveHistory(historyPath, { ...historyMeta, messages });
        console.log(chalk.yellow('\nSession saved. Resume with: node school.js resume ' +
          `${school} ${agent} module-${moduleNum}${sectionNum ? ` section-${sectionNum}` : ''}`));
        break;
      }

      if (input === '/status') {
        printStatus(agent, moduleData, sectionData, moduleDir);
        continue;
      }

      let userMessage = input;

      if (input === '/done') {
        const allText = getFullAssistantText(messages);
        const block = extractBlock(allText, markers.start, markers.end);
        if (block) {
          rl.close();
          await finishSession({ block, stateFilePath, progressPath, historyPath, agent, moduleData, sectionData });
          return;
        }
        userMessage = `Please provide your structured ${agent} output now, formatted exactly with ` +
          `the ${markers.start} and ${markers.end} markers as specified in your instructions.`;
      }

      messages.push({ role: 'user', content: userMessage });
      process.stdout.write(`\n${agentLabel} `);

      const responseText = await callWithStreaming(client, makeParams(messages), agentLabel);
      process.stdout.write('\n');
      messages.push({ role: 'assistant', content: responseText });
      saveHistory(historyPath, { ...historyMeta, messages });

      const block = extractBlock(responseText, markers.start, markers.end);
      if (block) {
        rl.close();
        await finishSession({ block, stateFilePath, progressPath, historyPath, agent, moduleData, sectionData });
        return;
      }
    }
  } catch (err) {
    saveHistory(historyPath, { ...historyMeta, messages });
    console.error(chalk.red(`\nError: ${err.message}`));
    console.log(chalk.yellow(`Session saved. Resume with: node school.js resume ` +
      `${school} ${agent} module-${moduleNum}${sectionNum ? ` section-${sectionNum}` : ''}`));
    rl.close();
    process.exit(1);
  }

  rl.close();
}

// === PREREQUISITES ===

function checkPrerequisites(agent, schoolDir, moduleNum, roadmap) {
  const moduleDir = path.join(schoolDir, `module-${moduleNum}`);
  const moduleData = roadmap.modules.find(m => m.number === moduleNum);

  if (!moduleData) return { ok: false, missing: [`Module ${moduleNum} not found in roadmap`] };

  if (agent === 'tester') {
    const missing = moduleData.sections
      .map(s => path.join(moduleDir, `section-${s.sectionIndex}`, 'teacher-assessment.md'))
      .filter(p => !fs.existsSync(p));
    return { ok: missing.length === 0, missing };
  }

  if (agent === 'pm') {
    const p = path.join(moduleDir, 'test-results.md');
    return { ok: fs.existsSync(p), missing: fs.existsSync(p) ? [] : [p] };
  }

  if (agent === 'board') {
    const p = path.join(moduleDir, 'project-state.md');
    return { ok: fs.existsSync(p), missing: fs.existsSync(p) ? [] : [p] };
  }

  return { ok: true, missing: [] };
}

// === CLI ===

function printUsage() {
  console.log(chalk.bold('\nUsage:'));
  console.log('  node school.js teacher  {school}  module-N  section-M');
  console.log('  node school.js tester   {school}  module-N');
  console.log('  node school.js pm       {school}  module-N');
  console.log('  node school.js board    {school}  module-N');
  console.log('  node school.js resume   {school}  {agent}   module-N  [section-M]');
  console.log('');
}

function parseArgs(argv) {
  const [agent, school, ...rest] = argv;

  if (!agent || !school) { printUsage(); process.exit(1); }

  if (agent === 'resume') {
    const [realAgent, moduleArg, sectionArg] = rest;
    if (!realAgent || !moduleArg) {
      console.error(chalk.red('Usage: node school.js resume {school} {agent} module-N [section-M]'));
      process.exit(1);
    }
    return {
      agent: realAgent,
      school,
      module: parseInt(moduleArg.replace('module-', '')),
      section: sectionArg ? parseInt(sectionArg.replace('section-', '')) : null,
      forceResume: true,
    };
  }

  if (!MODELS[agent]) {
    console.error(chalk.red(`Unknown agent: ${agent}. Valid agents: teacher, tester, pm, board`));
    process.exit(1);
  }

  const [moduleArg, sectionArg] = rest;
  if (!moduleArg) {
    console.error(chalk.red(`Module required. E.g.: node school.js ${agent} ${school} module-1`));
    process.exit(1);
  }

  if (agent === 'teacher' && !sectionArg) {
    console.error(chalk.red('Teacher requires a section. E.g.: node school.js teacher school-name module-1 section-1'));
    process.exit(1);
  }

  return {
    agent,
    school,
    module: parseInt(moduleArg.replace('module-', '')),
    section: sectionArg ? parseInt(sectionArg.replace('section-', '')) : null,
    forceResume: false,
  };
}

// === MAIN ===

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(chalk.red('\nError: ANTHROPIC_API_KEY environment variable is not set.\n'));
    process.exit(1);
  }

  const argv = process.argv.slice(2);
  if (argv.length === 0) { printUsage(); process.exit(0); }

  const parsed = parseArgs(argv);
  const { agent, school, module: moduleNum, section: sectionNum } = parsed;

  const schoolDir = path.join(SCHOOLS_DIR, school);
  if (!fs.existsSync(schoolDir)) {
    console.error(chalk.red(`\nSchool not found: ${school}`));
    console.log(chalk.yellow('Create a school in Claude Code by saying: "I want to create a new school about {topic}"\n'));
    process.exit(1);
  }

  const roadmapPath = path.join(schoolDir, 'roadmap.md');
  if (!fs.existsSync(roadmapPath)) {
    console.error(chalk.red(`\nRoadmap not found at ${roadmapPath}\n`));
    process.exit(1);
  }

  const roadmap = parseRoadmap(roadmapPath);
  const prereq = checkPrerequisites(agent, schoolDir, moduleNum, roadmap);
  if (!prereq.ok) {
    console.error(chalk.red(`\nMissing prerequisites for ${agent}:`));
    for (const m of prereq.missing) console.error(chalk.red(`  - ${m}`));
    console.error('');
    process.exit(1);
  }

  const moduleData = roadmap.modules.find(m => m.number === moduleNum);
  const sectionData = sectionNum != null
    ? moduleData?.sections.find(s => s.sectionIndex === sectionNum)
    : null;

  // Banner
  const width = 38;
  const agentLine = ` ${agent.toUpperCase()} `;
  const pad = Math.floor((width - agentLine.length) / 2);
  console.log(chalk.bold.blue('\n' + '═'.repeat(width)));
  console.log(chalk.bold.blue(' '.repeat(pad) + agentLine));
  console.log(chalk.bold.blue('═'.repeat(width)));
  console.log(`  School:  ${chalk.cyan(school)}`);
  console.log(`  Module:  ${chalk.cyan(moduleData?.name ?? `Module ${moduleNum}`)}`);
  if (sectionData) console.log(`  Section: ${chalk.cyan(sectionData.name)}`);
  console.log('');

  const client = new Anthropic({ apiKey });
  await runSession(client, parsed);
}

main().catch(err => {
  console.error(chalk.red(`\nFatal: ${err.message}\n`));
  process.exit(1);
});
