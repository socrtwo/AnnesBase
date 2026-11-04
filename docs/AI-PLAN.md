# AI plan

> **Plan.** Anne's Base has an early native editor and SQLite viewer; advanced database features remain planned. This document fixes what the **AI** tab and the **AI** menu (present in every classic menu layout) will do, which services they use, and the rules for privacy, accuracy and cost. Command ids are in [COMMANDS-PLAN.md](COMMANDS-PLAN.md#ai).

The AI tab is optional. Nothing is sent anywhere until you run an AI command, and every AI command is an ordinary command: it can go on the Quick Access Bar, on a custom tab, in any menu layout, on a shortcut, or in a macro.

## The rule: answers come from the database

A database's value is that its answers are right. Language models are fluent but can be confidently wrong. So:

1. **Ask Your Data never answers from the model's knowledge.** It translates the question to SQL, runs the SQL on your database, and answers from the rows. The answer pane always shows the SQL, the row count and the rows; a number in the answer is a number from the result. If the question cannot be expressed as a query on this database, it says so.
2. **Nothing is changed without review.** Design suggestions (tables, fields, indexes, relationships, forms, reports, validation rules, code) arrive as a plan with a *Create* or *Apply* button. Data changes (Classify, Extract, Clean, Match, Reconstruct) arrive as a preview grid of old and new values; applying them is one journaled, undoable step.
3. **Action queries are never run by AI alone.** If a question would need an update, append, delete or make-table query, the query is shown with *View Results* (`query.view`) first; running it is the user's click.
4. **Reconstructed values are marked.** `ai.reconstruct` proposals for unreadable fields during recovery are flagged in the Recovery Report and, if accepted, recorded in the row's lineage (`data.lineage`) as AI-estimated.

## What the AI tab does

| Group | Commands | What is sent (default) |
|---|---|---|
| **Ask** | Ask Your Data, Question to Query, Explain/Improve Query, Fix SQL Error, Translate SQL Dialect, Summarize Records, Intelligent Assistant (classic), Teach Vocabulary | the schema (table and field names, types, keys, descriptions) and the taught vocabulary; Summarize sends the selected rows |
| **Design** | Design Database, Suggest Fields, Suggest Normalization, Suggest Indexes, Build Form, Build Report, Write Validation Rule, Write Expression | the schema; Suggest Indexes adds the query history (SQL text, not results) |
| **Code** | Write Code, Explain Code, Find Bugs, Convert Macro or Code | the code or macro and the schema |
| **Data** | Classify Records, Extract Fields from Text, Clean with AI, Match Records Across Tables, Records from Documents, Translate Field, Run on Selection | the fields you choose, for the rows you choose |
| **Repair** | Diagnose with AI, Reconstruct Damaged Rows, Explain Error Message | the diagnosis and recovery reports (structure, not data); Reconstruct sends the surviving fields of affected rows |
| **Providers** | Set Up AI, Providers and Models, Active AI, AI and Privacy, Several AIs, Choose AIs, Show AI Discussion, AI History, Stop AI, Delete Downloaded Models | — |

### Ask Your Data in detail

1. The question, the schema, the vocabulary and the SQL dialect of the current database are sent to the text model with instructions to return one read-only `SELECT` (or a short sequence) as JSON.
2. The SQL is parsed by the app's own parser; anything other than a read-only query is rejected before it reaches the engine. It runs with a row limit and a time limit.
3. If it fails, the error is sent back once for a correction (`ai.fixSql` logic); after a second failure the pane shows the error and the SQL to edit.
4. The rows are shown as a grid. The model may then write a one-paragraph answer from the result (the result rows, capped, are sent for that step only if *AI and Privacy* allows results to be sent; otherwise the app writes a plain template answer from the numbers).
5. *Save as Query*, *Open in Query Design*, *Chart* and *Add to Dashboard* are offered under the result.

**Vocabulary.** As in Q&A's Intelligent Assistant, you can teach the database's words (`ai.teach`): "members" means `tblResidents`, "joined" means `DateJoined`, "Building C" means `Building = 'C'`. The vocabulary is sent with every question, and the simplest questions ("how many members joined in 2025", "list classes on Tuesday") are answered by the app's own rule-based parser without any AI service at all.

## Setting up

**AI ▸ Set Up AI** is the suite's wizard. It

1. lists services grouped as *Free · on device*, *Free · your computer* (Ollama, LM Studio, llama.cpp server and other OpenAI-compatible local servers), *Free tier*, *Free trial* and *Paid*;
2. links to each service's key page and checks the key with a tiny test request;
3. fetches the service's model list where one is published, so models are chosen by name rather than from a list frozen into the app;
4. shows what each command will send and, for paid services, links to the current price page.

Service terms, free tiers and model names change often; the wizard links to each service's current pages instead of promising limits or prices.

### Text services (planned adapters)

The suite's shared adapters: Anthropic, OpenAI, Google Gemini, Mistral, Groq, OpenRouter, Azure OpenAI, AWS Bedrock, and any OpenAI-compatible endpoint (which covers the local servers). Structured output (JSON schema or tool calling) is used where the service supports it, so SQL and plans come back parseable.

## On the device

Small models run in the app (ONNX Runtime Web / Transformers.js, WebGPU where available, WASM otherwise) for:

- **embeddings** of field names, descriptions and vocabulary, so the right tables are chosen for a question in large schemas before anything is sent, and for semantic search over text fields;
- **near-duplicate scoring** (`data.fuzzyDuplicates`, `ai.match`) together with classical methods (Jaro-Winkler, Soundex and Double Metaphone for names, date proximity);
- an optional small **text-to-SQL model** for simple questions with no service configured.

Each model's license is shown before download; only permissively licensed weights are offered (see [LEGAL.md](LEGAL.md)). *Delete Downloaded Models* removes them.

## Several AIs

The text commands can use the suite's ensemble modes (master synthesis or Quaker consensus), as described in [ENSEMBLE.md](ENSEMBLE.md). For Ask Your Data, each member proposes SQL; the master or clerk chooses or merges them, and the app runs only the final query. When members' queries return different results, the pane says so and shows both.

## What the app will not do

- Send data rows without the user's setting allowing it (*AI and Privacy*: **Schema only** is the default; **Schema and sample rows** and **Schema and query results** are opt-in, per database).
- Send password-protected or encrypted databases' contents to any service unless that database's own setting allows it.
- Run AI-written code automatically. Code from *Write Code* opens in the code editor; the database must be trusted to run it, as any code.
- Present an estimate as a fact. Reconstructed values, dates estimated from free text and probable matches are labeled as such in the data.

## Privacy and keys

Keys are stored in the platform keychain (Android Keystore, iOS Keychain, Windows Credential Manager, macOS Keychain, libsecret on Linux; on the web, encrypted in the browser with a passphrase), never in the database file or in exported settings. **AI History** (`ai.history`) records what was sent, to which service, and what came back, per database; it can be cleared. Fields or whole tables can be marked **never send** (`table.aiExclude`) (for example, notes about residents' health or finances); those fields are left out of every AI request, including the schema.
