# QR event attendance and lost-and-found evaluation

## M117 · Event attendance

A registered student opens My registrations on web or Flutter and selects Show QR ticket. Each request replaces the previous ticket. Tickets expire after five minutes or when the event ends, whichever comes first.

On the organizer web page, focus the scan field for the event. Use a QR reader in keyboard mode and submit. Check-in opens 30 minutes before the scheduled start. A successful scan records one attendance timestamp. Reopen the private roster to see it. A second scan should fail. Verify the workflow on a real phone and reader during the pilot.

## M118 · Lost-and-found evaluation

Run `node scripts/evaluate-lost-found.mjs` from backend after installing dependencies. The fixture contains eight synthetic query pools, seven labelled matches, a no-match case, Unicode titles, synonyms and a six-way tie for five places. Pools represent candidates after eligibility filtering.

| Signals used | Correct suggestions | Total suggestions | Precision | Recall |
|---|---:|---:|---:|---:|
| Title and location | 5 | 14 | 35.7% | 71.4% |
| Title alone | 4 | 10 | 40.0% | 57.1% |

Location recovered the identity card while introducing unrelated suggestions at the same venue. Both configurations missed the synonym-only earbuds case and the sixth identical notebook. Keep the current ranking pending a larger, independently labelled campus sample. The fixture measures the ranker only.
