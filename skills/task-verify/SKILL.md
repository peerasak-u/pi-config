---
name: task-verify
description: Verify completed non-web tasks. Use when asked to "verify the task", "check the implementation", "validate the changes", "test the code", or after any implementation todo that doesn't require browser testing. Runs automated checks, tests, and validations appropriate to the task type.
---

# General Task Verification

Verify completed implementation tasks that don't require browser testing. Designed to run after any non-web implementation todo is completed.

## Prerequisites

- The implementation todo must be completed
- The task has defined acceptance criteria
- Any required test commands are available (npm, cargo, pytest, etc.)

## Verification Workflow

### Step 1: Find and Claim the Verification Task

List open todos to find the completed task:

```
todo list
```

Claim the specific todo:

```
todo claim {todo-id}
```

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
- Testing instructions

### Step 3: Determine Verification Type

Based on the task, identify the appropriate verification approach:

| Task Type | Verification Approach |
|-----------|----------------------|
| TypeScript/Svelte code | `npm run check`, type checking |
| Build verification | `npm run build` |
| Unit tests | `npm test`, `cargo test`, `pytest` |
| Linting | `npm run lint`, `cargo clippy` |
| Integration tests | `npm run test:integration` |
| API changes | Manual curl/test or API test suite |
| Documentation | Read and verify accuracy |

### Step 4: Run Appropriate Checks

**For TypeScript/Svelte projects:**

```bash
npm run check
npm run build
```

**For Rust projects:**

```bash
cargo check
cargo clippy
cargo test
```

**For Python projects:**

```bash
python -m pytest
mypy .
flake8 .
```

**For other languages:**
Run the appropriate build, check, and test commands as specified in the project.

### Step 5: Manual Verification (If Needed)

Some tasks require manual code review:

**Read the changed files:**

```
Read the files that were modified per the todo
```

**Verify:**
- Code follows project conventions
- Logic matches the described behavior
- No obvious bugs or edge cases missed
- Comments are accurate

### Step 6: Determine Pass/Fail

**PASS criteria:**
- All automated checks pass (no errors, no warnings)
- All tests pass
- Manual code review passes
- Acceptance criteria are met

**FAIL criteria:**
- Any check fails (errors or critical warnings)
- Any test fails
- Manual review finds issues
- Acceptance criteria not met

### Step 7: Update Todo Status

**If verification PASSED:**

```
todo update {todo-id} --status closed
```

Report to user:
> ✅ **Verification passed!**
> - All checks pass: [list]
> - All tests pass: [list]
> - Acceptance criteria met
> - Task closed

**If verification FAILED:**

```
todo update {todo-id} --status open
```

Report to user:
> ❌ **Verification failed**
> - Check: [which check failed and why]
> - Issue: [specific error or test failure]
> - Location: [file:line if applicable]
> - Task reopened for fixes

## Common Verification Patterns

### Pattern: TypeScript/Svelte Implementation

```bash
# Type check
npm run check

# Build
npm run build

# If the project has tests
npm test
```

### Pattern: Pure Function/Logic Change

```bash
# Read the implemented function
cat src/lib/utils/myFunction.ts

# Check for syntax errors
npx tsc --noEmit

# Verify tests exist and pass
npm test -- myFunction
```

### Pattern: Configuration/Build Change

```bash
# Validate config syntax
npx tsc --noEmit

# Run build
npm run build

# Check output exists
ls -la dist/
```

### Pattern: Store/State Management

```bash
# Type check
npm run check

# Read the store code
cat src/lib/stores/myStore.ts

# Verify tests
npm test -- myStore
```

## Error Handling

| Error | Action |
|-------|--------|
| Check command not found | Check `package.json` for correct command name |
| Type errors | Report specific errors, reopen task |
| Test failures | Report which tests failed and why |
| Build failures | Report build errors, check dependencies |
| Warnings vs errors | Warnings may be acceptable depending on project standards |

## Example Session

```bash
# 1. Claim the todo
todo claim TODO-1ce041bb

# 2. Read details
todo get TODO-1ce041bb

# 3. Run checks
npm run check
# Output: No errors found

# 4. Build
npm run build
# Output: Build completed successfully

# 5. Verify pass → close
todo update TODO-1ce041bb --status closed
```

## Exit Conditions

| Condition | Next Action |
|-----------|-------------|
| All checks pass | Close todo, report success |
| Any check fails | Reopen todo, report specific issues |
| No verification criteria defined | Ask user how to verify, or do code review |
| Cannot run checks | Report tooling issue |

## Verification Command Reference

| Language/Framework | Type Check | Build | Test | Lint |
|-------------------|------------|-------|------|------|
| TypeScript/Svelte | `npm run check` or `npx tsc --noEmit` | `npm run build` | `npm test` | `npm run lint` |
| Rust | `cargo check` | `cargo build` | `cargo test` | `cargo clippy` |
| Python | `mypy .` | N/A | `pytest` | `flake8` |
| Go | `go build` | `go build` | `go test` | `go vet` |
| Node.js | `npx tsc --noEmit` | `npm run build` | `npm test` | `npm run lint` |

## Multi-Step Verification

For complex tasks, verify step by step:

```
Step 1: Type check
Step 2: Build
Step 3: Run tests
Step 4: Manual code review
Step 5: Check for console errors
```

Report after each step:
- ✅ Type check passed
- ✅ Build passed
- ✅ Tests passed (3/3)
- ✅ Code review passed
- ✅ Task closed
