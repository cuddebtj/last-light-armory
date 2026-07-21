// Package migrations embeds this repo's own scoring-schema SQL migration
// files so the scoring binary can migrate the database itself at startup.
//
// Files follow golang-migrate naming: {version}_{title}.{up|down}.sql.
package migrations

import "embed"

// FS holds every versioned migration file in this directory.
//
//go:embed *.sql
var FS embed.FS
