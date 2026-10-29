# Personalized recommendations

Home and the shared-post page use the same recommendation engine. It fetches recent posts,
the top three interest categories, and up to 30 followed authors in bounded groups. Results
are deduplicated and scored before pages of 12 are selected. Read posts stay in place as the
next page appends. Signed-out users get freshness, engagement, and author diversity.

Selected interests start at 6 points. A qualifying 4-second view adds 1, a like 4, a save 7,
a share 8, and a comment 5. Report contributes -12 and excludes the reported post. Authors
also accumulate scores. Own posts never train interests. Views/comments/shares are limited
to one contribution per post per day, and repeated likes/saves do not keep adding points.
Undoing a recorded like or save removes its contribution. Scores have a 14-day half-life,
so old interests gradually lose influence. History and author maps are bounded.

Posts get an initial score even without engagement. Personal category affinity is the
strongest signal; followed authors and learned author affinity add priority. Popularity
uses a capped logarithm, and seen posts get a penalty for seven days. Each group of four
slots aims for three interest/followed posts and one discovery post. If a pool runs out,
the other fills the remaining slots. Two consecutive posts from the same author trigger
an alternative-author choice within that pool when available.

Learning updates immediately in account-scoped browser storage and syncs to the signed-in
user's `feedSignals` profile field after two idle seconds. Saved profile signals hydrate on
future sign-ins; if Firestore rejects a write, browser learning remains available. This is
a bounded scoring recommender, not a trained neural network or Instagram's proprietary system.

## Firebase setup

Merge `firestore.feed.indexes.json` into your project's existing indexes and deploy with
your Firebase workflow. Interest and followed-author retrieval need these composite indexes.
If unavailable, the app falls back to ranking the recent candidate pool and shows a notice.
Ensure user rules allow only the authenticated owner to update their `feedSignals` field.
There is no Firebase deployment configuration in this repository; indexes/rules are not deployed
by these local code changes. Never loosen profile writes to other users.

Signals are heuristics and sync is last-write-wins across concurrent devices. They do not
measure completed video watch time; the passive signal is a post at least 50% visible for
four continuous seconds. The next fetched page uses the newest scores. A home refresh creates
a new session and also uses updated scores; already displayed cards do not jump around.
