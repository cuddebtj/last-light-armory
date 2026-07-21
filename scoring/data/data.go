// Package data embeds the community measurement snapshots (see README.md)
// so the baseline importer reads a committed, reviewable artifact — never
// a live Google Sheet — at build time.
package data

import "embed"

//go:embed *.json
var FS embed.FS
