# ReallyReadIt

A browser extension that helps you build and manage a reading queue from your bookmarks. No, really, read it.

## What it does

Every time you save a bookmark, ReallyReadIt asks whether you want to add it to your reading queue. You can also add the current tab directly from the popup. The extension badge shows a count of unread items so your queue is always one click away.

## Features

- **Bookmark capture** — prompts you to add a new bookmark to the queue, or adds it automatically (configurable).
- **Manual add** — add the current page to the queue without bookmarking it.
- **Read/unread tracking** — mark items read or unread with one click.
- **Drag-to-reorder** — rearrange your queue by dragging items.
- **Bookmark path** — shows which bookmark folder an item is saved in.
- **Badge counter** — the extension icon shows the number of unread items (or `?` when a bookmark is waiting for your decision).
- **Light / dark / auto theme**.
- **English and Spanish** interface.

## Installation (developer mode)

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the project folder.

## Usage

| Action | How |
|---|---|
| Add a bookmarked page | Save a bookmark — a prompt appears in the popup. Click **Yes, add** or **No**. |
| Add the current page | Open the popup and click the **+** button. |
| Open an item | Click its title in the queue. |
| Mark as read / unread | Click the eye icon next to the item. |
| Remove an item | Click the **×** button next to the item. |
| Reorder | Drag items by their handle (`⋮⋮`). |
| Settings | Click the gear icon in the popup to change bookmark behaviour, add order, and theme. |

## Development

```bash
npm install       # install dev dependencies (jsdom for tests)
npm test          # run the test suite
```
