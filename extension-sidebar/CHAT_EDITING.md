# Chat-Driven Iterative Resume Editing

This document explains the chat-driven iterative resume editing feature in the ResumeFit Sidebar extension.

## Overview

Users can discuss how they want their resume modified through a chat interface. The AI proposes incremental changes based on the conversation, and the user explicitly applies changes when ready.

## Architecture

```
User Chat Input
  ↓
Sidebar (sidebar.ts)
  ↓ postMessage
Content Script (contentScript.ts)
  ↓ chrome.runtime.sendMessage
Background Service Worker (background.ts)
  ↓ fetch API
Local Ollama API
  ↓ JSON Response
Background validates & returns
  ↓
Sidebar displays assistant message + proposed edits
  ↓
User clicks "Apply These Changes" or "Keep Chatting"
```

## Flow

### 1. User Sends Chat Message

- User types message in chat input
- Message sent to background with:
  - `message`: User's text
  - `currentDraft`: Current resume draft
  - `jobText`: Job description
  - `chatHistory`: Previous conversation

### 2. Ollama Processing

- Background sends request to Ollama with:
  - **System Prompt**: Enforces incremental changes only, no full rewrites
  - **User Prompt**: Current draft, job description, conversation history, user message
- Ollama returns JSON with:
  - `assistant_message`: AI's response
  - `proposed_edits`: Array of specific edits
  - `updated_draft`: Updated resume (or null if just asking questions)

### 3. Display Results

- Assistant message shown in chat
- If edits proposed:
  - Proposed edits displayed as cards
  - Shows section, before/after diff, reason
  - "Apply These Changes" and "Keep Chatting" buttons appear

### 4. User Action

- **Apply These Changes**:
  - Saves current draft as version snapshot
  - Replaces `currentDraft` with `updated_draft`
  - Updates draft preview
  - Hides proposed edits section
- **Keep Chatting**:
  - Dismisses proposed edits
  - Continues conversation

## System Prompt Rules

The system prompt enforces:

1. **NO full resume rewrites** - only incremental changes
2. **Changes grounded in existing content** - can't invent new sections
3. **1-3 specific edits per message** - focused, actionable changes
4. **Clarifying questions allowed** - `updated_draft` can be null
5. **Strict JSON output** - no markdown, no prose

## JSON Schema

```typescript
{
  "assistant_message": string,        // AI's response to user
  "proposed_edits": [
    {
      "section": "summary" | "experience" | "skills",
      "before": string | null,        // Current text (or null if adding new)
      "after": string,                // Proposed replacement
      "reason": string                // Why this change helps
    }
  ],
  "updated_draft": string | null     // Updated resume (null if just asking questions)
}
```

## Version History

When changes are applied:

1. Current draft saved as version snapshot:
   ```typescript
   {
     timestamp: number,
     draftText: string,
     source: "chat" | "analysis" | "manual"
   }
   ```
2. Stored in `chrome.storage.local`
3. Last 50 versions kept (older versions removed)

## Error Handling

### Ollama Not Running
- Error shown in chat: "Ollama not running. Please install and run Ollama, then run: ollama pull llama3.1"

### Invalid JSON
- Retry once with stricter prompt: "Return ONLY valid JSON. No explanation. No markdown. Just JSON."
- If still fails, show raw `assistant_message` only (no edits)

### Schema Validation Failure
- Error message in chat with specific validation error
- User can continue chatting

## UI Components

### Chat Section
- Message list (user and assistant messages)
- Input field with Send button
- Enter key to send

### Proposed Edits Section (shown when edits available)
- Edit cards showing:
  - Section badge (summary/experience/skills)
  - Before/After diff
  - Reason for change
- Action buttons:
  - "Apply These Changes" (primary)
  - "Keep Chatting" (secondary)

## State Management

### ExtensionState
```typescript
{
  currentDraft: string,              // Current resume draft
  chatHistory: ChatMessage[],        // Conversation history
  pendingEdits?: ProposedEdit[],     // Currently proposed edits
  draftVersions?: DraftVersion[]     // Version history
}
```

### Persistence
- All state saved to `chrome.storage.local`
- Restored when sidebar reopens
- Version history persists across sessions

## Code Locations

- **Chat Handler**: `src/background.ts` - `handleChatMessage()`, `callOllamaChat()`, `validateChatResponse()`
- **Chat UI**: `src/sidebar/sidebar.ts` - `sendChatMessage()`, `handleChatResponse()`, `displayProposedEdits()`
- **Apply Changes**: `src/sidebar/sidebar.ts` - `applyProposedChanges()`, `saveDraftVersion()`
- **Types**: `src/types.ts` - `ChatResponse`, `ProposedEdit`, `DraftVersion`
- **UI**: `src/sidebar/sidebar.html` - Proposed edits section
- **Styles**: `src/sidebar/sidebar.css` - Proposed edits styling

## Usage Example

1. User: "Make my summary more concise"
2. AI: "I can help with that. Here are some edits to make your summary more concise..."
3. Proposed edits shown:
   - Section: summary
   - Before: [long summary text]
   - After: [concise summary text]
   - Reason: "Removes redundant phrases and focuses on key achievements"
4. User clicks "Apply These Changes"
5. Draft updated, version saved, preview refreshed

## Future Enhancements

- Diff view for version history
- Undo/redo functionality
- Export chat conversation
- Multiple edit proposals with selection
- Edit preview before applying

