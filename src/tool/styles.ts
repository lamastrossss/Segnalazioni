export const TOOL_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.sr { font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif; color: #111; -webkit-font-smoothing: antialiased; }
button { font: inherit; cursor: pointer; border: 0; background: none; color: inherit; }
button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 2px solid #2E86AB; outline-offset: 2px; }

.sr-toolbar { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); display: flex; flex-wrap: wrap; align-items: center; gap: 4px;
  max-width: calc(100vw - 16px); padding: 6px; background: #111; color: #fff; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,.25); }
.sr-toolbar .sr-name { padding: 0 8px; font-weight: 600; white-space: nowrap; max-width: 140px; overflow: hidden; text-overflow: ellipsis; }
.sr-tb { padding: 6px 10px; border-radius: 8px; white-space: nowrap; color: #fff; }
.sr-tb:hover { background: rgba(255,255,255,.12); }
.sr-tb[aria-pressed="true"] { background: #fff; color: #111; }
.sr-tb.sr-primary[aria-pressed="true"] { background: #2E86AB; color: #fff; }
.sr-sep { width: 1px; align-self: stretch; background: rgba(255,255,255,.2); margin: 2px 4px; }
.sr-width { font-variant-numeric: tabular-nums; opacity: .7; padding: 0 6px; }
.sr-kbd { opacity: .6; font-size: 11px; margin-left: 4px; }
.sr-avatars { display: flex; padding: 0 4px; }
.sr-avatar { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; font-size: 10px; font-weight: 700; color: #fff; border: 2px solid #111; margin-left: -6px; }
.sr-avatar:first-child { margin-left: 0; }
.sr-msg { position: fixed; left: 50%; bottom: 72px; transform: translateX(-50%); max-width: min(480px, calc(100vw - 32px)); padding: 10px 14px;
  border-radius: 10px; background: #fff; box-shadow: 0 8px 30px rgba(0,0,0,.18); }
.sr-msg.sr-error { background: #FDECEA; color: #8A1C11; }
.sr-msg a { color: inherit; }

.sr-panel { position: fixed; top: 16px; right: 16px; width: min(380px, calc(100vw - 32px)); max-height: calc(100vh - 100px); overflow: auto;
  background: #fff; border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.22); padding: 16px; }
.sr-panel h2 { font-size: 15px; margin: 0 0 12px; }
.sr-panel h3 { font-size: 13px; margin: 12px 0 6px; color: #555; }
.sr-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.sr-muted { color: #666; font-size: 12px; }
.sr-btn { padding: 8px 12px; border-radius: 8px; background: #111; color: #fff; font-weight: 600; }
.sr-btn:disabled { opacity: .5; cursor: default; }
.sr-btn.sr-ghost { background: #F1F1F1; color: #111; }
.sr-btn.sr-danger { background: #FDECEA; color: #8A1C11; }
.sr-field { display: block; margin-bottom: 10px; }
.sr-field span { display: block; font-size: 12px; color: #555; margin-bottom: 4px; }
.sr input, .sr textarea, .sr select { width: 100%; font: inherit; color: #111; padding: 8px 10px; border: 1px solid #D5D5D5; border-radius: 8px; background: #fff; }
.sr textarea { min-height: 90px; resize: vertical; }
.sr-tabs { display: flex; gap: 4px; margin-bottom: 12px; }
.sr-tabs button { padding: 6px 10px; border-radius: 8px; }
.sr-tabs button[aria-selected="true"] { background: #111; color: #fff; }
.sr-error-text { color: #8A1C11; margin: 8px 0; }
.sr-list { list-style: none; margin: 0; padding: 0; }
.sr-list li { padding: 8px; border-radius: 8px; cursor: pointer; }
.sr-list li:hover { background: #F5F5F5; }
.sr-chip { display: inline-block; padding: 1px 6px; border-radius: 6px; background: #F1F1F1; font-size: 11px; }

.sr-pins { position: fixed; inset: 0; pointer-events: none; }
.sr-pin { position: fixed; left: 0; top: 0; width: 28px; height: 28px; margin: -14px 0 0 -14px; border-radius: 50%; border: 2px solid #fff; color: #fff;
  display: grid; place-items: center; font-size: 11px; font-weight: 700; pointer-events: auto; box-shadow: 0 2px 8px rgba(0,0,0,.3); }
.sr-pin.sr-moved { border-style: dashed; border-color: #111; }
.sr-pin.sr-muted-pin { background: #9A9A9A !important; opacity: .7; }
.sr-pin.sr-resolved { opacity: .55; }
.sr-pin.sr-focus { animation: sr-pulse 0.5s ease-in-out 4 alternate; }
@keyframes sr-pulse { to { transform: scale(1.5); } }
@media (prefers-reduced-motion: reduce) { .sr-pin.sr-focus { animation: none; outline: 3px solid #2E86AB; } }
.sr-highlight { position: fixed; pointer-events: none; border: 2px solid #2E86AB; background: rgba(46,134,171,.08); border-radius: 2px; }

.sr-dup { border: 1px solid #F0D58C; background: #FFF8E1; border-radius: 10px; padding: 10px; margin-bottom: 12px; }
.sr-dup-item { padding: 6px 0; border-top: 1px solid #F0E2B6; }
.sr-dup-item:first-of-type { border-top: 0; }
.sr-thumbs { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
.sr-thumb { position: relative; width: 64px; height: 64px; border-radius: 8px; overflow: hidden; background: #F1F1F1; }
.sr-thumb img { width: 100%; height: 100%; object-fit: cover; cursor: zoom-in; }
.sr-thumb .sr-thumb-x { position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; border-radius: 50%; background: rgba(0,0,0,.6); color: #fff; font-size: 11px; line-height: 18px; }
.sr-thumb.sr-failed { outline: 2px solid #C73E1D; }
.sr-drop { border: 1px dashed #BDBDBD; border-radius: 8px; padding: 10px; text-align: center; color: #666; font-size: 12px; }
.sr-drop.sr-over { border-color: #2E86AB; background: #EEF6FA; }
.sr-shot { width: 100%; border-radius: 8px; cursor: zoom-in; display: block; margin: 8px 0; }
.sr-body { white-space: pre-wrap; word-break: break-word; }
.sr-reply { border-top: 1px solid #EEE; padding: 8px 0; }
.sr-lightbox { position: fixed; inset: 0; background: rgba(0,0,0,.85); display: grid; place-items: center; cursor: zoom-out; }
.sr-lightbox img { max-width: 95vw; max-height: 95vh; }
`;
