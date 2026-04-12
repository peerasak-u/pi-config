# English Teacher Extension for pi

## Problem Statement
Users want to improve their English writing skills while using pi. They need real-time feedback on vocabulary, grammar, and writing style integrated into their workflow, with progress tracking and periodic summaries.

## Solution Overview
A pi extension that acts as a **pre-processing layer** for user messages. When enabled via `/english-improve`, it intercepts outgoing messages, reviews them with an LLM, presents a side-by-side comparison for user correction, updates the conversation history with the improved version, and maintains a knowledge base of mistakes/vocabulary for progress tracking.

## Technical Design

### Architecture
```
User Message
    ↓
[Extension Hook: pre-send]
    ↓
Language Detector (skip if non-English)
    ↓
Content Block Extractor (skip ```code and """quotes, review natural language)
    ↓
LLM Reviewer (analyze: grammar, vocab, style, tone)
    ↓
Side-by-Side UI (original | suggestions)
    ↓
User Types Correction
    ↓
Session Editor (replace original message)
    ↓
Knowledge Base Update (JSON storage)
    ↓
Primary Agent (receives corrected message)
```

### Key Decisions

| Decision | Rationale |
|----------|-----------|
| Pre-send hook | Must block and review before primary agent sees message |
| User types correction | Active learning: user must engage with suggestions, not auto-correct |
| Side-by-side UI | Clear visual comparison, easy to see what changed |
| JSON storage | Simple, portable, no dependencies, human-readable |
| Semantic mistake tracking | Catches pattern repeats even with different words |
| Sub-session analyzer | Keeps analysis logic separate from main extension code |
| Skip code/quote blocks | Technical content and quoted material shouldn't trigger grammar corrections |

## Implementation Location

**Primary file:** `extensions/english-teacher/index.ts`
**Storage directory:** `~/.pi/extensions/english-teacher/data/`
**Knowledge base files:**
- `mistakes.json` - Mistake records with semantic fingerprints
- `vocabulary.json` - New words/phrases learned
- `sessions.json` - Session metadata for summaries

**Related pi concepts to understand:**
- Extension manifest and hooks (read pi extension docs)
- Session/message editing APIs
- Command registration (`/` commands)
- UI panel/sidebar components

## Code Changes Required

### Step 1: Extension Scaffold & Manifest
Create extension structure with proper registration:
- `extension.json` manifest with pre-send hook
- Command registration: `/english-improve` (toggle), `/english-improve-summary`
- Configuration schema for LLM model selection

### Step 2: Message Interception Pipeline
Implement the pre-send hook:
- Detect if mode is enabled
- Language detection (English vs skip)
- Content extraction: parse markdown code blocks (```) AND custom quote blocks ("""), preserve only natural language for review
- Call LLM reviewer with structured prompt

### Step 3: LLM Review Engine
Create review prompt template:
```
Review this English text for:
1. Grammar errors
2. Spelling mistakes
3. Awkward phrasing
4. Vocabulary improvements (suggest advanced alternatives)
5. Tone/formality adjustments

Format response as JSON with:
- original_segments: [] // text segments
- issues: [{segment_index, type, suggestion, explanation}]
- improved_version: string
```

### Step 4: Side-by-Side UI Component
Build comparison view:
- Left panel: Original message (read-only)
- Right panel: Suggestions + editable text area
- Highlight segments with issues
- "Apply Suggestion" buttons per issue
- "Send" button (only enabled after user edits)

### Step 5: Session Message Replacement
Implement message editing:
- Use pi session API to replace user's original message
- Insert corrected version before primary agent processes
- Ensure conversation history shows corrected text

### Step 6: Knowledge Base (JSON Storage)
Implement data layer:
- `MistakeRecord`: {id, timestamp, original, correction, type, semantic_fingerprint, repetition_count}
- `VocabRecord`: {id, timestamp, word/phrase, context, usage_count}
- `SessionRecord`: {id, timestamp, message_count, mistake_count, new_vocab_count}
- Semantic fingerprint: simplified pattern representation for similarity matching

### Step 7: Semantic Mistake Analyzer (Sub-session)
Create background analyzer:
- Load mistakes.json and vocabulary.json
- Use LLM to analyze patterns: "What mistake types repeat?"
- Generate improvement metrics: "Grammar errors down 40% this week"
- Update mistake records with semantic similarity scores

### Step 8: Summary Command & Report Generation
Implement `/english-improve-summary`:
- Weekly view: Last 7 days stats
- Monthly view: Last 30 days trends
- Generate markdown report with:
  - Mistake categories (pie chart or list)
  - New vocabulary learned
  - Improvement trend (repetition rate going down?)
  - Personalized tips based on common errors

### Step 9: Configuration & Polish
- Settings panel for:
  - LLM model selection (default: inherit from user config)
  - Toggle categories (grammar only, vocab only, etc.)
  - Storage path override
- Error handling and edge cases
- Performance optimization (cache LLM calls)

## Testing Strategy

### Manual Tests
1. **Toggle flow**: `/english-improve` on → send message → see side-by-side → edit → send → check primary agent gets corrected version
2. **Non-English skip**: Send Thai message → should bypass review
3. **Content block skip**: Message with ```code``` → code not reviewed; Message with """quote""" → quote block not reviewed; natural language outside blocks is reviewed
4. **Session editing**: Verify conversation history shows corrected message
5. **Mistake tracking**: Make same grammar error twice → see repetition flag
6. **Summary command**: Run `/english-improve-summary` → see formatted report

### Edge Cases
| Edge Case | Expected Behavior |
|-----------|-------------------|
| Empty message | Skip review, send as-is |
| All content is in code/quote blocks | Skip review, send as-is |
| LLM timeout | Show error, offer to send original or retry |
| Very long message | Truncate or stream review |
| User dismisses without editing | Block send, require at least viewing |
| JSON corruption | Create backup, start fresh with warning |
| Same session multiple messages | Each reviewed independently |

## Future Extensions (Out of Scope)
- Speech-to-text review (voice messages)
- Integration with external dictionaries/thesauruses
- Gamification (streaks, badges)
- Export progress reports (PDF)
- Collaborative mode (review others' messages)
- Multi-language support (learn other languages)

## Acceptance Criteria

- [ ] `/english-improve` toggles mode on/off with visual indicator
- [ ] When ON, messages are blocked and shown in side-by-side UI
- [ ] Code blocks (```) and quote blocks (""") are excluded from review
- [ ] Non-English messages bypass review automatically
- [ ] User must type corrections (not auto-applied)
- [ ] Corrected message replaces original in session history
- [ ] Mistakes and vocabulary saved to JSON files
- [ ] Semantic similarity detects repeated mistake patterns
- [ ] `/english-improve-summary` shows weekly/monthly reports
- [ ] Configurable LLM model (inherits default if not set)
- [ ] Extension uninstalls cleanly without data loss
