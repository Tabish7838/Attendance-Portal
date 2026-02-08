# Backend (web/backend)

## Running tests

```bash
npm test
```

## Notes

- Tests use a mocked Supabase client and exercise `/sync` behavior:
  - LWW accept/reject
  - soft delete
  - basic idempotency replay behavior
