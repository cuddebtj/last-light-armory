package logging

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// countFiles returns the names of every regular file directly inside dir.
func countFiles(t *testing.T, dir string) []string {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("ReadDir(%s): %v", dir, err)
	}
	var names []string
	for _, e := range entries {
		if !e.IsDir() {
			names = append(names, e.Name())
		}
	}
	return names
}

func TestSetupHappyPath(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "logs")

	logger, closeFn, err := Setup(dir, DefaultRetention)
	if err != nil {
		t.Fatalf("Setup: %v", err)
	}
	t.Cleanup(func() { closeFn() })

	logger.Info("scoring complete", "rolls_scored", 42)

	files := countFiles(t, dir)
	if len(files) != 1 {
		t.Fatalf("expected exactly 1 log file, got %v", files)
	}
	if !strings.HasSuffix(files[0], ".log") {
		t.Errorf("log file name = %q, want a .log suffix", files[0])
	}

	if err := closeFn(); err != nil {
		t.Errorf("closeFn: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(dir, files[0]))
	if err != nil {
		t.Fatalf("reading log file: %v", err)
	}
	if !strings.Contains(string(data), "scoring complete") || !strings.Contains(string(data), "rolls_scored=42") {
		t.Errorf("log file content = %q, missing expected message/fields", data)
	}
}

func TestSetupCreatesNestedDirectory(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "a", "b", "c")

	_, closeFn, err := Setup(dir, DefaultRetention)
	if err != nil {
		t.Fatalf("Setup: %v", err)
	}
	defer closeFn()

	if info, err := os.Stat(dir); err != nil || !info.IsDir() {
		t.Errorf("expected %s to exist as a directory", dir)
	}
}

func TestSetupErrorWhenLogDirIsARegularFile(t *testing.T) {
	blocker := filepath.Join(t.TempDir(), "not-a-dir")
	if err := os.WriteFile(blocker, []byte("x"), 0o644); err != nil {
		t.Fatalf("writing blocker file: %v", err)
	}

	_, _, err := Setup(blocker, DefaultRetention)
	if err == nil {
		t.Fatal("Setup: expected an error when logDir path is an existing regular file, got nil")
	}
	if !strings.Contains(err.Error(), "creating log directory") {
		t.Errorf("error = %q, want it to mention creating the log directory", err)
	}
}

func TestSetupErrorWhenLogDirNotWritable(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("running as root: directory permissions don't block file creation")
	}

	dir := t.TempDir()
	// MkdirAll on an already-existing directory and ReadDir both only need
	// read+execute, so this permission change specifically isolates
	// OpenFile's own write requirement to create the new log file.
	if err := os.Chmod(dir, 0o555); err != nil {
		t.Fatalf("chmod: %v", err)
	}
	t.Cleanup(func() { os.Chmod(dir, 0o755) })

	_, _, err := Setup(dir, DefaultRetention)
	if err == nil {
		t.Fatal("Setup: expected an error opening the log file in an unwritable directory, got nil")
	}
	if !strings.Contains(err.Error(), "opening log file") {
		t.Errorf("error = %q, want it to mention opening the log file", err)
	}
}

func TestSetupErrorWhenPruneFails(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("running as root: directory permissions don't block removal")
	}

	dir := t.TempDir()
	old := filepath.Join(dir, "old.log")
	if err := os.WriteFile(old, []byte("x"), 0o644); err != nil {
		t.Fatalf("writing old.log: %v", err)
	}
	oldTime := time.Now().Add(-1000 * time.Hour)
	if err := os.Chtimes(old, oldTime, oldTime); err != nil {
		t.Fatalf("backdating old.log: %v", err)
	}
	if err := os.Chmod(dir, 0o555); err != nil {
		t.Fatalf("chmod: %v", err)
	}
	t.Cleanup(func() { os.Chmod(dir, 0o755) })

	_, _, err := Setup(dir, time.Hour)
	if err == nil {
		t.Fatal("Setup: expected pruning to fail and be surfaced as an error, got nil")
	}
	if !strings.Contains(err.Error(), "pruning old logs") {
		t.Errorf("error = %q, want it to mention pruning old logs", err)
	}
}

func TestSetupPrunesOldFilesButKeepsRecentOnes(t *testing.T) {
	dir := t.TempDir()

	old := filepath.Join(dir, "old.log")
	recent := filepath.Join(dir, "recent.log")
	for _, p := range []string{old, recent} {
		if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
			t.Fatalf("writing %s: %v", p, err)
		}
	}
	now := time.Now()
	if err := os.Chtimes(old, now, now.Add(-100*time.Hour)); err != nil {
		t.Fatalf("backdating old.log: %v", err)
	}
	if err := os.Chtimes(recent, now, now.Add(-1*time.Hour)); err != nil {
		t.Fatalf("backdating recent.log: %v", err)
	}

	_, closeFn, err := Setup(dir, 72*time.Hour)
	if err != nil {
		t.Fatalf("Setup: %v", err)
	}
	defer closeFn()

	files := countFiles(t, dir)
	for _, name := range files {
		if name == "old.log" {
			t.Errorf("old.log (100h old, 72h retention) should have been pruned; files = %v", files)
		}
	}
	foundRecent := false
	for _, name := range files {
		if name == "recent.log" {
			foundRecent = true
		}
	}
	if !foundRecent {
		t.Errorf("recent.log (1h old, 72h retention) should have been kept; files = %v", files)
	}
	// Plus the new file this Setup call itself created.
	if len(files) != 2 {
		t.Errorf("expected recent.log + this run's own new file, got %v", files)
	}
}

func TestPruneSkipsSubdirectories(t *testing.T) {
	dir := t.TempDir()
	sub := filepath.Join(dir, "a-subdirectory")
	if err := os.Mkdir(sub, 0o755); err != nil {
		t.Fatalf("creating subdirectory: %v", err)
	}
	old := time.Now().Add(-1000 * time.Hour)
	if err := os.Chtimes(sub, old, old); err != nil {
		t.Fatalf("backdating subdirectory: %v", err)
	}

	if err := prune(dir, time.Hour); err != nil {
		t.Fatalf("prune: %v", err)
	}
	if _, err := os.Stat(sub); err != nil {
		t.Errorf("subdirectory should not have been removed by prune: %v", err)
	}
}

func TestPruneErrorOnUnreadableDirectory(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "does-not-exist")
	if err := prune(missing, DefaultRetention); err == nil {
		t.Fatal("prune: expected an error for a nonexistent directory, got nil")
	}
}

func TestPruneReturnsRemovalError(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("running as root: directory permissions don't block removal")
	}

	parent := t.TempDir()
	dir := filepath.Join(parent, "unwritable")
	if err := os.Mkdir(dir, 0o755); err != nil {
		t.Fatalf("creating dir: %v", err)
	}
	old := filepath.Join(dir, "old.log")
	if err := os.WriteFile(old, []byte("x"), 0o644); err != nil {
		t.Fatalf("writing old.log: %v", err)
	}
	oldTime := time.Now().Add(-1000 * time.Hour)
	if err := os.Chtimes(old, oldTime, oldTime); err != nil {
		t.Fatalf("backdating old.log: %v", err)
	}

	// Removing a file requires write permission on its *containing*
	// directory, not the file itself — read+execute only blocks os.Remove.
	if err := os.Chmod(dir, 0o555); err != nil {
		t.Fatalf("chmod: %v", err)
	}
	t.Cleanup(func() { os.Chmod(dir, 0o755) })

	if err := prune(dir, time.Hour); err == nil {
		t.Error("prune: expected a removal error from an unwritable directory, got nil")
	}
}
