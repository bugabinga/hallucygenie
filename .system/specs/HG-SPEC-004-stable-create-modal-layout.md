# HG-SPEC-004: Stable Create modal layout

## Design decisions

- Tab switches must not move modal shell, title, tab bar, or action area.
- Only form body scrolls. Header/tabs/footer outside scroll region.
- Higher opacity modal surface: `rgba(20,20,26,0.94)`. Keep backdrop blur.
- No height animation on tab switch. Allowed: opacity, transform, box-shadow.
