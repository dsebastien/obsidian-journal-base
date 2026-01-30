# Tips & Best Practices

Get the most out of Journal Bases with these tips.

## Workflow Tips

### Start Small

Begin with daily notes. Add weekly reviews once you have a routine. Gradually add monthly, quarterly, and yearly reviews.

### Consistent Review Schedule

- **Daily**: Journal each morning or evening
- **Weekly**: Sunday evening or Monday morning
- **Monthly**: First day of each month
- **Quarterly**: First week of each quarter
- **Yearly**: First week of January

### Use Templates

Create templates with prompts for each period type:

**Daily template prompts**:

- What am I grateful for today?
- What's my main focus?
- What did I learn?

**Weekly template prompts**:

- What were my wins this week?
- What challenges did I face?
- What will I do differently?

### Mark Reviews as Done

Use the "Mark as Done" feature to track completed reviews. This cascades to child periods, making it easy to see progress.

## Organization Tips

### Folder Structure

Keep period types in separate folders:

```
Journal/
  Daily/
  Weekly/
  Monthly/
  Quarterly/
  Yearly/
```

### Nested Date Folders

For large journals, use nested folders:

```
Journal/Daily/2025/01/2025-01-15.md
```

Format: `YYYY/MM/YYYY-MM-DD`

### Consistent Naming

Use the default formats or ensure formats are consistent:

- Daily: `YYYY-MM-DD` (2025-01-15)
- Weekly: `gggg-[W]ww` (2025-W03)
- Monthly: `YYYY-MM` (2025-01)
- Quarterly: `YYYY-[Q]Q` (2025-Q1)
- Yearly: `YYYY` (2025)

## View Tips

### Periodic Notes View

- Use **Expand first card** to jump straight into writing
- Enable **Show missing periods** to fill gaps
- Set **Future periods** to 1-2 for planning ahead

### Periodic Review View

- Collapse columns you're not actively using
- Adjust **Column width** based on your screen size
- Use **Previous/Next** buttons to navigate without scrolling

### Keyboard Navigation

- Tab through elements
- Use standard Obsidian shortcuts while editing

## Troubleshooting

### Notes Not Appearing

1. Verify the folder path in settings matches your actual folder
2. Check the date format matches your filenames exactly
3. Ensure the period type is enabled
4. Verify the Base query includes your journal folder

### Create Buttons Not Working

1. Check if Templater is installed (if using templates)
2. Verify the template path is correct
3. Ensure you have write permissions to the folder

### Settings Showing as Read-Only

This happens when Periodic Notes plugin is enabled. Either:

- Make changes in Periodic Notes settings instead
- Disable Periodic Notes to edit Journal Bases settings directly

### Week Numbers Don't Match

Journal Bases uses ISO 8601 week numbering:

- Weeks start on Monday
- Week 1 is the week containing January 4th
- A week belongs to the year containing most of its days

### Performance Issues

- Disable period types you don't use
- Reduce the number of future periods shown
- Collapse unused columns in Periodic Review view

## Common Use Cases

### Morning Journaling

1. Open Periodic Notes view
2. Set to Daily
3. Expand today's note (or create if missing)
4. Write morning reflections

### Weekly Review

1. Open Periodic Review view
2. Select the week to review
3. Read through daily notes on the left
4. Write weekly summary on the right
5. Mark as done when complete

### Year-End Review

1. Open Periodic Review view
2. Select the year
3. Review quarterly summaries
4. Extract key themes and learnings
5. Write yearly reflection
