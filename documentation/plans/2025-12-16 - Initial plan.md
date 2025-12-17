Ultrathink. Make a plan to implement the following Obsidian plugin

## Overview

In a second stage, another Base view type should be added: "Periodic Review". That Base view type should show different types of periodic notes side-by-side with [[Andy Matuschak]]'s vertical tabs style (foldable columns). Columns again based on the enabled periodic note types: daily, weekly, monthly, quarterly, yearly (same order for the columns).

In that Base view type:

- the sort order of the Base should be ignored. Instead, the most recent year, month, week & day should be selected
- the dataset should be filtered so that
    - all the available years are listed (only the most recent being selected), but other ones available
    - all the available weeks for the selected year are visible (and no other), and the most recent one being selected
    - all the days for the selected week are visible (and no other), and the most recent one being selected

The goal of the "Periodic Review" Base type is to perform streamline periodic reviews, easily creating and updating periodic notes of different types (e.g., filling in a weekly note based on a set of daily notes, filling-in a monthly note based on ...)

Also, if sections match between different types of periodic notes, it should be possible to quickly/efficiently copy/append content from one type to another (e.g., copy section xxx contents from daily to weekly)

## Templater

If Templater is not installed or not enabled, then when notes are created, we should not try to apply the templater template. Same if the template path is not configured for that type of periodic note.
