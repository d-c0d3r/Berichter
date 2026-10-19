# Technical Specification: Asynchronous Weekly DOCX Updates

## 1. Objective

Extend the existing FastAPI application to automatically create weekly DOCX files and update individual daily entries through a lightweight FIFO task queue.

The implementation must reuse the existing frontend, AI-assisted text editing, and daily records.

The original DOCX template must remain **immutable**.

## 2. Scope

The implementation must support:

- Creating a weekly document when a user saves an entry and the corresponding file does not exist.
- Processing document creation and content updates as two separate task types.
- Replacing the content of a selected day without modifying other days.
- Updating existing documents in place rather than regenerating them from the template.
- Running document operations without blocking FastAPI’s event loop.
- Displaying basic task results and allowing failed operations to be retried.

The implementation is intended for a small, single-user application. Additional infrastructure should be avoided unless necessary.

## 3. Architecture

### 3.1 Components

Use the following components:

| Component | Responsibility |
|---|---|
| Existing frontend | Select a date, edit text, save entries, display document status |
| FastAPI | Validate requests, persist daily records, enqueue tasks |
| SQLite with `aiosqlite` | Store daily records and weekly document metadata |
| `asyncio.Queue` | Maintain an in-memory FIFO task queue |
| One background consumer | Execute queued tasks sequentially |
| Synchronous DOCX service | Create documents and replace individual daily entries |
| Persistent filesystem storage | Store the original template and weekly documents |

If asynchronous SQLite access is already configured, reuse the existing setup.

No additional database container, Redis instance, Celery deployment, or scheduler is required.

### 3.2 Execution Model

- Run one FastAPI application process.
- Create one queue and one consumer during application startup.
- Process one task at a time.
- Await completion of the current task before taking the next task.
- Execute synchronous document operations outside the event loop using `asyncio.to_thread`.
- Do not pass active database sessions or connections into the document-processing thread. Load the required data first.

## 4. Document Organization

### 4.1 Weekly Files

Each calendar week has one working DOCX file.

The selected entry date determines:

1. The corresponding week.
2. The weekly document.
3. The day-specific location within that document.

Editing a previous week must update that week’s file, not the file for the current date.

Use the date of the week’s Monday as the week identifier.

### 4.2 File Paths

- Generate filenames and storage paths on the backend.
- Use a deterministic filename based on the week identifier.
- Store the original template separately from generated documents.
- Never accept an arbitrary output path from the frontend.
- Never overwrite the original template.

### 4.3 Template Handling

Document creation must copy the original DOCX template to the target weekly file.

The creation task must not prepare a separate blank template or regenerate the document structure.

For the initial implementation, content copied from the original template remains unchanged until a write task explicitly replaces the corresponding day’s entry. This includes sample text in days that have not yet been updated.

Automatic changes to dates, report numbers, or other fields are outside this scope.

## 5. Data Model

### 5.1 Weekly Documents

Add a `weekly_documents` table with the following fields:

| Field | Purpose |
|---|---|
| `id` | Primary key |
| `week_start` | Monday date identifying the week |
| `filename` | Backend-generated filename |
| `status` | `pending`, `processing`, `ready`, or `error` |
| `last_error` | Most recent processing error, nullable |

For the single-user implementation, `week_start` must be unique.

The storage path may be derived from a configured document directory and `filename`; a separate path column is optional.

### 5.2 Daily Entries

Reuse the existing daily-entry table and add:

| Field | Purpose |
|---|---|
| `document_id` | Foreign key to the corresponding weekly document |

Reuse existing fields for the entry date and final text.

There must be one current entry per date. Saving new text for the same date replaces its previously stored text rather than creating another current entry.

Do not duplicate the document filename in each daily entry.

## 6. Queue Task Types

Document creation and document writing must be implemented as separate tasks.

### 6.1 `CREATE_DOCUMENT`

Purpose: create a missing weekly DOCX file.

Payload:

- Weekly document ID.

Behavior:

1. Resolve the target file path.
2. Check whether the file already exists.
3. If it exists, complete successfully without modifying it.
4. If it does not exist, copy the original template to that path.
5. Report any creation error.

This task must never overwrite an existing weekly document.

### 6.2 `WRITE_DAY`

Purpose: replace the content of one day in an existing weekly DOCX file.

Payload:

- Weekly document ID.
- Entry date.
- Replacement text.

The replacement text must be the exact text accepted by the corresponding save request. The worker must not substitute a different text version by rereading a later edit from the database.

Behavior:

1. Resolve the existing weekly file.
2. Verify that it exists.
3. Locate the target day’s content area.
4. Remove the previous content from that area.
5. Insert the replacement text using the existing formatting.
6. Save changes to the same weekly file.

This task must not create the document implicitly. If the file is missing at execution time, it must fail with a clear error.

## 7. Save Request Workflow

When the user saves a daily entry:

1. Validate the selected date and replacement text.
2. Determine the week’s Monday date.
3. Find or create the corresponding weekly-document record.
4. Replace the saved text for the selected date in the database.
5. Link the daily entry to the weekly document.
6. Commit the database transaction.
7. Check whether the weekly file exists.
8. Enqueue the required task or tasks.
9. Return confirmation that the text was saved and document processing was scheduled.

### 7.1 File Exists

Enqueue:

1. `WRITE_DAY`

### 7.2 File Does Not Exist

Enqueue, in this order:

1. `CREATE_DOCUMENT`
2. `WRITE_DAY`

Both tasks must reference the same weekly document.

The enqueue operation for this pair must preserve their adjacency and order. Concurrent save requests must not insert another task between the creation task and its corresponding write task.

A short application-level enqueue lock is sufficient for this single-process implementation.

## 8. FIFO and Replacement Semantics

### 8.1 Sequential Processing

Tasks must execute in the order they were enqueued.

The consumer must not launch document tasks concurrently.

For concurrent HTTP requests, FIFO refers to the order in which requests successfully enqueue their tasks, not the time at which the user originally clicked Save.

### 8.2 Repeated Updates to the Same Day

Each successful write replaces the entire previous entry for that day.

Example:

1. Save Monday with text A.
2. Save Monday with text B.
3. The queue executes the write for A.
4. The queue executes the write for B.
5. Monday contains only text B.

Text A must not remain appended, duplicated, or hidden elsewhere in the target content area.

### 8.3 Empty Text

An empty replacement string must clear the selected day’s content while retaining the cell or paragraph structure required by the document.

The task must not delete the day label, table row, or surrounding layout.

## 9. In-Place DOCX Editing

### 9.1 Required Behavior

A write operation must use the existing weekly DOCX as its input and save the result to the same document path.

It must not:

- Recreate the weekly document from the original template.
- Rebuild the full document from database entries.
- Rewrite other days using their database values.
- Replace the complete table.
- Modify content outside the selected day’s entry area.

### 9.2 Content That Must Be Preserved

Except for the selected day’s replacement text and the necessary local paragraph/run structure, preserve:

- Entries for all other days.
- Day labels.
- Table structure and cell properties.
- Styles and formatting definitions.
- Headers and footers.
- Images and other embedded content.
- Existing content outside the target area.

The new text must inherit the target area’s existing paragraph and character formatting. No unrelated restyling is permitted.

Changes in line wrapping, row height, or pagination caused by the length of the replacement text are acceptable.

### 9.3 Meaning of “In Place”

“In place” means updating the existing document at its existing path, not reconstructing it from the template.

An internal temporary file may be used to protect against incomplete writes, provided it is derived from the existing weekly document and replaces that same file only after a successful save.

Byte-for-byte identity of the DOCX archive is not required; preservation of non-target content and formatting is required.

## 10. Failure Handling

### 10.1 Creation Failure

If `CREATE_DOCUMENT` fails:

- Record the error.
- Do not allow the dependent `WRITE_DAY` task to write against a missing file.
- Mark that write as failed due to the missing document.
- Continue processing subsequent queue tasks.

### 10.2 Write Failure

If `WRITE_DAY` fails:

- Keep the saved daily text in the database.
- Record a readable error.
- Preserve the previous usable document where possible.
- Continue processing the queue.

### 10.3 Retry

Provide a manual “Retry document update” action.

A retry must:

1. Read the latest saved text for the selected day.
2. Check whether the weekly document exists.
3. Enqueue creation followed by writing if missing.
4. Otherwise, enqueue writing only.

Automatic retries and persistent task history are not required.

## 11. Status Reporting

The weekly-document status is a lightweight summary, not a full job-history system.

Use the following meanings:

| Status | Meaning |
|---|---|
| `pending` | One or more document tasks are waiting |
| `processing` | A document task is executing |
| `ready` | No tasks remain for this document and the latest requested update succeeded |
| `error` | Processing failed and user action may be required |

Do not mark a document `ready` merely because an earlier task completed if later tasks for the same document are still pending.

An in-memory pending-task counter per document is sufficient. It must include both creation and write tasks.

## 12. Application Lifecycle

### Startup

- Initialize the queue.
- Start one consumer.
- Treat leftover `pending` or `processing` database statuses as interrupted work and mark them for manual retry.

### Shutdown

- Stop accepting new document tasks.
- Allow active work to finish within the configured shutdown timeout.
- Do not assume an abrupt process termination preserves queued tasks.

### Accepted Limitation

The queue is in memory. Application restarts may discard queued tasks.

Saved daily entries must remain available in SQLite, allowing the user to retry document updates.

Durable queue storage and automatic recovery are outside this implementation.

## 13. Frontend Changes

Keep the existing day navigation and AI-assisted editing.

Add or update:

- Weekly document filename display.
- Document-processing status.
- Download action.
- Retry action.

The interface must distinguish between:

- Text successfully saved to the database.
- Text successfully written to the DOCX file.

Suggested messages:

- “Text saved. Document update queued.”
- “Updating document.”
- “Document is up to date.”
- “Text saved, but document update failed.”

Basic polling is sufficient. WebSocket support is not required.

## 14. Acceptance Criteria

The implementation is complete when the following scenarios pass:

1. Saving an entry for a missing weekly file enqueues `CREATE_DOCUMENT` followed by `WRITE_DAY`.
2. Saving an entry for an existing file enqueues only `WRITE_DAY`.
3. Creating a document never overwrites an existing file.
4. Writing new text for an already populated day removes its previous text.
5. Writing an empty string clears only the selected day’s entry.
6. Updating one day leaves all other document content unchanged.
7. Existing weekly documents are updated without regeneration from the template.
8. Two queued writes to the same day execute sequentially, with the later successful write determining the final content.
9. Editing a previous week updates that week’s file.
10. A failed task does not terminate the consumer.
11. Document-processing failures do not remove text saved in the database.
12. The original template remains byte-for-byte unchanged.
13. The API remains responsive during document processing.
14. Lost in-memory work after a restart can be resubmitted through the retry action.

## 15. Out of Scope

- Celery, Redis, or another external queue service.
- Scheduled document creation.
- Multiple API processes or multiple queue consumers.
- PostgreSQL migration.
- Automatic document regeneration from all database records.
- Document version history.
- Distributed locking.
- Automatic conflict resolution between multiple users.
- Automatic updates to report numbers or template metadata.
- Reworking the existing AI text-generation flow.