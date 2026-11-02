# Data Model: Public Manjam Home and Featured Courses

## Production data

No production course entity or catalog service exists in the current application. This feature adds no database model, migration, write path, or course-management behavior. The production featured-courses section therefore has zero records and renders the localized empty state until a real, authorized public source is introduced in a later scope.

## Public course card view

The landing page renders only the minimum fields needed for the approved public card presentation. Fields may be omitted when unavailable.

| Field | Purpose | Source/Rule |
|---|---|---|
| `id` | Stable key for rendering | Existing source record; seed uses a synthetic `seed-*` value |
| `title` | Course heading | Publicly displayable localized text |
| `category` | Optional course subject label | Show only when present |
| `instructor` | Optional instructor label | Show only when present and public |
| `summary` | Optional short description | Show only when present |
| `cover` | Optional image or visual fallback | Do not invent a real course image; use neutral/design fallback when absent |

No rating, price, enrollment total, progress, availability badge, or enrollment action is part of this feature unless a future approved public source provides it and a valid destination/action exists.

## Development preview seed

The existing `src/lib/fixtures/public-home-course-seed.server.ts` contains three synthetic bilingual display records with `id`, localized `title`, `category`, `instructor`, and `summary`, a presentation-only `coverStyle`, and `source: 'development-seed'` marker. It is not a production entity and is never persisted.

The accessor returns those records only when both `NODE_ENV === 'development'` and `MANJAM_PUBLIC_HOME_SEED === 'true'`. The caller must prefer live eligible public courses when a real source is added; the seed fills only an otherwise empty local preview. The module is server-only and must not be imported into client components.

## Display preference

Language and theme remain owned by the existing shared providers and persistence flows. This feature adds no preference records, keys, or storage schema.
