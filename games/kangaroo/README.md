# Kangaroo racks

A manual hunt for *kangaroo words*, words carrying a synonym inside them
(`lager` carries `ale`).

Type a word to get a rack of letter tiles. **+ child** copies that rack's
letters onto a new rack below it; drag letters into the tray to remove them,
rearrange what is left, and the caption tells you what the rack now spells.
Children can only ever lose letters their parent had, so the tree stays honest.

It has no dictionary and does no spell check — it is game pieces, not a judge.
Autosaves to `localStorage`, undo covers everything, and every drag has a
tap-only and keyboard equivalent. Design notes in `KANGAROO.md`.

```bash
npm run dev        # play locally
npm test           # rack rules
npm run smoke      # drives the lager -> ale flow in a real browser
npm run artifact   # dist/kangaroo.artifact.html, one offline file
```

Moved here from the `claude/kangaroo-word-discovery-bnazwb` branch, where it
lived beside the grid-card prototype behind a **Kangaroo** button. It is now
its own app; the styles in `src/index.css` started as a copy of grid-cards'.
