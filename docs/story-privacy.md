# Story audience setup

Settings at `/settings` saves `users/{uid}.storyAudience` as `public` or `followers`.
New uploads read the saved value from Firestore and store it as `stories/{id}.audience`.
Changing the setting affects future uploads; existing story audiences remain unchanged.
New users default to Public. Legacy stories without an audience are shown only to their owner and followers.

The feed now queries public stories, the viewer's own stories, and authors they follow.
Follow changes and story expiry update the feed automatically. Restricted stories are not
included in public feed queries.

## Required Firebase deployment

This repository has no Firebase deployment configuration or existing rules. The app filtering
alone does not enforce privacy for someone directly querying the database.

1. Merge `firestore.story-privacy.rules` into the existing deployed Firestore rules. Replace
   existing story permissions and remove any blanket rule that grants public reads to stories.
   Firebase allow rules are additive; a broad existing allow cannot be overridden by this block.
2. Preserve existing rules for users, follows, posts, conversations, notifications, and presence.
   Ensure users can update only their own `storyAudience`, restricted to `public` or `followers`.
   Only the follower should be able to create their own follow document. Story rules rely on it.
3. Merge `firestore.story-privacy.indexes.json` into the project's existing index configuration.
   Deploy the rules and indexes through your existing Firebase project workflow.
4. Verify with owner, follower, non-follower, and signed-out sessions. Both direct document reads
   and list queries for a followers-only story must fail for non-followers and signed-out users.
   Unfollow must remove access, and a user must not create a story under another user's ID or
   change an existing story's audience through an engagement update.

Uploaded Cloudinary URLs are public URLs in this app. Firestore access rules protect story
documents, but cannot revoke a media URL someone already obtained. Fully private media also
requires authenticated media delivery or expiring signed URLs on the media backend.
