package db

import (
	"context"
	"errors"
	"testing"

	"github.com/pashagolub/pgxmock/v4"

	"github.com/cuddebtj/last-light-armory/scoring/internal/scoring"
)

func TestWeapons(t *testing.T) {
	ctx := context.Background()

	t.Run("happy path", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectQuery("SELECT id, weapon_type").
			WillReturnRows(pgxmock.NewRows([]string{"id", "weapon_type", "frame"}).
				AddRow(int64(1), "Auto Rifle", "Adaptive Frame").
				AddRow(int64(2), "Sword", ""))

		got, err := store.Weapons(ctx)
		if err != nil {
			t.Fatalf("got err %v", err)
		}
		if got[1] != (WeaponRow{ID: 1, WeaponType: "Auto Rifle", Frame: "Adaptive Frame"}) {
			t.Errorf("got %+v", got[1])
		}
		expectMet(t, mock)
	})

	t.Run("query failure surfaces wrapped", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectQuery("SELECT id, weapon_type").WillReturnError(errBoom)
		_, err := store.Weapons(ctx)
		if err == nil || !errors.Is(err, errBoom) {
			t.Errorf("got %v", err)
		}
		expectMet(t, mock)
	})

	t.Run("scan failure surfaces wrapped", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectQuery("SELECT id, weapon_type").
			WillReturnRows(pgxmock.NewRows([]string{"id", "weapon_type", "frame"}).
				AddRow(int64(1), "Auto Rifle", "Adaptive Frame").
				RowError(0, errBoom))
		_, err := store.Weapons(ctx)
		if err == nil {
			t.Fatal("want error")
		}
		expectMet(t, mock)
	})
}

func TestPerkScores(t *testing.T) {
	ctx := context.Background()

	t.Run("happy path", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectQuery("SELECT id, coalesce").WithArgs(pgxmock.AnyArg()).
			WillReturnRows(pgxmock.NewRows([]string{"id", "pve", "pvp"}).
				AddRow(int64(1), 90, 50))

		got, err := store.PerkScores(ctx)
		if err != nil {
			t.Fatalf("got err %v", err)
		}
		if got[1].PVE != 90 || got[1].PVP != 50 {
			t.Errorf("got %+v", got[1])
		}
		expectMet(t, mock)
	})

	t.Run("query failure surfaces wrapped", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectQuery("SELECT id, coalesce").WithArgs(pgxmock.AnyArg()).WillReturnError(errBoom)
		_, err := store.PerkScores(ctx)
		if err == nil || !errors.Is(err, errBoom) {
			t.Errorf("got %v", err)
		}
		expectMet(t, mock)
	})

	t.Run("scan failure surfaces wrapped", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectQuery("SELECT id, coalesce").WithArgs(pgxmock.AnyArg()).
			WillReturnRows(pgxmock.NewRows([]string{"id", "pve", "pvp"}).
				AddRow(int64(1), 90, 50).RowError(0, errBoom))
		_, err := store.PerkScores(ctx)
		if err == nil {
			t.Fatal("want error")
		}
		expectMet(t, mock)
	})
}

func TestArchetypeScores(t *testing.T) {
	ctx := context.Background()

	t.Run("happy path with nullable columns", func(t *testing.T) {
		mock, store := newMock(t)
		pve := 80.0
		mock.ExpectQuery("SELECT weapon_type, frame, pve_score").
			WillReturnRows(pgxmock.NewRows([]string{"weapon_type", "frame", "pve_score", "pvp_score"}).
				AddRow("Auto Rifle", "Adaptive", &pve, (*float64)(nil)))

		got, err := store.ArchetypeScores(ctx)
		if err != nil {
			t.Fatalf("got err %v", err)
		}
		key := scoring.ArchetypeKey{WeaponType: "Auto Rifle", Frame: "Adaptive"}
		if got[key].PVE == nil || *got[key].PVE != 80 {
			t.Errorf("got %+v", got[key])
		}
		if got[key].PVP != nil {
			t.Errorf("got PVP %+v, want nil", got[key].PVP)
		}
		expectMet(t, mock)
	})

	t.Run("query failure surfaces wrapped", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectQuery("SELECT weapon_type, frame, pve_score").WillReturnError(errBoom)
		_, err := store.ArchetypeScores(ctx)
		if err == nil || !errors.Is(err, errBoom) {
			t.Errorf("got %v", err)
		}
		expectMet(t, mock)
	})

	t.Run("scan failure surfaces wrapped", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectQuery("SELECT weapon_type, frame, pve_score").
			WillReturnRows(pgxmock.NewRows([]string{"weapon_type", "frame", "pve_score", "pvp_score"}).
				AddRow("Auto Rifle", "Adaptive", (*float64)(nil), (*float64)(nil)).RowError(0, errBoom))
		_, err := store.ArchetypeScores(ctx)
		if err == nil {
			t.Fatal("want error")
		}
		expectMet(t, mock)
	})
}

func TestPerkSynergies(t *testing.T) {
	ctx := context.Background()

	t.Run("happy path", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectQuery("SELECT perk_a_id, perk_b_id").
			WillReturnRows(pgxmock.NewRows([]string{"a", "b", "pve", "pvp"}).
				AddRow(int64(1), int64(2), 5.0, 2.0))

		got, err := store.PerkSynergies(ctx)
		if err != nil {
			t.Fatalf("got err %v", err)
		}
		bonus := got[scoring.NewSynergyKey(1, 2)]
		if bonus.PVE != 5 || bonus.PVP != 2 {
			t.Errorf("got %+v", bonus)
		}
		expectMet(t, mock)
	})

	t.Run("query failure surfaces wrapped", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectQuery("SELECT perk_a_id, perk_b_id").WillReturnError(errBoom)
		_, err := store.PerkSynergies(ctx)
		if err == nil || !errors.Is(err, errBoom) {
			t.Errorf("got %v", err)
		}
		expectMet(t, mock)
	})

	t.Run("scan failure surfaces wrapped", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectQuery("SELECT perk_a_id, perk_b_id").
			WillReturnRows(pgxmock.NewRows([]string{"a", "b", "pve", "pvp"}).
				AddRow(int64(1), int64(2), 5.0, 2.0).RowError(0, errBoom))
		_, err := store.PerkSynergies(ctx)
		if err == nil {
			t.Fatal("want error")
		}
		expectMet(t, mock)
	})
}

func TestPerkSynergiesByHash(t *testing.T) {
	ctx := context.Background()

	t.Run("happy path", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectQuery("SELECT pa.hash, pb.hash").
			WillReturnRows(pgxmock.NewRows([]string{"a_hash", "b_hash", "pve", "pvp"}).
				AddRow(int64(100), int64(200), 5.0, 2.0))

		got, err := store.PerkSynergiesByHash(ctx)
		if err != nil {
			t.Fatalf("got err %v", err)
		}
		if len(got) != 1 || got[0] != (PerkSynergyExport{PerkAHash: 100, PerkBHash: 200, PVEBonus: 5, PVPBonus: 2}) {
			t.Errorf("got %+v", got)
		}
		expectMet(t, mock)
	})

	t.Run("empty result is nil, not an error", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectQuery("SELECT pa.hash, pb.hash").
			WillReturnRows(pgxmock.NewRows([]string{"a_hash", "b_hash", "pve", "pvp"}))
		got, err := store.PerkSynergiesByHash(ctx)
		if err != nil || got != nil {
			t.Errorf("got %+v, %v", got, err)
		}
		expectMet(t, mock)
	})

	t.Run("query failure surfaces wrapped", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectQuery("SELECT pa.hash, pb.hash").WillReturnError(errBoom)
		_, err := store.PerkSynergiesByHash(ctx)
		if err == nil || !errors.Is(err, errBoom) {
			t.Errorf("got %v", err)
		}
		expectMet(t, mock)
	})

	t.Run("scan failure surfaces wrapped", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectQuery("SELECT pa.hash, pb.hash").
			WillReturnRows(pgxmock.NewRows([]string{"a_hash", "b_hash", "pve", "pvp"}).
				AddRow(int64(100), int64(200), 5.0, 2.0).RowError(0, errBoom))
		_, err := store.PerkSynergiesByHash(ctx)
		if err == nil {
			t.Fatal("want error")
		}
		expectMet(t, mock)
	})
}

func TestScoringConfig(t *testing.T) {
	ctx := context.Background()

	t.Run("happy path", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectQuery("SELECT column1_weight").
			WillReturnRows(pgxmock.NewRows([]string{
				"column1_weight", "column2_weight", "column3_weight", "column4_weight", "column5_weight",
				"base_blend", "top_n_variants",
			}).AddRow(0.10, 0.10, 0.30, 0.30, 0.20, 0.50, 15))

		w, topN, err := store.ScoringConfig(ctx)
		if err != nil {
			t.Fatalf("got err %v", err)
		}
		if w.Column != [5]float64{0.10, 0.10, 0.30, 0.30, 0.20} || w.BaseBlend != 0.50 || topN != 15 {
			t.Errorf("got weights=%v baseBlend=%v topN=%d", w.Column, w.BaseBlend, topN)
		}
		expectMet(t, mock)
	})

	t.Run("query failure surfaces wrapped", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectQuery("SELECT column1_weight").WillReturnError(errBoom)
		_, _, err := store.ScoringConfig(ctx)
		if err == nil || !errors.Is(err, errBoom) {
			t.Errorf("got %v", err)
		}
		expectMet(t, mock)
	})
}

func TestRolls(t *testing.T) {
	ctx := context.Background()

	t.Run("happy path", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectQuery("SELECT id, weapon_id FROM roll").
			WillReturnRows(pgxmock.NewRows([]string{"id", "weapon_id"}).
				AddRow(int64(1), int64(100)))

		got, err := store.Rolls(ctx)
		if err != nil {
			t.Fatalf("got err %v", err)
		}
		if len(got) != 1 || got[0] != (RollRow{ID: 1, WeaponID: 100}) {
			t.Errorf("got %+v", got)
		}
		expectMet(t, mock)
	})

	t.Run("query failure surfaces wrapped", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectQuery("SELECT id, weapon_id FROM roll").WillReturnError(errBoom)
		_, err := store.Rolls(ctx)
		if err == nil || !errors.Is(err, errBoom) {
			t.Errorf("got %v", err)
		}
		expectMet(t, mock)
	})

	t.Run("scan failure surfaces wrapped", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectQuery("SELECT id, weapon_id FROM roll").
			WillReturnRows(pgxmock.NewRows([]string{"id", "weapon_id"}).
				AddRow(int64(1), int64(100)).RowError(0, errBoom))
		_, err := store.Rolls(ctx)
		if err == nil {
			t.Fatal("want error")
		}
		expectMet(t, mock)
	})
}

func TestRollPerks(t *testing.T) {
	ctx := context.Background()

	t.Run("groups by roll id", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectQuery("SELECT roll_id, column_index, perk_id").
			WillReturnRows(pgxmock.NewRows([]string{"roll_id", "column_index", "perk_id"}).
				AddRow(int64(1), 2, int64(10)).
				AddRow(int64(1), 3, int64(20)).
				AddRow(int64(2), 2, int64(30)))

		got, err := store.RollPerks(ctx)
		if err != nil {
			t.Fatalf("got err %v", err)
		}
		if len(got[1]) != 2 || len(got[2]) != 1 {
			t.Errorf("got %+v", got)
		}
		expectMet(t, mock)
	})

	t.Run("query failure surfaces wrapped", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectQuery("SELECT roll_id, column_index, perk_id").WillReturnError(errBoom)
		_, err := store.RollPerks(ctx)
		if err == nil || !errors.Is(err, errBoom) {
			t.Errorf("got %v", err)
		}
		expectMet(t, mock)
	})

	t.Run("scan failure surfaces wrapped", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectQuery("SELECT roll_id, column_index, perk_id").
			WillReturnRows(pgxmock.NewRows([]string{"roll_id", "column_index", "perk_id"}).
				AddRow(int64(1), 2, int64(10)).RowError(0, errBoom))
		_, err := store.RollPerks(ctx)
		if err == nil {
			t.Fatal("want error")
		}
		expectMet(t, mock)
	})
}

func TestWriteRollScores(t *testing.T) {
	ctx := context.Background()

	t.Run("empty input is a no-op, no query issued", func(t *testing.T) {
		mock, store := newMock(t)
		if err := store.WriteRollScores(ctx, nil); err != nil {
			t.Errorf("got %v, want nil", err)
		}
		expectMet(t, mock)
	})

	t.Run("happy path", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectExec("UPDATE roll SET").
			WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
			WillReturnResult(pgxmock.NewResult("UPDATE", 1))

		err := store.WriteRollScores(ctx, []RollScoreUpdate{{RollID: 1, PVE: 80, PVP: 60, Overall: 70}})
		if err != nil {
			t.Errorf("got %v, want nil", err)
		}
		expectMet(t, mock)
	})

	t.Run("exec failure surfaces wrapped", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectExec("UPDATE roll SET").
			WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
			WillReturnError(errBoom)

		err := store.WriteRollScores(ctx, []RollScoreUpdate{{RollID: 1}})
		if err == nil || !errors.Is(err, errBoom) {
			t.Errorf("got %v", err)
		}
		expectMet(t, mock)
	})
}

func TestWriteWeaponRankings(t *testing.T) {
	ctx := context.Background()

	t.Run("empty input is a no-op, no query issued", func(t *testing.T) {
		mock, store := newMock(t)
		if err := store.WriteWeaponRankings(ctx, nil); err != nil {
			t.Errorf("got %v, want nil", err)
		}
		expectMet(t, mock)
	})

	t.Run("happy path", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectExec("INSERT INTO weapon_ranking").
			WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
			WillReturnResult(pgxmock.NewResult("INSERT", 1))

		err := store.WriteWeaponRankings(ctx, []WeaponRankingUpdate{{WeaponID: 1, PVE: 80, PVP: 60, Overall: 70}})
		if err != nil {
			t.Errorf("got %v, want nil", err)
		}
		expectMet(t, mock)
	})

	t.Run("exec failure surfaces wrapped", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectExec("INSERT INTO weapon_ranking").
			WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
			WillReturnError(errBoom)

		err := store.WriteWeaponRankings(ctx, []WeaponRankingUpdate{{WeaponID: 1}})
		if err == nil || !errors.Is(err, errBoom) {
			t.Errorf("got %v", err)
		}
		expectMet(t, mock)
	})
}

func TestBarrelsAndMagazines(t *testing.T) {
	ctx := context.Background()

	t.Run("happy path, combined columns", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectQuery("SELECT wp.weapon_id, wp.column_index").
			WillReturnRows(pgxmock.NewRows([]string{"weapon_id", "column_index", "perk_id", "name"}).
				AddRow(int64(1), 0, int64(10), "Full Bore").
				AddRow(int64(1), 1, int64(20), "Tactical Mag"))

		got, err := store.BarrelsAndMagazines(ctx)
		if err != nil {
			t.Fatalf("got err %v", err)
		}
		if len(got[1]) != 2 {
			t.Errorf("got %+v", got[1])
		}
		expectMet(t, mock)
	})

	t.Run("query failure surfaces wrapped", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectQuery("SELECT wp.weapon_id, wp.column_index").WillReturnError(errBoom)
		_, err := store.BarrelsAndMagazines(ctx)
		if err == nil || !errors.Is(err, errBoom) {
			t.Errorf("got %v", err)
		}
		expectMet(t, mock)
	})

	t.Run("scan failure surfaces wrapped", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectQuery("SELECT wp.weapon_id, wp.column_index").
			WillReturnRows(pgxmock.NewRows([]string{"weapon_id", "column_index", "perk_id", "name"}).
				AddRow(int64(1), 0, int64(10), "Full Bore").RowError(0, errBoom))
		_, err := store.BarrelsAndMagazines(ctx)
		if err == nil {
			t.Fatal("want error")
		}
		expectMet(t, mock)
	})
}

func TestWriteRollVariants(t *testing.T) {
	ctx := context.Background()

	t.Run("begin error", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectBegin().WillReturnError(errBoom)
		err := store.WriteRollVariants(ctx, []RollVariantInsert{{RollID: 1}})
		if !errors.Is(err, errBoom) {
			t.Errorf("got %v", err)
		}
		expectMet(t, mock)
	})

	t.Run("delete error rolls back", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectBegin()
		mock.ExpectExec("DELETE FROM roll_variant").WillReturnError(errBoom)
		mock.ExpectRollback()
		err := store.WriteRollVariants(ctx, []RollVariantInsert{{RollID: 1}})
		if !errors.Is(err, errBoom) {
			t.Errorf("got %v", err)
		}
		expectMet(t, mock)
	})

	t.Run("empty variants still clears the table and commits", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectBegin()
		mock.ExpectExec("DELETE FROM roll_variant").WillReturnResult(pgxmock.NewResult("DELETE", 5))
		mock.ExpectCommit()
		if err := store.WriteRollVariants(ctx, nil); err != nil {
			t.Errorf("got %v, want nil", err)
		}
		expectMet(t, mock)
	})

	t.Run("insert error rolls back", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectBegin()
		mock.ExpectExec("DELETE FROM roll_variant").WillReturnResult(pgxmock.NewResult("DELETE", 0))
		mock.ExpectExec("INSERT INTO roll_variant").
			WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
			WillReturnError(errBoom)
		mock.ExpectRollback()
		err := store.WriteRollVariants(ctx, []RollVariantInsert{{RollID: 1, PVE: 80, PVP: 60, Overall: 70}})
		if !errors.Is(err, errBoom) {
			t.Errorf("got %v", err)
		}
		expectMet(t, mock)
	})

	t.Run("happy path commits", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectBegin()
		mock.ExpectExec("DELETE FROM roll_variant").WillReturnResult(pgxmock.NewResult("DELETE", 0))
		mock.ExpectExec("INSERT INTO roll_variant").
			WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
			WillReturnResult(pgxmock.NewResult("INSERT", 1))
		mock.ExpectCommit()
		err := store.WriteRollVariants(ctx, []RollVariantInsert{{RollID: 1, PVE: 80, PVP: 60, Overall: 70}})
		if err != nil {
			t.Errorf("got %v, want nil", err)
		}
		expectMet(t, mock)
	})

	t.Run("commit error surfaces wrapped", func(t *testing.T) {
		mock, store := newMock(t)
		mock.ExpectBegin()
		mock.ExpectExec("DELETE FROM roll_variant").WillReturnResult(pgxmock.NewResult("DELETE", 0))
		mock.ExpectCommit().WillReturnError(errBoom)
		err := store.WriteRollVariants(ctx, nil)
		if !errors.Is(err, errBoom) {
			t.Errorf("got %v", err)
		}
		expectMet(t, mock)
	})
}
