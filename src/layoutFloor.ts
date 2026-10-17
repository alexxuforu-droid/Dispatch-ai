/**
 * The window floor for the desktop build.
 *
 * There is no 320px target here. That number comes from WCAG's mobile reflow criterion
 * (SC 1.4.10, 320 CSS px) and it does not transfer to a resizable desktop window: Microsoft's
 * own breakpoints put "Small" below 640px, and every comparable developer tool sits far above
 * it. What actually matters for a dense multi-pane app is that the task board stays legible and
 * that Windows text scaling has room to grow into -- TextScaleFactor runs 1.0 to 2.25, and this
 * UI declares type as small as 7px.
 *
 * These values mirror `kMinWindowWidth` / `kMinWindowHeight` in
 * windows/DispatchNative/DispatchNative.cpp. `__tests__/layout-floor.test.ts` asserts the two
 * have not drifted apart, because a floor enforced only in C++ and asserted only in JS is a
 * floor nobody is really testing.
 */
export const MIN_WINDOW_WIDTH = 900;
export const MIN_WINDOW_HEIGHT = 600;