# Playlist Mover Client

React + Vite web client for the playlist migration workspace. This is the main UI for:

- connecting Spotify
- connecting Tidal
- migrating playlists and liked songs between Spotify and Tidal
- deleting and merging Tidal playlists

## Stack

- React 19
- TypeScript
- Vite
- React Router
- Tailwind CSS

## Prerequisites

- Node.js 20+
- npm
- The backend from `playlist-mover-server` running locally or deployed on Railway

## Environment Variables

Create `.env.local`:

```bash
VITE_API_URL=http://127.0.0.1:5000
```

If you want to point the client at Railway instead, set `VITE_API_URL` to your Railway backend URL.

## Run Locally

```bash
npm install
npm run dev
```

The app will usually start at `http://localhost:5173`.

## Required Backend Configuration

The backend must be configured with:

- Spotify OAuth credentials
- `FRONTEND_URL=http://localhost:5173`
- `FRONTEND_REDIRECT=http://localhost:5173/callback`

Spotify should redirect to the backend callback URL, not directly to the frontend:

```text
http://127.0.0.1:5000/callback
```

The backend then forwards the auth code back to the frontend callback route.

## Useful Commands

```bash
npm run dev
npm run build
npm run lint
npm run test
```

## Current Notes

- Tidal sessions are now restored on refresh by re-validating the saved session with the backend.
- Merge and delete flows depend on the backend Tidal session remaining valid.
- This client expects the backend to allow credentialed requests.

## Local Smoke Test

1. Start `playlist-mover-server`.
2. Start this client with `npm run dev`.
3. Connect Spotify from the landing page.
4. Open `Settings` and connect Tidal.
5. Open `Playlists`.
6. Select a Tidal playlist and try delete/merge actions.

## Testing

Integration-style coverage was added for auth session restoration:

```bash
npm run test
```
