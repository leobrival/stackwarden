# StackWarden public/core and cloud split

StackWarden is designed as an open-core product with a local core and an optional cloud control plane.

## Public local core

The public package must remain safe to publish. It contains only deterministic repository governance primitives:

- repository audit scoring;
- advisory checks;
- `.stackwarden/` init templates;
- generated projection freshness checks;
- local config parsing;
- cloud API client wiring without proprietary rule logic.

The local core must not contain private methodology names, client names, private repository URLs, tokens, customer data, or proprietary benchmark datasets.

## Client autonomy

Client repositories own their configuration:

- `.stackwarden/config.yml`;
- `.stackwarden/capabilities.yml`;
- `.stackwarden/ownership.yml`;
- `.stackwarden/pipeline.yml`;
- `.stackwarden/workspaces.yml`.

The CLI must keep useful core behavior offline so a client can maintain its codebase without depending on StackWarden Cloud availability.

## Premium cloud boundary

The cloud API may evaluate proprietary rules, benchmark maturity, prioritize recommendations, and manage licenses. The default privacy contract is metadata-first:

- do not send source code by default;
- do not send secret values;
- send local findings and structural signals;
- let clients opt into richer payloads explicitly.

Initial endpoint shape:

```txt
POST /v1/audit
Authorization: Bearer $STACKWARDEN_TOKEN
```

Request payload:

```json
{
  "toolVersion": "0.1.x",
  "repository": {
    "name": "example",
    "config": {},
    "signals": {},
    "localFindings": []
  },
  "privacy": {
    "sendSourceCode": false
  }
}
```

Response payload:

```json
{
  "license": { "valid": true, "plan": "pro" },
  "findings": [],
  "recommendations": []
}
```

Cloud checks must fail open by default unless a repository explicitly configures a premium check as blocking.

## Public export workflow

The source package can contain internal development metadata, but the public repository is produced through an allowlisted export:

```bash
bun run --filter stackwarden public:export
bun run --filter stackwarden public:check
```

The export writes to `dist/stackwarden-public` and fails if forbidden private markers are present.
