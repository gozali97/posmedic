package helpers

import (
	"errors"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"
)

func IsUniqueViolation(err error) bool { return pgCode(err) == "23505" }
func IsFKViolation(err error) bool     { return pgCode(err) == "23503" }

func pgCode(err error) string {
	var pg *pgconn.PgError
	if errors.As(err, &pg) {
		return pg.Code
	}
	return ""
}

var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

// LikePattern wraps user input for ILIKE '%...%' with wildcards escaped.
func LikePattern(s string) string { return "%" + likeEscaper.Replace(s) + "%" }

// ConstraintName returns the violated constraint/index name from a PostgreSQL error, or "".
func ConstraintName(err error) string {
	var pg *pgconn.PgError
	if errors.As(err, &pg) {
		return pg.ConstraintName
	}
	return ""
}
