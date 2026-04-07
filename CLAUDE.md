# Justin's School of Schools

This project is a Claude-powered learning system. When a user says they want to create a new school, run the Planner flow below.

## Creating a New School (Planner Flow)

When the user says something like "I want to create a new school about {topic}" or "create a school for {topic}":

### Step 1 — Planning conversation

Use web search and your knowledge to understand the topic. Ask the user:
1. What is their current background with this topic?
2. What is their goal — deep mastery, working knowledge, or something specific?
3. Are there any sub-areas they especially want to cover or skip?
4. How much depth do they want per module (broad survey vs deep dive)?

Use this to calibrate the roadmap scope. Don't generate the roadmap until you've had this conversation.

### Step 2 — Generate the roadmap

Output a roadmap in **exactly** this format (the CLI parser depends on it):

```markdown
# {School Name}

## Module 1: {Module Title}

### Section 1.1: {Section Title}
- {topic bullet point}
- {topic bullet point}
- {topic bullet point}

### Section 1.2: {Section Title}
- {topic bullet point}
- {topic bullet point}

## Module 2: {Module Title}

### Section 2.1: {Section Title}
- {topic bullet point}
- {topic bullet point}
```

**Rules:**
- `## Module N:` — exact format, N is an integer
- `### Section N.M:` — exact format, N matches the module, M is sequential within the module
- Lines starting with `- ` under a section are topic bullets (3–8 per section)
- 3–6 sections per module is typical
- Modules should be coherent learning units that build on each other
- Sections are discrete study units — the student self-studies each section before testing
- Topic bullets should be specific and concrete (not "understand X", but "what X is and why it exists", "how X compares to Y", "common pitfalls with X")
- Keep school names as simple lowercase slugs: `ai-fundamentals`, `node-internals`, `linear-algebra`

Show the proposed roadmap to the user and confirm before creating files.

### Step 3 — Create the school directory structure

Once the user approves the roadmap, create:

```
schools/{school-name}/
  roadmap.md          ← the approved roadmap
  progress.md         ← empty file (just a header line)
  module-1/
  module-2/
  ...
```

`progress.md` should contain just this header:
```markdown
# Progress Log — {School Name}
```

### Step 4 — Confirm and tell the user how to start

After creating all files, tell the user:
- The school has been created at `schools/{name}/`
- They should study Module 1 using the roadmap (`schools/{name}/roadmap.md`) before testing
- The first command to run when ready: `node school.js tester {name} module-1`
- The full learning flow for each module: Self-study → Tester → PM → Board

## School Flow Reference

For each module:
1. **Self-study** — read the roadmap sections and learn the material independently
2. **Tester** — when ready: `node school.js tester {school} module-N`
3. **PM** — after passing the test: `node school.js pm {school} module-N`
4. **Board** — after completing the project: `node school.js board {school} module-N`

Then repeat for the next module.

## File Structure Reference

```
schools/{name}/
  roadmap.md
  progress.md
  module-N/
    .chat-history.json        ← temp, deleted on clean exit
    test-results.md           ← written by Tester agent
    project-state.md          ← written by PM agent
    module-record.md          ← written by Board agent
```
