package money

import "errors"

// ErrRefundExceedsTotal cocok dengan kode REFUND_EXCEEDS_TOTAL di
// docs/20-api/ERROR-CATALOG.md §B.
var ErrRefundExceedsTotal = errors.New("refund melebihi sisa yang bisa dikembalikan")
