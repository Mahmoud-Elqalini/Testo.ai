# Quickstart: Public Manjam Home

## Prerequisites

- Use the repository's existing Node.js/package-manager setup and local Supabase configuration.
- The root route currently allows signed-out visitors; authenticated visits are redirected by the existing proxy to `/dashboard`.

## Run the public page

1. Start the local app with `npm run dev`.
2. Open `/` in a signed-out browser. With preview seed disabled, confirm the localized empty state appears in the featured-courses section.
3. To preview populated cards, add this line to the ignored root `.env.local`:

   ```env
   MANJAM_PUBLIC_HOME_SEED=true
   ```

4. Restart the development server and reload `/`. Confirm the three synthetic cards appear. No Supabase rows are inserted or updated.
5. Remove the line from `.env.local` and restart to return to the empty state.

## Manual experience review

- Switch between Arabic and English. Confirm translated copy, `lang`/`dir`, and mirrored layout update through the shared provider.
- Switch between light and dark themes. Confirm the Manjam logo variant and scoped semantic colors match the active theme.
- Review wide desktop, tablet, and narrow mobile layouts. On mobile, open and close the navigation using its control, Escape, overlay, and navigation links.
- Use keyboard navigation to reach the language, theme, login, and registration controls; confirm visible focus and truthful destinations.
- Open `/` while signed in and confirm the existing proxy redirects to `/dashboard`.
- In a production configuration, confirm the seed flag cannot return records and the public page shows the empty state until an approved production course source exists.

## Remove the preview data

Unset `MANJAM_PUBLIC_HOME_SEED`, remove the root-page seed call, and delete `src/lib/fixtures/public-home-course-seed.server.ts`. No database cleanup, schema change, migration, or authentication change is required.
