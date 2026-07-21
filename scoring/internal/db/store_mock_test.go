package db

import (
	"context"
	"errors"
	"testing"

	"github.com/pashagolub/pgxmock/v4"

	"github.com/cuddebtj/last-light-armory/scoring/internal/baseline"
)

// These tests fault-inject the paths a live database can't realistically
// produce (scan failures, exec failures) — mirrors last-light-armory-
// ingest's own store_mock_test.go pattern. Happy-path behavior is also
// verified live against the real dev database (see the branch's commit
// history / PR description), since this writes to a shared production
// schema.

var errBoom = errors.New("boom")

func newMock(t *testing.T) (pgxmock.PgxPoolIface, *Store) {
	t.Helper()
	mock, err := pgxmock.NewPool()
	if err != nil {
		t.Fatalf("pgxmock.NewPool: %v", err)
	}
	t.Cleanup(mock.Close)
	return mock, NewStore(mock)
}

func expectMet(t *testing.T, mock pgxmock.PgxPoolIface) {
	t.Helper()
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

func TestUpsertArchetypeScores(t *testing.T) {
	ctx := context.Background()

	t.Run("empty input is a no-op, no query issued", func(t *testing.T) {
		mock, store := newMock(t)
		if err := store.UpsertArchetypeScores(ctx, nil); err != nil {
			t.Errorf("got %v, want nil", err)
		}
		expectMet(t, mock) // no expectations set, none should have been consumed
	})

	t.Run("happy path", func(t *testing.T) {
		mock, store := newMock(t)
		score := 80.0
		mock.ExpectExec("INSERT INTO archetype_score").
			WithArgs([]string{"Auto Rifle"}, []string{"Adaptive"}, []*float64{&score}, []*float64{nil}, []string{"src"}).
			WillReturnResult(pgxmock.NewResult("INSERT", 1))

		err := store.UpsertArchetypeScores(ctx, []baseline.ArchetypeScore{
			{WeaponType: "Auto Rifle", Frame: "Adaptive", PVEScore: &score, PVPScore: nil, Source: "src"},
		})
		if err != nil {
			t.Errorf("got %v, want nil", err)
		}
		expectMet(t, mock)
	})

	t.Run("exec failure surfaces wrapped", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectExec("INSERT INTO archetype_score").
			WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
			WillReturnError(errBoom)

		err := store.UpsertArchetypeScores(ctx, []baseline.ArchetypeScore{
			{WeaponType: "Auto Rifle", Frame: "Adaptive"},
		})
		if err == nil {
			t.Fatal("want error, got nil")
		}
		if !errors.Is(err, errBoom) {
			t.Errorf("error %v does not wrap errBoom", err)
		}
		expectMet(t, mock)
	})
}

func TestPerkNames(t *testing.T) {
	ctx := context.Background()

	t.Run("happy path", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectQuery("SELECT id, name FROM perk").
			WillReturnRows(pgxmock.NewRows([]string{"id", "name"}).
				AddRow(int64(1), "Kill Clip").
				AddRow(int64(2), "Zen Moment"))

		got, err := store.PerkNames(ctx)
		if err != nil {
			t.Fatalf("got err %v", err)
		}
		want := map[int64]string{1: "Kill Clip", 2: "Zen Moment"}
		if len(got) != len(want) || got[1] != want[1] || got[2] != want[2] {
			t.Errorf("got %v, want %v", got, want)
		}
		expectMet(t, mock)
	})

	t.Run("query failure surfaces wrapped", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectQuery("SELECT id, name FROM perk").WillReturnError(errBoom)

		_, err := store.PerkNames(ctx)
		if err == nil || !errors.Is(err, errBoom) {
			t.Errorf("got %v, want wrapped errBoom", err)
		}
		expectMet(t, mock)
	})

	t.Run("scan failure surfaces wrapped", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectQuery("SELECT id, name FROM perk").
			WillReturnRows(pgxmock.NewRows([]string{"id", "name"}).
				AddRow(int64(1), "Kill Clip").
				RowError(0, errBoom))

		_, err := store.PerkNames(ctx)
		if err == nil {
			t.Fatal("want error, got nil")
		}
		expectMet(t, mock)
	})
}

func TestUpdatePerkScores(t *testing.T) {
	ctx := context.Background()

	t.Run("empty input is a no-op, no query issued", func(t *testing.T) {
		mock, store := newMock(t)
		if err := store.UpdatePerkScores(ctx, nil); err != nil {
			t.Errorf("got %v, want nil", err)
		}
		expectMet(t, mock)
	})

	t.Run("happy path", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectExec("UPDATE perk SET").
			WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
			WillReturnResult(pgxmock.NewResult("UPDATE", 1))

		err := store.UpdatePerkScores(ctx, map[int64]baseline.PerkScore{
			1: {PVE: 90, PVP: 50},
		})
		if err != nil {
			t.Errorf("got %v, want nil", err)
		}
		expectMet(t, mock)
	})

	t.Run("exec failure surfaces wrapped", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectExec("UPDATE perk SET").
			WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
			WillReturnError(errBoom)

		err := store.UpdatePerkScores(ctx, map[int64]baseline.PerkScore{1: {PVE: 90, PVP: 50}})
		if err == nil || !errors.Is(err, errBoom) {
			t.Errorf("got %v, want wrapped errBoom", err)
		}
		expectMet(t, mock)
	})
}
