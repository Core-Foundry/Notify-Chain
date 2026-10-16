# Rate Limiting Fix - Task Breakdown

## Bug 1: Missing `rawApiKeys` variable in `config.ts`
- [x] Add `const rawApiKeys = parseJsonEnv<unknown>('API_KEYS', '[]');` before its usage in `loadConfig()`
- File: `listener/src/config.ts`

## Bug 2: Health endpoint not rate-limit exempt in `events-server.ts`
- [x] Use the standalone `isRateLimitExempt()` function instead of the incomplete inline check
- File: `listener/src/api/events-server.ts`

## Bug 3: Duplicate `contractStatuses` declaration in `events-server.ts`
- [x] Remove the first (redundant) `const contractStatuses` block, keep the second
- File: `listener/src/api/events-server.ts`

## Verification
- [ ] Run `npm run typecheck` to verify TypeScript compilation
- [ ] Run `npm test -- rate-limiter` to verify tests pass

