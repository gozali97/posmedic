package helpers

import "math"

// DivRound returns a/b rounded half-up for non-negative a and positive b (BR5).
func DivRound(a, b int64) int64 { return (2*a + b) / (2 * b) }

// DivCeil returns a/b rounded up for non-negative a and positive b.
func DivCeil(a, b int64) int64 { return (a + b - 1) / b }

// RateBasisPoints turns a NUMERIC(5,2) percentage (11.00) into basis points (1100) without float math downstream.
func RateBasisPoints(rate float64) int64 { return int64(math.Round(rate * 100)) }

// SplitTax splits a tax-inclusive total into DPP and PPN (BR9). rateBP = 0 means not PKP.
func SplitTax(total, rateBP int64) (dpp, ppn int64) {
	if rateBP <= 0 {
		return total, 0
	}
	dpp = DivRound(total*10000, 10000+rateBP)
	return dpp, total - dpp
}

// Today is the current calendar day in Asia/Jakarta as "YYYY-MM-DD".
func Today() string { return Now().In(Jakarta).Format("2006-01-02") }

// TodayPlus is Today shifted by n days.
func TodayPlus(n int) string { return Now().In(Jakarta).AddDate(0, 0, n).Format("2006-01-02") }
