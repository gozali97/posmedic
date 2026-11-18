package dto

// Response is the single envelope for every endpoint: {status, code, message, data}.
type Response struct {
	Status  string `json:"status"` // "success" | "failed"
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
	Errors  any    `json:"errors,omitempty"`
}

type PaginationMeta struct {
	CurrentPage int   `json:"current_page"`
	PerPage     int   `json:"per_page"`
	Total       int64 `json:"total"`
	TotalPages  int   `json:"total_pages"`
	From        int   `json:"from"`
	To          int   `json:"to"`
}

func NewPaginationMeta(page, perPage int, total int64) PaginationMeta {
	meta := PaginationMeta{CurrentPage: page, PerPage: perPage, Total: total}
	if total == 0 {
		return meta
	}
	meta.TotalPages = int((total + int64(perPage) - 1) / int64(perPage))
	from := (page-1)*perPage + 1
	if int64(from) > total {
		return meta
	}
	meta.From = from
	meta.To = min(page*perPage, int(total))
	return meta
}
