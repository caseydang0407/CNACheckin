# CNA Union Check-In & Compliance — Security Specification

## 1. Data Invariants
1. **Default Deny**: Every Firestore path not explicitly matched is denied (`allow read, write: if false`).
2. **PII Isolation**: Attendance records (`name`, `phone`, `email`) and staff records are never readable by unauthenticated visitors or unauthorized chapters. Reads are gated by verified Google identity (`request.auth.token.email_verified == true`) and explicit branch authorization (`authorizedEmails`) or bootstrapped administrator verification (`caseydang0407@gmail.com`).
3. **Passcode Verification Gate**: Unauthenticated in-person check-in writes to `attendance/{recordId}` succeed ONLY when `incoming().verificationPasscode` strictly matches the hidden `daily_passcodes/{dateKey}.code` stored on the server, and all keys/sizes/enum values pass `isValidAttendance()`.
4. **Immutable Audit Trail**: `audit_logs/{logId}` entries cannot be updated or deleted once written, and `createdAt == request.time` is enforced.
5. **Anti-Update-Gap & Strict Keys**: Every `create` enforces `hasAll` + `hasOnly` with strict type and `.size()` checks; every `update` enforces `isValid[Entity]` + action-specific `affectedKeys().hasOnly(...)` + immutable `createdAt`/`ownerUid`.

## 2. "Dirty Dozen" Adversarial Payloads (Must All Yield PERMISSION_DENIED)
1. **Unauthenticated PII Read**: Unauthenticated `list` or `get` on `/attendance` or `/staff`.
2. **Remote Check-In Without Valid Passcode**: `create` on `/attendance/{id}` with `verificationPasscode: "000000"` not matching `/daily_passcodes/{dateKey}`.
3. **Shadow Field Injection on Attendance**: `create` on `/attendance/{id}` including an extra ghost field `{ isVerifiedAdmin: true }`.
4. **Invalid Meeting Session Injection**: `create` on `/attendance/{id}` with `meetingTitle: "Unauthorized Session"`.
5. **Unverified Email Admin Spoof**: Authenticated user with `email: "caseydang0407@gmail.com"` and `email_verified: false` attempting to read `/daily_passcodes`.
6. **Privilege Escalation on Staff Role**: Non-admin user attempting `update` on `/staff/{id}` to change `role` to `"Administrative Staff"`.
7. **ID Poisoning**: Creating a document with a 200-character ID or invalid characters (`../admin`).
8. **Denial-of-Wallet Oversized String**: Creating an `attendance` record with a 5,000-character `name`.
9. **Array Bounds Bypass**: Submitting `authorizedEmails` with >25 entries or non-string first element.
10. **Audit Log Tampering**: Attempting `update` or `delete` on `/audit_logs/{logId}`.
11. **Backdated Timestamp Spoofing**: Submitting `createdAt` equal to a past client timestamp instead of `request.time`.
12. **Vault Owner Spoofing**: Authenticated non-admin creating `/encrypted_documents/{docId}` with `ownerUid` set to another user's UID.
