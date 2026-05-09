const express = require('express');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'todos.json');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DEFAULT_SETTINGS = { nowWeeks: 4, nextWeeks: 8 };

function readData() {
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  if (Array.isArray(raw)) {
    return { outcomes: [], todos: raw.map(t => ({ ...t, placement: 'unplaced', outcomeIds: [] })), settings: { ...DEFAULT_SETTINGS } };
  }
  return { settings: { ...DEFAULT_SETTINGS }, ...raw };
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const OUTCOME_COLOURS = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#14b8a6'];

const SEED_TODOS = [
  "Book a family holiday for the summer",
  "Plan a proper date night with my partner",
  "Sort out the kids' bedroom — it needs a proper clear-out",
  "Call mum — haven't spoken properly in weeks",
  "Get back into running — sign up for a local 5K",
  "Book dentist appointments for the whole family",
  "Organise a weekend trip to visit old friends",
  "Clear out the garage and donate what we don't need",
  "Cook a proper Sunday roast together this weekend",
  "Sign up for the pottery class I keep looking at",
  "Read the book that's been on my nightstand for months",
  "Get the car serviced before the long drive",
  "Set up a regular savings plan for the kids",
  "Plan something special for my partner's birthday",
  "Go for a proper walk in the countryside — just us",
  "Sort out the pension paperwork I've been putting off",
  "Build a morning routine that actually sticks",
  "Take the kids swimming — they've been asking for ages",
  "Declutter my wardrobe and drop bags at the charity shop",
  "Catch up with my sister — properly, not just a text",
].map((text, i) => ({
  id: 1700000000000 + i,
  text,
  dueDate: null,
  completed: false,
  createdAt: new Date('2025-01-01').toISOString(),
  placement: 'unplaced',
  outcomeIds: []
}));

function seedData() {
  return { outcomes: [], todos: [...SEED_TODOS.map(t => ({ ...t }))], settings: { ...DEFAULT_SETTINGS } };
}

// ─── Todos ────────────────────────────────────────────────────────────────────

app.get('/api/todos', (req, res) => {
  res.json(readData().todos);
});

app.post('/api/todos', (req, res) => {
  const data = readData();
  const todo = {
    id: Date.now(),
    text: req.body.text,
    dueDate: req.body.dueDate || null,
    completed: false,
    createdAt: new Date().toISOString(),
    placement: req.body.placement || 'unplaced',
    outcomeIds: req.body.outcomeIds || []
  };
  data.todos.push(todo);
  writeData(data);
  res.status(201).json(todo);
});

app.patch('/api/todos/:id', (req, res) => {
  const data = readData();
  const idx = data.todos.findIndex(t => t.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  data.todos[idx] = { ...data.todos[idx], ...req.body };
  writeData(data);
  res.json(data.todos[idx]);
});

app.delete('/api/todos/:id', (req, res) => {
  const data = readData();
  const filtered = data.todos.filter(t => t.id !== parseInt(req.params.id));
  if (filtered.length === data.todos.length) return res.status(404).json({ error: 'Not found' });
  data.todos = filtered;
  writeData(data);
  res.status(204).send();
});

// ─── Outcomes ─────────────────────────────────────────────────────────────────

app.get('/api/outcomes', (req, res) => {
  res.json(readData().outcomes);
});

app.post('/api/outcomes', (req, res) => {
  const data = readData();
  const colour = OUTCOME_COLOURS[data.outcomes.length % OUTCOME_COLOURS.length];
  const outcome = {
    id: Date.now(),
    statement: req.body.statement,
    colour
  };
  data.outcomes.push(outcome);
  writeData(data);
  res.status(201).json(outcome);
});

app.patch('/api/outcomes/:id', (req, res) => {
  const data = readData();
  const idx = data.outcomes.findIndex(o => o.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  data.outcomes[idx] = { ...data.outcomes[idx], ...req.body };
  writeData(data);
  res.json(data.outcomes[idx]);
});

app.delete('/api/outcomes/:id', (req, res) => {
  const data = readData();
  const id = parseInt(req.params.id);
  const exists = data.outcomes.some(o => o.id === id);
  if (!exists) return res.status(404).json({ error: 'Not found' });
  // Remove outcome from all todos that reference it
  data.todos = data.todos.map(t => ({
    ...t,
    outcomeIds: t.outcomeIds.filter(oid => oid !== id)
  }));
  data.outcomes = data.outcomes.filter(o => o.id !== id);
  writeData(data);
  res.status(204).send();
});

// ─── AI ───────────────────────────────────────────────────────────────────────

function loadApiKey() {
  try {
    const env = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    const match = env.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    if (match) return match[1].trim();
  } catch {}
  return process.env.ANTHROPIC_API_KEY;
}

const anthropic = new Anthropic({ apiKey: loadApiKey() });

const ARNOLD_CONTEXT = `A good outcome:
- Describes a desired change in state, not a solution or project name
- Starts with an action/feeling verb: "Feel", "Have", "Be", "Spend", "Make", "Reduce"
- Is memorable and emotive — someone should be able to recall it without looking
- Answers "why" — every task beneath it should make sense when you read it
Examples: "Feel less overwhelmed at work", "Be more present with family", "Have more energy day to day"`;

app.post('/api/analyse', async (req, res) => {
  const data = readData();
  const activeTodos = data.todos.filter(t => !t.completed);

  if (activeTodos.length === 0) {
    return res.status(400).json({ error: 'No active todos to analyse.' });
  }

  const todoList = activeTodos.map(t => `- ${t.text}`).join('\n');

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You help people understand the outcomes behind their tasks.

${ARNOLD_CONTEXT}

Here are someone's current todos:
${todoList}

Analyse these tasks and suggest 2–4 outcomes that capture what this person is really trying to achieve in their life. For each outcome, list the todos from the list above that relate to it (by their exact text).

Respond in this exact JSON format with no other text:
{
  "outcomes": [
    {
      "statement": "Feel less overwhelmed at work",
      "rationale": "One sentence explaining why these tasks suggest this outcome",
      "relatedTodos": ["exact todo text", "exact todo text"]
    }
  ]
}`
      }]
    });

    const raw = message.content[0].text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const json = JSON.parse(raw);

    // Map todo text back to IDs
    const enriched = json.outcomes.map(o => ({
      ...o,
      relatedTodoIds: o.relatedTodos
        .map(text => activeTodos.find(t => t.text === text)?.id)
        .filter(Boolean)
    }));

    res.json({ outcomes: enriched });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Analysis failed. Check your API key and try again.' });
  }
});

app.post('/api/suggest-outcome', async (req, res) => {
  const { todoText } = req.body;
  const data = readData();

  if (!data.outcomes.length) return res.json({ suggestion: null });

  const outcomeList = data.outcomes.map(o => `- id:${o.id} "${o.statement}"`).join('\n');

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 128,
      messages: [{
        role: 'user',
        content: `Given these outcomes a person is working towards:
${outcomeList}

Does this new todo relate clearly to one of them?
Todo: "${todoText}"

If yes, respond with JSON: { "outcomeId": <id>, "confidence": "high" | "medium" }
If no clear match, respond with JSON: { "outcomeId": null }
No other text.`
      }]
    });

    const raw = message.content[0].text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const json = JSON.parse(raw);
    if (!json.outcomeId || json.confidence === 'medium' && data.outcomes.length > 2) {
      return res.json({ suggestion: null });
    }
    const outcome = data.outcomes.find(o => o.id === json.outcomeId);
    res.json({ suggestion: outcome || null });
  } catch (err) {
    console.error(err);
    res.json({ suggestion: null }); // fail silently — ambient feature shouldn't break the form
  }
});

// ─── Demo controls ────────────────────────────────────────────────────────────

app.post('/api/reset', (req, res) => {
  const data = seedData();
  writeData(data);
  res.json(data);
});

app.post('/api/clear', (req, res) => {
  const data = { outcomes: [], todos: [], settings: { ...DEFAULT_SETTINGS } };
  writeData(data);
  res.json(data);
});

// ─── Settings ─────────────────────────────────────────────────────────────────

app.get('/api/settings', (req, res) => {
  res.json(readData().settings);
});

app.patch('/api/settings', (req, res) => {
  const data = readData();
  data.settings = { ...data.settings, ...req.body };
  writeData(data);
  res.json(data.settings);
});

module.exports = app;
