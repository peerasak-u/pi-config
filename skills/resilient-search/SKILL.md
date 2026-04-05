---
name: resilient-search
description: Performs web searches with built-in retry logic, keyword limiting, and explicit delays to avoid 429 Rate Limit errors. Use when asked to "search safely", "search with fallback", "robust search", "avoid 429 search", or when web_search fails.
allowed-tools: web_search, bash
---

# Resilient Search

Execute web searches while actively avoiding 429 Rate Limit errors by limiting queries and adding mandatory delays.

## Step 1: Mandatory Pre-flight Delay

Always perform a `sleep` before the **first** search in a sequence to ensure no "burst" overlap with any previous activity.

```bash
# Before the first search in a sequence
sleep 1
```

## Step 2: Single Query Only (Hard Requirement)

The Brave Search API's rate limits are strictly enforced (1 request/second). **NEVER** send multiple queries in a single `web_search` call. This is the primary cause of immediate 429 errors.

1.  **Strict Constraint**: The `queries` array MUST contain exactly one element.
2.  **Simplify**: Use 1-2 high-impact keywords first (e.g., "Toy DataRockie").

```typescript
// ✅ CORRECT - exactly one query
web_search({ queries: ["Toy DataRockie"] })

// ❌ INCORRECT - multiple queries at once
web_search({ queries: ["Toy DataRockie", "Kasidis Satangmongkol", "DataRockie Facebook"] })
```

## Step 3: Implement Inter-Search Delay

Always add a `sleep` between consecutive search attempts, even if the previous one succeeded. This prevents "bursty" behavior that triggers rate limits.

```bash
# Before the next search or retry
sleep 3
```

## Step 3: Handle 429 Errors with Exponential Backoff

If the output contains `429 Too Many Requests`:

1.  **First Retry**: Wait 5 seconds, then retry with a simpler query.
    ```bash
    sleep 5
    ```
2.  **Second Retry**: Wait 15 seconds.
    ```bash
    sleep 15
    ```

## Step 4: Browser Fallback

If `web_search` continues to fail after retries, switch to `agent-browser`. This uses a different path (browser automation) and is less likely to be rate-limited by the same API quota.

```bash
# Search via Brave Search or Google
agent-browser open "https://search.brave.com/search?q=Toy+DataRockie" && agent-browser wait --load networkidle
agent-browser snapshot -i
```

## Workflow Summary

| Step | Action | Reason |
|------|--------|--------|
| **1. Preparation** | Use 1 query, 1-3 keywords. | Reduces API load. |
| **2. Execution** | `web_search` -> `sleep 3`. | Prevents burst limits. |
| **3. Recovery** | If 429, `sleep 10` -> Retry. | Allows quota to reset. |
| **4. Final Fallback** | `agent-browser` search. | Bypasses search API entirely. |

## Expected Output

Report results clearly. If a fallback was used, mention it: "Primary search was rate-limited; retrieved info via browser fallback."
