# Mobile topic-detail navigation QA — 2026-10-09

## Scope and result
- Functional automated result: passed the checks below.
- Visual/browser result: blocked by the available environment. Publication was explicitly requested after completing the independent checks and disclosing this limit.
- final result: blocked

## Source visual truth and capture limits
The existing owner-private production Site was opened in the cloud Chromium browser. It showed the ChatGPT sign-in gate, not the working application, so this was not accepted as an application reference screenshot. No screenshot was used to claim an application visual audit.

The restored v4 source was built, a local-only fixture database was prepared, and its preview started. The cloud browser could not reach its loopback address. The documented cloud preview host was blocked by the client. Chromium reported that developer tools were disabled by organization policy. No policy setting, authentication boundary, or access control was bypassed. The agent-created browser tab was closed. No user-computer or user sign-in was requested.

- Source application screenshot: unavailable.
- Implementation browser-rendered screenshot: unavailable.
- Pixel dimensions / density comparison: not available; no pixel-fidelity claim.
- DOM tests use a simulated 393 × 852 window size. JSDOM does not perform layout; this is not mobile rendering or physical-device emulation.
- No before/after visual comparison or screenshot-based accessibility compliance is claimed.

## Verified interaction steps
1. A list entry records search, all filters, sort, tab, loaded-item count, scroll coordinates and originating card. Opening a detail pushes one same-page topic URL. Passed.
2. Back restores the list snapshot and focus; Forward reopens the same detail. Passed in React/JSDOM same-document history.
3. Return-to-list, X and Escape share the close path. The actual Workspace and Radix Sheet DOM tests passed, including clearing the dialog scroll lock and restoring card focus.
4. Double opening/closing and twenty repeated open-close cycles do not create duplicate list entries. Back from the list still reaches the prior page. Passed.
5. Refresh-like unmount/remount retains the existing detail parent and loaded list snapshot without another push. Passed.
6. Direct deep links open the requested topic. Their explicit close replaces the current entry with a list URL; it does not guess or manufacture a prior list entry. Passed. Native Back on a directly entered deep link intentionally retains the browser's previous-page semantics.
7. Invalid/missing IDs return safely after data readiness; unrelated URL parameters and hash survive. Passed.
8. Rapid traversal, pageshow and Strict Mode setup/cleanup keep one coherent history trail. Passed.
9. Navigation-only Workspace interactions make zero data API calls. Passed.
10. TypeScript and the Cloudflare-compatible Worker build passed. No database schema, content, sharing policy, automation, or personal-state write was introduced.

## Required visual surfaces
- Typography: existing type system retained; new navigation controls use 14px labels and at least 44px targets. Not visually verified.
- Spacing/layout: existing drawer retained; a sticky top navigation row and phone-width detail override were added. Safe-area padding is included. Not pixel-verified.
- Colors/tokens: existing card, foreground and border tokens reused. No palette change.
- Images/assets: unchanged; no new imagery, logo or asset substitution.
- Copy: added “返回列表” and an accessible “关闭详情，返回列表” label; existing content untouched.

## Remaining device checks
Actual iPhone Safari edge-back, cancelled edge swipes, Android system Back, touch scrolling, browser chrome/keyboard resizing, and pixel layout must be checked on a real browser/device. No global touch, wheel, swipe or gesture interception was added. DOM history traversal is not evidence of an operating-system edge gesture.

## Reproduce functional checks
Install test-only jsdom outside production dependencies, for example:

    npm install --prefix .sites-runtime/test-deps --no-save --no-audit --no-fund jsdom@26.1.0
    TOPIC_TEST_PACKAGE="$PWD/.sites-runtime/test-deps/package.json" node scripts/test-navigation.mjs
    npx tsc --noEmit

The test script bundles the actual hook and Workspace into the ignored local runtime directory. It does not open a browser or call a production API.
