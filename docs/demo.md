# Five-minute interview walkthrough

Start `npm run dev` and open `http://localhost:5173`. A reviewer can choose **Explore the interactive demo** without creating an account. It contains fictional credentials encrypted in memory; changes disappear on leaving the demo. Its public unlock phrase is `vaultline demo workspace`.

For the full backend story, create a personal test account with a supported physical passkey, choose a fictional master passphrase, and add synthetic entries. The automated browser suite provides a reproducible virtual-authenticator alternative.

A short [recorded interface walkthrough](demo.webm) uses the fictional, in-memory demo. It shows the product interface rather than claiming a physical authenticator or public deployment. Re-record it with `npm run record:demo` while the local development server is running.

## Suggested script

**0:00–0:40 — Explain the purpose.**

“Vaultline is a personal password vault built to demonstrate secure design, consistency, and recovery. Account access uses a passkey; a separate passphrase unlocks the vault locally. I chose TypeScript, React, Node/Fastify, and PostgreSQL to keep the complete system understandable and relevant to U-centrix's published web stack.”

**0:40–1:30 — Use the product.**

Sign in and unlock. Add a login with a generated password. Mark it as a favorite and search locally. Open a secure note. Show keyboard focus, the search shortcut, and mobile navigation.

**1:30–2:15 — Show the boundary.**

Inspect an API save and PostgreSQL entry envelope using only synthetic data. Titles, website, username, password, notes, category, and favorite status are ciphertext. Explain the worker, Argon2id, random data key, wrapping key, AES-GCM, and authenticated ID/revision binding. State which metadata remains visible.

**2:15–3:00 — Show a controlled failure.**

Open the same item in two unlocked tabs. Save an edit in the first. Try a different edit in the second. The second draft remains visible with a conflict, and the accepted revision remains unchanged. Explain the database transaction and revision check. The browser test also demonstrates a response lost after commit without duplicating a retry.

**3:00–3:45 — Recover something.**

Export the encrypted vault. Restore it into another unlocked test vault using its original passphrase. Show the recovered entry. Open `docs/evidence/recovery-drill.json` to show the separate completed database recovery exercise, where the synthetic source database was removed before restoration.

**3:45–4:30 — Show the account controls.**

Show sessions and server-verifiable activity. Explain why local reveal/copy/export operations are absent from server audit claims. Discuss recent passkey verification before enrolling an additional passkey or changing the passphrase. Lock a tab and show the other one locks too.

**4:30–5:00 — Explain the limits.**

“A compromised browser or malicious JavaScript can expose an unlocked vault. Forgotten master passphrases cannot be reset into decryption. Rewrapping does not invalidate historical backups. The project has automated evidence, but needs independent review and physical-device/deployment validation before real use.”

## Evidence to keep open

- `docs/architecture.md` and `docs/threat-model.md`.
- Passing `npm run check`, `npm run test:e2e`, and `npm audit` output.
- `docs/evidence/recovery-drill.json` and `docs/evidence/benchmark.json`.
- The recorded desktop/mobile screenshots in `docs/screenshots`.
- The local application and the security test source, ready for follow-up questions.

Present completed behavior separately from the unexecuted public deployment, container verification, and independent review work. Keep real personal credentials out of the interview and any recording.
