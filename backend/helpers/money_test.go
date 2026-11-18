package helpers

import "testing"

func TestDivRoundHalfUp(t *testing.T) {
	cases := []struct{ a, b, want int64 }{{10, 4, 3}, {9, 4, 2}, {5, 2, 3}, {0, 7, 0}, {1, 3, 0}, {2, 3, 1}}
	for _, c := range cases {
		if got := DivRound(c.a, c.b); got != c.want {
			t.Errorf("DivRound(%d,%d) = %d, want %d", c.a, c.b, got, c.want)
		}
	}
}

func TestDivCeil(t *testing.T) {
	if DivCeil(1001, 10) != 101 || DivCeil(1000, 10) != 100 || DivCeil(0, 10) != 0 {
		t.Fatal("DivCeil wrong")
	}
}

func TestSplitTax(t *testing.T) {
	// 111.000 incl. PPN 11% → DPP 100.000, PPN 11.000
	if dpp, ppn := SplitTax(111000, RateBasisPoints(11)); dpp != 100000 || ppn != 11000 {
		t.Fatalf("got %d/%d", dpp, ppn)
	}
	// rounding stays inside the total
	if dpp, ppn := SplitTax(10000, RateBasisPoints(11)); dpp != 9009 || ppn != 991 {
		t.Fatalf("got %d/%d", dpp, ppn)
	}
	if dpp, ppn := SplitTax(5000, 0); dpp != 5000 || ppn != 0 {
		t.Fatalf("non-PKP got %d/%d", dpp, ppn)
	}
}
