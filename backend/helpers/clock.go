package helpers

import "time"

// Now is the clock behind business timestamps (shift open/close, paid_at, document numbers) and "today".
// The app always uses time.Now; the demo seeder (cmd/seed) swaps it to replay past days.
var Now = time.Now
