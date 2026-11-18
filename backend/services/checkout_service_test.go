package services

import "testing"

func TestSplitDiscount(t *testing.T) {
	cases := []struct {
		discount int64
		lines    []int64
		want     []int64
	}{
		{500, []int64{9500, 5000}, []int64{328, 172}},
		{0, []int64{100, 200}, []int64{0, 0}},
		{1, []int64{100, 100, 100}, []int64{0, 0, 1}}, // tie goes to the later line
		{99, []int64{1, 1, 98}, []int64{1, 1, 97}},
		{4_000_000_000, []int64{4_000_000_000, 4_000_000_000}, []int64{2_000_000_000, 2_000_000_000}},
	}
	for _, c := range cases {
		var subtotal, sum int64
		for _, l := range c.lines {
			subtotal += l
		}
		got := splitDiscount(c.discount, c.lines, subtotal)
		for i := range got {
			sum += got[i]
			if got[i] != c.want[i] {
				t.Errorf("splitDiscount(%d, %v) = %v, want %v", c.discount, c.lines, got, c.want)
				break
			}
			if got[i] > c.lines[i] {
				t.Errorf("share %d exceeds line %d", got[i], c.lines[i])
			}
		}
		if sum != c.discount {
			t.Errorf("shares %v do not add up to %d", got, c.discount)
		}
	}
}
