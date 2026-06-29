# Learnings: Multiplayer and Collaboration Deep Linking

- **Deep Linking in Angular:** Using `ActivatedRoute.queryParamMap.subscribe` in `ngOnInit` is essential for handling parameters that might arrive after the component has initialized or when navigating between routes that use the same component.
- **Clipboard API:** `navigator.clipboard.writeText` provides a standard way to copy URLs to the clipboard, but it requires a secure context (HTTPS or localhost) and user interaction.
- **Backend Error Handling:** Always check for missing function definitions in Node.js when adding new features, as it can lead to runtime crashes even if the syntax is valid.
- **Angular Signal Sync:** When using signals (like `selectedGame`), updating them based on query params ensures that the UI reactively opens the correct views (like the game preview overlay).
- **Authentication Resilience:** Verification that `authGuard` preserves query parameters (`returnUrl`) ensures that deep links work even for unauthenticated users after they log in.
