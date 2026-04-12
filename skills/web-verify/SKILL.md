---
name: web-verify
description: Verify completed web UI tasks using browser automation. Use when asked to "verify a web task", "test the web UI", "check the web app", "validate the frontend", or after implementing a web-related todo. Loads agent-browser skill to test web applications. Starts dev servers if needed and cleans them up after verification.
---

# Web UI Task Verification

Verify completed web UI/frontend tasks using browser automation. This skill is designed to run after a web-related implementation todo is completed.

## Prerequisites

- The implementation todo must be completed
- The web application should be testable (local dev server or deployed)
- agent-browser skill must be available

## Verification Workflow

### Step 1: Find and Claim the Verification Task

List open todos to find the web UI task that needs verification:

```
todo list
```

If the specific todo is known, claim it:

```
todo claim {todo-id}
```

If no specific todo, use the most recently completed web task.

### Step 2: Read the Todo Details

Get full context about what needs verification:

```
todo get {todo-id}
```

Extract:
- What was implemented
- Files changed
- Expected behavior
- Acceptance criteria

### Step 3: Start Dev Server (If Needed)

Check if a dev server needs to run:

**Look for indicators in the project:**
- `package.json` scripts like `dev`, `start`, `serve`
- `vite.config.*`, `webpack.config.*`, etc.
- README instructions

**If dev server is needed:**

```bash
# Start the server in background
cmux new dev -d "npm run dev" --tag web-verify-session

# Wait for server to be ready
cmux wait-for "http://localhost:5173" --timeout 30000
```

**Get the server URL:**
- Check `package.json` for port (commonly 3000, 5173, 8080)
- Or read the dev server output for the URL

### Step 4: Load agent-browser Skill

Read the agent-browser skill for browser automation:

```
Read `/Users/peerasak/.agents/skills/agent-browser/SKILL.md`
```

### Step 5: Run Browser Tests

Open the web app and verify the implementation:

```bash
# Open the app
agent-browser open http://localhost:5173

# Wait for page load
agent-browser wait --load networkidle

# Take initial snapshot to see current state
agent-browser snapshot -i
```

**Based on the todo requirements, perform the relevant tests:**

| Test Type | Commands |
|-----------|----------|
| Visual check | `agent-browser screenshot` |
| Element exists | `agent-browser wait "#selector"` |
| Text content | `agent-browser get text @e1` |
| Interaction | `agent-browser click @e1` |
| Form testing | `agent-browser fill @e1 "value" && agent-browser click @e2` |

### Step 6: Verify Acceptance Criteria

Go through each acceptance criterion from the todo:

**Example verification flow:**

```bash
# Test: "Pressing spacebar starts workout"
agent-browser press Space
agent-browser wait 500
agent-browser snapshot -i
# Verify: Check if state changed to 'exercising'

# Test: "Double-tap is debounced"
agent-browser press Space && agent-browser press Space
agent-browser wait 500
agent-browser snapshot -i
# Verify: Check that state is still 'exercising', not 'break'
```

### Step 7: Determine Pass/Fail

**PASS criteria:**
- All acceptance criteria work as expected
- No console errors
- UI behaves correctly

**FAIL criteria:**
- Any acceptance criterion fails
- Console errors occur
- Unexpected UI behavior

### Step 8: Kill Dev Server (Cleanup)

Always clean up the dev server:

```bash
cmux kill dev --tag web-verify-session
```

Or if using tmux directly:

```bash
tmux kill-session -t web-verify-session
```

### Step 9: Update Todo Status

**If verification PASSED:**

```
todo update {todo-id} --status closed
```

Report to user:
> ✅ **Verification passed!**
> - All acceptance criteria met
> - Web UI behaves as expected
> - Task closed

**If verification FAILED:**

```
todo update {todo-id} --status open
```

Report to user:
> ❌ **Verification failed**
> - Issue 1: [description]
> - Issue 2: [description]
> - Task reopened for fixes

## Common Verification Patterns

### Pattern: Event/Interaction Testing

```bash
# Setup
cmux new dev -d "npm run dev" --tag verify
cmux wait-for "http://localhost:5173" --timeout 30000

# Test
agent-browser open http://localhost:5173
agent-browser wait --load networkidle
agent-browser press Space
agent-browser wait 600  # Wait longer than debounce
agent-browser press Space
agent-browser snapshot -i

# Cleanup
cmux kill dev --tag verify
```

### Pattern: Visual Regression

```bash
agent-browser open http://localhost:5173
agent-browser screenshot --full baseline.png
# ... make changes or interact ...
agent-browser screenshot --full current.png
# Compare or verify specific elements
```

### Pattern: Form Validation

```bash
agent-browser open http://localhost:5173/settings
agent-browser snapshot -i
agent-browser fill @e1 "test@example.com"
agent-browser click @e2  # Submit
agent-browser wait --load networkidle
agent-browser snapshot -i
# Verify success message or state change
```

## Error Handling

| Error | Action |
|-------|--------|
| Dev server won't start | Check `package.json`, try different port, report failure |
| agent-browser not found | Check if skill is loaded, try `npx agent-browser` |
| Page won't load | Check URL, verify server is running, check network |
| Element not found | Verify selector, wait longer, take screenshot for debug |
| Test behavior differs from expected | Document the discrepancy, mark as fail |

## Example Session

```bash
# 1. Claim the todo
todo claim TODO-1ce041bb

# 2. Read details
todo get TODO-1ce041bb

# 3. Start dev server
cmux new dev -d "npm run dev" --tag web-verify-1ce041bb
cmux wait-for "http://localhost:5173" --timeout 30000

# 4. Load agent-browser skill
# (read skill file)

# 5. Run tests
agent-browser open http://localhost:5173
agent-browser wait --load networkidle
agent-browser press Space  # First press - start workout
agent-browser wait 200     # Wait less than 500ms debounce
agent-browser press Space  # Second press - should be ignored
agent-browser wait 600     # Wait to see final state
agent-browser snapshot -i  # Verify state is 'exercising', not 'break'

# 6. Cleanup
cmux kill dev --tag web-verify-1ce041bb

# 7. Close if passed
todo update TODO-1ce041bb --status closed
```

## Exit Conditions

| Condition | Next Action |
|-----------|-------------|
| All tests pass | Close todo, report success |
| Any test fails | Reopen todo, report specific issues found |
| Dev server won't start | Report infrastructure issue |
| Cannot access page | Check URL and server status |
