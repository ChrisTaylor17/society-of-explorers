# Source-read boundary incident — 2026-11-04

The native read-only audit crossed the no-download boundary by opening an older cloud-backed source copy while comparing hashes. The confirmed file is `/Users/christaylor/Documents/Codex/2026-11-01/task-4/soe-native-transport-storage/native-policy/apple/MemberPolicy.swift`.

The comparing process recorded size 5,916 bytes and zero allocated blocks, then called `read_bytes()` rather than skipping it. A later stat-only observation reported the same size, sixteen blocks and flags64. Prior flags were not recorded. Only this file has a confirmed zero-to-sixteen block transition; this is not proof it was the only source file materialized.

Other compared Swift copies had sixteen blocks before their reads. Earlier recursive source scans, including a linked Expo Gradle-plugin scan and candidate/original repository searches, lacked per-file allocation baselines. Additional incidental materialization cannot be ruled out. One expanded November1 search was interrupted with exit130; agents report no candidate scan remains running. Do not reread sources to try to reconstruct missing allocation history.

No deliberate source-byte edit, SDK manager, package installation, native build, signing, provider, account or production operation was performed by this audit. OS source materialization is separate from the guarded application/test/build runs and must not be hidden by their offline results. The saved Hall/application checkpoint remains unchanged.

No dehydration, reset or cleanup of the source copies is authorized or attempted. Stop broad recursive scans and hashes of older candidate/tooling trees. For any further source read, inspect file metadata first and skip nonempty zero-block/cloud placeholders; use already materialized canonical files and existing evidence. Do not dereference tooling/source symlinks for recursive content scans. If source access needs materialization, obtain the user's direction first. These precautions do not reconstruct the missing historical baselines or claim an OS-level network isolation guarantee.
