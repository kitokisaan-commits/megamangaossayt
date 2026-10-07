# Future public accounts

V1 has no public signup or fake bookmark/comment controls. Administrative identities are separate from future readers.

When public accounts are requested, add `reader_profiles(id UUID REFERENCES auth.users)` and user-owned relations for `favourites`, `bookmarks`, `reading_history` and `notification_preferences`. Use `(user_id,title_id)` or `(user_id,chapter_id)` unique keys as appropriate and require `auth.uid()=user_id` in both USING and WITH CHECK policies. Public comments need their own published-content foreign keys, moderation state and rate limits; they must not gain admin roles by editing profile metadata.

The current title and chapter IDs are stable foreign-key targets. Use versioned local history import after explicit sign-in, with latest timestamp winning. Keep `admin_users` as an independently provisioned allowlist and never trust user-supplied role claims. No future account table is exposed as a working V1 feature.
