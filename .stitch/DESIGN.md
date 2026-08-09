---
name: StoryPrompt Desktop
colors:
  surface: "#0b1326"
  surface-dim: "#0b1326"
  surface-bright: "#31394d"
  surface-container-lowest: "#060e20"
  surface-container-low: "#131b2e"
  surface-container: "#171f33"
  surface-container-high: "#222a3d"
  surface-container-highest: "#2d3449"
  on-surface: "#dae2fd"
  on-surface-variant: "#c2c6d6"
  inverse-surface: "#dae2fd"
  inverse-on-surface: "#283044"
  outline: "#8c909f"
  outline-variant: "#424754"
  surface-tint: "#adc6ff"
  primary: "#adc6ff"
  on-primary: "#002e6a"
  primary-container: "#4d8eff"
  on-primary-container: "#00285d"
  inverse-primary: "#005ac2"
  secondary: "#4edea3"
  on-secondary: "#003824"
  secondary-container: "#00a572"
  on-secondary-container: "#00311f"
  tertiary: "#ffb786"
  on-tertiary: "#502400"
  tertiary-container: "#df7412"
  on-tertiary-container: "#461f00"
  error: "#ffb4ab"
  on-error: "#690005"
  error-container: "#93000a"
  on-error-container: "#ffdad6"
  primary-fixed: "#d8e2ff"
  primary-fixed-dim: "#adc6ff"
  on-primary-fixed: "#001a42"
  on-primary-fixed-variant: "#004395"
  secondary-fixed: "#6ffbbe"
  secondary-fixed-dim: "#4edea3"
  on-secondary-fixed: "#002113"
  on-secondary-fixed-variant: "#005236"
  tertiary-fixed: "#ffdcc6"
  tertiary-fixed-dim: "#ffb786"
  on-tertiary-fixed: "#311400"
  on-tertiary-fixed-variant: "#723600"
  background: "#0b1326"
  on-background: "#dae2fd"
  surface-variant: "#2d3449"
  surface-charcoal: "#0F172A"
  surface-slate: "#1E293B"
  border-subtle: "#334155"
  vilao-blue: "#3B82F6"
  emerald-success: "#10B981"
  text-primary: "#F8FAFC"
  text-secondary: "#94A3B8"
typography:
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: "600"
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: "600"
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 18px
    fontWeight: "500"
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: "400"
    lineHeight: 26px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: "400"
    lineHeight: 22px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: "400"
    lineHeight: 20px
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: "600"
    lineHeight: 16px
    letterSpacing: 0.05em
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: "400"
    lineHeight: 18px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  sidebar-width: 260px
  container-max: 1200px
  gutter: 24px
  margin-mobile: 16px
  unit: 8px
---

## Brand & Style

The design system for StoryPrompt Desktop is engineered for the focused writer and AI strategist. It embodies a **High-End macOS Utility** aesthetic—blending the precision of developer tools with the elegance of a luxury publishing platform. The brand personality is professional, quiet, and intellectually empowering.

The design style is a hybrid of **Minimalism** and **Glassmorphism**, specifically utilizing:

- **Atmospheric Depth:** Relying on subtle tonal shifts rather than heavy shadows to denote hierarchy.
- **Precision Interfaces:** Using thin, low-contrast borders and monospaced accents to evoke the feel of a technical instrument.
- **Focus-First Layouts:** Removing visual noise to prioritize the narrative flow and prompt logic.

## Colors

The palette is optimized for a **default dark mode** to reduce eye strain during long-form writing sessions.

- **Primary (Vilao Blue):** Used strictly for primary actions, active states, and focus indicators.
- **Secondary (Emerald):** Reserved for success states, "Generation Complete" indicators, and constructive feedback loops.
- **Backgrounds:** The primary interface uses `surface-charcoal`. Modal overlays and floating panels use `surface-slate` to create a tiered visual hierarchy.
- **Borders:** To maintain the macOS utility feel, borders are kept to a consistent 1px width using `border-subtle`, providing structure without clutter.

## Typography

The typographic system balances technical precision with editorial readability.

- **Space Grotesk** is used for headlines to provide a modern, geometric character that feels forward-thinking.
- **Inter** serves as the workhorse for all body copy and interface elements, ensuring maximum legibility across all display types.
- **JetBrains Mono** is utilized for metadata, tags, and AI-specific parameters (e.g., tokens, temperature) to reinforce the "utility" aspect of the tool.

Use `label-caps` for section headers in the sidebar and navigation to create a clear structural distinction.

## Layout & Spacing

This design system utilizes a **Fixed Sidebar / Fluid Content** model, mimicking classic desktop productivity suites.

- **Sidebar:** A 260px fixed-width left navigation panel containing library management and global settings.
- **Main Canvas:** A centered fluid container with a maximum width of 1200px to ensure line lengths remain readable for writing.
- **Grid:** A standard 8px-based spacing system. All paddings and margins should be increments of this unit (8, 16, 24, 32, 48, 64).
- **Responsive Behavior:** On smaller viewports, the sidebar collapses into a hidden drawer, and margins reduce from 24px to 16px to maximize the text input area.

## Elevation & Depth

Hierarchy is established through **Tonal Layering** and **Glassmorphism** rather than traditional drop shadows.

- **Level 0 (Background):** `surface-charcoal` (#0F172A).
- **Level 1 (Cards/Sidebar):** `surface-slate` (#1E293B) with a 1px border of `border-subtle`.
- **Level 2 (Popovers/Modals):** `surface-slate` with an increased backdrop blur (20px) and a slightly brighter border to simulate proximity to the user.
- **Interaction:** Elements do not "lift" on hover; instead, their background color lightens by 5% or their border color transitions to `vilao-blue`.

## Shapes

The shape language is **Soft (0.25rem)**. This provides a professional, "tooled" look that avoids the playfulness of fully rounded corners while remaining more accessible than sharp 0px corners.

- **Standard Elements:** (Buttons, Inputs, Small Cards) use 4px (0.25rem).
- **Containers:** Large UI regions or main editor blocks use 8px (0.5rem) to provide a soft frame for the content.
- **Active Indicators:** Vertical pills in the sidebar navigation use a 2px radius for a sharp, precise indicator.

## Components

- **Buttons:**
  - _Primary:_ Solid `vilao-blue` with white text.
  - _Ghost:_ No background, `border-subtle` stroke, transitions to white text on hover.
- **Minimalist Cards:** No shadows. Use a 1px `border-subtle` and a background color one shade lighter than the page background to denote interactable areas.
- **Input Fields:** Dark background (#020617), subtle border, and a 2px blue left-accent line when focused.
- **Progress Indicators:** Thin, 2px horizontal bars using the `emerald-success` color for AI generation steps.
- **Sidebar Navigation:** Use `label-caps` for category headers. Active states should be indicated by a subtle background shift and a `vilao-blue` vertical strip on the left edge.
- **Prompt Chips:** Use `JetBrains Mono` for text inside chips with a `surface-slate` background and a 4px radius.
