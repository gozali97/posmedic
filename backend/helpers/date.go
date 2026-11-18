package helpers

import (
	"time"
	_ "time/tzdata" // embed tz database so Asia/Jakarta loads in minimal containers
)

var Jakarta = mustLoadLocation("Asia/Jakarta")

func mustLoadLocation(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		panic(err)
	}
	return loc
}

// ParseDay parses YYYY-MM-DD as midnight in Asia/Jakarta.
func ParseDay(s string) (time.Time, error) {
	return time.ParseInLocation("2006-01-02", s, Jakarta)
}
