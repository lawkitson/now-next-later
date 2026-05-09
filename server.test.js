const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// We point the server at a separate test data file so tests
// don't touch your real todos.json
const TEST_DATA_FILE = path.join(__dirname, 'todos.test.json');
process.env.DATA_FILE = TEST_DATA_FILE;

const BASE_URL = 'http://localhost:3001';

// We need a version of the server we can start/stop in tests.
// Pull out the core logic into a function that accepts a port.
const express = require('express');
const app = require('./server-lib');

let server;

before(() => {
  fs.writeFileSync(TEST_DATA_FILE, '[]');
  return new Promise(resolve => {
    server = app.listen(3001, resolve);
  });
});

after(() => {
  fs.unlinkSync(TEST_DATA_FILE);
  return new Promise(resolve => server.close(resolve));
});

async function api(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

describe('GET /api/todos', () => {
  test('returns empty array when no todos exist', async () => {
    const res = await api('GET', '/api/todos');
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.deepStrictEqual(data, []);
  });
});

describe('POST /api/todos', () => {
  test('creates a todo with text', async () => {
    const res = await api('POST', '/api/todos', { text: 'Buy milk' });
    assert.strictEqual(res.status, 201);
    const todo = await res.json();
    assert.strictEqual(todo.text, 'Buy milk');
    assert.strictEqual(todo.completed, false);
    assert.ok(todo.id);
  });

  test('creates a todo with a due date', async () => {
    const res = await api('POST', '/api/todos', { text: 'File taxes', dueDate: '2026-04-15' });
    const todo = await res.json();
    assert.strictEqual(todo.dueDate, '2026-04-15');
  });
});

describe('PATCH /api/todos/:id', () => {
  test('marks a todo as completed', async () => {
    const created = await (await api('POST', '/api/todos', { text: 'Walk the dog' })).json();

    const res = await api('PATCH', `/api/todos/${created.id}`, { completed: true });
    assert.strictEqual(res.status, 200);
    const updated = await res.json();
    assert.strictEqual(updated.completed, true);
  });

  test('returns 404 for unknown id', async () => {
    const res = await api('PATCH', '/api/todos/999999', { completed: true });
    assert.strictEqual(res.status, 404);
  });
});

describe('DELETE /api/todos/:id', () => {
  test('deletes a todo', async () => {
    const created = await (await api('POST', '/api/todos', { text: 'Delete me' })).json();

    const deleteRes = await api('DELETE', `/api/todos/${created.id}`);
    assert.strictEqual(deleteRes.status, 204);

    const todos = await (await api('GET', '/api/todos')).json();
    assert.ok(!todos.find(t => t.id === created.id));
  });

  test('returns 404 for unknown id', async () => {
    const res = await api('DELETE', '/api/todos/999999');
    assert.strictEqual(res.status, 404);
  });
});
