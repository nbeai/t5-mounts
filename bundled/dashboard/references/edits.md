# Panel table edits

In T5's panel the user can correct a table cell; each correction is a revision in the dashboard's own data store (the source and the HTML stay unchanged), the page recomputes with it, and your next turn lists it. The console hand lists them (`GET /dashboard-edits`) and undoes one (`POST /dashboard-edits`).

Write edits into the source (`edit-xlsx`, with a backup) only when the user asks, then rebuild a new version.
