# Dashboard Redesign — Olivera Brand

## Goal
Redesign the TimeTracker dashboard to match olivera.com.uy brand identity. Remove generic AI-generated look, make it feel like a premium legal tool.

## Design Decisions
- Dark navy sidebar (always visible)
- Toggle buttons for approve: `[Aprobar]` → `[✓ Aprobado]`
- Show AI confidence % on auto-categorized entries
- Olivera brand colors, Inter font

---

## Color System

| Element | Hex | Token |
|---|---|---|
| Sidebar bg | `#1B365D` | navy / primary |
| Sidebar active bg | `#1B416A` | navy-light |
| Sidebar active border | `#DABA2A` | gold |
| Page background | `#FAF9F7` | warm-white |
| Cards | `#FFFFFF` | white |
| Text body | `#1C1917` | near-black |
| Headings | `#1B365D` | navy |
| Accent / primary buttons | `#1B365D` | navy |
| Gold highlight | `#DABA2A` | gold — progress bar, confidence badge |
| Approved | `#54C24E` | green |
| Error / uncategorized | `#BA271A` | red |
| Borders | `#E5E5E5` | neutral |
| Muted text | `#6B7280` | gray-500 |

## Typography

- Font: Inter (Google Fonts, closest to Olivera's TT Hoves Pro)
- Headings: Inter 600-700, color navy `#1B365D`
- Body: Inter 400, color `#1C1917`
- Numbers/hours: `font-variant-numeric: tabular-nums`
- Matter numbers: Inter 400, reduced opacity
- Base size: 14px body, 24px main heading

## Layout

- Sidebar: 200px wide, navy `#1B365D`, white text
- Main content: max-width 640px centered, warm white bg `#FAF9F7`
- Cards: white bg, `border-radius: 0.8rem`, `border: 1px solid #E5E5E5`, `box-shadow: 0 2px 8px rgba(0,0,0,0.1)`
- Spacing: 1.5rem horizontal padding, 1rem between card rows

## Components

### Sidebar
- Logo: "OLIVERA" uppercase, letter-spacing 0.05em, white, weight 700
- Below: "TimeTracker" in lighter weight 400, smaller, white/60% opacity
- Nav items: white/60% opacity, 13px, hover white/80%
- Active nav: white text, bg `#1B416A`, left border 3px `#DABA2A` gold

### Client Card
- White bg, 0.8rem radius, 1px border `#E5E5E5`, shadow `0 2px 8px rgba(0,0,0,0.1)`
- Header: client name in navy 600 weight, total hours right-aligned tabular-nums
- Matter rows: color dot 8px + matter name + (matter_number) in muted + hours + approve button
- Description: below matter name, indented with left border, italic gray placeholder "Agregar descripción…"

### Approve Toggle
- Default: outline button, navy border, text "Aprobar", small, rounded
- Approved: solid green `#54C24E` bg, white text "✓ Aprobado"
- Click approved → reverts to default (undo)

### AI Confidence Badge
- Small pill next to matter name when `ai_confidence` exists
- Gold bg `#DABA2A`, dark text, shows percentage: "85%"
- No badge when manually assigned (ai_confidence is null)

### Progress Bar
- Track: `#E5E5E5` gray, 6px height, rounded
- Fill: `#DABA2A` gold
- Above: "Hoy: X.X horas" in navy 700 weight, 24px
- Right: "8h meta" in muted gray

### Bottom Actions
- "Aprobar todo": solid navy `#1B365D` button, white text, with confirm dialog
- "Exportar CSV": navy outline button

### Uncategorized Card
- Warm amber tint bg `#FEF3C7`, border `#F59E0B`
- Header: "Sin categorizar" with ⚠ icon
- Matter select dropdown to bulk-assign

### Empty State
- Centered text: "Sin actividad registrada"
- Subtitle: "Las capturas aparecerán aquí automáticamente"

## Files to Modify

- `frontend/src/pages/DashboardPage.tsx` — apply brand colors, new approve toggle, confidence badge
- `frontend/src/components/Layout.tsx` — navy sidebar with Olivera branding
- `frontend/src/components/MatterSelect.tsx` — match brand styling
- `frontend/src/index.css` — add Inter font import, CSS variables for brand tokens
- `frontend/tailwind.config.js` or CSS — extend theme with Olivera colors

## Anti-Patterns to Avoid (per UI Guidelines)
- No gradients
- No `transition: all`
- No `h-screen` (use `h-dvh`)
- All icon buttons need aria-label
- `size-x` for square elements
- `tabular-nums` for all numbers
- `text-pretty` for body, `text-balance` for headings
