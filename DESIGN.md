# Design

## Source of truth

- Status: Active
- Date: 2026-09-11
- Product surfaces: OBS Custom Browser Dock, 1920 × 1080 Overlay, browser Debug view
- Evidence reviewed: `apps/web/src/components/Dock.tsx`, `apps/web/src/components/Overlay.tsx`, `apps/web/src/index.css`, `apps/web/src/lib/overlay-state.ts`, `agent_plan/inkling-obs-streamkit-handoff.md`, and the two team-detail reference screenshots supplied on 2026-09-11.

## Brand

- Personality: competitive, readable at broadcast distance, energetic without visual clutter.
- Trust signals: stable hierarchy, consistent spacing, legible Japanese names, and predictable slide timing.
- Avoid: copying event branding from references, multiple competing accent colors, dense statistics, SNS handles, and game-data decoration that is not used by this toolkit.

## Product goals

- Show each four-player roster as four full-width horizontal rows.
- Make player names and every registered weapon recognizable at broadcast resolution.
- Let the operator choose one accent color in the Dock and apply it consistently across the Overlay.
- Resolve weapon images without issuing new upstream API requests on carousel slide changes.
- Non-goals: SNS, XP, gear, sub-weapon, special-weapon, and per-player social or ranking details.
- Success signals: four rows fit inside the fixed canvas, weapon names are not rendered visually, all registered weapons are present, and changing only the accent does not refetch matchup data.

## Personas and jobs

- Primary persona: a tournament stream operator controlling the broadcast from an OBS Dock.
- Job: choose matchup metadata and one visual accent, submit once, and leave the Overlay running unattended.
- Viewing context: a 1920 × 1080 OBS Browser Source observed from a distance and a scaled Debug preview used during setup.

## Information architecture

- Dock: tournament → left/right teams → next rule/stage → accent color → explicit “Overlayへ反映”.
- Overlay carousel: matchup → Team A detail → Team B detail → next match.
- Team detail hierarchy: team label/name → four player rows → player identity/position → weapon images.

## Design principles

1. Broadcast legibility wins over information density.
2. One accent color creates identity; neutral light/dark layers provide contrast.
3. The references guide composition, not branding or content scope.
4. Data loading follows operator selection, not automatic carousel timing.

## Visual language

- Color: a single operator-selected accent drives the Vector Grid motion, header gradients, row rails, chips, image frames, and indicators. White and dark translucent neutrals remain structural colors.
- Typography: bold Japanese-capable sans serif, with the team name as the largest text and player names as the row anchors.
- Spacing: four evenly spaced horizontal rows inside a centered 1660 px content column.
- Shape/elevation: Glassmorphism is a fixed requirement. Use translucent cool-neutral surfaces, fine white borders, inner highlights, and soft shadows; do not remove the glass treatment from cards. The matchup slide places a central `VS` badge between the two team panels.
- Background: a white Vector Grid replaces the looping video. A static grid stays behind the content while the operator-selected accent drives a slow diagonal sweep and subtle rings.
- Motion: retain the eight-second carousel and fade; do not animate individual weapon images. Background motion uses only `transform`, is decorative, and stops when reduced motion is requested.
- Imagery/iconography: player avatars are optional identity aids; registered weapons use Ikaclo main-weapon images.

## Components

- Existing: `Dock`, `OverlayCarousel`, `MatchupSlide`, `TeamDetailSlide`, `MatchInfoSlide`, `PlayerAvatar`.
- Updated: `TeamDetailSlide` becomes a four-row table-like layout; the Dock gains one native color input.
- New: weapon-image presentation and API-side image URL resolver/cache.
- Token ownership: `Overlay` owns `--overlay-accent-color` and `--overlay-accent-rgb`; descendants consume them without defining side-specific accent colors.

## Accessibility

- Preserve semantic headings and ordered player/weapon lists.
- Weapon items expose the Japanese weapon name through an accessible label; a missing image has a clear accessible fallback label without rendering the name visually.
- Keep text contrast independent of the selected accent by placing primary text on neutral surfaces.
- Retain reduced-motion handling for the carousel.
- The Dock color input has a visible label and text output of the selected hexadecimal value.

## Responsive behavior

- Overlay layout is fixed at 1920 × 1080 and is never internally reflowed for smaller screens.
- Debug scales only the outer iframe wrapper, preserving the production viewport and media-query behavior.
- Dock controls continue to fit the narrow OBS panel as a single column.

## Interaction states

- Loading: keep the Overlay background visible until the selected matchup is resolved.
- Empty: a player with no weapons shows a neutral “未設定” marker.
- Image unavailable: show a neutral placeholder without substituting the weapon name as visible content.
- Error/slow upstream: keep the roster usable and leave unavailable weapon images as placeholders; do not automatically retry.
- Success: Dock submission updates selection and accent together; carousel slide changes use already-resolved data and mounted images.

## Content voice

- Use short broadcast labels: `TEAM A`, `TEAM B`, `PLAYER`, `POSITION`, `WEAPONS`, `NEXT MATCH`, `RULE`, and `STAGE`.
- Preserve tournament, team, player, position, rule, stage, and weapon names exactly as stored or received.

## Implementation constraints

- React + TypeScript in the existing Vite app; no router or second bundle.
- Dock-to-Overlay storage remains ID-centered and uses the existing same-window listener plus `storage` event.
- Upstream weapon detail is requested once per distinct numeric weapon ID while matchup data is loaded. Carousel transitions never trigger it, and it is never polled or automatically retried.
- All slides remain mounted after matchup resolution so carousel transitions do not remount weapon images.
- No new dependency is required.
- Validation should distinguish static build/lint, browser Debug rendering, and real OBS output.

## Open questions

- [ ] Confirm the final accent and weapon-image legibility in the actual OBS version used for broadcast. Owner: operator. Impact: visual polish only; layout and data flow are fixed.
