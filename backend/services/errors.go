package services

import (
	"fmt"
	"net/http"
)

// BizError is a rule violation the client can fix; controllers turn it into its HTTP status and message.
type BizError struct {
	Status  int
	Message string
}

func (e *BizError) Error() string { return e.Message }

func fail(status int, format string, args ...any) error {
	return &BizError{Status: status, Message: fmt.Sprintf(format, args...)}
}

func invalid(format string, args ...any) error {
	return fail(http.StatusUnprocessableEntity, format, args...)
}

func conflict(format string, args ...any) error { return fail(http.StatusConflict, format, args...) }

func notFound(format string, args ...any) error { return fail(http.StatusNotFound, format, args...) }
