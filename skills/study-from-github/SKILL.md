---
name: study-from-github
description: Learn undocumented or poorly-documented SDKs/APIs by studying real-world code on GitHub. Use when asked to "learn from GitHub", "study source code", "find examples", "understand unknown API", "check how others use X", "look for patterns".
---

# Study from GitHub

Learn how to use unknown or poorly-documented APIs by searching, cloning, and studying real-world code on GitHub.

## When to Use This Skill

- Apple's/Xcode/framework API lacks documentation or examples
- Need working code patterns for an SDK
- "How do I use X?" when search engines don't give clear answers
- Learning a new library by example

## The Process

### Step 1: Search GitHub for Real Code

Use `gh search code` to find repositories using the API:

```bash
gh search code "<API-NAME>" --language swift --limit 10
```

**Pro tip:** Combine API name with related terms to narrow results:
```bash
gh search code "RecognizeDocumentsRequest table" --language swift --limit 10
gh search code "VNRecognizeTextRequest boundingBox" --language swift --limit 10
gh search code "PDFPage thumbnail OCR" --language swift --limit 10
```

Examples:
- `RecognizeDocumentsRequest`
- `VNRecognizeTextRequest`
- `PDFPage.thumbnail`

**Tips:**
- Sort by repos with most stars (likely well-maintained)
- Filter by language matching your project (swift, python, etc.)
- Add `--limit 20` if results are sparse

### Step 2: Evaluate Search Results

For each promising result, check:
- **Repository purpose** — Is it related to your use case?
- **Star count** — Higher stars = more likely battle-tested code
- **File path** — Usually `Sources/`, `Lib/`, or root level

Prioritize repos that:
- Are apps/projects (not forks or archived)
- Have recent commits
- Match your domain (e.g., document scanning → receipt/OCR apps)

### Step 3: Clone and Study

```bash
git clone https://github.com/<owner>/<repo>.git
```

Then find the relevant file:
```bash
grep -n "API-NAME" <repo>/**/*.swift
```

### Step 4: Extract Patterns

When studying the code, focus on:
1. **How is it initialized?** (construction patterns)
2. **What configuration options exist?** (properties, enums)
3. **How is it used in a complete flow?** (from input to output)
4. **Error handling** (what can go wrong?)
5. **Platform/version requirements** (macOS 12+, iOS 16+, etc.)

### Step 5: Test and Adapt

- Copy the relevant code pattern
- Adapt to your project structure
- Test with your own data/files
- Iterate based on results

## Example Workflow

**Goal:** Learn how to extract tables from images using Apple's Vision framework.

**Step 1: Search**
```bash
gh search code "RecognizeDocumentsRequest" --language swift --limit 10
```

**Step 2: Find promising results**
- `cameronrye/clarissa` — Document OCR service
- `LuegM/ReceiptBro` — Receipt processing with table detection

**Step 3: Clone the best match**
```bash
git clone https://github.com/LuegM/ReceiptBro.git
```

**Step 4: Study the relevant code**
```bash
cat ReceiptBro/ReceiptBro/Services/OCRService.swift
```

**Step 5: Extract the pattern**
```swift
let request = RecognizeDocumentsRequest()
let observations = try await request.perform(on: imageData)

if let document = observations.first?.document {
    let tables = document.tables
    // ... process tables
}
```

## Rules

1. **No exa/web search for code** — Use `gh search code` only
2. **Clone with git, not gh** — `gh repo clone` may fail due to SSH keys
3. **Focus on patterns, not theory** — Find working code, not documentation
4. **Validate before sharing** — Test the pattern before recommending it
5. **Note version requirements** — Many Vision APIs require macOS 26+

## Version Requirements

Always check platform requirements:
- `RecognizeDocumentsRequest` → macOS 26+, iOS 26+
- `VNRecognizeTextRequest` → macOS 10.15+, iOS 13+
- `VNDetectDocumentSegmentationRequest` → macOS 13+, iOS 16+

If API requires newer OS than target, suggest fallback or alternative approach.